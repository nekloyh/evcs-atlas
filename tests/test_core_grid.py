"""Lưới H3 — sinh ứng viên, tỉ lệ diện tích, ngưỡng ô vụn.

Bất biến trung tâm: **tập ứng viên phải là tập CHA của tập đúng.** Nếu bước đơn giản hoá
làm mất một ô có giao thật, ô đó biến mất khỏi bộ dữ liệu trong im lặng — không có phép
kiểm nào ở hạ nguồn bắt được, vì hạ nguồn chỉ thấy tập đã thiếu.
"""

from __future__ import annotations

import h3
from shapely.geometry import Point, box

from evcs.core import geo, grid


def _hn_box():
    """Ô vuông ~40 km quanh Hà Nội — đủ lớn để có ô trong lẫn ô biên."""
    return box(105.6, 20.85, 106.05, 21.2)


def test_ung_vien_la_tap_cha_cua_tap_dung():
    """Đơn giản hoá đa giác nới KHÔNG được làm mất ô nào."""
    g = _hn_box()
    khong_don_gian = set(grid.candidates(g, simplify_deg=0.0))
    co_don_gian = set(grid.candidates(g))
    assert khong_don_gian <= co_don_gian


def test_moi_o_ung_vien_deu_giao_that_voi_hinh():
    g = _hn_box()
    for c in grid.candidates(g)[:200]:
        assert grid.cell_polygon(c).intersects(g)


def test_h3shape_to_cells_mot_minh_thi_bo_sot_o_bien():
    """Vì sao phải nới rồi lọc lại: luật tâm-ô của h3 tự nó thiếu ô cắt biên."""
    g = _hn_box()
    tho = set(h3.h3shape_to_cells(h3.geo_to_h3shape(geo.as_geojson(g)), grid.RES))
    day_du = set(grid.candidates(g))
    assert tho < day_du


def test_area_frac_nam_trong_khoang_0_1():
    g = _hn_box()
    cells = grid.candidates(g)
    frac = grid.area_fractions(cells, g)
    assert len(frac) == len(cells)
    assert all(0.0 <= v <= 1.0 for v in frac.values())


def test_o_nam_tron_ben_trong_ra_dung_1_khong_phai_0_999_gi_do():
    g = _hn_box()
    frac = grid.area_fractions(grid.candidates(g), g)
    assert max(frac.values()) == 1.0


def test_o_bien_co_frac_thuc_su_nam_giua():
    g = _hn_box()
    frac = grid.area_fractions(grid.candidates(g), g)
    o_bien = [v for v in frac.values() if 0.0 < v < 1.0]
    assert len(o_bien) > 10


def test_split_slivers_chia_het_khong_mat_o_nao():
    g = _hn_box()
    cells = grid.candidates(g)
    frac = grid.area_fractions(cells, g)
    keep, sliver = grid.split_slivers(cells, frac)
    assert set(keep) | set(sliver) == set(cells)
    assert not (set(keep) & set(sliver))
    assert all(frac[c] >= grid.MIN_AREA_FRAC for c in keep)
    assert all(frac[c] < grid.MIN_AREA_FRAC for c in sliver)


def test_o_vun_ton_tai_that_va_duoc_dem_chu_khong_bi_nuot():
    g = _hn_box()
    cells = grid.candidates(g)
    _, sliver = grid.split_slivers(cells, grid.area_fractions(cells, g))
    assert len(sliver) > 0


def test_cell_state_hai_nhan():
    assert grid.cell_state(1.0) == "INSIDE"
    assert grid.cell_state(0.9995) == "INSIDE"
    assert grid.cell_state(0.99) == "BORDER"
    assert grid.cell_state(0.011) == "BORDER"


def test_cell_of_va_centroid_khu_hoi():
    c = grid.cell_of(21.0, 105.84)
    lat, lng = grid.centroid(c)
    assert grid.cell_of(lat, lng) == c
    assert grid.cell_polygon(c).contains(Point(lng, lat))


def test_dien_tich_o_r8_khoang_0_74_km2():
    c = grid.cell_of(21.0, 105.84)
    assert 0.6 < grid.cell_area_km2(c) < 0.9


def test_area_fractions_hinh_roi_khong_giao_ra_0():
    xa = box(0.0, 0.0, 0.1, 0.1)
    c = grid.cell_of(21.0, 105.84)
    assert grid.area_fractions([c], xa)[c] == 0.0
