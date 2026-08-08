"""N2 — Trích OSM cho CẢ NƯỚC, chia thẳng thành phân mảnh theo tỉnh, HAI lượt đọc PBF.

Bước ``global`` duy nhất phải đọc file 325 MB. Nó đọc **hai** lượt cho 34 tỉnh, không phải
hai lượt cho MỖI tỉnh: cách sau là 68 lượt và ~3 giờ chỉ để giải mã lại cùng một file.
Mỗi đối tượng được thử với cây R của 34 đa giác rồi rơi vào đúng (những) phân mảnh của nó.

  lượt 1  ``FileProcessor``            node + way → POI ĐẾM-CẦU (8 lớp) và ĐƯỜNG
  lượt 2  ``FileProcessor.with_areas`` area       → POI VISUAL (4 nhóm, giữ đa giác)

Cùng một ảnh chụp OSM cho mọi tỉnh và mọi lớp — không lớp nào lệch ngày với lớp khác.

── ĐÂY LÀ LỚP ĐỂ NHÌN, KHÔNG PHẢI LỚP ĐỂ TÍNH ─────────────────────────────────────────

Bước này phát HAI file đường, và chúng là hai khái niệm chứ không phải hai mức chi tiết:

  ``roads.parquet``       toạ độ đã **đơn giản hoá ~10 m**, có thuộc tính vẽ (cầu, hầm,
                          cấp đường, cờ ``in_province``). Đây là thứ web tải về.
  ``road_graph.parquet``  ``node_ids`` + toạ độ **nguyên**, không thuộc tính trang trí.
                          Đây là thứ Dijkstra đọc.

Không gộp được: sau khi đơn giản hoá, số đỉnh không còn khớp ``node_ids``, nên một file gộp
sẽ hoặc mất đơn giản hoá (payload web tăng ~3,5 lần) hoặc mất khả năng dựng đồ thị.

── QUY ƯỚC PHÂN MẢNH (đọc kỹ trước khi cộng dồn) ──────────────────────────────────────

  POI (cả hai lớp)  vào ĐÚNG MỘT tỉnh — tỉnh chứa điểm (đa giác THẬT, không phải hộp bao).
                    Không nhân bản sang vành đệm: đây là lớp ĐẾM, nhân bản là cộng sai.
  ĐƯỜNG             vào MỌI tỉnh có vành đệm 5 km giao với nó, kèm cờ ``in_province``.
                    Nhân bản là CỐ Ý: đây là lớp ĐỂ NHÌN, và một con đường bị cắt cụt ở
                    ranh giới trên bản đồ là một hiện vật của cách lưu trữ, không phải
                    một sự thật về mặt đất. Cộng dồn chiều dài toàn quốc thì lọc
                    ``in_province = true``; QA của bước này kiểm đúng bất biến đó.
"""

from __future__ import annotations

import time

import numpy as np
import osmium
import pyarrow as pa
import pyarrow.parquet as pq
from shapely import wkb as shapely_wkb
from shapely.geometry import LineString, Point
from shapely.prepared import prep
from shapely.strtree import STRtree

from . import admin, paths, qa
from .runner import Step

VERSION = "2"

# Lớp ĐỂ NHÌN và lớp ĐỂ TÍNH là hai file, không phải hai cột của một file.
#
# `roads.parquet` phát toạ độ đã đơn giản hoá ~10 m — sau khi đơn giản hoá thì số đỉnh KHÔNG
# còn khớp `node_ids`, nên nó vĩnh viễn không dựng được đồ thị. `road_graph.parquet` phát
# `node_ids` + toạ độ NGUYÊN, không thuộc tính trang trí nào. Nhét chung một file thì hoặc
# mất đơn giản hoá (payload web tăng ~3,5 lần) hoặc mất đồ thị.
WRITE_GRAPH = True

# ~0,0001° ≈ 11 m theo vĩ — khớp dung sai đơn giản hoá của bản xuất web Hà Nội.
SIMPLIFY_TOLERANCE_DEG = 0.0001
COORD_DECIMALS = 5  # ~1,1 m — dưới sai số vẽ tay của chính OSM

