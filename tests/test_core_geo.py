"""Quy đổi mét ↔ độ.

Phép kiểm quan trọng nhất ở đây không phải "hàm chạy được" mà là **hàm này thay thế đúng
hằng số cũ ở Hà Nội, và khác hẳn nó ở Cà Mau**. Nếu nó không tái tạo được 103.940 ở 21° thì
mọi con số đã công bố của Hà Nội sẽ đổi; nếu nó tái tạo được 103.940 ở MỌI vĩ độ thì nó
không sửa gì cả.
"""

from __future__ import annotations

import math

from shapely.geometry import Point, box

from evcs.core import geo


def test_tai_vi_do_ha_noi_tra_ve_dung_cong_thuc_cu():
    """`hanoi/aoi.py:28` khai `103_940.0  # 111_320 * cos(21°)`.

    Con số đúng của công thức đó là **103.926,2** — hằng số đã chép trong nguồn lệch 13,8 m
    (0,013%). Không đáng kể, nhưng ghi lại: nó là bằng chứng thêm rằng một hằng số chép tay
    trôi khỏi công thức sinh ra nó, kể cả khi công thức nằm ngay trên cùng dòng.
    """
    assert geo.m_per_deg_lon(21.0) == 111_320.0 * math.cos(math.radians(21.0))
    assert abs(geo.m_per_deg_lon(21.0) - 103_940.0) < 20.0
    assert abs(geo.m_per_deg_lon(21.0) - 103_926.2) < 0.5


def test_ca_mau_lech_gan_6_phan_tram_so_voi_hang_so_ha_noi():
    """Đây là con số biện minh cho cả module: 5,9% ở cực Nam."""
    ca_mau = geo.m_per_deg_lon(8.6)
    assert abs(ca_mau - 110_073.0) < 5.0
    lech = (ca_mau - 103_940.0) / 103_940.0
    assert 0.055 < lech < 0.065


def test_don_dieu_giam_theo_vi_do():
    lats = [8.4, 12.0, 16.0, 21.0, 23.4]
    vals = [geo.m_per_deg_lon(x) for x in lats]
    assert vals == sorted(vals, reverse=True)


def test_scale_at_va_scale_of_khop_nhau():
    g = box(105.0, 20.5, 106.0, 21.5)
    assert geo.scale_of(g) == geo.scale_at(g.centroid.y)


def test_buffer_dang_huong_theo_met_khong_theo_do():
    """Đệm 5 km phải cho ~5 km ở CẢ hai trục, không phải 5 km dọc và 5,3 km ngang."""
    p = Point(105.84, 21.0)
    b = geo.buffer_degrees(p, 5_000)
    minx, miny, maxx, maxy = b.bounds
    rong_m = (maxx - minx) / 2 * geo.m_per_deg_lon(21.0)
    cao_m = (maxy - miny) / 2 * geo.M_PER_DEG_LAT
    assert abs(rong_m - 5_000) / 5_000 < 0.01
    assert abs(cao_m - 5_000) / 5_000 < 0.01


def test_buffer_lat_deg_tuong_minh_ghi_de_centroid():
    p = Point(105.84, 21.0)
    theo_centroid = geo.buffer_degrees(p, 5_000)
    theo_xich_dao = geo.buffer_degrees(p, 5_000, lat_deg=0.0)
    # Ở xích đạo một độ kinh dài hơn ⇒ vành đệm HẸP hơn theo độ.
    assert theo_xich_dao.bounds[2] < theo_centroid.bounds[2]


def test_area_km2_gan_dung_tren_o_vuong_mot_do():
    g = box(105.0, 20.5, 106.0, 21.5)
    # 1° × 1° ở ~21°N ≈ 110,574 km × 103,93 km ≈ 11.491 km²
    assert abs(geo.area_km2(g) - 110.574 * 103.93) / geo.area_km2(g) < 0.01
