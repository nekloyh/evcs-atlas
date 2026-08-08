"""Quy đổi mét ↔ độ. Một chỗ, không phải mười hai.

Trước khi có file này, "một độ kinh dài bao nhiêu mét" được trả lời **12 lần** trong repo
với **4 giá trị khác nhau**:

    103.940      ``hanoi/aoi.py:28``, ``hanoi/roadnet.py:29``  — khoá cứng ở vĩ độ 21°
    111.320·cosφ ``hanoi/s01_admin.py:43``, ``hanoi/s02_grid.py:91``  — theo centroid
    107.000      ``vn/n10_quality.py:74``                       — "giữa Việt Nam"
    hàm của lat  ``vn/admin.py:132``                            — đúng

Đây không phải chuyện gọn gàng. Hằng số Hà Nội dùng cho Cà Mau (8,6°N) **sai 5,9%**, và sai
có hệ thống theo một chiều: ngưỡng chính sách 500 m của engine sàng lọc thành 529 m ở cực
Nam. Sai số ấy đi vào một quyết định quy hoạch, không vào một nhãn hiển thị.

Mọi hàm ở đây THUẦN: vào là số và hình, ra là số và hình. Không đọc đĩa, không biết tỉnh
nào đang chạy.
"""

from __future__ import annotations

import math

# WGS84: chiều dài một độ vĩ gần như không đổi trong phạm vi Việt Nam (110.574 m ở 45°,
# biến thiên < 0,3% từ xích đạo tới cực). Giữ hằng số — đây là xấp xỉ đã dùng suốt bộ dữ
# liệu và đổi nó sẽ đổi mọi con số đã công bố mà không mua được độ chính xác đáng kể.
M_PER_DEG_LAT = 110_574.0


def m_per_deg_lon(lat_deg: float) -> float:
    """Chiều dài một độ kinh theo mét ở vĩ độ cho trước."""
    return 111_320.0 * math.cos(math.radians(lat_deg))


def scale_at(lat_deg: float) -> tuple[float, float]:
    """(mét trên độ vĩ, mét trên độ kinh) tại một vĩ độ."""
    return M_PER_DEG_LAT, m_per_deg_lon(lat_deg)


def scale_of(geom) -> tuple[float, float]:
    """``scale_at`` tại vĩ độ TÂM của chính hình được xử lý."""
    return scale_at(geom.centroid.y)


def buffer_degrees(geom, metres: float, lat_deg: float | None = None):
    """Nới ``geom`` ra ``metres`` trong hệ toạ độ độ, đẳng hướng theo mét.

    Một độ kinh ngắn hơn một độ vĩ, nên ``geom.buffer(d)`` thẳng trong hệ độ tạo vành lệch.
    Kéo giãn trục x trước, đệm tròn, rồi co lại.

    ``lat_deg`` mặc định là vĩ độ tâm của chính ``geom`` — đây là chỗ gói ``hanoi`` khoá
    cứng 21° và vì thế lệch vài chục mét ngay tại Hà Nội (tâm thật ~20,97°).
    """
    from shapely import affinity

    lat0 = geom.centroid.y if lat_deg is None else lat_deg
    dy = metres / M_PER_DEG_LAT
    dx = metres / m_per_deg_lon(lat0)
    scaled = affinity.scale(geom, xfact=dy / dx, yfact=1.0, origin=(0, 0))
    return affinity.scale(scaled.buffer(dy, quad_segs=8), xfact=dx / dy, yfact=1.0, origin=(0, 0))


def area_km2(geom) -> float:
    """Diện tích xấp xỉ theo km² của một hình trong hệ độ, quy đổi tại vĩ độ tâm."""
    return geom.area * M_PER_DEG_LAT * m_per_deg_lon(geom.centroid.y) / 1e6


def as_geojson(geom) -> dict:
    from shapely.geometry import mapping

    return mapping(geom)


def length_m(geom, m_lat: float = M_PER_DEG_LAT, m_lon: float | None = None) -> float:
    """Chiều dài hình học trong hệ ĐỘ, quy đổi ra mét.

    ``m_lon`` mặc định tính theo vĩ độ TÂM của chính hình. Truyền tường minh khi nhiều
    hình phải dùng CHUNG một hệ số — ví dụ mọi đoạn đường trong một tỉnh, để chiều dài
    cộng lại được mà không lệch theo vị trí từng đoạn.

    Xử lý cả Multi*: ``geom.geoms`` nếu có, còn không thì chính nó.
    """
    import numpy as np

    if geom.is_empty:
        return 0.0
    if m_lon is None:
        m_lon = m_per_deg_lon(geom.centroid.y)
    total = 0.0
    for part in (geom.geoms if hasattr(geom, "geoms") else [geom]):
        c = np.asarray(part.coords)
        if len(c) < 2:
            continue
        total += float(np.hypot(np.diff(c[:, 0]) * m_lon, np.diff(c[:, 1]) * m_lat).sum())
    return total
