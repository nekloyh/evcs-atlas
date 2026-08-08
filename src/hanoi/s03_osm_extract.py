"""B3 — Trích OSM cho Hà Nội từ file PBF đã đóng băng, MỘT lần đọc.

Nguồn: ``vietnam-latest.osm.pbf`` đã freeze trong aGiang-evcs (chỉ đọc). Cùng một lần đọc
sinh hai lớp, nên hai lớp chắc chắn cùng một ảnh chụp OSM — không lớp nào lệch ngày với lớp
khác như ở repo cũ (POI lấy qua Overpass ngày khác với đường lấy từ PBF).

KHÔNG trích ``power=substation``: lớp lưới điện đã ra khỏi phạm vi (DECISIONS §8) — bài toán
chỉ xét công suất TRÊN TRỤ, không xét khả năng đấu nối lưới.

Sinh (bản trích phạm vi Hà Nội + đệm 5 km, để bộ dữ liệu đứng độc lập):
  data/raw/osm_hanoi_roads.parquet   — hình học đường + thuộc tính đi lại
  data/raw/osm_hanoi_poi.parquet     — điểm quan tâm theo phân lớp nhu cầu
  data/qa/s03_osm_extract.json

CẮT BIÊN LÀ BẮT BUỘC: mọi đối tượng đều bị lọc theo đa giác đệm thật, không phải theo hộp
bao. Repo cũ để lọt 54,2% POI ngoài phạm vi vì chỉ lọc bằng bbox (E-DQ7a/E-DQ11).
"""

from __future__ import annotations

import json
import time

import osmium
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely.geometry import LineString, Point
from shapely.prepared import prep

from . import aoi, paths

# --- phân lớp đường: chỉ giữ loại ô tô đi được ---------------------------
ROAD_CLASS = {
    "motorway": "MOTORWAY",
    "motorway_link": "MOTORWAY",
    "trunk": "TRUNK",
    "trunk_link": "TRUNK",
    "primary": "PRIMARY",
    "primary_link": "PRIMARY",
    "secondary": "SECONDARY",
    "secondary_link": "SECONDARY",
    "tertiary": "TERTIARY",
    "tertiary_link": "TERTIARY",
    "unclassified": "LOCAL",
    "residential": "LOCAL",
    "living_street": "LOCAL",
    "road": "LOCAL",
    "service": "SERVICE",
}

# KHÔNG có bảng tốc độ ở đây, và đó là một quyết định.
#
# Bản trước có ``DEFAULT_KPH`` — 7 con số km/h đặt tay theo cấp đường — để tính
# ``drive_time_station_min``. Đo lại thì chỉ 2.685/240.212 đoạn (1,1%) có tag ``maxspeed``,
# và **bỏ hẳn tag đi thì Spearman của trường thời gian vẫn 0,9991**. Tức trường đó không
# phải "98,9% giả định" mà là **100% giả định**, còn 1,1% kia chỉ là trang trí.
#
# Bộ dữ liệu này vì thế chỉ phát MÉT (``dist_station_network_m``) — đo trên hình học đường
# thật, không tham số nào. Xem DECISIONS.md §6.


def classify_poi(tags) -> str | None:
    """Phân lớp POI theo cùng taxonomy repo cũ, để hai bộ số so sánh được."""
    amenity = tags.get("amenity")
    shop = tags.get("shop")
    building = tags.get("building")
    if amenity == "fuel":
        return "FUEL"
    if amenity == "parking":
        kind = (tags.get("parking") or "").lower()
        return "PARKING_STREET" if kind in {"street_side", "lane", "on_street"} else "PARKING_OFF"
    if shop == "mall":
        return "MALL"
    if shop == "department_store":
        return "DEPT_STORE"
    if shop == "supermarket":
        return "SUPERMARKET"
    if amenity == "marketplace":
        return "MARKET"
    if building == "apartments" or tags.get("residential") == "apartments":
        return "APARTMENT"
    return None


def _levels(tags) -> float | None:
    v = tags.get("building:levels")
    try:
        return float(v) if v is not None else None
    except ValueError:
        return None


