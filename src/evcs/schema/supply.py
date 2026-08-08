"""Bốn bảng của lớp CUNG + lớp trạm biến áp.

Chúng khai ở đây vì lý do đã sinh ra module này: bản mô tả cột duy nhất của chúng từng nằm
trong ``DATA_DICTIONARY.md``, viết tay, và **phần lớn con số ở đó chép từ trước bộ lọc điểm
sạc cá nhân** — bảng phân bố ``op_status`` cộng ra 2.521 dòng trên một bảng có 939, bảng
``connector_standard`` cộng ra 4.009 trên một bảng có 1.602, bảng ``grade`` cộng ra 2.491
trên một bảng có 703.

Đó không phải lỗi cẩu thả mà là hệ quả cấu trúc: một bảng phân bố viết tay là một **ảnh
chụp**, và ảnh chụp thì không biết dữ liệu đã đổi. Ở đây chỉ khai thứ KHÔNG đổi theo dữ
liệu — tên, kiểu, đơn vị, nghĩa. Mọi phân bố đọc ở ``store/qa/<mã>/n03_supply.json``.

``dtype`` là kiểu ở tầng phát hành. Cột ``i8``/``i32`` của hồ sơ 168 giờ được hạ có chủ ý:
bảng ấy có 2,74 triệu dòng toàn quốc và ``dow``/``hour`` chỉ cần 0–6 / 0–23.
"""

from __future__ import annotations

from .column import Column, Table

# ── TRẠM ──────────────────────────────────────────────────────────────────────
STATIONS = Table(
    name="stations",
    key="station_id",
    desc="Trạm sạc CÔNG CỘNG trong tỉnh và vành đệm 5 km. Điểm sạc cá nhân 1-súng-AC đã loại.",
    columns=(
        Column("station_id", "str", "supply", role="key", desc="Slug ASCII — khoá dùng ở URL"),
        Column(
            "station_code",
            "str",
            "supply",
            role="identity",
            desc=(
                "Mã của nguồn. **KHÔNG dùng ở URL**: đo được 6/939 mã chứa dấu cách, dấu "
                "phẩy và dấu tiếng Việt, mà dấu phẩy là ký tự phân cách của khoá hash."
            ),
        ),
        Column("lat", "f64", "supply", role="identity", unit="độ"),
        Column("lng", "f64", "supply", role="identity", unit="độ"),
        Column("name", "str", "supply", role="identity"),
        Column("address", "str", "supply", role="identity"),
        Column("operator", "str", "supply", role="identity", desc="Hà Nội: 704/710 là VinFast"),
        Column("station_type", "str", "supply", role="identity"),
        Column("vehicle_class", "str", "supply", role="identity"),
        Column(
            "op_status",
            "str",
            "supply",
            desc="OPERATIONAL · MAINTENANCE · OUT_OF_SERVICE · UNKNOWN. Hai giá trị đầu là 'đủ tư cách phục vụ'.",
        ),
        Column(
            "access",
            "str",
            "supply",
            desc="PUBLIC · RESTRICTED · UNKNOWN. RESTRICTED bị loại khỏi nguồn Dijkstra.",
        ),
        Column("current_type", "str", "supply", desc="AC · DC · MIXED"),
        Column("n_ports", "i64", "supply", unit="súng", agg="sum"),
        Column(
            "n_guns_imputed",
            "i64",
            "supply",
            unit="súng",
            agg="sum",
            desc="Phần số súng do SUY RA chứ không do nguồn khai — mẫu số của mọi tỉ lệ theo cổng",
        ),
        Column("power_kw_max_port", "f64", "supply", unit="kW", desc="Cổng mạnh nhất tại trạm"),
        Column(
            "power_kw_site", "f64", "supply", unit="kW", agg="sum", desc="Tổng công suất trên trụ"
        ),
        Column(
            "port_config_source", "str", "supply", role="identity", desc="Cấu hình cổng lấy từ đâu"
        ),
        Column("verified_official", "bool", "supply", desc="Khớp danh mục chính thức"),
        Column(
            "freshness",
            "f64",
            "supply",
            unit="0–1",
            desc="Độ mới của bản ghi. Nhỏ là mới.",
        ),
        Column("has_timeseries", "bool", "supply", desc="Có telemetry để tính mức sử dụng không"),
        Column("province_code", "str", "supply", role="identity"),
        Column(
            "commune_code",
            "str",
            "supply",
            role="identity",
            desc="Gán lại bằng HÌNH HỌC, không tin nhãn nguồn",
        ),
        Column("commune_name", "str", "supply", role="identity"),
        Column(
            "scope",
            "str",
            "supply",
            desc=(
                "IN (trong ranh giới) · BUFFER (trong vành đệm 5 km). Vành đệm hai tỉnh kề "
                "nhau CHỒNG nhau ⇒ **mọi phép cộng dồn toàn quốc phải lọc IN**."
            ),
        ),
        Column(
            "h3_r8", "str", "supply", role="identity", desc="Ô chứa trạm — khoá nối trạm ↔ lưới"
        ),
        Column("commune_kind", "str", "supply", role="identity", desc="PHUONG · XA · DAC_KHU"),
    ),
)

