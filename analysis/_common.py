"""Tiện ích dùng chung cho các mũi phản biện A1–A13.

Mọi script trong thư mục này CHỈ ĐỌC dữ liệu đã build; chúng không ghi vào
``data/processed``. Kết quả đi vào ``data/qa/critique/<mã>.json`` để tái lập và
đối chiếu được.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

CRITIQUE = ROOT / "data/qa/critique"
CRITIQUE.mkdir(parents=True, exist_ok=True)


def grid():
    return pq.read_table(ROOT / "data/processed/grid_h3_r8.parquet").to_pandas()


def stations():
    return pq.read_table(ROOT / "data/processed/stations.parquet").to_pandas()


def communes():
    return pq.read_table(ROOT / "data/processed/commune.parquet").to_pandas()


def occupancy():
    return pq.read_table(ROOT / "data/processed/station_occupancy.parquet").to_pandas()


def roads(columns=None):
    return pq.read_table(ROOT / "data/raw/osm_hanoi_roads.parquet", columns=columns).to_pandas()


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
