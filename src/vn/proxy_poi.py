"""Proxy POI — đưa MỘT bảng POI bất kỳ lên bản đồ, không đi qua pipeline.

Đây **không phải** một bước của pipeline (không có số ``nXX``, không đăng ký vào runner,
không ghi vào ``store/``). Nó là một cái ống ngắn nhất có thể từ *một file parquet đang
nằm trên đĩa* tới *một lớp nhìn được trên bản đồ*, cho vòng lặp soi lớp POI ở notebook:

    uv run python -m vn.proxy_poi data/qa/eda/poi_chungcu_7tinh.parquet
    make poi-proxy SRC=data/qa/eda/poi_chungcu_7tinh.parquet

Ghi ra ``web/public/data/proxy/<tên>.geojson`` + ``proxy/manifest.json``, xem ở
``#tinh=poi``.

── BA QUYẾT ĐỊNH ─────────────────────────────────────────────────────────────────────

1. **Không suy diễn gì về nội dung bảng.** Bước này không biết ``lop`` là gì, không đếm
   theo lớp, không tô màu theo lớp. Nó cần đúng ba thứ: ``lat``/``lng`` (bắt buộc) và
   ``geometry_wkb`` (nếu có). Mọi cột khác đi thẳng vào ``properties`` nguyên văn để panel
   bên web in ra. Lý do: tập đang soi **đổi cột mỗi lần chạy lại notebook** — một exporter
   biết trước tên cột là một exporter hỏng ở lần lặp thứ hai.

2. **Không thư mục tỉnh.** Bộ này không phải một tỉnh: nó có thể trải 7 tỉnh, có thể là
   một xã, có thể là phần *bị loại* của một luật. Ghi nó vào ``p/<mã>/`` là mời nhầm lẫn
   với 34 bộ thật, và mọi con số của màn hình tỉnh (phủ, bậc màu, KPI) sẽ nói về một mẫu
   số không tồn tại. Vì thế: một nhánh riêng, một manifest riêng, một màn hình riêng.

Từ 2026-08-09 đây là **cửa thứ nhất trong hai**: web còn nhận file kéo-thả thẳng vào
``#tinh=poi`` (``web/src/proxy/nap.ts``), đọc trong trình duyệt, không ghi đĩa và mất khi
tải lại trang. Cửa đó dành cho một bản đã golive, nơi người cầm dữ liệu không có repo để
chạy lệnh này. Hai cửa phải cho **cùng một kết quả trên cùng một file** — mọi luật ở dưới
(``co_hinh``, bỏ dòng không toạ độ, ``GEO_DECIMALS = 6``) đều có bản đối ứng ở đó, và đã
đo khớp trên ``poi_chungcu_7tinh_b3.parquet``: 9.612 dòng, 9.269 có hình, 0 bỏ.

3. **Manifest CỘNG DỒN.** Chạy lại với file khác thì tập cũ vẫn còn — bộ chọn ở web liệt
   kê mọi tập đã xuất. Đó là cái làm nên "theo dõi": xem b2 rồi bấm sang b3 để thấy 1.726
   dòng nào vừa bị luật xoá, không phải chạy lại lệnh giữa hai lần nhìn.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from shapely import wkb, wkt
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "web" / "public" / "data" / "proxy"

# 6 chữ số ≈ 0,11 m ở xích đạo — đủ cho một mặt bằng toà nhà, và đây là chỗ DUY NHẤT bước
# này đụng vào hình học. Cùng con số mà `n11._poi_geojson` dùng cho POI visual.
GEO_DECIMALS = 6

# Cột KHÔNG vào `properties`: hình học đã thành `geometry`, giữ lại là ship hai lần cùng
# một thứ (và `geometry_wkb`/`geometry_wkt` là cột nặng nhất của mọi bảng POI).
BO_COT = {"geometry_wkb", "geometry_wkt"}


def _round_coords(c, nd: int):
    if isinstance(c, (int, float)):
        return round(c, nd)
    return [_round_coords(x, nd) for x in c]


def _sach(v):
    """Một ô của DataFrame → giá trị JSON được. ``NaN``/``NaT``/``pd.NA`` → ``None``."""
    if v is None:
        return None
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if pd.isna(f) else f
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None  # cột nhị phân lạ — không có cách in nó ra một panel
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v if isinstance(v, (str, int, bool)) else str(v)


def _feature(row: dict) -> dict | None:
    """Một dòng → một Feature. ``None`` nếu dòng không có toạ độ nào dùng được.

    Hình học THẬT nếu có ``geometry_wkb``, điểm nếu không — và cờ ``co_hinh`` nói ra điều
    đó. Cùng luật §4d với lớp POI của bản đồ chính: "không biết cạnh ở đâu" phải nhìn khác
    "có cạnh", và không bao giờ vẽ một vòng tròn bán kính bịa thay cho một hình chưa biết.
    """
    g = row.pop("geometry_wkb", None)
    g_wkt = row.pop("geometry_wkt", None)
    geom = None
    if g is not None and not (isinstance(g, float) and pd.isna(g)):
        try:
            m = mapping(wkb.loads(bytes(g)))
            geom = {"type": m["type"], "coordinates": _round_coords(m["coordinates"], GEO_DECIMALS)}
        except Exception:
            geom = None
    elif isinstance(g_wkt, str) and g_wkt:
        try:
            m = mapping(wkt.loads(g_wkt))
            geom = {"type": m["type"], "coordinates": _round_coords(m["coordinates"], GEO_DECIMALS)}
        except Exception:
            geom = None
    lat, lng = _sach(row.get("lat")), _sach(row.get("lng"))
    co_hinh = geom is not None
    if geom is None:
        if lat is None or lng is None:
            return None
        geom = {
            "type": "Point",
            "coordinates": [round(lng, GEO_DECIMALS), round(lat, GEO_DECIMALS)],
        }
    props = {k: _sach(v) for k, v in row.items() if k not in BO_COT}
    props = {k: v for k, v in props.items() if v is not None}
    props["co_hinh"] = co_hinh
    # Tâm để bay tới khi bấm một dòng — polygon không có "một điểm", và tính nó ở web nghĩa
    # là mỗi lần render lại phải duyệt lại toàn bộ vành.
    if lat is not None and lng is not None:
        props["lat"], props["lng"] = lat, lng
    return {"type": "Feature", "geometry": geom, "properties": props}


def _bbox(feats: list[dict]) -> list[float]:
    xs, ys = [], []
    for f in feats:
        p = f["properties"]
        if "lng" in p and "lat" in p:
            xs.append(p["lng"])
            ys.append(p["lat"])
    if not xs:
        return [102.1, 8.4, 109.5, 23.4]  # cả nước — thà rộng còn hơn bay ra Đại Tây Dương
    return [min(xs), min(ys), max(xs), max(ys)]


def _diem_nhay(df: pd.DataFrame) -> list[dict]:
    """Bookmark camera theo ``province_name`` nếu bảng có cột đó — THUẦN NAVIGATION.

    Không phải một phép tính về tỉnh và không được đọc như vậy: nó chỉ trả lời "bay tới
    đâu để thấy cụm này". Bảng không có cột tỉnh thì danh sách rỗng và bộ chọn không hiện.
    """
    if "province_name" not in df.columns or "lat" not in df.columns:
        return []
    out = []
    for ten, sub in df.groupby("province_name", dropna=True):
        lat, lng = sub["lat"].dropna(), sub["lng"].dropna()
        if lat.empty:
            continue
        out.append(
            {
                "ten": str(ten),
                "n": len(sub),
                "bbox": [
                    float(lng.min()),
                    float(lat.min()),
                    float(lng.max()),
                    float(lat.max()),
                ],
            }
        )
    return sorted(out, key=lambda d: -d["n"])


def xuat_mot(src: Path, khoa: str | None = None) -> dict:
    """Một parquet → một geojson + một mục manifest."""
    df = pq.read_table(src).to_pandas()
    thieu = {"lat", "lng"} - set(df.columns)
    if thieu:
        raise SystemExit(f"{src}: thiếu cột {sorted(thieu)} — proxy cần toạ độ, không đoán được.")

    feats = [f for f in (_feature(r) for r in df.to_dict("records")) if f is not None]
    key = khoa or src.stem
    dst = OUT_DIR / f"{key}.geojson"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": feats},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    n_hinh = sum(1 for f in feats if f["properties"]["co_hinh"])
    return {
        "key": key,
        "file": dst.name,
        "nguon": str(src.relative_to(ROOT)) if src.is_relative_to(ROOT) else str(src),
        "n": len(feats),
        "n_bo_qua": int(len(df) - len(feats)),
        "n_hinh": n_hinh,
        "bytes": dst.stat().st_size,
        "bbox": _bbox(feats),
        "cot": [c for c in df.columns if c not in BO_COT],
        "diem_nhay": _diem_nhay(df),
        "xuat_utc": datetime.now(UTC).isoformat(timespec="seconds"),
    }


def _doc_manifest() -> dict:
    p = OUT_DIR / "manifest.json"
    if not p.exists():
        return {"tap": []}
    try:
        return json.loads(p.read_text("utf-8"))
    except json.JSONDecodeError:
        return {"tap": []}


def _ghi_manifest(muc_moi: list[dict]) -> Path:
    man = _doc_manifest()
    theo_khoa = {t["key"]: t for t in man.get("tap", [])}
    for m in muc_moi:
        theo_khoa[m["key"]] = m
    # Tập nào không còn file trên đĩa thì rơi khỏi manifest: xoá một geojson bằng tay phải
    # là cách gỡ nó khỏi bộ chọn, không phải một mục chết trỏ vào 404.
    tap = [t for t in theo_khoa.values() if (OUT_DIR / t["file"]).exists()]
    tap.sort(key=lambda t: t["xuat_utc"], reverse=True)
    p = OUT_DIR / "manifest.json"
    p.write_text(
        json.dumps(
            {"xuat_utc": datetime.now(UTC).isoformat(timespec="seconds"), "tap": tap},
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="python -m vn.proxy_poi",
        description="Đưa một bảng POI bất kỳ lên bản đồ ở #tinh=poi (chế độ test).",
    )
    ap.add_argument("src", nargs="*", type=Path, help="một hoặc nhiều file .parquet")
    ap.add_argument("--ten", help="đặt tên tập (mặc định: tên file). Chỉ dùng khi có ĐÚNG 1 src.")
    ap.add_argument("--xoa", metavar="KEY", nargs="*", default=[], help="gỡ tập đã xuất")
    a = ap.parse_args(argv)

    for k in a.xoa:
        (OUT_DIR / f"{k}.geojson").unlink(missing_ok=True)
        print(f"đã gỡ  {k}")
    if a.ten and len(a.src) != 1:
        ap.error("--ten chỉ dùng được khi có đúng một file nguồn")
    if not a.src and not a.xoa:
        ap.error("cần ít nhất một file .parquet")

    muc = []
    for s in a.src:
        if not s.exists():
            raise SystemExit(f"không có file: {s}")
        m = xuat_mot(s, a.ten)
        muc.append(m)
        bo = f" · bỏ {m['n_bo_qua']} dòng không toạ độ" if m["n_bo_qua"] else ""
        print(
            f"{m['key']:<34} {m['n']:>7,} POI · {m['n_hinh']:>7,} có hình"
            f" · {m['bytes'] / 1e6:5.1f} MB{bo}"
        )
    p = _ghi_manifest(muc)
    n_tap = len(json.loads(p.read_text("utf-8"))["tap"])
    print(f"\n{p.relative_to(ROOT)} · {n_tap} tập · xem ở  http://localhost:5173/#tinh=poi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
