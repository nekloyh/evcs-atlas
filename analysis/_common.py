"""Tiện ích dùng chung cho các mũi phản biện A1–A13.

Mọi script trong thư mục này CHỈ ĐỌC dữ liệu đã build. Kết quả đi vào
``data/qa/critique/<mã>.json`` để tái lập và đối chiếu được.

── NGUỒN ĐỌC: ``store/p/01/``, KHÔNG PHẢI ``data/processed/`` ────────────────────────

Bộ Hà Nội cũ đã thành tỉnh 01 của store chung. Mọi mũi phản biện vẫn nói về **cùng một
thành phố** — một bảng đối chứng đã chứng minh hai đường mã cho ra số
trùng khít trên các chỉ số chính.

Hai chỗ KHÁC, phải biết trước khi đọc lại một kết luận cũ:

* ``road_graph.parquet`` mang ``coords`` (list phẳng) thay cho ``geometry_wkb``. Nó là lớp
  ĐỂ TÍNH; lớp ĐỂ NHÌN đã đơn giản hoá ~10 m nên không dựng đồ thị được.
* Vài cột đổi tên (``road_len_in_hanoi_m`` → ``road_len_in_province_m``) và có thêm cột
  (``population_wp``, ``province_code``, ``h3_r8`` ở bảng trạm, 3 lớp phủ luôn-phát).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

# Tỉnh 01 = Hà Nội. Mọi mũi phản biện ở đây nói về Hà Nội, nên chúng đọc đúng một phân mảnh.
TINH = "01"
PROV = ROOT / "store" / "p" / TINH
CACHE = ROOT / "store" / "cache" / TINH

CRITIQUE = ROOT / "data/qa/critique"
CRITIQUE.mkdir(parents=True, exist_ok=True)


def grid():
    return pq.read_table(PROV / "grid_h3_r8.parquet").to_pandas()


def stations():
    return pq.read_table(PROV / "stations.parquet").to_pandas()


def communes():
    return pq.read_table(PROV / "commune.parquet").to_pandas()


def occupancy():
    return pq.read_table(PROV / "station_occupancy.parquet").to_pandas()


def roads(columns=None):
    """Đoạn đường với hình học NGUYÊN — lớp ĐỂ TÍNH (``road_graph``), không phải lớp để nhìn.

    Hình học ở cột ``coords`` (list phẳng [x0,y0,x1,y1,…]), KHÔNG phải ``geometry_wkb``.
    Cần WKB thì dựng lại: ``LineString(np.asarray(c, float).reshape(-1, 2))``.
    """
    return pq.read_table(CACHE / "road_graph.parquet", columns=columns).to_pandas()


def _jsonable(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else round(float(o), 6)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def emit(code: str, verdict: str, report: dict) -> None:
    """Ghi kết quả một mũi phản biện. ``verdict`` ∈ HONG / KHONG_HONG / CANH_BAO."""
    assert verdict in {"HONG", "KHONG_HONG", "CANH_BAO"}
    payload = {"code": code, "verdict": verdict, **report}
    p = CRITIQUE / f"{code.lower()}.json"
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_jsonable), "utf-8")
    print(f"\n=== {code}: {verdict} ===")
    print(json.dumps(report, ensure_ascii=False, indent=2, default=_jsonable)[:4000])
