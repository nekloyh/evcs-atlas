"""B3c — Trạm biến áp OSM: TOẠ ĐỘ để vẽ, không phải một trường để tính.

Vì sao là một bước RIÊNG chứ không phải mở rộng ``s03_osm_extract`` — cùng tiền lệ s03b
(DESIGN.md §11 M3.5): nhét một khái niệm mới vào s03 sẽ đổi nghĩa các cột đếm POI hiện có
(``n_poi_total`` / ``n_poi_1km``) và kéo theo mọi số dẫn xuất. Ở đây còn thêm một lý do:
s03 mở đầu bằng câu "KHÔNG trích ``power=substation``" và câu đó vẫn ĐÚNG cho việc của
s03 — lớp ĐẾM-CẦU không có chỗ cho trạm biến áp.

**Ranh giới phạm vi, đọc trước khi dùng file này** (DECISIONS.md §8 sửa đổi):
``dist_substation_m`` đã bị bỏ và KHÔNG quay lại. Khả năng đấu nối lưới — kVA khả dụng,
công suất trạm biến áp — nằm ngoài phạm vi bài toán. Bước này chỉ xuất **vị trí**, và một
trạm biến áp trên bản đồ chỉ nói đúng một điều: *"ở đây có một trạm biến áp trong OSM"*.
Không cột công suất, không khoảng cách tới trạm biến áp, không bán kính phục vụ.

Vì sao vẫn đáng trích, dù trường phái sinh đã bị loại: **n nhỏ giết một TRƯỜNG, không giết
một LỚP**. Một trường khoảng cách dựng trên mẫu thưa là bịa ra sự khác biệt giữa các ô
(A12 đo: 1 trạm biến áp làm láng giềng gần nhất cho tới 236 ô); một lớp điểm chỉ khẳng
định đúng những điểm nó vẽ, và cái nó KHÔNG vẽ được nói ra bằng cảnh báo n nhỏ.

Sinh:
  data/raw/osm_hanoi_substations.parquet — osm_type · osm_id · name · lat · lng
  data/qa/s03c_osm_substation.json
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


def is_substation(tags) -> bool:
    """``power=substation`` và chỉ thế.

    Ba thứ cố tình KHÔNG lấy, mỗi thứ một lý do:

    * ``power=transformer`` / ``pole`` / ``portal`` / ``minor_line`` — thiết bị trên cột,
      không phải trạm. A12 đã chốt phạm vi này; giữ nguyên để con số so được với A12.
    * ``substation=transmission|distribution|traction`` — phân hạng theo cấp điện áp.
      Đọc nó là mã hoá **công suất lưới điện**, thứ DESIGN §12 gọi đích danh là cấm.
      Một trạm biến áp ở đây không có hạng: nó chỉ có mặt.
    * ``building=transformer_tower`` — nhãn kiến trúc, không phải nhãn hạ tầng điện.

    Hàm THUẦN trên một dict-like, có self-test chạy mỗi lần bước này chạy.
    """
    return tags.get("power") == "substation"


def _selftest_is_substation() -> None:
    """Self-test của luật phân loại — chạy MỖI lần bước này chạy, nổ to nếu luật gãy.

    Cùng khuôn ``_selftest_classify`` của s03b: luật sống ở Python (nơi duy nhất chạm tag
    thô) nên phép kiểm của nó cũng ở đây, không chép sang TS để hai bản trôi khỏi nhau.
    """
    cases: list[tuple[dict, bool]] = [
        ({"power": "substation"}, True),
        # phân hạng điện áp CÓ mặt vẫn không đổi kết quả — ta không đọc nó (§12)
        ({"power": "substation", "substation": "transmission"}, True),
        ({"power": "substation", "substation": "minor_distribution"}, True),
        ({"power": "substation", "voltage": "110000"}, True),
        ({"power": "transformer"}, False),
        ({"power": "pole"}, False),
        ({"power": "portal"}, False),
        ({"power": "minor_line"}, False),
        ({"power": "line"}, False),
        ({"power": "generator"}, False),
        ({"building": "transformer_tower"}, False),
        # "substation" ở tag khác mà không có power= thì không phải trạm biến áp điện
        ({"substation": "distribution"}, False),
        ({"railway": "substation"}, False),
        ({"building": "yes"}, False),
        ({}, False),
    ]
    for tags, want in cases:
        got = is_substation(tags)
        assert got == want, f"is_substation({tags}) = {got}, muốn {want}"


def main() -> None:
    _selftest_is_substation()
    paths.assert_sources()
    t0 = time.time()
    area = aoi.buffered()
    parea = prep(area)
    minx, miny, maxx, maxy = area.bounds

    nodes: list[dict] = []
    areas: list[dict] = []
    area_geoms: list = []
    n_assembly_err = 0

    wkbf = osmium.geom.WKBFactory()
    # `with_areas()` như s03b: trạm biến áp phần lớn được vẽ bằng way khép kín, và những
    # trạm lớn bằng relation multipolygon. Đọc mỗi node thì mất gần hết.
    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_areas()
    for o in fp:
        ts = o.type_str()
        if ts == "n":
            tags = o.tags
            if len(tags) == 0 or not is_substation(tags):
                continue
            loc = o.location
            if not (minx <= loc.lon <= maxx and miny <= loc.lat <= maxy):
                continue
            if not parea.contains(Point(loc.lon, loc.lat)):
                continue
            nodes.append(
                {
                    "osm_type": "node",
                    "osm_id": o.id,
                    "name": tags.get("name"),
                    "lat": loc.lat,
                    "lng": loc.lon,
                }
            )
        elif ts == "a":
            if not is_substation(o.tags):
                continue
            try:
                g = shapely_wkb.loads(bytes.fromhex(wkbf.create_multipolygon(o)))
            except Exception:
                n_assembly_err += 1
                continue
            gx0, gy0, gx1, gy1 = g.bounds
            if gx1 < minx or gx0 > maxx or gy1 < miny or gy0 > maxy:
                continue
            if not parea.intersects(g):
                continue
            # TÂM của đa giác, không phải đa giác. Lớp này là lớp ĐIỂM (DESIGN §4d-1):
            # nó khẳng định "có một trạm biến áp ở đây", và tâm của một đa giác THẬT nói
            # đúng câu đó. Vẽ cạnh sẽ là một overlay VÙNG — khái niệm khác, luật khác
            # (§4d-1 vân 135°), và không luận điểm nào của app cần cạnh của trạm biến áp.
            c = g.centroid
            areas.append(
                {
                    "osm_type": "way" if o.from_way() else "relation",
                    "osm_id": o.orig_id(),
                    "name": o.tags.get("name"),
                    "lat": c.y,
                    "lng": c.x,
                }
            )
            area_geoms.append(g)

    # Dedup node ⊂ đa giác — cùng lý do s03b: OSM hay đặt một node tên giữa chính khuôn
    # viên của nó. Không loại thì bản đồ đếm một trạm biến áp thành hai, và cảnh báo n nhỏ
    # sẽ nói một con số cao hơn sự thật — đúng chiều sai nguy hiểm nhất cho lớp này.
    tree = STRtree(area_geoms) if area_geoms else None
    kept_nodes: list[dict] = []
    n_node_dupes = 0
    for nd in nodes:
        dup = (
            tree is not None
            and len(tree.query(Point(nd["lng"], nd["lat"]), predicate="intersects")) > 0
        )
        if dup:
            n_node_dupes += 1
        else:
            kept_nodes.append(nd)

    df = pd.DataFrame(kept_nodes + areas, columns=["osm_type", "osm_id", "name", "lat", "lng"])
    df.sort_values(["osm_type", "osm_id"], inplace=True)
    df.reset_index(drop=True, inplace=True)
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False),
        paths.RAW / "osm_hanoi_substations.parquet",
    )

    # "Dùng được" = có CẢ HAI toạ độ hữu hạn. Đo chứ không giả định: câu hỏi của BƯỚC 0 là
    # "bao nhiêu trạm biến áp có toạ độ dùng được", và câu trả lời phải là một phép đo.
    usable = df.lat.notna() & df.lng.notna() if len(df) else pd.Series(dtype=bool)
    n_usable = int(usable.sum())
    report = {
        "layer": "osm_substations",
        "source_pbf": str(paths.SRC_OSM_PBF),
        "aoi": "ranh giới VNSDI Hà Nội + đệm 5 km (đa giác thật, không phải bbox)",
        "tag": "power=substation (không đọc substation=* — phân hạng điện áp là công suất lưới, §12)",
        "scope_note": (
            "LỚP ĐIỂM để vẽ. Không có trường khoảng cách tới trạm biến áp; "
            "khả năng đấu nối lưới ngoài phạm vi (DECISIONS §8 sửa đổi)."
        ),
        "stats": {
            "n_total": int(len(df)),
            "n_with_usable_coords": n_usable,
            "by_osm_type": {k: int(v) for k, v in df.osm_type.value_counts().items()},
            "n_named": int(df.name.notna().sum()),
            "node_dupes_dropped": n_node_dupes,
            "multipolygon_assembly_errors": n_assembly_err,
            "elapsed_s": round(time.time() - t0, 1),
        },
    }
    (paths.QA / "s03c_osm_substation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