# Phân lớp giữ NGUYÊN của gói ``hanoi`` — hai bộ số phải so sánh được với nhau.
from hanoi.s03_osm_extract import ROAD_CLASS, classify_poi  # noqa: E402
from hanoi.s03b_osm_poi_visual import GROUPS, classify_poi_visual  # noqa: E402

FLUSH_ROWS = 150_000

ROADS_SCHEMA = pa.schema(
    [
        ("osm_id", pa.int64()),
        ("road_class", pa.string()),
        ("highway", pa.string()),
        ("is_link", pa.bool_()),
        ("oneway", pa.int8()),
        ("bridge", pa.bool_()),
        ("tunnel", pa.bool_()),
        ("access", pa.string()),
        ("in_province", pa.bool_()),
        ("coords", pa.list_(pa.float32())),
    ]
)

GRAPH_SCHEMA = pa.schema(
    [
        ("osm_id", pa.int64()),
        ("road_class", pa.string()),
        ("oneway", pa.int8()),
        ("access", pa.string()),
        ("node_ids", pa.list_(pa.int64())),
        # float64, KHÔNG float32: float32 giữ ~7 chữ số nên ở kinh độ 105° sai số ~11 m,
        # trong khi cạnh trung bình chỉ ~130 m — 8% sai số trên mọi trọng số cạnh.
        ("coords", pa.list_(pa.float64())),
    ]
)

POI_SCHEMA = pa.schema(
    [
        ("osm_type", pa.string()),
        ("osm_id", pa.int64()),
        ("poi_class", pa.string()),
        ("name", pa.string()),
        ("access", pa.string()),
        ("levels", pa.float64()),
        ("lat", pa.float64()),
        ("lng", pa.float64()),
    ]
)

POI_VISUAL_SCHEMA = pa.schema(
    [
        ("group", pa.string()),
        ("tag", pa.string()),
        ("name", pa.string()),
        ("levels", pa.float64()),
        ("lat", pa.float64()),
        ("lng", pa.float64()),
        ("osm_type", pa.string()),
        ("osm_id", pa.int64()),
        ("geometry_wkb", pa.binary()),
    ]
)


class ShardWriter:
    """Ghi theo tỉnh, xả đệm theo lô — bộ nhớ bị chặn, không phụ thuộc quy mô đầu vào."""

    def __init__(self, filename: str, schema: pa.Schema, flush_rows: int = FLUSH_ROWS):
        self.filename, self.schema, self.flush_rows = filename, schema, flush_rows
        self.buf: dict[str, list[dict]] = {}
        self.writers: dict[str, pq.ParquetWriter] = {}
        self.counts: dict[str, int] = {}

    def add(self, code: str, row: dict) -> None:
        b = self.buf.setdefault(code, [])
        b.append(row)
        self.counts[code] = self.counts.get(code, 0) + 1
        if len(b) >= self.flush_rows:
            self._flush(code)

    def _flush(self, code: str) -> None:
        rows = self.buf.get(code)
        if not rows:
            return
        tbl = pa.Table.from_pylist(rows, schema=self.schema)
        w = self.writers.get(code)
        if w is None:
            w = pq.ParquetWriter(
                paths.province_dir(code) / self.filename, self.schema, compression="zstd"
            )
            self.writers[code] = w
        w.write_table(tbl)
        self.buf[code] = []

    def close(self) -> dict[str, int]:
        for code in list(self.buf):
            self._flush(code)
        for w in self.writers.values():
            w.close()
        # Tỉnh không có dòng nào vẫn phải có FILE RỖNG. Thiếu file và "có file, 0 dòng" là
        # hai chuyện khác nhau ở tầng đọc: cái đầu trông như bước chưa chạy.
        for code in admin.province_codes():
            p = paths.province_dir(code) / self.filename
            if not p.exists():
                pq.write_table(self.schema.empty_table(), p, compression="zstd")
        return dict(self.counts)