# ── CỔNG SẠC ──────────────────────────────────────────────────────────────────
CONNECTORS = Table(
    name="connectors",
    key="connector_id",
    desc="Một dòng một cấu hình cổng của một trạm",
    columns=(
        Column("connector_id", "str", "supply", role="key"),
        Column("station_id", "str", "supply", role="identity"),
        Column("station_code", "str", "supply", role="identity"),
        Column("connector_standard", "str", "supply", desc="CCS2 · TYPE2 · UNKNOWN"),
        Column("current_type", "str", "supply", desc="AC · DC"),
        Column("power_kw", "f64", "supply", unit="kW", desc="Công suất định mức MỘT cổng"),
        Column("vehicle_class", "str", "supply", role="identity"),
        Column(
            "count_total", "i64", "supply", unit="cổng", agg="sum", desc="Số cổng cùng cấu hình"
        ),
        Column("province_code", "str", "supply", role="identity"),
    ),
)

# ── MỨC SỬ DỤNG ───────────────────────────────────────────────────────────────
OCCUPANCY = Table(
    name="station_occupancy",
    key="station_code",
    desc="Mức sử dụng đo được trên cửa sổ telemetry 30 ngày, một dòng một trạm",
    columns=(
        Column("station_code", "str", "occupancy", role="key"),
        Column(
            "util",
            "f64",
            "occupancy",
            unit="tỉ lệ cổng-giờ bận, 0–1",
            polarity="high-bad",
            desc="Mẫu số là số cổng LẮP ĐẶT, không phải số cổng đang báo cáo",
        ),
        Column("util_p95", "f64", "occupancy", unit="0–1", desc="Phân vị 95 của mức bận theo giờ"),
        Column(
            "saturation_frac",
            "f64",
            "occupancy",
            unit="0–1",
            desc="Phần thời gian mọi cổng đều bận",
        ),
        Column("duty_cycle", "f64", "occupancy", unit="0–1"),
        Column(
            "grade",
            "str",
            "occupancy",
            desc="GOOD · PARTIAL · INSUFFICIENT — hạng bằng chứng của phép đo, không phải của trạm",
        ),
        Column("coverage", "f64", "occupancy", unit="0–1", desc="Phần cửa sổ có quan sát"),
        Column("obs_days", "f64", "occupancy", unit="ngày"),
        Column("util_reportable", "bool", "occupancy", desc="Đủ điều kiện để TRÍCH RA NGOÀI"),
        Column(
            "occ_status", "str", "occupancy", desc="Cổng thật của `util_pctl` — KHÔNG phải `grade`"
        ),
        Column(
            "shape_class",
            "str",
            "occupancy",
            desc="DEM_TROI · HAI_DINH · BAN_NGAY_PHANG · THAT_THUONG · KHONG_XEP_LOAI",
        ),
        Column("peak_hour", "i64", "occupancy", unit="giờ 0–23"),
        Column("peak_dow", "i64", "occupancy", unit="thứ 0–6"),
        Column("night_share", "f64", "occupancy", unit="0–1"),
        Column("weekend_ratio", "f64", "occupancy", unit="lần"),
        Column("util_denominator_ports", "f64", "occupancy", unit="cổng", desc="Mẫu số của `util`"),
        Column("ever_active", "bool", "occupancy"),
        Column("province_code", "str", "occupancy", role="identity"),
        Column("current_type", "str", "occupancy", role="identity"),
        Column("commune_kind", "str", "occupancy", role="identity"),
        Column(
            "util_pctl",
            "f64",
            "occupancy",
            unit="phân vị trong nhóm cùng loại, 0–100",
            null_means="trạm chưa đủ quan sát để xếp hạng — KHÔNG phải xếp hạng thấp",
        ),
        Column(
            "util_pctl_peer",
            "str",
            "occupancy",
            role="identity",
            desc=(
                "Lớp tham chiếu của phân vị, dạng `<province_code>|<current_type>` (ví dụ "
                "`01|AC`). Phân vị chỉ có nghĩa TRONG lớp này; thiếu nhãn là hai tỉnh bị so "
                "nhầm mà không ai thấy."
            ),
        ),
        Column("window_start_utc", "str", "occupancy", role="identity"),
        Column("window_end_utc", "str", "occupancy", role="identity"),
        Column("snapshot_id", "str", "occupancy", role="identity"),
    ),
)

