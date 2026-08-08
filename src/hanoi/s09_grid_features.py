"""B9 — Gộp đường bộ, POI và cung hiện hữu về từng ô lưới.

Một khái niệm một trường, cụ thể ở lớp đường: bảng cũ có ba biến thể cho MỘT khái niệm
"lượng đường trong ô" — ``m_<CLASS>`` (chiều dài), ``lane_m_<CLASS>`` (mét-làn với số làn
suy đoán khi thiếu tag), ``lane_obs_m_<CLASS>`` (mét-làn chỉ tính làn có tag). Ở đây chỉ giữ
CHIỀU DÀI: nó là số đo trực tiếp, hai bản mét-làn kia trộn một phép suy đoán vào số đo.

KHÔNG có ``dist_substation_m``: lớp lưới điện đã ra khỏi phạm vi (DECISIONS §8). Bản trước
tính nó từ **133** trạm biến áp gắn tag OSM cho cả AOI — 25,3 km²/trạm, và MỘT trạm biến áp
làm láng giềng gần nhất cho tới **236 ô**. Đó là lớp thưa giả tạo: trường trông có cơ sở kỹ
thuật điện trong khi không có.

QUY ƯỚC CẮT BIÊN — đọc kỹ. ``road_len_*``, ``n_poi_*`` và các ``*_frac`` lớp phủ đo trên
TOÀN Ô, kể cả phần nằm ngoài Hà Nội; còn ``population`` chỉ đếm pixel TRONG ranh giới. Hai
quy ước khác nhau trong cùng một bảng. Giữ toàn-ô là CỐ Ý — con đường cách ranh giới 200 m
vẫn chở người trong ô đi sạc, cắt cứng là giả vờ ranh giới hành chính chặn được xe. Nhưng
để chênh lệch đó ĐO ĐƯỢC chứ không âm thầm, ``road_len_in_hanoi_m`` phát bản đã cắt.
**Đừng chia hai trường khác quy ước cho nhau ở mức ô** — muốn tỉ lệ trên đầu người thì lên
cấp xã, nơi ``area_frac`` không còn nghĩa.

Sinh:
  data/processed/layers/road_cell.parquet
  data/processed/layers/poi_cell.parquet
  data/processed/layers/supply_cell.parquet
  data/qa/s09_grid_features.json
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree
from shapely import wkb as shwkb
from shapely.prepared import prep
from shapely.strtree import STRtree

from . import aoi, grid, paths
from .s03_osm_extract import ROAD_CLASS
from .roadnet import M_PER_DEG_LAT, M_PER_DEG_LON

CLASSES = sorted(set(ROAD_CLASS.values()))
POI_CLASSES = [
    "FUEL",
    "PARKING_OFF",
    "PARKING_STREET",
    "MALL",
    "DEPT_STORE",
    "SUPERMARKET",
    "MARKET",
    "APARTMENT",
]


def _len_m(geom) -> float:
    """Chiều dài xấp xỉ theo mét của hình học trong hệ độ, ở vĩ độ Hà Nội."""
    if geom.is_empty:
        return 0.0
    total = 0.0
    parts = geom.geoms if hasattr(geom, "geoms") else [geom]
    for p in parts:
        c = np.asarray(p.coords)
        if len(c) < 2:
            continue
        dx = np.diff(c[:, 0]) * M_PER_DEG_LON
        dy = np.diff(c[:, 1]) * M_PER_DEG_LAT
        total += float(np.hypot(dx, dy).sum())
    return total


def main() -> None:
    cells = grid.hanoi_cells()
    polys = [grid.cell_polygon(c) for c in cells]
    tree = STRtree(polys)
    pos = {c: i for i, c in enumerate(cells)}

    # --- đường -------------------------------------------------------------
    roads = pq.read_table(
        paths.RAW / "osm_hanoi_roads.parquet", columns=["road_class", "geometry_wkb"]
    ).to_pandas()
    road_m = np.zeros((len(cells), len(CLASSES)))
    ci = {c: i for i, c in enumerate(CLASSES)}
    for rc, gwkb in zip(roads.road_class, roads.geometry_wkb):
        line = shwkb.loads(bytes(gwkb))
        j = ci[rc]
        for i in tree.query(line):
            i = int(i)
            seg = line.intersection(polys[i])
            if not seg.is_empty:
                road_m[i, j] += _len_m(seg)

    # Bản CẮT THEO RANH GIỚI — cột kiểm chứng, không phải cột thay thế. Nó trả lời
    # "ô này mang bao nhiêu đường không thuộc Hà Nội", tức đầu vào để đánh giá ô biên.
    boundary = aoi.boundary()
    pb = prep(boundary)
    clipped = [p if pb.contains(p) else p.intersection(boundary) for p in polys]
    road_in = np.zeros(len(cells))
    for gwkb in roads.geometry_wkb:
        line = shwkb.loads(bytes(gwkb))
        for i in tree.query(line):
            i = int(i)
            cp = clipped[i]
            if cp.is_empty:
                continue
            seg = line.intersection(cp)
            if not seg.is_empty:
                road_in[i] += _len_m(seg)

    rd = pd.DataFrame({"h3_r8": pd.Series(cells, dtype="string")})
    for c, j in ci.items():
        rd[f"road_len_{c.lower()}_m"] = road_m[:, j]
    rd["road_len_m"] = road_m.sum(axis=1)
    rd["road_len_arterial_m"] = road_m[
        :, [ci[k] for k in ("MOTORWAY", "TRUNK", "PRIMARY", "SECONDARY")]
    ].sum(axis=1)
    rd["road_len_in_hanoi_m"] = road_in
    pq.write_table(
        pa.Table.from_pandas(rd, preserve_index=False), paths.LAYERS / "road_cell.parquet"
    )

    # --- POI ----------------------------------------------------------------
    poi = pq.read_table(paths.RAW / "osm_hanoi_poi.parquet").to_pandas()
    poi["h3_r8"] = [grid.cell_of(la, ln) for la, ln in zip(poi.lat, poi.lng)]
    poi = poi[poi.h3_r8.isin(pos)]
    wide = (
        poi.pivot_table(index="h3_r8", columns="poi_class", values="osm_id", aggfunc="count")
        .reindex(columns=POI_CLASSES)
        .fillna(0)
        .astype("int64")
    )
    pdf = pd.DataFrame({"h3_r8": pd.Series(cells, dtype="string")})
    for k in POI_CLASSES:
        pdf[f"n_{k.lower()}"] = pdf.h3_r8.map(wide[k]).fillna(0).astype("int64")
    pdf["n_poi_total"] = pdf[[f"n_{k.lower()}" for k in POI_CLASSES]].sum(axis=1)

    # POI trong bán kính 1 km quanh TÂM ô — khái niệm khác `n_poi_total` (đếm TRONG ô).
    # `n_poi_total` là KIỂM KÊ ("ô này có gì"); trường này là PHƠI NHIỄM ("quanh điểm này có
    # gì"), và đo được là phơi nhiễm mới dự báo được nhu cầu: trên 632 trạm có `util` tin cậy,
    # thêm nó vào mô hình đưa R² từ 0,2659 lên 0,3126 — hơn cả khối 18 lớp cơ cấu POI (0,3028)
    # và hơn bán kính theo mạng đường. Xem notebook l5 §9.
    #
    # Chim bay, không phải mạng đường, và đó là kết quả ĐO chứ không phải cho tiện: ở mọi bán
    # kính dưới 1,5 km chim bay dự báo tốt hơn. POI không tác động như ĐIỂM ĐẾN người ta lái
    # xe tới, mà như CHỈ BÁO tính chất khu vực — thứ lan theo không gian, không theo mạng đường.
    ptree = cKDTree(np.c_[poi.lng.to_numpy() * M_PER_DEG_LON, poi.lat.to_numpy() * M_PER_DEG_LAT])
    clat = np.array([grid.centroid(c)[0] for c in cells])
    clng = np.array([grid.centroid(c)[1] for c in cells])
    pdf["n_poi_1km"] = [
        len(j)
        for j in ptree.query_ball_point(np.c_[clng * M_PER_DEG_LON, clat * M_PER_DEG_LAT], 1000.0)
    ]
    ap = poi[poi.poi_class == "APARTMENT"].groupby("h3_r8").levels.sum()
    pdf["apartment_levels_sum"] = pdf.h3_r8.map(ap).fillna(0.0)
    pq.write_table(
        pa.Table.from_pandas(pdf, preserve_index=False), paths.LAYERS / "poi_cell.parquet"
    )

    # --- cung hiện hữu -------------------------------------------------------
    st = pq.read_table(paths.PROCESSED / "stations.parquet").to_pandas()
    sh = st[st.scope == "HANOI"]
    g = sh.groupby("h3_r8").agg(
        n_stations=("station_id", "count"),
        n_ports=("n_ports", "sum"),
        power_kw_site=("power_kw_site", "sum"),
    )
    go = sh[sh.op_status == "OPERATIONAL"].groupby("h3_r8").station_id.count()

    sup = pd.DataFrame({"h3_r8": pd.Series(cells, dtype="string")})
    sup["n_stations"] = sup.h3_r8.map(g.n_stations).fillna(0).astype("int64")
    sup["n_stations_operational"] = sup.h3_r8.map(go).fillna(0).astype("int64")
    sup["n_ports"] = sup.h3_r8.map(g.n_ports).fillna(0).astype("int64")
    sup["power_kw_site"] = sup.h3_r8.map(g.power_kw_site).fillna(0.0)
    pq.write_table(
        pa.Table.from_pandas(sup, preserve_index=False), paths.LAYERS / "supply_cell.parquet"
    )

    # --- QA ------------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    chk(
        "road_total_equals_class_sum",
        bool((rd.road_len_m - road_m.sum(axis=1)).abs().max() < 1e-6),
        "",
    )
    chk(
        "cells_with_road",
        float((rd.road_len_m > 0).mean()) > 0.95,
        f"{int((rd.road_len_m > 0).sum())}/{len(rd)} = {(rd.road_len_m > 0).mean():.1%}",
    )
    chk(
        "poi_total_matches",
        int(pdf.n_poi_total.sum()) == int(len(poi)),
        f"{int(pdf.n_poi_total.sum())} vs {len(poi)}",
    )
    chk(
        "supply_matches_station_table",
        int(sup.n_stations.sum()) == len(sh),
        f"{int(sup.n_stations.sum())} vs {len(sh)}",
    )
    chk(
        "clipped_road_le_full_cell",
        bool((rd.road_len_in_hanoi_m <= rd.road_len_m + 1e-6).all()),
        f"phần ngoài ranh giới {1 - rd.road_len_in_hanoi_m.sum() / rd.road_len_m.sum():.2%} "
        "tổng chiều dài",
    )

    report = {
        "layer": "grid_features",
        "stats": {
            "road_len_total_km": round(float(rd.road_len_m.sum()) / 1000, 1),
            "road_len_arterial_km": round(float(rd.road_len_arterial_m.sum()) / 1000, 1),
            "road_len_by_class_km": {
                c.lower(): round(float(road_m[:, j].sum()) / 1000, 1) for c, j in ci.items()
            },
            "poi_in_hanoi": int(len(poi)),
            "poi_by_class": {k.lower(): int(pdf[f"n_{k.lower()}"].sum()) for k in POI_CLASSES},
            "road_len_in_hanoi_km": round(float(rd.road_len_in_hanoi_m.sum()) / 1000, 1),
            "road_outside_boundary_share": round(
                float(1 - rd.road_len_in_hanoi_m.sum() / rd.road_len_m.sum()), 4
            ),
            "cells_with_supply": int((sup.n_stations > 0).sum()),
            "ports_total": int(sup.n_ports.sum()),
        },
        "checks": checks,
    }
    (paths.QA / "s09_grid_features.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