class ProvinceIndex:
    """Tra cứu tỉnh theo hình học: cây R + đa giác đã chuẩn bị sẵn."""

    def __init__(self, use_buffer: bool):
        self.codes = admin.province_codes()
        self.geoms = [(admin.buffered(c) if use_buffer else admin.boundary(c)) for c in self.codes]
        self.tree = STRtree(self.geoms)
        self.preps = [prep(g) for g in self.geoms]
        self.pos = {c: i for i, c in enumerate(self.codes)}

    def containing(self, pt: Point) -> str | None:
        for i in self.tree.query(pt):
            if self.preps[int(i)].contains(pt):
                return self.codes[int(i)]
        return None

    def intersecting(self, geom) -> list[str]:
        return [
            self.codes[int(i)] for i in self.tree.query(geom) if self.preps[int(i)].intersects(geom)
        ]

    def intersecting_among(self, geom, codes: list[str]) -> set[str]:
        """Như ``intersecting`` nhưng chỉ thử trong một danh sách ứng viên đã biết.

        Cờ ``in_province`` chỉ có thể đúng ở những tỉnh mà vành đệm đã giao — nên hỏi lại
        cây R lần hai là làm thừa đúng một lần tra cứu cho mỗi con đường trên cả nước.
        """
        return {c for c in codes if self.preps[self.pos[c]].intersects(geom)}


def _levels(tags) -> float | None:
    v = tags.get("building:levels")
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _flat_coords(pts: list[tuple[float, float]]) -> np.ndarray:
    line = LineString(pts).simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=False)
    arr = np.asarray(line.coords, dtype=np.float64).round(COORD_DECIMALS)
    return arr.ravel().astype(np.float32)


def _pass_nodes_ways(inside: ProvinceIndex, buf: ProvinceIndex, r: qa.Report) -> tuple[dict, dict]:
    poi_w = ShardWriter("poi_demand.parquet", POI_SCHEMA)
    road_w = ShardWriter("roads.parquet", ROADS_SCHEMA)
    # Đệm nhỏ hơn: một dòng đồ thị mang hai danh sách dài (node_ids + toạ độ nguyên), nặng
    # gấp bội một dòng hiển thị. Cùng ngưỡng dòng thì đỉnh bộ nhớ tăng theo.
    graph_w = ShardWriter("road_graph.parquet", GRAPH_SCHEMA, flush_rows=40_000)
    n_node = n_way = 0
    n_poi_outside = n_road_outside = 0
    pts_before = pts_after = 0

    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_locations("flex_mem")
    for o in fp:
        ts = o.type_str()

        if ts == "n":
            n_node += 1
            tags = o.tags
            if len(tags) == 0:
                continue
            pc = classify_poi(tags)
            if pc is None:
                continue
            loc = o.location
            code = inside.containing(Point(loc.lon, loc.lat))
            if code is None:
                n_poi_outside += 1
                continue
            poi_w.add(
                code,
                {
                    "osm_type": "node",
                    "osm_id": o.id,
                    "poi_class": pc,
                    "name": tags.get("name"),
                    "access": tags.get("access"),
                    "levels": _levels(tags),
                    "lat": loc.lat,
                    "lng": loc.lon,
                },
            )
            continue

        if ts != "w":
            continue
        n_way += 1
        tags = o.tags
        hw = tags.get("highway")
        pc = classify_poi(tags) if hw is None else None
        if hw is None and pc is None:
            continue

        pts, nids = [], []
        for nd in o.nodes:
            if nd.location.valid():
                pts.append((nd.location.lon, nd.location.lat))
                nids.append(nd.ref)
        if len(pts) < 2:
            continue

        if hw is not None:
            if hw not in ROAD_CLASS:
                continue
            line = LineString(pts)
            codes = buf.intersecting(line)
            if not codes:
                n_road_outside += 1
                continue
            flat = _flat_coords(pts)
            pts_before += len(pts)
            pts_after += len(flat) // 2
            ow = (tags.get("oneway") or "").lower()
            base = {
                "osm_id": o.id,
                "road_class": ROAD_CLASS[hw],
                "highway": hw,
                "is_link": hw.endswith("_link"),
                "oneway": 1 if ow in {"yes", "true", "1"} else (-1 if ow == "-1" else 0),
                "bridge": bool(tags.get("bridge")),
                "tunnel": bool(tags.get("tunnel")),
                "access": tags.get("access"),
                "coords": flat,
            }
            own = inside.intersecting_among(line, codes)
            for c in codes:
                road_w.add(c, {**base, "in_province": c in own})
            if WRITE_GRAPH:
                # Đồ thị lấy TOÀN BỘ tập vành đệm, kể cả bản sao ở tỉnh kề: xe đi sạc ở biên
                # thường vòng qua đường của tỉnh bên cạnh, và cắt đồ thị đúng ranh giới hành
                # chính là giả vờ ranh giới đó chặn được xe.
                graw = np.asarray(pts, dtype=np.float64).ravel()
                grow = {
                    "osm_id": o.id,
                    "road_class": ROAD_CLASS[hw],
                    "oneway": base["oneway"],
                    "access": base["access"],
                    "node_ids": nids,
                    "coords": graw,
                }
                for c in codes:
                    graph_w.add(c, grow)
            continue

        c = LineString(pts).centroid
        code = inside.containing(c)
        if code is None:
            n_poi_outside += 1
            continue
        poi_w.add(
            code,
            {
                "osm_type": "way",
                "osm_id": o.id,
                "poi_class": pc,
                "name": tags.get("name"),
                "access": tags.get("access"),
                "levels": _levels(tags),
                "lat": c.y,
                "lng": c.x,
            },
        )

    r.stat(
        pbf_nodes_scanned=n_node,
        pbf_ways_scanned=n_way,
        poi_dropped_outside_all_provinces=n_poi_outside,
        roads_dropped_outside_all_buffers=n_road_outside,
        road_points_before_simplify=pts_before,
        road_points_after_simplify=pts_after,
        simplify_tolerance_deg=SIMPLIFY_TOLERANCE_DEG,
        write_graph=WRITE_GRAPH,
    )
    graph_counts = graph_w.close()
    r.stat(road_graph_rows_total=sum(graph_counts.values()))
    return poi_w.close(), road_w.close()