def main() -> None:
    paths.assert_sources()
    t0 = time.time()
    area = aoi.buffered()
    parea = prep(area)
    minx, miny, maxx, maxy = area.bounds

    roads, pois = [], []
    n_node = n_way = 0
    skipped_bbox_ok_area_no = 0

    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_locations("flex_mem")
    for o in fp:
        ts = o.type_str()

        if ts == "n":
            n_node += 1
            loc = o.location
            if not (minx <= loc.lon <= maxx and miny <= loc.lat <= maxy):
                continue
            tags = o.tags
            pc = classify_poi(tags)
            if pc is None:
                continue
            if not parea.contains(Point(loc.lon, loc.lat)):
                skipped_bbox_ok_area_no += 1
                continue
            if pc:
                pois.append(
                    {
                        "osm_type": "node",
                        "osm_id": o.id,
                        "poi_class": pc,
                        "name": tags.get("name"),
                        "access": tags.get("access"),
                        "levels": _levels(tags),
                        "lat": loc.lat,
                        "lng": loc.lon,
                    }
                )
            continue

        if ts != "w":
            continue
        n_way += 1
        tags = o.tags
        hw = tags.get("highway")
        pc = classify_poi(tags)
        if hw is None and pc is None:
            continue

        pts, nids = [], []
        for nd in o.nodes:
            if nd.location.valid():
                pts.append((nd.location.lon, nd.location.lat))
                nids.append(nd.ref)
        if len(pts) < 2:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        if max(xs) < minx or min(xs) > maxx or max(ys) < miny or min(ys) > maxy:
            continue

        if hw is not None and hw in ROAD_CLASS:
            line = LineString(pts)
            if not parea.intersects(line):
                skipped_bbox_ok_area_no += 1
                continue
            clipped = line.intersection(area)
            if clipped.is_empty:
                continue
            oneway = (tags.get("oneway") or "").lower()
            roads.append(
                {
                    "osm_id": o.id,
                    "road_class": ROAD_CLASS[hw],
                    "highway": hw,
                    "is_link": hw.endswith("_link"),
                    "oneway": 1
                    if oneway in {"yes", "true", "1"}
                    else (-1 if oneway == "-1" else 0),
                    "bridge": bool(tags.get("bridge")),
                    "tunnel": bool(tags.get("tunnel")),
                    "access": tags.get("access"),
                    "node_ids": nids,
                    "geometry_wkb": line.wkb,
                }
            )
            continue

        if pc:
            c = LineString(pts).centroid
            if not parea.contains(c):
                skipped_bbox_ok_area_no += 1
                continue
            pois.append(
                {
                    "osm_type": "way",
                    "osm_id": o.id,
                    "poi_class": pc,
                    "name": tags.get("name"),
                    "access": tags.get("access"),
                    "levels": _levels(tags),
                    "lat": c.y,
                    "lng": c.x,
                }
            )

    dr = pd.DataFrame(roads)
    dp = pd.DataFrame(pois)
    for d in (dr, dp):
        if "osm_id" in d:
            d.sort_values("osm_id", inplace=True)
            d.reset_index(drop=True, inplace=True)

    pq.write_table(
        pa.Table.from_pandas(dr, preserve_index=False), paths.RAW / "osm_hanoi_roads.parquet"
    )
    pq.write_table(
        pa.Table.from_pandas(dp, preserve_index=False), paths.RAW / "osm_hanoi_poi.parquet"
    )
    report = {
        "layer": "osm_extract",
        "source_pbf": str(paths.SRC_OSM_PBF),
        "aoi": "ranh giới VNSDI Hà Nội + đệm 5 km (đa giác thật, không phải bbox)",
        "stats": {
            "pbf_nodes_scanned": n_node,
            "pbf_ways_scanned": n_way,
            "roads": int(len(dr)),
            "road_class_counts": dr.road_class.value_counts().to_dict() if len(dr) else {},
            "poi": int(len(dp)),
            "poi_class_counts": dp.poi_class.value_counts().to_dict() if len(dp) else {},
            "dropped_in_bbox_but_outside_polygon": skipped_bbox_ok_area_no,
            "elapsed_s": round(time.time() - t0, 1),
        },
    }
    (paths.QA / "s03_osm_extract.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
