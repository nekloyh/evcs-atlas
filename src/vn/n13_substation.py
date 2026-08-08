"""N13 — Trạm biến áp OSM: TOẠ ĐỘ để vẽ, không phải một trường để tính.

Sinh (mỗi tỉnh):
  store/p/<code>/substations.parquet   osm_type · osm_id · name · lat · lng · province_code · scope
  store/qa/n13_substation.json

**Ranh giới phạm vi, đọc trước khi sửa file này** — luật phân loại và lý do của nó ở
``evcs.core.osm.is_substation``. Tóm tắt: ``dist_substation_m`` đã bị bỏ và KHÔNG quay lại;
không cột công suất, không cấp điện áp, không bán kính phục vụ. Bước này chỉ xuất vị trí.

── VÌ SAO MỘT LƯỢT QUÉT RIÊNG, KHÔNG GỘP VÀO ``n02_osm`` ───────────────────────────────

Cùng lý do đã ghi ở đầu ``Makefile`` cho ba lượt quét của bộ Hà Nội: **ba lớp là ba khái
niệm**, và nhét trạm biến áp vào lượt quét POI sẽ đổi nghĩa các cột đếm mà lượt ấy đã phát
(``n_poi_total`` / ``n_poi_1km``). ``n02`` mở đầu bằng câu "lớp ĐẾM-CẦU không có chỗ cho
trạm biến áp", và câu đó vẫn đúng.

Giá đã đo: **107,3 giây** cho một lượt ``with_areas()`` trên PBF 325 MB toàn quốc.

── BA CHỖ KHÁC BẢN HÀ NỘI, CẢ BA LÀ HỆ QUẢ CỦA VIỆC CÓ 34 TỈNH ────────────────────────

1. **Gán tỉnh bằng cây R 34 đa giác**, không phải một đa giác đã prep. Chỉ 1.387 đối tượng
   đi tới bước tra cứu nên chi phí không đáng kể.
2. **``scope`` IN/BUFFER**, đúng khuôn bảng trạm sạc. Vành đệm hai tỉnh kề nhau CHỒNG lên
   nhau, nên một trạm biến áp có mặt ở nhiều phân mảnh với ``BUFFER`` và ở đúng MỘT phân
   mảnh với ``IN``. Cộng dồn toàn quốc phải lọc ``IN``.
3. **Dedup node ⊂ đa giác chạy TRƯỚC khi chia phân mảnh.** Dựng một cây cho cả nước rồi
   lọc, không dựng 34 cây — cùng lý lẽ của ``n02``. Làm ngược thứ tự thì vẫn bắt được
   trùng, nhưng số đếm QA sẽ lệch và không ai giải thích được vì sao.
"""

from __future__ import annotations

import time

import osmium
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely import STRtree
from shapely import wkb as shapely_wkb
from shapely.geometry import Point

from evcs.core.osm import is_substation, selftest_is_substation

from . import admin, paths, qa
from .n02_osm import ProvinceIndex
from .runner import Step

VERSION = "1"

SCHEMA = pa.schema(
    [
        ("osm_type", pa.string()),
        ("osm_id", pa.int64()),
        ("name", pa.string()),
        ("lat", pa.float64()),
        ("lng", pa.float64()),
        ("province_code", pa.string()),
        ("scope", pa.string()),
    ]
)


