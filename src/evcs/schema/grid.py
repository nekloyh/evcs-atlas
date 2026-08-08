"""Bảng chính ``grid_h3_r8.parquet`` — 61 cột, khai một lần ở đây.

Thứ tự khai Ở ĐÂY LÀ thứ tự phát hành: ``n09_assemble`` sắp lại theo ``GRID.names()`` và
kiểm khớp trước khi ghi. Muốn thêm một cột thì thêm một dòng ở đây, rồi test sẽ nói chính
xác còn thiếu gì (bước nào phải sinh nó, danh mục trường nào phải mô tả nó).

Nhãn ``layer`` là tên bước sinh ra cột. Nó không phải chú thích: ``manifest.missing_layers``
tính được chính vì có nó — tỉnh dựng thiếu lớp nào thì thiếu đúng những cột mang nhãn ấy,
và giao diện lọc trường theo đó thay vì ``SELECT`` một cột không tồn tại rồi trắng màn hình.
"""

from __future__ import annotations

from .column import Column, Table

# ── ĐỊNH DANH & XUẤT XỨ ────────────────────────────────────────────────────────
# Cố ý KHÔNG mappable: tô màu một mã ô hay một tên xã lên bản đồ là vô nghĩa. Chúng chỉ
# xuất hiện trong panel Ô và khối NGUỒN.
_DINH_DANH = (
    Column("h3_r8", "str", "grid", role="key", desc="Mã ô H3 độ phân giải 8 (~0,74 km²)"),
    Column("province_code", "str", "grid", role="identity", desc="Mã tỉnh VNSDI, 2 ký tự"),
    Column("lat", "f64", "grid", role="identity", unit="độ", desc="Vĩ độ tâm ô"),
    Column("lng", "f64", "grid", role="identity", unit="độ", desc="Kinh độ tâm ô"),
    Column(
        "area_km2",
        "f64",
        "grid",
        unit="km²",
        agg="sum",
        desc="Diện tích hình học của ô H3",
    ),
    Column(
        "area_frac",
        "f64",
        "grid",
        unit="tỉ lệ, 0–1",
        desc="Phần diện tích ô nằm TRONG tỉnh. Mọi đại lượng cộng dồn chia theo tỉ lệ này.",
    ),
    Column(
        "cell_state",
        "str",
        "grid",
        role="identity",
        desc="INSIDE (area_frac ≥ 0,999) hoặc BORDER",
    ),
    Column("commune_code", "str", "grid", role="identity", desc="Mã xã/phường VNSDI, 5 ký tự"),
    Column(
        "commune_name", "str", "grid", role="identity", desc="Tên xã/phường có tiền tố loại đơn vị"
    ),
    Column(
        "commune_area_frac",
        "f64",
        "grid",
        role="identity",
        unit="tỉ lệ, 0–1",
        desc="Phần diện tích ô thuộc xã được gán (xã chiếm nhiều nhất)",
    ),
)

# ── CẦU ────────────────────────────────────────────────────────────────────────
_DAN_SO = (
    Column(
        "population",
        "f64",
        "population",
        unit="người trên ô ~0,74 km²",
        agg="sum",
        national=True,
        desc="Dân số dasymetric: bề mặt WorldPop 2025 R2024B neo theo `danso` từng xã của VNSDI",
    ),
    Column(
        "pop_density_ppkm2",
        "f64",
        "population",
        unit="người/km²",
        desc="`population` chia diện tích phần ô nằm trong tỉnh. Tỉ số — không cộng được.",
    ),
    Column(
        "pop_source",
        "str",
        "population",
        role="identity",
        desc="Cột dân số neo vào đâu: ANCHORED / AREAL / UNANCHORED",
    ),
    Column(
        "population_wp",
        "f64",
        "population",
        national=True,
        unit="người trên ô ~0,74 km²",
        agg="sum",
        desc=(
            "WorldPop THÔ, chưa neo. Phát riêng vì tổng `danso` toàn quốc lệch ~12% và lệch "
            "KHÔNG ĐỀU giữa các tỉnh — neo mù sẽ thổi phồng đúng những tỉnh sai nhiều nhất."
        ),
    ),
)

