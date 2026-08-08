"""``commune_kind`` ba nhánh và cờ chất lượng cấp xã.

Test đầu tiên ở đây là test đáng giá nhất trong cả repo: **13 đặc khu**. Luật hai nhánh cũ
dán nhãn ``XA`` cho cả 13, và ở engine sàng lọc nhãn đó CHỌN NGƯỠNG CHÍNH SÁCH — đặc khu bị
áp ngưỡng 2.000 m thay vì 500 m. Một quyết định quy hoạch do một tiền tố chuỗi quyết định.
"""

from __future__ import annotations

import pytest

from evcs.core import admin

# 13 đặc khu của niên bản VNSDI hiệu lực 16/6/2025.
DAC_KHU = [
    "Đặc khu Phú Quốc",
    "Đặc khu Côn Đảo",
    "Đặc khu Vân Đồn",
    "Đặc khu Cát Hải",
    "Đặc khu Lý Sơn",
    "Đặc khu Cô Tô",
    "Đặc khu Kiên Hải",
    "Đặc khu Phú Quý",
    "Đặc khu Thổ Châu",
    "Đặc khu Bạch Long Vĩ",
    "Đặc khu Cồn Cỏ",
    "Đặc khu Trường Sa",
    "Đặc khu Hoàng Sa",
]


@pytest.mark.parametrize("ten", DAC_KHU)
def test_dac_khu_khong_bi_dan_nhan_xa(ten):
    assert admin.commune_kind(ten) == "DAC_KHU"


def test_luat_hai_nhanh_cu_sai_o_dung_13_cho_nay():
    """Tái dựng luật cũ để chỉ ra nó sai ở đâu — bằng chứng, không phải lời kể."""

    def luat_cu(name: str) -> str:
        return "PHUONG" if str(name).startswith("Phường") else "XA"

    sai = [t for t in DAC_KHU if luat_cu(t) != admin.commune_kind(t)]
    assert len(sai) == 13


@pytest.mark.parametrize(
    "ten,mong_doi",
    [
        ("Phường Hoàn Kiếm", "PHUONG"),
        ("Phường Ba Đình", "PHUONG"),
        ("Xã Tân Tiến", "XA"),
        ("Xã Tân Thành", "XA"),
    ],
)
def test_hai_nhanh_thong_thuong(ten, mong_doi):
    assert admin.commune_kind(ten) == mong_doi


def test_khong_co_nhanh_con_lai_im_lang():
    """Tên không mang tiền tố loại đơn vị phải thành KHONG_RO, không rơi vào XA."""
    assert admin.commune_kind("Thị trấn Cũ") == admin.UNKNOWN_KIND
    assert admin.commune_kind("") == admin.UNKNOWN_KIND
    assert admin.commune_kind(None) == admin.UNKNOWN_KIND


def test_moi_nhan_hop_le_deu_nam_trong_KINDS():
    for ten in [*DAC_KHU, "Phường X", "Xã Y"]:
        assert admin.commune_kind(ten) in admin.KINDS


# --- cờ chất lượng -------------------------------------------------------
def test_phuong_phu_loi_bi_bat_dien_tich_sai_bac():
    """Phường Phú Lợi (TP.HCM) công bố 17.956 km² — lớn hơn tỉnh lớn nhất nước."""
    f = admin.quality_flags(area_km2=17_956.0, population=50_000.0, area_km2_geom=12.0)
    assert admin.has_flag(f, admin.FLAG_AREA_WRONG_MAGNITUDE)


def test_xa_thua_that_van_bi_gan_co_va_do_la_co_y():
    """Cờ nói 'đừng NEO vào con số này', không nói 'con số này sai'."""
    f = admin.quality_flags(area_km2=500.0, population=5_000.0, area_km2_geom=500.0)
    assert admin.has_flag(f, admin.FLAG_POP_TOO_LOW)


def test_xa_binh_thuong_khong_co_co_nao():
    assert admin.quality_flags(area_km2=12.0, population=30_000.0, area_km2_geom=12.0) is None


def test_lech_hinh_hoc_qua_25_phan_tram():
    f = admin.quality_flags(area_km2=20.0, population=100_000.0, area_km2_geom=12.0)
    assert admin.has_flag(f, admin.FLAG_AREA_DRIFT)


def test_nhieu_co_thi_noi_bang_gach_dung():
    f = admin.quality_flags(area_km2=17_956.0, population=1.0, area_km2_geom=12.0)
    assert f is not None and f.count("|") >= 1
    assert admin.has_flag(f, admin.FLAG_AREA_WRONG_MAGNITUDE)
    assert admin.has_flag(f, admin.FLAG_POP_TOO_LOW)


def test_has_flag_khong_khop_tien_to():
    """``DANSO_CONG_BO_QUA_THAP`` không được khớp nhầm bởi phép `in` trên chuỗi."""
    assert not admin.has_flag("DIENTICH_CONG_BO_SAI_BAC", "SAI_BAC")
    assert not admin.has_flag(None, admin.FLAG_POP_TOO_LOW)
