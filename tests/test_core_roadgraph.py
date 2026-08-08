"""Đồ thị đường bộ có hướng + Dijkstra đa nguồn.

Ba luật có số đo đỡ lưng ở ``DECISIONS §14``, và test này khoá cả ba:

  1. cạnh CÓ HƯỚNG — bỏ luật này thì mọi khoảng cách ở khu phố cổ sai
  2. neo vào đỉnh xe ĐI TIẾP ĐƯỢC, không phải đỉnh gần nhất về hình học — bỏ thì ô neo
     trúng đầu cụt của đường một chiều và khoảng cách ra vô nghĩa
  3. độ lệch neo lấy MIN chứ không phải TỔNG — ``csr_matrix`` CỘNG DỒN giá trị trùng chỉ
     số, nên một đỉnh có 5 trạm sẽ mang trọng số gấp 5 nếu quên

Và một luật thứ tư, luật duy nhất KHÁC gói ``hanoi``: neo vào SCC **đủ lớn**, không phải
SCC **lớn nhất**. Ở TP.HCM (Sài Gòn + Bình Dương + Bà Rịa–Vũng Tàu, với Đồng Nai chen
giữa) luật "lớn nhất" bỏ rơi 3.368 ô mang 1,38 triệu người.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from evcs.core import roadgraph as rg

# Hệ số mét/độ đơn giản hoá cho test: 1 độ = 1 mét ở cả hai trục, nên khoảng cách trong
# test đọc thẳng ra được. Luật đồ thị không phụ thuộc giá trị hệ số.
M = (1.0, 1.0)


def _ways(rows: list[dict]) -> pd.DataFrame:
    """``rows``: [{'node_ids': [...], 'coords': [x0,y0,x1,y1,...], 'oneway': 0|1|-1}]"""
    return pd.DataFrame(rows)


def _chuoi(ids: list[int], buoc: float = 10.0, oneway: int = 0, y: float = 0.0) -> dict:
    """Một chuỗi đỉnh thẳng hàng, cách nhau ``buoc``."""
    coords = []
    for i, _ in enumerate(ids):
        coords += [i * buoc, y]
    return {"node_ids": ids, "coords": coords, "oneway": oneway}


def _vong(ids: list[int], r: float = 100.0, oneway: int = 0) -> dict:
    """Một vòng kín — mọi đỉnh thuộc cùng một SCC dù có một chiều hay không."""
    n = len(ids)
    coords = []
    for k in range(n):
        a = 2 * np.pi * k / n
        coords += [r * np.cos(a), r * np.sin(a)]
    coords += [r, 0.0]
    return {"node_ids": [*ids, ids[0]], "coords": coords, "oneway": oneway}


# --- dựng đồ thị ---------------------------------------------------------
def test_dinh_sap_xep_tang_va_khong_trung():
    g = rg.build(_ways([_chuoi([30, 10, 20])]), *M)
    assert list(g.ids) == [10, 20, 30]
    assert g.n_nodes == 3


def test_hai_chieu_sinh_hai_canh_mot_chieu_sinh_mot():
    hai = rg.build(_ways([_chuoi([1, 2], oneway=0)]), *M)
    mot = rg.build(_ways([_chuoi([1, 2], oneway=1)]), *M)
    nguoc = rg.build(_ways([_chuoi([1, 2], oneway=-1)]), *M)
    assert len(hai.src) == 2
    assert len(mot.src) == 1
    assert len(nguoc.src) == 1
    # `-1` là chiều NGƯỢC với thứ tự đỉnh
    assert (mot.src[0], mot.dst[0]) == (0, 1)
    assert (nguoc.src[0], nguoc.dst[0]) == (1, 0)


def test_trong_so_canh_la_MET_theo_he_so_truyen_vao():
    g = rg.build(_ways([_chuoi([1, 2], buoc=250.0)]), 2.0, 3.0)
    # dx = 250 độ × 3 m/độ = 750 m; dy = 0
    assert g.dist_w[0] == pytest.approx(750.0)


def test_hinh_hoc_khong_khop_node_ids_thi_BO_DOAN_khong_doan():
    xau = {"node_ids": [1, 2, 3], "coords": [0.0, 0.0, 10.0, 0.0], "oneway": 0}
    g = rg.build(_ways([xau, _chuoi([7, 8])]), *M)
    assert set(g.ids) == {7, 8}, "đoạn hỏng phải bị bỏ, không được đoán toạ độ"


def test_doan_mot_dinh_bi_bo():
    g = rg.build(_ways([{"node_ids": [1], "coords": [0.0, 0.0], "oneway": 0}, _chuoi([2, 3])]), *M)
    assert set(g.ids) == {2, 3}


def test_canh_do_dai_0_bi_bo():
    trung = {"node_ids": [1, 2], "coords": [5.0, 5.0, 5.0, 5.0], "oneway": 0}
    g = rg.build(_ways([trung, _chuoi([3, 4])]), *M)
    assert all(w > 0 for w in g.dist_w)


# --- SCC đủ lớn, không phải lớn nhất -------------------------------------
def test_dinh_thuoc_SCC_nho_khong_duoc_lam_diem_neo():
    """Đầu cụt của đường một chiều: vào được, không ra được ⇒ SCC = 1."""
    lon = _vong(list(range(100, 100 + rg.MIN_SCC_NODES + 5)))
    cut = {"node_ids": [100, 999], "coords": [100.0, 0.0, 500.0, 500.0], "oneway": 1}
    g = rg.build(_ways([lon, cut]), *M)
    pos = {int(v): i for i, v in enumerate(g.ids)}
    assert not g.in_core[pos[999]], "đầu cụt phải bị loại khỏi tập neo"
    assert g.in_core[pos[100]]


def test_hai_manh_lon_ROI_NHAU_deu_duoc_giu():
    """Đây là chỗ luật 'SCC lớn nhất' của gói hanoi SAI, và sai lớn.

    TP.HCM sau sáp nhập không liền mạch theo đường bộ trong vành đệm của chính nó. Luật
    'lớn nhất' giữ Sài Gòn và vứt toàn bộ Vũng Tàu — 3.368 ô, 1,38 triệu người.
    """
    a = _vong(list(range(1000, 1000 + rg.MIN_SCC_NODES + 10)), r=100.0)
    b = _vong(list(range(5000, 5000 + rg.MIN_SCC_NODES + 3)), r=100.0)
    b["coords"] = [c + 100_000 if i % 2 == 0 else c for i, c in enumerate(b["coords"])]
    g = rg.build(_ways([a, b]), *M)
    assert g.n_core_components == 2, "hai mạng đường có thật, cả hai phải được giữ"
    assert g.in_core.all()


def test_manh_vun_duoi_nguong_bi_loai():
    lon = _vong(list(range(1000, 1000 + rg.MIN_SCC_NODES + 5)))
    vun = _vong([7, 8, 9])
    vun["coords"] = [c + 50_000 for c in vun["coords"]]
    g = rg.build(_ways([lon, vun]), *M)
    pos = {int(v): i for i, v in enumerate(g.ids)}
    assert not any(g.in_core[pos[v]] for v in (7, 8, 9))


# --- neo ------------------------------------------------------------------
def _g_vong():
    return rg.build(_ways([_vong(list(range(1, 1 + rg.MIN_SCC_NODES + 5)), r=1000.0)]), *M)


def test_neo_chi_vao_dinh_du_dieu_kien():
    g = _g_vong()
    nodes, off, ok, _, _ = rg.snap(g, np.array([1000.0]), np.array([0.0]))
    assert ok.all()
    assert all(g.in_core[n] for n in nodes)


def test_diem_qua_xa_thi_KHONG_neo_duoc():
    g = _g_vong()
    _, _, ok, _, _ = rg.snap(g, np.array([1e6]), np.array([1e6]))
    assert not ok.any()
    assert rg.SNAP_MAX_M == 2_000.0


def test_nhieu_diem_cung_mot_dinh_thi_do_lech_lay_MIN():
    """csr_matrix CỘNG DỒN giá trị trùng chỉ số — quên lấy MIN là trọng số gấp bội."""
    g = _g_vong()
    x, y = g.lon[g.gidx[0]], g.lat[g.gidx[0]]
    nodes, off, ok, _, _ = rg.snap(g, np.array([x, x, x]), np.array([y, y + 5, y + 9]))
    assert len(nodes) == 1, "ba điểm cùng neo một đỉnh phải gộp thành một"
    assert off[0] == pytest.approx(0.0, abs=1e-6), "phải là MIN, không phải tổng"


def test_snap_tap_rong_khong_no():
    g = _g_vong()
    nodes, off, ok, _, _ = rg.snap(g, np.array([1e7]), np.array([1e7]))
    assert len(nodes) == 0 and len(off) == 0


# --- Dijkstra đa nguồn ----------------------------------------------------
def test_khong_co_nguon_thi_moi_dinh_la_vo_han():
    g = _g_vong()
    d = rg.multisource(g, np.empty(0, np.int32), np.empty(0), reverse=True)
    assert np.isinf(d).all()
    assert len(d) == g.n_nodes


def test_khoang_cach_toi_chinh_nguon_bang_do_lech_neo():
    g = _g_vong()
    n = np.array([g.gidx[0]], np.int32)
    d = rg.multisource(g, n, np.array([12.5]), reverse=True)
    assert d[g.gidx[0]] == pytest.approx(12.5)


def test_chieu_di_va_chieu_ve_khac_nhau_tren_duong_mot_chieu():
    """`reverse=True` là Ô→TRẠM (chiều đi sạc). Trên vòng một chiều hai chiều phải LỆCH."""
    g = rg.build(_ways([_vong(list(range(1, 1 + rg.MIN_SCC_NODES + 5)), r=1000.0, oneway=1)]), *M)
    n = np.array([g.gidx[0]], np.int32)
    o = np.array([0.0])
    di = rg.multisource(g, n, o, reverse=True)
    ve = rg.multisource(g, n, o, reverse=False)
    assert np.isfinite(di).all() and np.isfinite(ve).all()
    assert not np.allclose(di, ve), "vòng một chiều thì đi và về phải khác"

    # Bất biến của một vòng MỘT CHIỀU: tại mọi đỉnh, (đi + về) = chu vi vòng. Đi một
    # quãng rồi về nốt phần còn lại thì đúng bằng một vòng.
    #
    # TRỪ chính đỉnh nguồn, ở đó cả hai bằng 0 — và đó cũng đúng: đứng ngay tại trạm thì
    # không phải đi đâu cả. Bỏ sót ngoại lệ này là chỗ bất biến trông như sai.
    chu_vi = float(g.dist_w.sum())
    khac_nguon = np.ones(g.n_nodes, bool)
    khac_nguon[g.gidx[0]] = False
    assert di[g.gidx[0]] == 0.0 and ve[g.gidx[0]] == 0.0
    assert np.allclose((di + ve)[khac_nguon], chu_vi, rtol=1e-6)


def test_hai_chieu_bang_nhau_tren_duong_hai_chieu():
    g = _g_vong()
    n = np.array([g.gidx[0]], np.int32)
    o = np.array([0.0])
    assert np.allclose(
        rg.multisource(g, n, o, reverse=True), rg.multisource(g, n, o, reverse=False)
    )


def test_xy_dung_he_so_cua_chinh_do_thi():
    g = rg.build(_ways([_chuoi([1, 2])]), 111_000.0, 104_000.0)
    x, y = g.xy(np.array([2.0]), np.array([3.0]))
    assert x[0] == pytest.approx(2.0 * 104_000.0)
    assert y[0] == pytest.approx(3.0 * 111_000.0)
