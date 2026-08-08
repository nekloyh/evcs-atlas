"""B3b — Lớp POI VISUAL: 4 nhóm cần nhìn thấy hình học thật, giữ cả polygon.

Vì sao là một bước RIÊNG chứ không phải mở rộng ``s03_osm_extract`` (quyết định 2026-08-07,
DESIGN.md §11 M3.5): lớp VISUAL (thực thể để nhìn trên bản đồ) và lớp ĐẾM-CẦU
(``n_poi_*``, taxonomy 8 lớp của s03/s09) là hai khái niệm. Nhét 2 nhóm mới vào s03 sẽ đổi
nghĩa ``n_poi_total``/``n_poi_1km`` (~4.000 POI trường học/công viên) ⇒ mọi số dẫn xuất và
R² trong DECISIONS §17 đổi theo mà không có lý do phân tích nào đứng sau.

Khác s03 ở hai chỗ, cả hai là lý do tồn tại của bước này:
  · GIỮ HÌNH HỌC: way khép kín và relation multipolygon giữ nguyên đa giác (WKB),
    không nén thành tâm. s03 vứt hình học ở đúng chỗ này (s03:185–200).
  · ĐỌC CẢ RELATION: ``with_areas()`` của osmium ráp multipolygon — s03 chỉ đọc
    node + way nên các khu lớn vẽ bằng relation rớt hẳn.

Dedup node⊂polygon (đã hỏi, 2026-08-07): OSM hay vẽ một thực thể hai lần — node tên đặt
giữa building của chính nó. Node rơi trong polygon CÙNG NHÓM bị loại, số đã loại ghi QA.

Sinh:
  data/raw/osm_hanoi_poi_visual.parquet  — group · tag · name · levels · lat/lng ·
                                           osm_type/osm_id · geometry_wkb (null = chỉ điểm)
  data/qa/s03b_osm_poi_visual.json
"""

from __future__ import annotations

import json
import time

import osmium
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely import STRtree
from shapely import wkb as shapely_wkb
from shapely.geometry import Point
from shapely.prepared import prep

from . import aoi, paths

# Tag đã chốt cho 4 nhóm — DESIGN.md §11 M3.5 (bảng "Tag OSM đã chốt", kèm các ứng viên
# đã loại và lý do). Nhóm `apartment`/`mall` trùng đúng luật APARTMENT/MALL/DEPT_STORE
# của s03 để hai lớp cùng nói về một tập.
GROUPS = ("apartment", "mall", "public", "edu_health")


def classify_poi_visual(tags) -> tuple[str, str] | None:
    """(nhóm, tag khớp) của một đối tượng OSM, hoặc None.

    Hàm THUẦN trên một dict-like — nhiều nhánh, sai sẽ âm thầm, nên có self-test chạy
    mỗi lần bước này chạy (xem ``_selftest_classify`` dưới).
    """
    building = tags.get("building")
    if building == "apartments" or tags.get("residential") == "apartments":
        key = "building" if building == "apartments" else "residential"
        return "apartment", f"{key}=apartments"

    shop = tags.get("shop")
    if shop in ("mall", "department_store"):
        return "mall", f"shop={shop}"

    leisure = tags.get("leisure")
    if leisure in ("park", "playground", "garden"):
        return "public", f"leisure={leisure}"
    amenity = tags.get("amenity")
    if amenity == "community_centre":
        return "public", "amenity=community_centre"

    if amenity in ("hospital", "school", "university", "college"):
        return "edu_health", f"amenity={amenity}"
    return None


def _selftest_classify() -> None:
    """Self-test của luật phân loại — chạy MỖI lần bước này chạy, nổ to nếu luật gãy.

    Không có hạ tầng pytest trong repo (quy ước kiểm của pipeline là QA JSON); một luật
    nhiều nhánh mà chỉ được kiểm bằng số đếm tổng thì gãy âm thầm, nên self-test đứng
    ngay cạnh luật.
    """
    cases: list[tuple[dict, tuple[str, str] | None]] = [
        ({"building": "apartments"}, ("apartment", "building=apartments")),
        ({"residential": "apartments"}, ("apartment", "residential=apartments")),
        # building=apartments thắng residential khi cả hai có mặt — tag khớp phải nói tag thật
        (
            {"building": "apartments", "residential": "apartments"},
            ("apartment", "building=apartments"),
        ),
        ({"building": "dormitory"}, None),  # ký túc xá — đã loại có chủ ý
        ({"shop": "mall"}, ("mall", "shop=mall")),
        ({"shop": "department_store"}, ("mall", "shop=department_store")),
        ({"shop": "supermarket"}, None),  # thuộc taxonomy ĐẾM-CẦU của s03, không thuộc visual
        ({"leisure": "park"}, ("public", "leisure=park")),
        ({"leisure": "playground"}, ("public", "leisure=playground")),
        ({"leisure": "garden"}, ("public", "leisure=garden")),
        ({"leisure": "sports_centre"}, None),  # thường thu phí — đã loại
        ({"amenity": "community_centre"}, ("public", "amenity=community_centre")),
        ({"amenity": "hospital"}, ("edu_health", "amenity=hospital")),
        ({"amenity": "clinic"}, None),  # phòng khám ≠ bệnh viện — đã loại
        ({"amenity": "school"}, ("edu_health", "amenity=school")),
        ({"amenity": "university"}, ("edu_health", "amenity=university")),
        ({"amenity": "college"}, ("edu_health", "amenity=college")),
        ({"amenity": "kindergarten"}, None),  # mầm non — đã loại
        ({"highway": "residential"}, None),
        ({}, None),
    ]
    for tags, want in cases:
        got = classify_poi_visual(tags)
        assert got == want, f"classify_poi_visual({tags}) = {got}, muốn {want}"