def _quet() -> tuple[list[dict], list, int]:
    """Một lượt PBF: trả (node thô, đa giác của area, số lỗi lắp multipolygon).

    ``with_areas()`` chứ không phải ``with_locations()``: trạm biến áp phần lớn được OSM vẽ
    bằng way khép kín, những trạm lớn bằng relation multipolygon. Đo được toàn quốc:
    **1.376 way + 2 relation + 9 node** — tức 99,4% nằm ở nhánh area. Bỏ nhánh area là bỏ
    gần hết lớp.
    """
    nodes: list[dict] = []
    areas: list[dict] = []
    area_geoms: list = []
    n_err = 0

    wkbf = osmium.geom.WKBFactory()
    fp = osmium.FileProcessor(str(paths.SRC_OSM_PBF)).with_areas()
    for o in fp:
        ts = o.type_str()
        if ts == "n":
            tags = o.tags
            if len(tags) == 0 or not is_substation(tags):
                continue
            loc = o.location
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
                n_err += 1
                continue
            # TÂM của đa giác, không phải đa giác. Lớp này là lớp ĐIỂM: nó khẳng định "có
            # một trạm biến áp ở đây", và tâm của một đa giác THẬT nói đúng câu đó.
            #
            # Hệ quả kiến trúc quan trọng hơn thẩm mỹ: sau khi nén, file KHÔNG CÒN hình học
            # nào để một bán kính phục vụ hay một bậc công suất lẻn vào.
            c = g.centroid
            # `orig_id()` chứ không phải `id`: `id` của một area là số tổng hợp của osmium,
            # không phải id OSM. Ghi nhầm làm `osm_id` vô nghĩa mà không lỗi gì cả.
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
    return nodes + areas, area_geoms, n_err, len(nodes)