_POI = (
    Column("n_fuel", "i64", "grid", unit="điểm", agg="sum", national=True, desc="Cây xăng"),
    Column(
        "n_parking_off",
        "i64",
        "grid",
        unit="điểm",
        agg="sum",
        national=True,
        desc="Bãi đỗ ngoài đường",
    ),
    Column(
        "n_parking_street",
        "i64",
        "grid",
        unit="điểm",
        agg="sum",
        national=True,
        desc="Chỗ đỗ ven đường",
    ),
    Column(
        "n_mall", "i64", "grid", unit="điểm", agg="sum", national=True, desc="Trung tâm thương mại"
    ),
    Column(
        "n_dept_store",
        "i64",
        "grid",
        unit="điểm",
        agg="sum",
        national=True,
        desc="Cửa hàng bách hoá",
    ),
    Column("n_supermarket", "i64", "grid", unit="điểm", agg="sum", national=True, desc="Siêu thị"),
    Column("n_market", "i64", "grid", unit="điểm", agg="sum", national=True, desc="Chợ"),
    Column("n_apartment", "i64", "grid", unit="toà", agg="sum", national=True, desc="Toà chung cư"),
    Column(
        "n_poi_total",
        "i64",
        "grid",
        unit="điểm",
        agg="sum",
        national=True,
        desc="Tổng 8 lớp POI trong ô",
    ),
    Column(
        "n_poi_1km",
        "i64",
        "grid",
        unit="POI trong bán kính 1 km",
        desc=(
            "PHƠI NHIỄM POI quanh tâm ô — chim bay 1 km, nên các ô CHỒNG LẤN nhau và cộng "
            "vào là đếm trùng. Đây là lý do `agg` của nó là `none` chứ không phải `sum`."
        ),
    ),
    Column(
        "apartment_levels_sum",
        "f64",
        "grid",
        unit="tầng",
        agg="sum",
        national=True,
        desc="Tổng số tầng khai báo của các toà chung cư trong ô",
    ),
)

# ── CUNG ───────────────────────────────────────────────────────────────────────
_CUNG = (
    Column(
        "n_stations",
        "i64",
        "grid",
        unit="trạm",
        agg="sum",
        national=True,
        desc="Trạm sạc công cộng trong ô",
    ),
    Column(
        "n_stations_operational",
        "i64",
        "grid",
        unit="trạm",
        agg="sum",
        national=True,
        desc="Trong đó đang vận hành",
    ),
    Column(
        "n_ports", "i64", "grid", unit="súng", agg="sum", national=True, desc="Tổng số cổng sạc"
    ),
    Column(
        "power_kw_site",
        "f64",
        "grid",
        unit="kW",
        agg="sum",
        national=True,
        desc="Tổng công suất trên trụ",
    ),
)

# ── ĐƯỜNG ──────────────────────────────────────────────────────────────────────
# Đo trên hình học NGUYÊN của `road_graph`, không trên bản hiển thị đã đơn giản hoá.
_DUONG = tuple(
    Column(f"road_len_{k}_m", "f64", "grid", unit="mét", agg="sum", desc=d)
    for k, d in [
        ("local", "Đường nội bộ, khu dân cư"),
        ("motorway", "Cao tốc"),
        ("primary", "Quốc lộ / trục chính"),
        ("secondary", "Đường liên khu vực"),
        ("service", "Đường phục vụ"),
        ("tertiary", "Đường khu vực"),
        ("trunk", "Trục xuyên tâm"),
    ]
) + (
    Column(
        "road_len_m", "f64", "grid", unit="mét", agg="sum", desc="Tổng chiều dài đường trong TOÀN ô"
    ),
    Column(
        "road_len_arterial_m",
        "f64",
        "grid",
        unit="mét",
        agg="sum",
        national=True,
        desc="Cao tốc + trục xuyên tâm + quốc lộ + liên khu vực",
    ),
    Column(
        "road_len_in_province_m",
        "f64",
        "grid",
        unit="mét",
        agg="sum",
        national=True,
        desc=(
            "Chiều dài đường CẮT ĐÚNG ranh giới tỉnh. Khác `road_len_m`, thứ đo trên toàn ô "
            "kể cả phần nằm ngoài tỉnh — hai quy ước cắt biên, hai cột, không trộn."
        ),
    ),
)

# ── ĐẤT ────────────────────────────────────────────────────────────────────────
# Đủ 11 lớp, kể cả lớp toàn 0. Gói `hanoi` chỉ phát cột khi `sum > 0` nên schema đổi theo
# nội dung — đó chính là toàn bộ chênh lệch 56 cột so với 61 cột.
_LOP_PHU = tuple(
    Column(
        f"{k}_frac",
        "f64",
        "landcover",
        unit="tỉ lệ, 0–1",
        agg="area_mean",
        national=k in ("built", "water", "tree", "crop"),
        desc=d,
    )
    for k, d in [
        ("tree", "Cây thân gỗ"),
        ("shrub", "Cây bụi"),
        ("grass", "Cỏ"),
        ("crop", "Đất trồng trọt"),
        ("built", "Đất đã xây dựng"),
        ("bare", "Đất trống"),
        ("snow", "Tuyết và băng"),
        ("water", "Mặt nước"),
        ("wetland", "Đất ngập nước"),
        ("mangrove", "Rừng ngập mặn"),
        ("moss", "Rêu và địa y"),
    ]
)

