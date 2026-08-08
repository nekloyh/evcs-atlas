"""Luật về cung: nhãn scope, điểm sạc cá nhân, trạm đủ tư cách phục vụ."""

from __future__ import annotations

import pandas as pd
from shapely.geometry import Point, box
from shapely.prepared import prep

from evcs.core import supply


# --- scope ---------------------------------------------------------------
def _scopes(points):
    trong = box(0, 0, 10, 10)
    dem = box(-2, -2, 12, 12)
    return supply.scope_of(points, prep(trong), prep(dem))


def test_ba_nhan_scope():
    got = _scopes([Point(5, 5), Point(11, 5), Point(20, 20)])
    assert got == ["IN", "BUFFER", "OUT"]


def test_khong_con_nhan_mang_ten_mot_tinh():
    """`HANOI` không phải một khái niệm, nó là một giá trị. Nhãn phải là IN."""
    assert "HANOI" not in _scopes([Point(5, 5)])


def test_vanh_dem_hai_tinh_chong_nhau_mot_diem_IN_o_dung_mot_phia():
    """Bất biến chống đếm trùng: điểm nằm ở vùng chồng là IN của ĐÚNG một tỉnh."""
    p = Point(11, 5)
    a_in, a_dem = box(0, 0, 10, 10), box(-2, -2, 12, 12)
    b_in, b_dem = box(10, 0, 20, 10), box(8, -2, 22, 12)
    sa = supply.scope_of([p], prep(a_in), prep(a_dem))[0]
    sb = supply.scope_of([p], prep(b_in), prep(b_dem))[0]
    assert sorted([sa, sb]) == ["BUFFER", "IN"]
    assert [sa, sb].count("IN") == 1


# --- điểm sạc cá nhân ----------------------------------------------------
def test_mot_sung_AC_la_ca_nhan():
    n = pd.Series([1, 1, 2, 4])
    t = pd.Series(["AC", "DC", "AC", "DC"])
    assert list(supply.is_private_ac(n, t)) == [True, False, False, False]


def test_khong_biet_thi_giu_lai_dtype_numpy():
    """`n_guns` hoặc `current_type` null ⇒ KHÔNG loại. Đây là dtype pipeline thật dùng."""
    n = pd.Series([1.0, float("nan"), 1.0])
    t = pd.Series(["AC", "AC", None], dtype=object)
    assert list(supply.is_private_ac(n, t)) == [True, False, False]


def test_khong_biet_thi_giu_lai_dtype_nullable():
    """Cùng câu trả lời với dtype nullable — trước đây phép `&` sẽ NỔ ở đây."""
    n = pd.Series([1, None, 1], dtype="Int64")
    t = pd.Series(["AC", "AC", None], dtype="string")
    assert list(supply.is_private_ac(n, t)) == [True, False, False]


# --- trạm đủ tư cách phục vụ --------------------------------------------
def test_is_serving():
    op = pd.Series(["OPERATIONAL", "MAINTENANCE", "CLOSED", "OPERATIONAL"])
    ac = pd.Series(["PUBLIC", "PUBLIC", "PUBLIC", "RESTRICTED"])
    assert list(supply.is_serving(op, ac)) == [True, True, False, False]


# --- nhãn lớp tham chiếu -------------------------------------------------
def test_peer_label_mang_ma_tinh_khong_mang_ten_tinh():
    assert supply.peer_label("79", "AC") == "79|AC"
    assert supply.peer_label("01", "DC") == "01|DC"


def test_hai_tinh_khong_bao_gio_chung_mot_nhan_peer():
    assert supply.peer_label("01", "AC") != supply.peer_label("79", "AC")
