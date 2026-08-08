"""Bảng theo XÃ ``commune.parquet`` — 21 cột phát hành, đơn vị đọc THỨ HAI của giao diện.

Vì sao nó cần hợp đồng riêng, không gộp vào ``GRID``: nó trả lời câu hỏi khác. Lưới trả lời
"chỗ này thế nào"; bảng xã trả lời "đơn vị hành chính này thế nào". Ở zoom thấp, 126 mảng
gọi được TÊN là từ vựng đọc được, còn 4.400 hạt 9 px thì không.

Hệ quả kỹ thuật: ``manifest.available_commune_columns`` là một danh sách RIÊNG, và
``fieldAvailable`` ở web hỏi nó bằng một nhánh riêng — cột của lưới không nói gì về cột của
xã. Trước file này, danh sách ấy được suy từ ``sorted(feats[0]["properties"].keys())``, tức
từ **dòng đầu tiên tình cờ có mặt**. Không ai khai nó, nên không ai kiểm được nó.

``geometry_wkb`` KHÔNG nằm trong bản khai: nó là hình học, không phải một trường đọc được.
``n11`` chuyển nó thành GeoJSON và bỏ khỏi ``properties``.

Thứ tự khai ở đây LÀ thứ tự phát hành, cùng luật với ``GRID``.
"""

from __future__ import annotations

from .column import Column, Table

COMMUNE = Table(
    name="commune",
    key="commune_code",
    desc="Một dòng một xã/phường/đặc khu trong một tỉnh",
    columns=(
        # ── định danh ────────────────────────────────────────────────────────
        Column("commune_code", "str", "admin", role="key", desc="Mã VNSDI 5 ký tự"),
        Column(
            "commune_name",
            "str",
            "admin",
            role="identity",
            desc="Tên có tiền tố loại đơn vị — KHÔNG dùng làm khoá: 246 tên dùng ở nhiều tỉnh",
        ),
        Column(
            "commune_kind",
            "str",
            "admin",
            role="identity",
            desc="PHUONG · XA · DAC_KHU. BA nhánh — ở engine sàng lọc nhãn này CHỌN NGƯỠNG.",
        ),
        Column("province_code", "str", "admin", role="identity", desc="Mã tỉnh 2 ký tự"),
        Column("province_name", "str", "admin", role="identity"),
        # ── diện tích: hai con số, hai nguồn, cố ý không hoà làm một ─────────
        Column(
            "area_km2",
            "f64",
            "admin",
            unit="km²",
            agg="sum",
            desc=(
                "Diện tích CÔNG BỐ của VNSDI. Có vết hỏng đo được — Phường Phú Lợi công bố "
                "17.956 km², lớn hơn tỉnh lớn nhất nước. Dùng làm mẫu số thì phải xem "
                "`quality_flag` trước."
            ),
        ),
        Column("valid_from", "str", "admin", role="identity", desc="Niên bản địa giới hiệu lực"),
        Column("published", "str", "admin", role="identity", desc="Ngày VNSDI xuất bản"),
        Column(
            "area_km2_geom",
            "f64",
            "admin",
            unit="km²",
            agg="sum",
            desc="Diện tích ĐO từ đa giác. Lệch quá 25% so với công bố thì có cờ.",
        ),
        Column(
            "quality_flag",
            "str",
            "admin",
            role="identity",
            null_means="không phát hiện vết hỏng nào ở số công bố của xã này",
            desc="Cờ chất lượng ngăn bằng `|` — ĐÁNH DẤU, không sửa âm thầm",
        ),
        # ── dân số ───────────────────────────────────────────────────────────
        Column(
            "population",
            "f64",
            "population",
            unit="người trên toàn xã",
            agg="sum",
            desc="Dân số dasymetric, đã neo theo `danso` công bố trừ khi xã bị gắn cờ",
        ),
        Column(
            "population_wp",
            "f64",
            "population",
            unit="người",
            agg="sum",
            desc="WorldPop THÔ, chưa neo — để đối chiếu, không để thay thế",
        ),
        Column(
            "anchor_ratio",
            "f64",
            "population",
            unit="lần",
            desc=(
                "`danso` công bố chia tổng WorldPop của xã. Xa 1 là hai nguồn BẤT ĐỒNG — đây "
                "là số đo của độ bất đồng, không phải của sai số."
            ),
        ),
        Column(
            "pop_source",
            "str",
            "population",
            role="identity",
            desc="Dân số neo vào đâu: ANCHORED / AREAL / UNANCHORED",
        ),
        Column(
            "pop_density_ppkm2",
            "f64",
            "population",
            unit="người/km²",
            desc="Tỉ số — không cộng được. Mẫu số là diện tích công bố.",
        ),
        # ── cung ─────────────────────────────────────────────────────────────
        Column(
            "n_stations",
            "i64",
            "supply",
            unit="trạm",
            agg="sum",
            desc="Trạm CÔNG CỘNG có tâm trong xã (đã loại điểm sạc cá nhân 1-súng-AC)",
        ),
        Column("n_ports", "i64", "supply", unit="súng", agg="sum", desc="Tổng cổng sạc"),
        Column("power_kw_site", "f64", "supply", unit="kW", agg="sum", desc="Tổng công suất trụ"),
        Column(
            "ports_per_10k_pop",
            "f64",
            "supply",
            unit="súng trên 10.000 dân",
            polarity="high-good",
            null_means="xã không có dân trong bản đồ dân số — mẫu số bằng 0",
            desc="Phép chia của hai số đo. Trường mặc định của màn hình đầu.",
        ),
        # ── sử dụng & tiếp cận ───────────────────────────────────────────────
        Column(
            "util_mean_port_weighted",
            "f64",
            "occupancy",
            unit="tỉ lệ cổng-giờ bận, 0–1",
            null_means="xã không có trạm nào đo được — KHÔNG phải bận bằng 0",
            desc="Trung bình trọng số SỐ CỔNG — trạm 30 cổng nói nhiều hơn trạm 2 cổng",
        ),
        Column(
            "dist_station_m_pop_weighted",
            "f64",
            "distance",
            unit="mét theo mạng đường, trọng số dân",
            polarity="high-bad",
            null_means="không ô nào trong xã tới được trạm bằng đường bộ",
            desc=(
                "Trọng số DÂN chứ không phải diện tích: câu hỏi là 'người ở đây phải đi bao "
                "xa', không phải 'đất ở đây cách bao xa'."
            ),
        ),
    ),
)

# Cột hình học, phát ra parquet nhưng KHÔNG thuộc bản khai — `n11` chuyển nó thành GeoJSON.
GEOMETRY_COLUMN = "geometry_wkb"
