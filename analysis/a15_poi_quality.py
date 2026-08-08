"""A15 — Chất lượng lớp POI (đầu vào của L5).

Bốn câu hỏi:
  1. **Bỏ sót hình học**: ``s03`` xử lý node + way, BỎ QUA relation. Mất bao nhiêu?
  2. **Bỏ sót phân loại**: taxonomy 8 lớp kế thừa repo cũ. Còn neo nhu cầu nào ngoài đó?
  3. **Thiên lệch bản đồ hoá**: OSM ở Việt Nam map nội thành kỹ hơn ngoại thành. Đo được không?
  4. **Trùng lặp và độ thưa**: bao nhiêu POI trùng, bao nhiêu ô rỗng?

Quét lại PBF một lượt (~2,5 phút). CHỈ ĐỌC.
"""

from __future__ import annotations

import json
import time
from collections import Counter

import numpy as np
import osmium
import pandas as pd
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point
from shapely.prepared import prep

from _common import ROOT, emit, grid
from hanoi import aoi, paths
from hanoi.s03_osm_extract import classify_poi

# --- taxonomy MỞ RỘNG: neo lưu trú/điểm đến mà 8 lớp hiện hành không bắt ---
# Mỗi mục là (tên nhóm, hàm nhận tags). Chỉ để ĐO độ phủ, không đề xuất dùng ngay.
EXT = {
    "CUA_HANG_TIEN_LOI": lambda t: t.get("shop") == "convenience",
    "AN_UONG": lambda t: t.get("amenity") in {"restaurant", "cafe", "fast_food", "food_court"},
    "KHACH_SAN": lambda t: t.get("tourism") in {"hotel", "motel", "guest_house", "hostel"},
    "GIAO_DUC": lambda t: t.get("amenity") in {"school", "university", "college", "kindergarten"},
    "Y_TE": lambda t: t.get("amenity") in {"hospital", "clinic", "doctors"},
    "VAN_PHONG": lambda t: t.get("office") is not None
    or t.get("building") in {"office", "commercial"},
    "BAN_LE_KHAC": lambda t: t.get("shop") is not None and t.get("shop") not in {
        "mall", "department_store", "supermarket", "convenience"
    },
    "NGAN_HANG": lambda t: t.get("amenity") in {"bank", "atm"},
    "GIAI_TRI": lambda t: t.get("leisure") in {"sports_centre", "stadium", "fitness_centre", "park"},
    "BEN_XE_GA": lambda t: t.get("amenity") == "bus_station" or t.get("railway") == "station",
}


