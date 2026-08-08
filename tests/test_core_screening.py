"""Engine sàng lọc — ngưỡng chính sách và luật quyết định.

Ba bất biến được kiểm ở đây, và cả ba từng hỏng hoặc suýt hỏng:

1. đặc khu dùng ngưỡng của PHƯỜNG (500 m), không phải của Xã (2.000 m);
2. ngoại lệ ``DE_XUAT_NEU_CO_DC`` CHỈ mở cho Xã, và không bao giờ dưới sàn 500 m;
3. ô không tính được khoảng cách ra ``None``, **không phải** ``TU_CHOI``.
"""

from __future__ import annotations

import numpy as np

from evcs.core import screening as sc


def test_dac_khu_dung_nguong_cua_phuong():
    assert sc.threshold_for(["DAC_KHU"])[0] == sc.NGUONG_M["PHUONG"]
    assert sc.threshold_for(["DAC_KHU"])[0] != sc.NGUONG_M["XA"]


def test_ba_nhanh_nguong():
    got = sc.threshold_for(["PHUONG", "XA", "DAC_KHU"])
    assert list(got) == [500.0, 2000.0, 500.0]


def test_nhan_la_khong_ro_thi_roi_ve_nguong_xa():
    """Nhánh mặc định phải là ngưỡng CHẶT hơn (2 km) — thiếu thông tin thì đừng nới rule."""
    assert sc.threshold_for(["KHONG_RO"])[0] == sc.NGUONG_M["XA"]


def test_phuong_du_xa_thi_de_xuat():
    d, m = sc.decide([600.0], ["PHUONG"], [False])
    assert d[0] == sc.DE_XUAT
    assert m[0] == 100.0


def test_dac_khu_1000m_duoc_de_xuat_luat_cu_thi_khong():
    """Ô đặc khu cách 1.000 m: ngưỡng Phường ⇒ ĐỀ XUẤT; ngưỡng Xã ⇒ TỪ CHỐI."""
    d, _ = sc.decide([1_000.0], ["DAC_KHU"], [False])
    assert d[0] == sc.DE_XUAT
    d_neu_la_xa, _ = sc.decide([1_000.0], ["XA"], [False])
    assert d_neu_la_xa[0] == sc.TU_CHOI


def test_ngoai_le_chi_mo_cho_xa():
    # Xã, 1.000 m (chưa đủ 2 km), trên sàn 500 m, trạm gần nhất cao tải ⇒ có cửa.
    d, _ = sc.decide([1_000.0], ["XA"], [True])
    assert d[0] == sc.DE_XUAT_NEU_CO_DC
    # Cùng tình huống nhưng là Phường ⇒ 1.000 m đã vượt ngưỡng 500 m rồi, thành ĐỀ XUẤT.
    d, _ = sc.decide([1_000.0], ["PHUONG"], [True])
    assert d[0] == sc.DE_XUAT


def test_ngoai_le_khong_bao_gio_pha_san_500m():
    d, _ = sc.decide([400.0], ["XA"], [True])
    assert d[0] == sc.TU_CHOI


def test_khong_do_duoc_util_thi_khong_coi_la_cao_tai():
    """Thiếu bằng chứng phải nghiêng về phía KHÔNG nới rule."""
    d, _ = sc.decide([1_000.0], ["XA"], [False])
    assert d[0] == sc.TU_CHOI


def test_khoang_cach_vo_han_ra_None_khong_phai_tu_choi():
    d, m = sc.decide([np.inf], ["XA"], [False])
    assert d[0] is None
    assert np.isnan(m[0])


def test_khoang_cach_nan_ra_None():
    d, m = sc.decide([np.nan], ["PHUONG"], [True])
    assert d[0] is None
    assert np.isnan(m[0])


def test_bien_do_am_khi_chua_du_xa():
    _, m = sc.decide([300.0], ["PHUONG"], [False])
    assert m[0] == -200.0


def test_vector_hoa_giu_dung_thu_tu():
    d, _ = sc.decide(
        [600.0, 1_000.0, 400.0, np.inf],
        ["PHUONG", "XA", "XA", "XA"],
        [False, True, True, False],
    )
    assert list(d) == [sc.DE_XUAT, sc.DE_XUAT_NEU_CO_DC, sc.TU_CHOI, None]
