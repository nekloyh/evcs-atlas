"""A17 — Trích POI theo taxonomy MỞ RỘNG, phục vụ nghiên cứu L5.

A15 đã ĐẾM và cho thấy taxonomy 8 lớp hiện hành bỏ sót ~4,3× số đối tượng. Bước này
TRÍCH RA để nghiên cứu được. Đây là **hiện vật nghiên cứu**, không phải một phần của bộ
dữ liệu — nên ghi vào ``data/qa/critique/`` chứ không vào ``data/raw/``.

Cùng luật cắt biên với s03: lọc theo đa giác thật, không theo hộp bao.
"""

from __future__ import annotations

import time

import osmium
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from _common import CRITIQUE
from shapely.geometry import LineString, Point
from shapely.prepared import prep

from evcs.core.osm import classify_poi
from vn import admin, paths

# Nhóm mở rộng. Giữ RIÊNG lớp gốc ở cột `poi_class` để so được với bản hiện hành.
EXT = [
    ("CUA_HANG_TIEN_LOI", lambda t: t.get("shop") == "convenience"),
    ("AN_UONG", lambda t: t.get("amenity") in {"restaurant", "cafe", "fast_food", "food_court"}),
    ("KHACH_SAN", lambda t: t.get("tourism") in {"hotel", "motel", "guest_house", "hostel"}),
    ("GIAO_DUC", lambda t: t.get("amenity") in {"school", "university", "college", "kindergarten"}),
    ("Y_TE", lambda t: t.get("amenity") in {"hospital", "clinic", "doctors"}),
    ("VAN_PHONG", lambda t: t.get("office") is not None or t.get("building") in {"office", "commercial"}),
    ("BAN_LE_KHAC", lambda t: t.get("shop") is not None
     and t.get("shop") not in {"mall", "department_store", "supermarket", "convenience"}),
    ("NGAN_HANG", lambda t: t.get("amenity") in {"bank", "atm"}),
    ("GIAI_TRI", lambda t: t.get("leisure") in {"sports_centre", "stadium", "fitness_centre", "park"}),
    ("BEN_XE_GA", lambda t: t.get("amenity") == "bus_station" or t.get("railway") == "station"),
]


def klass(tags):
    c = classify_poi(tags)
    if c:
        return c, "GOC"
    for name, f in EXT:
        if f(tags):
            return name, "MO_RONG"
    return None, None


def main() -> None:
    t0 = time.time()
    hanoi = admin.boundary("01")
    ph = prep(hanoi)
    minx, miny, maxx, maxy = hanoi.bounds
    rows = []

    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_locations("flex_mem")
    for o in fp:
        ts = o.type_str()
        if ts not in ("n", "w"):
            continue
        tags = o.tags
        cls, tang = klass(tags)
        if cls is None:
            continue
        if ts == "n":
            loc = o.location
            if not (minx <= loc.lon <= maxx and miny <= loc.lat <= maxy):
                continue
            x, y, geom = loc.lon, loc.lat, "node"
        else:
            pts = [(n.location.lon, n.location.lat) for n in o.nodes if n.location.valid()]
            if len(pts) < 2:
                continue
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if max(xs) < minx or min(xs) > maxx or max(ys) < miny or min(ys) > maxy:
                continue
            c = LineString(pts).centroid
            x, y, geom = c.x, c.y, "way"
        if not ph.contains(Point(x, y)):
            continue
        rows.append({
            "osm_type": geom, "osm_id": o.id, "poi_class": cls, "tang": tang,
            "name": tags.get("name"), "lat": y, "lng": x,
        })

    df = pd.DataFrame(rows)
    import h3

    from evcs.core import grid as gridmod

    df["h3_r8"] = [h3.latlng_to_cell(a, b, gridmod.RES) for a, b in zip(df.lat, df.lng)]
    out = CRITIQUE / "poi_extended.parquet"
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), out)
    print(f"{len(df):,} POI → {out}  ({time.time()-t0:.0f}s)")
    print(df.groupby(["tang", "poi_class"]).size().to_string())


if __name__ == "__main__":
    main()