# ── NHỊP 168 GIỜ ──────────────────────────────────────────────────────────────
PROFILE_168H = Table(
    name="station_occupancy_profile_168h",
    key="station_code",
    desc="Hồ sơ bận theo 168 ô (thứ × giờ) từng trạm — 2,74 triệu dòng toàn quốc",
    columns=(
        Column("station_code", "str", "occupancy", role="key"),
        Column("dow", "i8", "occupancy", role="identity", unit="thứ 0–6"),
        Column("hour", "i8", "occupancy", role="identity", unit="giờ 0–23"),
        Column(
            "occ",
            "f64",
            "occupancy",
            unit="cổng bận",
            null_means="ô giờ này không có quan sát nào",
        ),
        Column(
            "observed_h",
            "f64",
            "occupancy",
            unit="giờ",
            desc=(
                "Số giờ quan sát rơi vào ô này. Dưới 1 h thì KHÔNG tô — ngưỡng suy từ khớp "
                "`var(t) = a + b/t`, xem `web/DESIGN.md`."
            ),
        ),
        Column("n_obs", "i32", "occupancy", unit="mẫu", agg="sum"),
        Column("province_code", "str", "occupancy", role="identity"),
    ),
)

# ── TRẠM BIẾN ÁP ──────────────────────────────────────────────────────────────
SUBSTATIONS = Table(
    name="substations",
    key="osm_id",
    desc="Trạm biến áp OSM — lớp ĐIỂM để vẽ. Bảy cột, và bảy là con số có ý nghĩa.",
    columns=(
        Column("osm_type", "str", "substation", role="identity", desc="node · way · relation"),
        Column(
            "osm_id",
            "i64",
            "substation",
            role="key",
            desc="`orig_id()` với area — KHÔNG phải id tổng hợp của osmium",
        ),
        Column("name", "str", "substation", role="identity", null_means="OSM không đặt tên"),
        Column(
            "lat",
            "f64",
            "substation",
            role="identity",
            unit="độ",
            desc="TÂM đa giác nếu OSM vẽ bằng đa giác",
        ),
        Column("lng", "f64", "substation", role="identity", unit="độ"),
        Column("province_code", "str", "substation", role="identity"),
        Column(
            "scope", "str", "substation", desc="IN · BUFFER — lớp bối cảnh, không cộng dồn ở đâu"
        ),
    ),
)

# Bảy cột và KHÔNG hơn. Không `voltage`, không `substation=*`, không công suất, không
# khoảng cách. Đây là chỗ `DECISIONS §8` có thể bị đảo ngược bằng một dòng ba từ, nên hàng
# rào có test (`tests/test_core_osm.py`) và một phép kiểm chạy ở bước.
SUBSTATION_CAM = frozenset({"voltage", "substation", "capacity", "power", "rating", "kva"})