def main() -> None:
    t0 = time.time()
    area = aoi.buffered()
    parea = prep(area)
    hanoi = aoi.boundary()
    phanoi = prep(hanoi)
    minx, miny, maxx, maxy = area.bounds

    cur = Counter()          # taxonomy hiện hành, theo (lớp, kiểu hình học)
    ext = Counter()          # taxonomy mở rộng, theo nhóm
    ext_pts: dict[str, list] = {k: [] for k in EXT}
    rel_cur = Counter()      # relation mang tag của taxonomy hiện hành — s03 BỎ HẾT
    rel_ext = Counter()
    n_building = 0

    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_locations("flex_mem")
    for o in fp:
        ts = o.type_str()
        tags = o.tags

        if ts == "r":
            # relation không có toạ độ rẻ tiền → đếm TOÀN QUỐC làm chặn trên
            if classify_poi(tags):
                rel_cur[classify_poi(tags)] += 1
            for k, f in EXT.items():
                if f(tags):
                    rel_ext[k] += 1
            continue

        if ts == "n":
            loc = o.location
            if not (minx <= loc.lon <= maxx and miny <= loc.lat <= maxy):
                continue
            pt = Point(loc.lon, loc.lat)
            if not parea.contains(pt):
                continue
            inside = phanoi.contains(pt)
            pc = classify_poi(tags)
            if pc:
                cur[(pc, "node", inside)] += 1
            for k, f in EXT.items():
                if f(tags):
                    ext[(k, inside)] += 1
                    if inside:
                        ext_pts[k].append((loc.lon, loc.lat))
            continue

        if ts != "w":
            continue
        pts = [(n.location.lon, n.location.lat) for n in o.nodes if n.location.valid()]
        if len(pts) < 2:
            continue
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        if max(xs) < minx or min(xs) > maxx or max(ys) < miny or min(ys) > maxy:
            continue
        if tags.get("building"):
            n_building += 1
        c = LineString(pts).centroid
        if not parea.contains(c):
            continue
        inside = phanoi.contains(c)
        pc = classify_poi(tags)
        if pc:
            cur[(pc, "way", inside)] += 1
        for k, f in EXT.items():
            if f(tags):
                ext[(k, inside)] += 1
                if inside:
                    ext_pts[k].append((c.x, c.y))

    print(f"quét xong {time.time()-t0:.0f}s")

    # --- tổng hợp -----------------------------------------------------------
    cur_in = {}
    for (pc, geom, ins), n in cur.items():
        if ins:
            cur_in.setdefault(pc, {"node": 0, "way": 0})[geom] += n
    ext_in = {k: ext.get((k, True), 0) for k in EXT}

    n_cur_total = sum(v["node"] + v["way"] for v in cur_in.values())
    n_ext_total = sum(ext_in.values())

    # --- thiên lệch bản đồ hoá: POI trên km² đã xây dựng, Phường vs Xã ------
    g = grid()
    g["kind"] = np.where(g.commune_name.str.startswith("Phường"), "PHUONG", "XA")
    g["built_km2"] = g.built_frac * g.area_km2 * g.area_frac
    bias = (
        g.groupby("kind")
        .apply(
            lambda d: pd.Series(
                {
                    "n_o": len(d),
                    "poi": int(d.n_poi_total.sum()),
                    "km2_da_xay": float(d.built_km2.sum()),
                    "poi_tren_km2_da_xay": float(d.n_poi_total.sum() / d.built_km2.sum()),
                    "dan_so": float(d.population.sum()),
                    "poi_tren_10k_dan": float(d.n_poi_total.sum() / d.population.sum() * 1e4),
                    "ty_le_o_khong_co_poi": float((d.n_poi_total == 0).mean()),
                }
            ),
            include_groups=False,
        )
        .to_dict("index")
    )

    # --- trùng lặp và độ thưa ----------------------------------------------
    poi = pd.read_parquet(ROOT / "data/raw/osm_hanoi_poi.parquet")
    poi = poi[[phanoi.contains(Point(x, y)) for x, y in zip(poi.lng, poi.lat)]]
    dup = 0
    for cls, sub in poi.groupby("poi_class"):
        if len(sub) < 2:
            continue
        xy = np.c_[sub.lng * 103_940.0, sub.lat * 110_574.0]
        pairs = cKDTree(xy).query_pairs(25.0)
        dup += len(pairs)

    report = {
        "cau_hoi": "Lớp POI đủ tốt để dựng L5 chưa?",
        "1_bo_sot_hinh_hoc": {
            "note": "s03 chỉ xử lý node + way; relation bị bỏ qua hoàn toàn (`if ts != 'w': continue`)",
            "poi_hien_hanh_trong_hanoi_theo_hinh_hoc": cur_in,
            "relation_mang_tag_taxonomy_hien_hanh_TOAN_QUOC": dict(rel_cur),
            "relation_mang_tag_taxonomy_mo_rong_TOAN_QUOC": dict(rel_ext),
            "ket_luan": "relation là chặn trên toàn quốc, chưa cắt về Hà Nội — nếu nhỏ thì bỏ qua được",
        },
        "2_bo_sot_phan_loai": {
            "n_poi_taxonomy_hien_hanh": n_cur_total,
            "n_poi_taxonomy_mo_rong": n_ext_total,
            "ty_so_mo_rong_tren_hien_hanh": round(n_ext_total / max(1, n_cur_total), 2),
            "chi_tiet_mo_rong_trong_hanoi": dict(sorted(ext_in.items(), key=lambda kv: -kv[1])),
            "n_building_way_trong_bbox": n_building,
        },
        "3_thien_lech_ban_do_hoa": bias,
        "4_trung_lap_va_do_thua": {
            "n_poi_trong_hanoi": int(len(poi)),
            "n_cap_cung_lop_cach_nhau_duoi_25m": int(dup),
            "ty_le_poi_co_ten": round(float(poi.name.notna().mean()), 3),
            "ty_le_o_khong_co_poi_nao": round(float((g.n_poi_total == 0).mean()), 3),
            "poi_trung_vi_moi_o": float(g.n_poi_total.median()),
            "ty_trong_apartment_trong_tong_poi": round(
                float((poi.poi_class == "APARTMENT").mean()), 3
            ),
            "ty_le_apartment_co_building_levels": round(
                float(poi[poi.poi_class == "APARTMENT"].levels.notna().mean()), 3
            ),
        },
        "elapsed_s": round(time.time() - t0, 1),
    }
    emit("A15", "CANH_BAO", report)


if __name__ == "__main__":
    main()
