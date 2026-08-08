"""A1 — 523 ô biên trộn hai quy ước cắt biên.

Nghi ngờ: ``population`` chỉ đếm pixel NẰM TRONG ranh giới Hà Nội (s04 lọc
``point-in-polygon`` trước khi gán ô), nhưng ``road_len_*`` (s09 giao đường với
``grid.cell_polygon``), ``n_poi_*`` (s09 gán POI theo ô, POI đã lọc theo đa giác ĐỆM 5 km
chứ không phải ranh giới Hà Nội) và ``*_frac`` lớp phủ (s07 đốt raster theo đa giác ô)
được tính trên TOÀN BỘ ô.

Kiểm: cắt lại đường/POI/lớp phủ theo ranh giới thật rồi so với giá trị hiện hành.
Hỏng nếu: chênh lệch ở ô biên đủ lớn để làm sai các tỉ lệ trên đầu người.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from shapely import wkb as shwkb
from shapely.prepared import prep
from shapely.strtree import STRtree

from _common import ROOT, emit, grid, roads  # noqa: E402

from hanoi import aoi, grid as gridmod  # noqa: E402
from hanoi.s09_grid_features import _len_m  # noqa: E402


def main() -> None:
    g = grid().set_index("h3_r8")
    cells = list(g.index)
    boundary = aoi.boundary()
    pb = prep(boundary)

    # --- 1. đường: cắt theo ô ∩ ranh giới ----------------------------------
    polys = [gridmod.cell_polygon(c) for c in cells]
    clipped_polys = [p if pb.contains(p) else p.intersection(boundary) for p in polys]
    tree = STRtree(polys)
    rd = roads(columns=["road_class", "geometry_wkb"])
    ARTERIAL = {"MOTORWAY", "TRUNK", "PRIMARY", "SECONDARY"}
    road_in = np.zeros(len(cells))
    road_art_in = np.zeros(len(cells))
    for rc, gwkb in zip(rd.road_class, rd.geometry_wkb):
        line = shwkb.loads(bytes(gwkb))
        for i in tree.query(line):
            i = int(i)
            cp = clipped_polys[i]
            if cp.is_empty:
                continue
            seg = line.intersection(cp)
            if seg.is_empty:
                continue
            m = _len_m(seg)
            road_in[i] += m
            if rc in ARTERIAL:
                road_art_in[i] += m

    # --- 2. POI: điểm có nằm trong ranh giới Hà Nội không -------------------
    poi = pd.read_parquet(ROOT / "data/raw/osm_hanoi_poi.parquet")
    from shapely.geometry import Point

    poi["in_hanoi"] = [pb.contains(Point(x, y)) for x, y in zip(poi.lng, poi.lat)]
    poi["h3_r8"] = [gridmod.cell_of(la, ln) for la, ln in zip(poi.lat, poi.lng)]
    poi = poi[poi.h3_r8.isin(set(cells))]
    poi_all = poi.groupby("h3_r8").size()
    poi_in = poi[poi.in_hanoi].groupby("h3_r8").size()

    d = pd.DataFrame(index=pd.Index(cells, name="h3_r8"))
    d["area_frac"] = g.area_frac
    d["cell_state"] = g.cell_state
    d["population"] = g.population
    d["road_now"] = g.road_len_m
    d["road_clipped"] = road_in
    d["road_art_now"] = g.road_len_arterial_m
    d["road_art_clipped"] = road_art_in
    d["poi_now"] = d.index.map(poi_all).fillna(0)
    d["poi_clipped"] = d.index.map(poi_in).fillna(0)
    d["n_ports"] = g.n_ports
    d["n_stations"] = g.n_stations

    bo = d[d.cell_state == "BORDER"]
    tiny = d[d.area_frac < 0.01]

    # --- 3. tỉ lệ trên đầu người đổi bao nhiêu ở ô biên ---------------------
    pop_ok = d.population > 50
    r_now = (d.road_now / d.population).where(pop_ok)
    r_new = (d.road_clipped / d.population).where(pop_ok)
    rel = ((r_new - r_now) / r_now).dropna()
    rel_border = rel[d.loc[rel.index, "cell_state"] == "BORDER"]
    rel_inside = rel[d.loc[rel.index, "cell_state"] == "INSIDE"]

    # --- 4. bất biến: dân số và số trạm KHÔNG được đổi ---------------------
    invariants = {
        "population_total": float(d.population.sum()),
        "n_stations_total": int(d.n_stations.sum()),
        "n_ports_total": int(d.n_ports.sum()),
    }

    worst = (
        bo.assign(loss=1 - bo.road_clipped / bo.road_now.replace(0, np.nan))
        .sort_values("loss", ascending=False)
        .head(10)[["area_frac", "road_now", "road_clipped", "population", "loss"]]
    )

    report = {
        "cau_hoi": "road/POI/landcover tính trên toàn ô, population chỉ tính phần trong ranh giới — có lệch thật không?",
        "do_duoc": {
            "n_border": int((d.cell_state == "BORDER").sum()),
            "border_area_frac_median": float(bo.area_frac.median()),
            "area_outside_km2": float((g.area_km2 * (1 - g.area_frac)).sum()),
            "road_total_now_km": float(d.road_now.sum()) / 1000,
            "road_total_clipped_km": float(d.road_clipped.sum()) / 1000,
            "road_outside_km": float(d.road_now.sum() - d.road_clipped.sum()) / 1000,
            "road_outside_pct": float(1 - d.road_clipped.sum() / d.road_now.sum()) * 100,
            "road_arterial_outside_pct": float(
                1 - d.road_art_clipped.sum() / d.road_art_now.sum()
            )
            * 100,
            "poi_total_now": int(d.poi_now.sum()),
            "poi_total_clipped": int(d.poi_clipped.sum()),
            "poi_outside": int(d.poi_now.sum() - d.poi_clipped.sum()),
            "border_road_now_km": float(bo.road_now.sum()) / 1000,
            "border_road_clipped_km": float(bo.road_clipped.sum()) / 1000,
            "border_road_loss_pct": float(1 - bo.road_clipped.sum() / bo.road_now.sum()) * 100,
        },
        "ti_le_tren_dau_nguoi": {
            "note": "road_len_m / population, chỉ ô có >50 dân",
            "border_median_rel_change_pct": float(rel_border.median()) * 100,
            "border_p10_rel_change_pct": float(rel_border.quantile(0.10)) * 100,
            "inside_median_rel_change_pct": float(rel_inside.median()) * 100,
            "n_border_cells_shift_gt_20pct": int((rel_border.abs() > 0.20).sum()),
            "n_border_cells_with_pop": int(len(rel_border)),
        },
        "o_cuc_doan_area_frac_lt_0_01": {
            "n_cells": int(len(tiny)),
            "road_km_now": float(tiny.road_now.sum()) / 1000,
            "road_km_clipped": float(tiny.road_clipped.sum()) / 1000,
            "population": float(tiny.population.sum()),
            "poi": int(tiny.poi_now.sum()),
            "n_stations": int(tiny.n_stations.sum()),
        },
        "bat_bien_khong_duoc_doi": invariants,
        "10_o_bien_lech_nhat": worst.reset_index().to_dict("records"),
    }
    # Hỏng nếu phần đường nằm ngoài ranh giới vượt 2% tổng, hoặc >10% ô biên có dân
    # bị lệch tỉ lệ trên đầu người quá 20%.
    hong = report["do_duoc"]["road_outside_pct"] > 2.0 or (
        report["ti_le_tren_dau_nguoi"]["n_border_cells_shift_gt_20pct"]
        > 0.10 * max(1, report["ti_le_tren_dau_nguoi"]["n_border_cells_with_pop"])
    )
    emit("A01", "HONG" if hong else "KHONG_HONG", report)


if __name__ == "__main__":
    main()
