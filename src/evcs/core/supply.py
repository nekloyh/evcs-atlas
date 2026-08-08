"""Luật về CUNG: trạm nào tính, trạm nào không, trạm nào thuộc về đâu.

Ba luật ở đây từng được viết hai lần mỗi luật, và một trong hai bản đã trôi:

* ``scope_of`` — gói ``hanoi`` phát ``HANOI``/``BUFFER``/``OUT``, gói ``vn`` phát
  ``IN``/``BUFFER``/``OUT``. Nhãn lệch rò vào 9 consumer và ``n11_web_export`` phải né bằng
  cách chỉ khoá vào ``BUFFER`` — nhãn duy nhất mang cùng nghĩa ở cả hai. Ở đây **một nhãn**:
  ``IN``, vì "HANOI" không phải một khái niệm, nó là một giá trị.
* ``is_private_ac`` — cùng vị từ, hai chỗ khai.
* ``is_serving`` — điều kiện "trạm đủ tư cách phục vụ" lặp lại ở ``roadnet.load_stations``,
  ``n07_distance`` và ``n08_screening`` dưới dạng ba biểu thức inline giống hệt nhau.
"""

from __future__ import annotations

# Trạm được coi là ĐANG PHỤC VỤ — nguồn của Dijkstra và của rule cao tải.
SERVING_OP_STATUS = ("OPERATIONAL", "MAINTENANCE")
RESTRICTED_ACCESS = "RESTRICTED"

# Cột giữ lại từ bảng canonical khi phát hành bảng ``stations``.
STATION_KEEP = [
    "station_id",
    "station_code",
    "lat",
    "lng",
    "name",
    "address",
    "operator",
    "station_type",
    "vehicle_class",
    "op_status",
    "access",
    "current_type_asset",
    "n_guns_installed",
    "n_guns_imputed",
    "max_power_kw_asset",
    "site_power_kw",
    "config_src",
    "official_matched",
    "freshness",
    "has_timeseries",
    "is_primary",
    "coord_resolved",
]


def is_private_ac(n_guns, current_type):
    """Trạm CÓ ĐÚNG MỘT SÚNG VÀ SÚNG ĐÓ LÀ AC — điểm sạc cá nhân lắp tại nhà.

    Bộ dữ liệu coi chúng như **không tồn tại**: không vào bảng ``stations``, nên cũng không
    vào bất kỳ trường dẫn xuất nào (nguồn Dijkstra của ``dist_station_network_m``,
    ``n_stations``, ``n_ports``, ``power_kw_site``, ``util_cell``).

    Vì sao: hạ tầng khác hẳn về ca sử dụng — chủ nhà sạc xe của chính mình qua đêm, không
    phục vụ công cộng. Chúng chiếm phần lớn SỐ TRẠM nhưng một phần nhỏ công suất, nên gộp
    chung làm loãng mọi thống kê cung.

    **Bộ lọc theo cấu trúc, không theo tên.** Tên gọi không tin được: chỉ ~64% mang tiền tố
    ``Tư nhân``. Cặp (1 súng, AC) thì đo được và tái lập được.

    ``n_guns`` hoặc ``current_type`` null thì **giữ lại** — "không biết" không phải "biết là
    cá nhân". Điều đó được bảo đảm BẰNG CẤU TRÚC ở đây (mỗi vế ``fillna(False)`` riêng) chứ
    không phải bằng may mắn về kiểu dữ liệu: với dtype numpy thì NaN tự thành False, nhưng
    với dtype nullable của pandas thì phép ``&`` cho ``NA`` và dùng nó làm mask sẽ NỔ.

    Tỉ lệ bị loại KHÁC NHAU THEO TỈNH và không được hằng số hoá: đo được 48,6% (Gia Lai) →
    78,7% (Bắc Ninh) theo số trạm. Xem ``QUYET_DINH_TOAN_QUOC.md`` §3.
    """
    mot_sung = n_guns == 1
    la_ac = current_type == "AC"
    if hasattr(mot_sung, "fillna"):
        mot_sung = mot_sung.fillna(False).astype(bool)
    if hasattr(la_ac, "fillna"):
        la_ac = la_ac.fillna(False).astype(bool)
    return mot_sung & la_ac


def is_serving(op_status, access):
    """Trạm đủ tư cách làm NGUỒN phục vụ: đang vận hành/bảo trì và không hạn chế lối vào."""
    return op_status.isin(SERVING_OP_STATUS) & (access != RESTRICTED_ACCESS)


def scope_of(points, prepared_inside, prepared_buffer) -> list[str]:
    """``IN`` · ``BUFFER`` · ``OUT`` cho từng điểm.

    ``IN`` = trong ranh giới hành chính · ``BUFFER`` = trong vành đệm nhưng ngoài ranh giới.

    **Bất biến bắt buộc:** vành đệm của hai tỉnh kề nhau CHỒNG LÊN NHAU, nên một trạm ở Bắc
    Ninh là ``BUFFER`` của Hà Nội *và* ``IN`` của Bắc Ninh. Mọi phép cộng dồn toàn quốc phải
    lọc ``scope == "IN"``; cộng dồn ngây thơ sẽ đếm trùng ở mọi biên.
    """
    return [
        "IN"
        if prepared_inside.contains(p)
        else ("BUFFER" if prepared_buffer.contains(p) else "OUT")
        for p in points
    ]


def peer_label(province_code: str, current_type) -> str:
    """Nhãn lớp tham chiếu của một phân vị mức sử dụng.

    Phân vị chỉ có nghĩa TRONG lớp tham chiếu người đọc đang nhìn. Gói ``hanoi`` khoá cứng
    tiền tố ``HANOI``; ở 34 tỉnh nhãn phải nói TỈNH nào, nếu không hai tỉnh bị so nhầm phân
    vị mà không ai thấy.
    """
    return f"{province_code}|{current_type}"