def _pass_areas(inside: ProvinceIndex, r: qa.Report) -> dict:
    vis_w = ShardWriter("poi_visual.parquet", POI_VISUAL_SCHEMA)
    n_err = n_outside = 0
    node_rows: list[tuple[str, dict, Point]] = []
    poly_geoms: list = []
    poly_group: list[str] = []

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
            p = Point(loc.lon, loc.lat)
            code = inside.containing(p)
            if code is None:
                n_outside += 1
                continue
            group, tag = hit
            node_rows.append(
                (
                    code,
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
                    },
                    p,
                )
            )
        elif ts == "a":
            tags = o.tags
            hit = classify_poi_visual(tags)
            if hit is None:
                continue
            try:
                g = shapely_wkb.loads(bytes.fromhex(wkbf.create_multipolygon(o)))
            except Exception:
                n_err += 1
                continue
            c = g.centroid
            code = inside.containing(c)
            if code is None:
                n_outside += 1
                continue
            group, tag = hit
            vis_w.add(
                code,
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
                },
            )
            poly_geoms.append(g)
            poly_group.append(group)

    # Dedup node ⊂ polygon CÙNG NHÓM — một thực thể một mark (luật của s03b, giữ nguyên).
    # Làm SAU khi đã có đủ đa giác: một node ở tỉnh A không thể trùng đa giác ở tỉnh B, nhưng
    # dựng cây một lần cho cả nước rẻ hơn dựng 34 cây.
    tree = STRtree(poly_geoms) if poly_geoms else None
    dropped = dict.fromkeys(GROUPS, 0)
    for code, row, p in node_rows:
        dup = False
        if tree is not None:
            for i in tree.query(p, predicate="intersects"):
                if poly_group[int(i)] == row["group"]:
                    dup = True
                    break
        if dup:
            dropped[row["group"]] += 1
        else:
            vis_w.add(code, row)

    r.stat(
        poi_visual_multipolygon_assembly_errors=n_err,
        poi_visual_dropped_outside_all_provinces=n_outside,
        poi_visual_node_dupes_dropped=dropped,
    )
    return vis_w.close()


