"""Schema khai ra phải khớp bảng THẬT trên đĩa, và các danh sách suy ra phải khớp bản cũ.

Test quan trọng nhất ở đây là ``test_khop_bang_that``: nó đọc parquet của cả 34 tỉnh và so
với khai báo. Không có nó thì module schema chỉ là một tài liệu thứ năm nói một con số thứ
năm — đúng cái bệnh nó sinh ra để chữa (README 56 · DATA_DICTIONARY 56 · fields.ts 53 ·
đĩa 61).
"""

from __future__ import annotations

from pathlib import Path

import pyarrow.parquet as pq
import pytest

from evcs.schema import GRID

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "store" / "p"


def _tinh_co_du_lieu() -> list[Path]:
    if not STORE.exists():
        return []
    return sorted(p for p in STORE.iterdir() if (p / "grid_h3_r8.parquet").exists())


TINH = _tinh_co_du_lieu()


# --- tự nhất quán, không cần đĩa -----------------------------------------
def test_dung_61_cot():
    assert len(GRID.columns) == 61


def test_khoa_la_h3_r8_va_duy_nhat():
    assert GRID.key == "h3_r8"
    assert GRID.get("h3_r8").role == "key"
    assert len(set(GRID.names())) == 61


def test_moi_cot_deu_co_lop_sinh_ra_no():
    assert all(c.layer for c in GRID.columns)
    assert set(GRID.layers()) == {
        "grid",
        "population",
        "landcover",
        "distance",
        "screening",
        "assemble",
    }


def test_moi_cot_measure_deu_co_mo_ta():
    thieu = [c.name for c in GRID.measures() if not c.desc]
    assert thieu == []


def test_khong_cot_dinh_danh_nao_len_man_hinh_ca_nuoc():
    """Cột ĐỊNH DANH không phải số đo — chở chúng lên bậc gộp là vô nghĩa."""
    assert [c.name for c in GRID.identity() if c.national] == []


def test_cot_national_deu_gop_duoc():
    """`national=True` mà `agg='none'` là mâu thuẫn: không biết gộp thì không lên được."""
    xau = [c.name for c in GRID.where(national=True) if c.agg == "none"]
    assert xau == []


def test_n_poi_1km_khong_duoc_cong():
    """Bán kính 1 km quanh tâm ô CHỒNG LẤN giữa các ô — cộng vào là đếm trùng."""
    assert GRID.get("n_poi_1km").agg == "none"


def test_lop_phu_la_cuong_tinh_khong_phai_quang_tinh():
    """Khoá theo LỚP SINH RA, không theo hậu tố tên.

    `area_frac` cũng kết thúc bằng `_frac` nhưng nó là tỉ lệ ô-nằm-trong-tỉnh, không phải
    một lớp phủ — gộp nó bằng trung bình trọng số diện tích là vô nghĩa. Hậu tố tên là một
    quy ước đặt tên; `layer` là một sự thật về nguồn gốc.
    """
    for c in GRID.of_layer("landcover"):
        assert c.agg == "area_mean", c.name


def test_khoang_cach_khong_gop_duoc_bang_phep_nao():
    for n in ("dist_station_network_m", "dist_station_euclid_m", "detour_ratio"):
        assert GRID.get(n).agg == "none"


def test_du_11_lop_phu_ke_ca_lop_toan_0():
    """Schema không được phụ thuộc nội dung — đó là chỗ hanoi phát 56 cột còn vn phát 61."""
    frac = [c.name for c in GRID.of_layer("landcover")]
    assert len(frac) == 11
    for k in ("snow", "mangrove", "moss"):
        assert f"{k}_frac" in frac


def test_cot_co_nghia_null_thi_phai_noi_ra_nghia_do():
    """Null CÓ NGHĨA khác null 'không biết'. Cột nào biết thì phải khai."""
    assert GRID.get("util_cell").null_means
    assert "KHÔNG phải bận bằng 0" in GRID.get("util_cell").null_means
    assert GRID.get("screen_decision").null_means


# --- validate() ----------------------------------------------------------
def test_validate_bat_thieu_cot():
    v = GRID.validate([n for n in GRID.names() if n != "population"])
    assert any("THIẾU" in x for x in v)


def test_validate_bat_cot_la():
    v = GRID.validate([*GRID.names(), "buildable"])
    assert any("THỪA" in x and "buildable" in x for x in v)


def test_validate_bat_sai_thu_tu():
    n = GRID.names()
    v = GRID.validate([n[1], n[0], *n[2:]])
    assert any("SAI thứ tự" in x for x in v)


def test_validate_bat_sai_kieu():
    v = GRID.validate(GRID.names(), {"population": "large_string"})
    assert any("kiểu" in x for x in v)


def test_validate_khop_thi_rong():
    assert GRID.validate(GRID.names()) == []


# --- đối chứng với đĩa ---------------------------------------------------
@pytest.mark.skipif(not TINH, reason="chưa có store/p/*/grid_h3_r8.parquet")
@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_khop_bang_that(pdir: Path):
    s = pq.read_schema(pdir / "grid_h3_r8.parquet")
    types = {n: str(t) for n, t in zip(s.names, s.types)}
    assert GRID.validate(list(s.names), types) == []


@pytest.mark.skipif(not TINH, reason="chưa có store")
def test_34_tinh_cung_mot_schema():
    """Một schema duy nhất giữa 34 phân mảnh — đây là điều kiện để giao diện dùng lại được."""
    bo = {tuple(pq.read_schema(p / "grid_h3_r8.parquet").names) for p in TINH}
    assert len(bo) == 1


# --- khớp các danh sách viết tay cũ --------------------------------------
def test_sum_cols_suy_ra_dung_bang_18_ten_cua_n12():
    """18 tên `SUM_COLS` từng gõ tay ở `n12_national.py:80-98`."""
    cu = {
        "population",
        "population_wp",
        "n_stations",
        "n_stations_operational",
        "n_ports",
        "power_kw_site",
        "n_fuel",
        "n_parking_off",
        "n_parking_street",
        "n_mall",
        "n_dept_store",
        "n_supermarket",
        "n_market",
        "n_apartment",
        "n_poi_total",
        "apartment_levels_sum",
        "road_len_in_province_m",
        "road_len_arterial_m",
    }
    assert {c.name for c in GRID.where(agg="sum", national=True)} == cu


def test_frac_cols_suy_ra_dung_bang_4_ten_cua_n12():
    cu = {"built_frac", "water_frac", "tree_frac", "crop_frac"}
    assert {c.name for c in GRID.where(agg="area_mean", national=True)} == cu


def test_front_suy_ra_dung_13_cot_dau_cua_n09():
    cu = [
        "h3_r8",
        "province_code",
        "lat",
        "lng",
        "area_km2",
        "area_frac",
        "cell_state",
        "commune_code",
        "commune_name",
        "commune_area_frac",
        "population",
        "pop_density_ppkm2",
        "pop_source",
    ]
    assert GRID.names()[:13] == cu