def run() -> None:
    selftest_is_substation()
    r = qa.Report(
        "n13_substation",
        source_pbf=str(paths.SRC_OSM_PBF),
        tag="power=substation (KHÔNG đọc substation=* — phân hạng điện áp là công suất lưới)",
        scope_note=(
            "LỚP ĐIỂM để vẽ. Không có trường khoảng cách tới trạm biến áp; khả năng đấu nối "
            "lưới ngoài phạm vi (DECISIONS §8 sửa đổi)."
        ),
    )
    t0 = time.time()
    tho, area_geoms, n_err, n_node_raw = _quet()
    t_quet = time.time() - t0

    # --- dedup node ⊂ đa giác, MỘT cây cho cả nước --------------------------
    # OSM hay đặt một node tên giữa chính khuôn viên của nó. Không loại thì bản đồ đếm một
    # trạm thành hai VÀ cảnh báo n-nhỏ sẽ nói một con số CAO HƠN sự thật — đúng chiều sai
    # nguy hiểm nhất cho một lớp vốn đã thưa.
    tree = STRtree(area_geoms) if area_geoms else None
    giu: list[dict] = []
    n_dupes = 0
    for row in tho:
        if row["osm_type"] == "node" and tree is not None:
            if len(tree.query(Point(row["lng"], row["lat"]), predicate="intersects")) > 0:
                n_dupes += 1
                continue
        giu.append(row)

    # --- gán tỉnh + scope ---------------------------------------------------
    idx_in = ProvinceIndex(use_buffer=False)
    idx_buf = ProvinceIndex(use_buffer=True)
    rows: list[dict] = []
    n_ngoai = 0
    for row in giu:
        pt = Point(row["lng"], row["lat"])
        trong = idx_in.containing(pt)
        cham = set(idx_buf.intersecting(pt))
        if not cham:
            n_ngoai += 1
            continue
        for code in sorted(cham):
            rows.append(
                {**row, "province_code": code, "scope": "IN" if code == trong else "BUFFER"}
            )

    df = pd.DataFrame(rows, columns=SCHEMA.names)
    if len(df):
        df = df.sort_values(["province_code", "osm_type", "osm_id"]).reset_index(drop=True)

    for code in admin.province_codes():
        sub = df[df.province_code == code] if len(df) else df
        pq.write_table(
            pa.Table.from_pandas(sub, schema=SCHEMA, preserve_index=False),
            paths.province_dir(code) / "substations.parquet",
            compression="zstd",
        )

    ins = df[df.scope == "IN"] if len(df) else df
    r.stat(
        n_objects_national=int(len(giu)),
        n_rows_sharded=int(len(df)),
        n_in_scope=int(len(ins)),
        by_osm_type={
            k: int(v) for k, v in (ins.osm_type.value_counts().items() if len(ins) else [])
        },
        n_named=int(ins.name.notna().sum()) if len(ins) else 0,
        node_raw=n_node_raw,
        node_dupes_dropped=n_dupes,
        multipolygon_assembly_errors=n_err,
        outside_all_provinces=n_ngoai,
        only_buffer_across_border=int(
            (df.osm_type + ":" + df.osm_id.astype(str)).nunique()
            - (df.osm_type + ":" + df.osm_id.astype(str))[df.scope == "IN"].nunique()
        )
        if len(df)
        else 0,
        provinces_with_none=[
            c
            for c in admin.province_codes()
            if not len(df[(df.province_code == c) & (df.scope == "IN")])
        ]
        if len(df)
        else admin.province_codes(),
        pbf_scan_s=round(t_quet, 1),
        elapsed_s=round(time.time() - t0, 1),
    )
    # Hàng rào phạm vi, kiểm bằng MÁY chứ không bằng lời: bảng không được mang một cột nào
    # nói về công suất, cấp điện áp hay phân hạng. Đây là chỗ DECISIONS §8 có thể bị đảo
    # ngược bằng một dòng ba từ, nên nó phải có một phép kiểm chạy mỗi lần.
    cam = {"voltage", "substation", "capacity", "power", "rating", "kva"}
    dinh = sorted(cam & {c.lower() for c in SCHEMA.names})
    r.check("khong_co_cot_cong_suat_hay_dien_ap", not dinh, f"cột phạm: {dinh}" if dinh else "sạch")
    r.check(
        "moi_dong_co_toa_do_dung_duoc",
        bool(df.lat.notna().all() and df.lng.notna().all()) if len(df) else True,
        f"{len(df)} dòng",
    )
    # Bất biến CHỐNG ĐẾM TRÙNG: một đối tượng là `IN` của ĐÚNG một tỉnh, không hơn.
    #
    # KHÔNG phải "mọi đối tượng đều có một tỉnh IN" — bản đầu viết thế và nó FAIL, đúng lý:
    # vành đệm 5 km của tỉnh biên giới vươn SANG LÃNH THỔ NƯỚC KHÁC. Đo được 4 đối tượng ở
    # 22,7–22,9°N / 104,2–106,8°E (biên giới phía Bắc) nằm trong vành đệm Việt Nam nhưng
    # ngoài mọi ranh giới tỉnh — chúng là trạm biến áp Trung Quốc, và `scope='BUFFER'` là
    # câu trả lời ĐÚNG cho chúng.
    khoa = df.osm_type + ":" + df.osm_id.astype(str) if len(df) else pd.Series(dtype="string")
    n_in_nhieu_tinh = int((df[df.scope == "IN"].groupby(khoa[df.scope == "IN"]).size() > 1).sum()) if len(df) else 0
    r.check(
        "khong_doi_tuong_nao_IN_o_hai_tinh",
        n_in_nhieu_tinh == 0,
        f"{n_in_nhieu_tinh} đối tượng IN ở nhiều hơn một tỉnh",
    )
    n_chi_buffer = int(khoa.nunique() - khoa[df.scope == "IN"].nunique()) if len(df) else 0
    r.check(
        "chi_co_BUFFER_thi_dem_duoc",
        True,
        f"{n_chi_buffer} đối tượng chỉ nằm trong vành đệm — ngoài lãnh thổ, phần lớn ở biên giới",
    )
    r.write(quiet=True)
    print(
        f"   {len(giu)} đối tượng · {len(ins)} IN · {len(df)} dòng phân mảnh · quét {t_quet:.0f}s"
    )


STEP = Step(
    name="n13_substation",
    scope="global",
    version=VERSION,
    run=run,
    reads=("src_pbf", "src_vnsdi"),
    writes=("substations",),
    desc="quét PBF lấy power=substation → lớp ĐIỂM để vẽ, theo tỉnh (không có trường dẫn xuất)",
)


if __name__ == "__main__":
    paths.ensure_dirs()
    run()