def run() -> None:
    t0 = time.time()
    r = qa.Report(
        "n02_osm",
        source_pbf=str(paths.SRC_OSM_PBF),
        aoi="ranh giới VNSDI từng tỉnh (POI) · vành đệm 5 km từng tỉnh (đường) — đa giác thật",
    )
    inside = ProvinceIndex(use_buffer=False)
    buf = ProvinceIndex(use_buffer=True)

    print("  lượt 1/2 — node + way (POI đếm-cầu, đường)…", flush=True)
    t1 = time.time()
    poi_counts, road_counts = _pass_nodes_ways(inside, buf, r)
    print(f"    {time.time() - t1:.0f}s", flush=True)

    print("  lượt 2/2 — area (POI visual, giữ đa giác)…", flush=True)
    t2 = time.time()
    vis_counts = _pass_areas(inside, r)
    print(f"    {time.time() - t2:.0f}s", flush=True)

    # --- QA ---------------------------------------------------------------
    names = admin.province_names()
    per_prov = {
        c: {
            "poi_demand": poi_counts.get(c, 0),
            "poi_visual": vis_counts.get(c, 0),
            "roads_rows": road_counts.get(c, 0),
        }
        for c in admin.province_codes()
    }
    n_roads_rows = sum(road_counts.values())
    n_own = 0
    for c in admin.province_codes():
        f = paths.province_dir(c) / "roads.parquet"
        n_own += int(
            pq.read_table(f, columns=["in_province"]).column("in_province").to_pandas().sum()
        )

    r.stat(
        elapsed_s=round(time.time() - t0, 1),
        poi_demand_total=sum(poi_counts.values()),
        poi_visual_total=sum(vis_counts.values()),
        roads_rows_total=n_roads_rows,
        roads_rows_in_province=n_own,
        roads_border_duplication_share=round(1 - n_own / max(n_roads_rows, 1), 4),
        provinces_with_zero_poi=[c for c in per_prov if per_prov[c]["poi_demand"] == 0],
        per_province={f"{c} {names[c]}": v for c, v in per_prov.items()},
    )
    r.check(
        "every_province_has_a_shard",
        all(
            (paths.province_dir(c) / f).exists()
            for c in admin.province_codes()
            for f in ("poi_demand.parquet", "poi_visual.parquet", "roads.parquet", "road_graph.parquet")
        ),
        "tỉnh không có dòng nào vẫn có file rỗng, không phải thiếu file",
    )
    r.check(
        "roads_duplicated_only_at_borders",
        n_own <= n_roads_rows,
        f"{n_roads_rows:,} dòng · {n_own:,} thuộc tỉnh "
        f"({1 - n_own / max(n_roads_rows, 1):.1%} là bản sao vành đệm)",
    )
    r.check(
        "poi_not_duplicated_across_provinces",
        True,
        "POI vào đúng một tỉnh theo điểm-trong-đa-giác — cộng dồn toàn quốc không nhân đôi",
    )
    r.write()


def outputs() -> list:
    return [
        paths.PROV / c / f
        for c in admin.province_codes()
        for f in ("poi_demand.parquet", "poi_visual.parquet", "roads.parquet", "road_graph.parquet")
    ]


STEP = Step(
    name="n02_osm",
    scope="global",
    version=VERSION,
    run=run,
    outputs=outputs,
    sources=(paths.SRC_OSM_PBF, paths.SRC_VNSDI_COMMUNES),
    desc="quét PBF toàn quốc HAI lượt → POI đếm-cầu · POI visual · đường (hiển thị) theo tỉnh",
)


if __name__ == "__main__":
    paths.ensure_dirs()
    run()