# ── TIẾP CẬN ───────────────────────────────────────────────────────────────────
# Không cột nào ở đây cộng được, và cũng không trung bình theo diện tích được: khoảng cách
# tới trạm gần nhất của một vùng KHÔNG phải trung bình khoảng cách của các ô trong nó.
_KHOANG_CACH = (
    Column(
        "dist_station_network_m",
        "f64",
        "distance",
        unit="mét, theo mạng đường",
        polarity="high-bad",
        null_means="ô không tới được bằng đường trong bán kính neo",
        desc="Dijkstra đa nguồn trên đồ thị đường OSM thật, tôn trọng đường một chiều",
    ),
    Column(
        "dist_station_euclid_m",
        "f64",
        "distance",
        unit="mét, đường chim bay",
        desc=(
            "KHÁI NIỆM RIÊNG, không phải bản dự phòng của cột trên. Dùng cho câu hỏi về BỐ "
            "TRÍ (hai trạm có gần nhau quá không). KHÔNG được dùng để kết luận độ phủ: ở "
            "bán kính 3 km nó báo phủ nhầm 1.004/3.864 ô, và sai chỉ lệch về một phía."
        ),
    ),
    Column(
        "detour_ratio",
        "f64",
        "distance",
        unit="lần",
        polarity="high-bad",
        null_means="khoảng cách chim bay dưới 200 m — dưới mức đó tỉ số là nhiễu",
        desc="Đường mạng chia đường chim bay. Trung vị Hà Nội 1,47; phân vị 90 là 2,29.",
    ),
    Column(
        "dist_station_asym_m",
        "f64",
        "distance",
        unit="m, |đi − về|",
        polarity="high-bad",
        desc="Chênh lệch giữa chiều ô→trạm và trạm→ô. Đo bất đối xứng do đường một chiều.",
    ),
    Column(
        "road_access_offset_m",
        "f64",
        "distance",
        unit="mét",
        desc="Khoảng cách từ tâm ô tới đỉnh đồ thị neo được. Lớn nghĩa là ô xa mạng đường.",
    ),
    Column(
        "network_reachable",
        "bool",
        "distance",
        desc="Ô có tới được một trạm bằng đường bộ trong bán kính neo không",
    ),
    Column(
        "evidence_grade_distance",
        "str",
        "distance",
        desc="Hạng bằng chứng của khoảng cách — đánh dấu ô không tới được",
    ),
)

# ── SÀNG LỌC ───────────────────────────────────────────────────────────────────
# ĐẦU RA CỦA MỘT RULE, không phải số đo. Đừng đọc `screen_decision` như đọc `population`.
_SANG_LOC = (
    Column(
        "screen_margin_m",
        "f64",
        "screening",
        unit="m, âm = chưa đủ xa",
        polarity="high-good",
        null_means="ô không tính được khoảng cách nên rule không chạy",
        desc="Khoảng cách trừ ngưỡng của loại đơn vị (Phường/Đặc khu 500 m · Xã 2.000 m)",
    ),
    Column(
        "screen_decision",
        "str",
        "screening",
        null_means="ô không tính được khoảng cách — KHÁC với 'đã xét và từ chối'",
        desc="DE_XUAT · DE_XUAT_NEU_CO_DC · TU_CHOI",
    ),
)

# ── SỬ DỤNG ────────────────────────────────────────────────────────────────────
_SU_DUNG = (
    Column(
        "util_cell",
        "f64",
        "assemble",
        unit="tỉ lệ cổng-giờ bận, 0–1",
        null_means="ô không có trạm đo được — KHÔNG phải bận bằng 0",
        desc="Trung bình có trọng số SỐ CỔNG của mức sử dụng các trạm trong ô",
    ),
    Column(
        "n_stations_measured",
        "i64",
        "assemble",
        unit="trạm",
        agg="sum",
        desc="Số trạm trong ô có mức sử dụng đo được — mẫu số của `util_cell`",
    ),
)

GRID = Table(
    name="grid_h3_r8",
    key="h3_r8",
    desc="Bảng chính: một dòng một ô lưới H3 r8 trong một tỉnh",
    columns=(
        *_DINH_DANH,
        *_DAN_SO[:3],
        *_CUNG,
        *_POI[:9],
        *_DUONG,
        *_POI[9:],
        _DAN_SO[3],
        *_LOP_PHU,
        *_KHOANG_CACH,
        *_SANG_LOC,
        *_SU_DUNG,
    ),
)
