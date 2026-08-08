"""Registry dataset của pipeline toàn quốc — mọi bảng có TÊN, một chỗ.

Đọc bảng này là biết cả pipeline: cái gì là NGUỒN chỉ đọc, cái gì là SẢN PHẨM, cái gì chỉ
là CACHE dựng lại được. Không cần mở 12 file bước để ghép lại bức tranh.

Thêm một nguồn ETL mới = thêm một dòng ``source`` ở đây + một ``Step`` khai ``writes``. DAG,
thứ tự chạy, vân tay resume và phép kiểm "thượng nguồn đã có chưa" đều suy ra từ đó.
"""

from __future__ import annotations

from evcs.pipeline.dataset import Dataset, Registry
from evcs.schema import GRID

from . import paths

# ── NGUỒN: chỉ đọc, nằm ngoài store ────────────────────────────────────────────
# Mở rộng phạm vi từ 1 tỉnh ra 34 tỉnh làm **0 request mới** tới evcs.vn: bảng canonical đã
# là bảng toàn quốc ngay từ đầu, bộ Hà Nội chỉ lọc một phần của nó ra.
_SOURCES = [
    Dataset(
        "src_vnsdi",
        "source",
        "source",
        "communes.parquet",
        abs_path=paths.SRC_VNSDI_COMMUNES,
        desc="Địa giới VNSDI 34 tỉnh / 3.321 xã",
    ),
    Dataset(
        "src_pbf",
        "source",
        "source",
        "vietnam-latest.osm.pbf",
        abs_path=paths.SRC_OSM_PBF,
        desc="OSM toàn quốc, 325 MB",
    ),
    Dataset(
        "src_worldpop",
        "source",
        "source",
        "worldpop.tif",
        abs_path=paths.SRC_WORLDPOP_2025,
        desc="WorldPop 2025 R2024B, 100 m",
    ),
    Dataset(
        "src_worldcover",
        "source",
        "source",
        "",
        abs_path=paths.SRC_WORLDCOVER_DIR,
        desc="ESA WorldCover, thư mục tile .tif",
    ),
    Dataset(
        "src_canon_stations",
        "source",
        "source",
        "",
        abs_path=paths.SRC_CANON_STATIONS,
        desc="Bảng trạm canonical, phân mảnh hive",
    ),
    Dataset(
        "src_canon_connectors",
        "source",
        "source",
        "",
        abs_path=paths.SRC_CANON_CONNECTORS,
        desc="Bảng cổng sạc canonical",
    ),
    Dataset(
        "src_occ_station",
        "source",
        "source",
        "occ_station.parquet",
        abs_path=paths.SRC_OCC_STATION,
        desc="Mức sử dụng theo trạm, cửa sổ 30 ngày",
    ),
    Dataset(
        "src_occ_profile",
        "source",
        "source",
        "occ_profile_168.parquet",
        abs_path=paths.SRC_OCC_PROFILE_168,
        desc="Hồ sơ bận 168 giờ",
    ),
    Dataset(
        "src_secondary_stations",
        "source",
        "source",
        "part.parquet",
        abs_path=paths.SRC_SECONDARY_STATIONS,
        desc="Nguồn PHỤ, chỉ để ĐỐI CHIẾU độ phủ nhà vận hành — không gộp vào bảng chính",
    ),
]

# ── ĐỊA GIỚI: toàn cục, dùng chung cho mọi tỉnh ────────────────────────────────
_ADMIN = [
    Dataset(
        "admin_communes",
        "global",
        "product",
        "communes.parquet",
        desc="3.321 xã: khoá, loại đơn vị ba nhánh, cờ chất lượng",
    ),
    Dataset(
        "admin_provinces",
        "global",
        "product",
        "provinces.parquet",
        desc="34 tỉnh: khoá, bbox, diện tích, dân số công bố",
    ),
    Dataset(
        "admin_crosswalk",
        "global",
        "product",
        "crosswalk_province_legacy.parquet",
        desc="Mã tỉnh CŨ (alpha-3) → mã mới. Để ĐỌC di sản, KHÔNG để gán địa bàn.",
    ),
    Dataset(
        "admin_boundary",
        "global",
        "product",
        "boundary",
        desc="Thư mục ranh giới + vành đệm theo tỉnh, GeoJSON",
    ),
]