def _levels(tags) -> float | None:
    v = tags.get("building:levels")
    try:
        return float(v) if v is not None else None
    except ValueError:
        return None


def main() -> None:
    _selftest_classify()
    paths.assert_sources()
    t0 = time.time()
    area = aoi.buffered()
    parea = prep(area)
    minx, miny, maxx, maxy = area.bounds

    nodes: list[dict] = []
    polys: list[dict] = []
    poly_geoms: list = []
    n_assembly_err = 0

    wkbf = osmium.geom.WKBFactory()
    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_areas()
    for o in fp:
        ts = o.type_str()
        if ts == "n":
            tags = o.tags
            if len(tags) == 0:
                continue
            hit = classify_poi_visual(tags)
            if hit is None:
                continue
            loc = o.location
            if not (minx <= loc.lon <= maxx and miny <= loc.lat <= maxy):
                continue
            if not parea.contains(Point(loc.lon, loc.lat)):
                continue
            group, tag = hit
            nodes.append(
                {
                    "group": group,
                    "tag": tag,
                    "name": tags.get("name"),
                    "levels": _levels(tags),
                    "lat": loc.lat,
                    "lng": loc.lon,
                    "osm_type": "node",
                    "osm_id": o.id,
                    "geometry_wkb": None,
                }
            )
        elif ts == "a":
            tags = o.tags
            hit = classify_poi_visual(tags)
            if hit is None:
                continue
            # Ráp multipolygon có thể hỏng trên dữ liệu OSM lỗi — đếm, không chết im.
            try:
                g = shapely_wkb.loads(bytes.fromhex(wkbf.create_multipolygon(o)))
            except Exception:
                n_assembly_err += 1
                continue
            gx0, gy0, gx1, gy1 = g.bounds
            if gx1 < minx or gx0 > maxx or gy1 < miny or gy0 > maxy:
                continue
            # `intersects`, không cắt: một công viên vắt qua mép vành đệm vẫn giữ nguyên
            # hình thật — mép đệm là ranh THU THẬP, không phải một đường có thật trên đất.
            if not parea.intersects(g):
                continue
            group, tag = hit
            c = g.centroid
            polys.append(
                {
                    "group": group,
                    "tag": tag,
                    "name": tags.get("name"),
                    "levels": _levels(tags),
                    "lat": c.y,
                    "lng": c.x,
                    "osm_type": "way" if o.from_way() else "relation",
                    "osm_id": o.orig_id(),
                    "geometry_wkb": g.wkb,
                }
            )
            poly_geoms.append(g)

    # Dedup node⊂polygon CÙNG NHÓM — một thực thể một mark.
    dropped_by_group = dict.fromkeys(GROUPS, 0)
    kept_nodes: list[dict] = []
    tree = STRtree(poly_geoms) if poly_geoms else None
    for nd in nodes:
        dup = False
        if tree is not None:
            for i in tree.query(Point(nd["lng"], nd["lat"]), predicate="intersects"):
                if polys[int(i)]["group"] == nd["group"]:
                    dup = True
                    break
        if dup:
            dropped_by_group[nd["group"]] += 1
        else:
            kept_nodes.append(nd)

    df = pd.DataFrame(kept_nodes + polys)
    df.sort_values(["group", "osm_type", "osm_id"], inplace=True)
    df.reset_index(drop=True, inplace=True)
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False),
        paths.RAW / "osm_hanoi_poi_visual.parquet",
    )

    by_group = {
        g: {
            "n": int((df.group == g).sum()),
            "n_polygon": int(((df.group == g) & df.geometry_wkb.notna()).sum()),
            "n_point_only": int(((df.group == g) & df.geometry_wkb.isna()).sum()),
            "node_dupes_dropped": dropped_by_group[g],
        }
        for g in GROUPS
    }
    report = {
        "layer": "osm_poi_visual",
        "source_pbf": str(paths.SRC_OSM_PBF),
        "aoi": "ranh giới VNSDI Hà Nội + đệm 5 km (đa giác thật, không phải bbox)",
        "stats": {
            "poi": int(len(df)),
            "by_group": by_group,
            "multipolygon_assembly_errors": n_assembly_err,
            "elapsed_s": round(time.time() - t0, 1),
        },
    }
    (paths.QA / "s03b_osm_poi_visual.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