# ── PHÂN MẢNH THEO TỈNH ────────────────────────────────────────────────────────
_PROVINCE = [
    # từ OSM
    Dataset(
        "roads",
        "province",
        "product",
        "roads.parquet",
        desc="Lớp ĐỂ NHÌN: hình học đã đơn giản hoá ~10 m, web tải nổi",
    ),
    Dataset(
        "road_graph",
        "province",
        "cache",
        "road_graph.parquet",
        desc=(
            "Lớp ĐỂ TÍNH: node_ids + toạ độ NGUYÊN. Sau khi đơn giản hoá thì số đỉnh "
            "không còn khớp node_ids và vĩnh viễn không dựng đồ thị được — đó là lý do "
            "hai lớp là hai file. Tier cache: 626/714 MB của store, dựng lại từ PBF."
        ),
    ),
    Dataset(
        "poi_demand",
        "province",
        "product",
        "poi_demand.parquet",
        desc="POI ĐẾM CẦU, 8 lớp — vào cột n_poi_* của lưới",
    ),
    Dataset(
        "poi_visual",
        "province",
        "product",
        "poi_visual.parquet",
        desc="POI ĐỂ NHÌN, 4 nhóm, giữ đa giác nếu OSM có",
    ),
    # cung
    Dataset(
        "stations",
        "province",
        "product",
        "stations.parquet",
        desc="Trạm CÔNG CỘNG (đã loại điểm sạc cá nhân 1-súng-AC), scope IN|BUFFER",
    ),
    Dataset(
        "connectors",
        "province",
        "product",
        "connectors.parquet",
        desc="Cổng sạc theo chuẩn/công suất",
    ),
    Dataset(
        "station_occupancy",
        "province",
        "product",
        "station_occupancy.parquet",
        desc="Mức sử dụng thật, cửa sổ telemetry 30 ngày",
    ),
    Dataset(
        "station_profile_168h",
        "province",
        "product",
        "station_occupancy_profile_168h.parquet",
        desc="Hồ sơ bận theo 168 ô (thứ × giờ) từng trạm",
    ),
    # lưới và các lớp tính
    Dataset(
        "grid_cell",
        "province",
        "interim",
        "grid_cell.parquet",
        desc="Khung lưới + nhãn xã + cung/POI/đường ĐO ĐƯỢC trực tiếp trên hình học",
    ),
    Dataset(
        "grid_cell_commune",
        "province",
        "interim",
        "grid_cell_commune.parquet",
        desc="Ma trận ô × xã (phần diện tích), cho cộng dồn theo xã",
    ),
    Dataset("poi_commune", "province", "interim", "poi_commune.parquet", desc="POI theo xã"),
    Dataset(
        "population_cell",
        "province",
        "interim",
        "population_cell.parquet",
        desc="Dân số dasymetric theo ô, kèm bản KHÔNG neo",
    ),
    Dataset(
        "population_commune",
        "province",
        "interim",
        "population_commune.parquet",
        desc="Dân số theo xã kèm anchor_ratio",
    ),
    Dataset(
        "landcover_cell",
        "province",
        "interim",
        "landcover_cell.parquet",
        desc="11 tỉ lệ lớp phủ ESA WorldCover, ĐỦ cột kể cả cột toàn 0",
    ),
    Dataset(
        "traveltime_cell",
        "province",
        "interim",
        "traveltime_cell.parquet",
        desc="Khoảng cách Dijkstra theo mạng đường — MÉT, không phút",
    ),
    Dataset(
        "screening_cell",
        "province",
        "interim",
        "screening_cell.parquet",
        desc="Đầu ra của RULE sàng lọc, không phải một số đo",
    ),
    Dataset(
        "substations",
        "province",
        "product",
        "substations.parquet",
        desc=(
            "Trạm biến áp OSM — lớp ĐIỂM để vẽ. KHÔNG có trường khoảng cách, công suất hay "
            "cấp điện áp: khả năng đấu nối lưới nằm ngoài phạm vi (DECISIONS §8 sửa đổi)."
        ),
    ),
    # sản phẩm cuối
    Dataset(
        "grid_h3_r8",
        "province",
        "product",
        "grid_h3_r8.parquet",
        schema=GRID,
        desc="BẢNG CHÍNH: một dòng một ô, 61 cột",
    ),
    Dataset(
        "commune",
        "province",
        "product",
        "commune.parquet",
        desc="Bảng theo xã: ranh giới, dân số, cung, mức sử dụng",
    ),
]

# ── CHẤT LƯỢNG ─────────────────────────────────────────────────────────────────
# Hai báo cáo QA dưới đây là ĐẦU VÀO THẬT của `n10`, không phải sản phẩm phụ: nó đọc
# `dropped` (tỉ lệ điểm sạc cá nhân) và `anchor_ratio` (độ lệch neo dân số) từ chúng để
# dựng cờ chất lượng cấp tỉnh. `--soi` bắt được chỗ này — bản khai đầu tiên bỏ sót cả 68
# file, nghĩa là sửa một ngưỡng ở `n05` sẽ KHÔNG làm bảng chất lượng hết hạn.
_QA = [
    Dataset("qa_n03_supply", "province", "qa", "n03_supply.json",
            desc="Báo cáo QA bước cung — n10 đọc khối `dropped` từ đây"),
    Dataset("qa_n05_population", "province", "qa", "n05_population.json",
            desc="Báo cáo QA bước dân số — n10 đọc `anchor_ratio` từ đây"),
    Dataset(
        "qa_provinces",
        "global",
        "qa",
        "provinces.parquet",
        desc="Bảng thống kê theo tỉnh + cờ chất lượng",
    ),
    Dataset(
        "qa_exclusions",
        "global",
        "qa",
        "exclusions.json",
        desc="Tỉnh ĐỀ NGHỊ loại khỏi phân tích, kèm lý do đo được",
    ),
    Dataset("qa_report", "global", "qa", "BAO_CAO_TINH.md", desc="Báo cáo chất lượng theo tỉnh"),
]

REGISTRY = Registry([*_SOURCES, *_ADMIN, *_PROVINCE, *_QA])

SOURCE_DIRS = [d.abs_path for d in _SOURCES if d.abs_path is not None]
