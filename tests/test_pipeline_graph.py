"""DAG suy từ reads/writes, và cổng chặn khai-thiếu.

Test quan trọng nhất: ``test_soi_bat_duoc_doc_khong_khai``. Không có nó thì cơ chế ``--soi``
có thể im lặng vì hỏng chứ không phải vì sạch — và một cổng chặn luôn báo "không sao" thì
tệ hơn không có cổng nào.
"""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from evcs.pipeline import graph
from evcs.pipeline.audit import record_reads, undeclared
from evcs.pipeline.dataset import Dataset, Registry
from evcs.pipeline.runner import Pipeline
from evcs.pipeline.step import Step
from evcs.pipeline.store import Roots


def _reg() -> Registry:
    return Registry(
        [
            Dataset("nguon", "source", "source", "n.parquet", abs_path=Path("/tmp/khong-co")),
            Dataset("a", "province", "product", "a.parquet"),
            Dataset("b", "province", "interim", "b.parquet"),
            Dataset("c", "province", "cache", "c.parquet"),
        ]
    )


def _steps() -> list[Step]:
    return [
        Step("s1", "province", "1", lambda p: None, reads=("nguon",), writes=("a", "c")),
        Step("s2", "province", "1", lambda p: None, reads=("a", "c"), writes=("b",)),
    ]


# --- DAG -----------------------------------------------------------------
def test_thu_tu_suy_ra_tu_reads_writes():
    assert graph.topo_order(_steps()) == ["s1", "s2"]


def test_thu_tu_on_dinh_khong_phu_thuoc_thu_tu_khai():
    a, b = _steps()
    assert graph.topo_order([b, a]) == graph.topo_order([a, b])


def test_bat_chu_trinh():
    xau = [
        Step("x", "province", "1", lambda p: None, reads=("b",), writes=("a",)),
        Step("y", "province", "1", lambda p: None, reads=("a",), writes=("b",)),
    ]
    with pytest.raises(ValueError, match="CHU TRÌNH"):
        graph.topo_order(xau)


def test_bat_hai_buoc_cung_ghi_mot_dataset():
    xau = [
        Step("x", "province", "1", lambda p: None, writes=("a",)),
        Step("y", "province", "1", lambda p: None, writes=("a",)),
    ]
    with pytest.raises(ValueError, match="ghi bởi cả"):
        graph.producers(xau)


def test_bat_doc_dataset_khong_ai_sinh():
    mo_coi = [Step("x", "province", "1", lambda p: None, reads=("b",), writes=("a",))]
    v = graph.validate(mo_coi, _reg())
    assert any("KHÔNG bước nào sinh ra nó" in x for x in v)


def test_bat_ten_dataset_go_nham():
    xau = [Step("x", "province", "1", lambda p: None, reads=("grid_cel",), writes=("a",))]
    assert any("chưa khai trong registry" in x for x in graph.validate(xau, _reg()))


def test_buoc_vua_doc_vua_ghi_mot_dataset_la_loi():
    with pytest.raises(ValueError, match="vừa đọc vừa ghi"):
        Step("x", "province", "1", lambda p: None, reads=("a",), writes=("a",))


def test_upstream_of():
    assert graph.upstream_of(_steps(), "s2") == ["s1"]
    assert graph.upstream_of(_steps(), "s1") == []


# --- tier quyết định thư mục --------------------------------------------
def test_tier_cache_di_vao_cay_rieng(tmp_path):
    r = Roots(store=tmp_path)
    reg = _reg()
    assert reg.get("a").path(r, "01") == tmp_path / "p" / "01" / "a.parquet"
    assert reg.get("c").path(r, "01") == tmp_path / "cache" / "01" / "c.parquet"


def test_dataset_theo_tinh_khong_giai_duoc_neu_thieu_ma_tinh(tmp_path):
    with pytest.raises(ValueError, match="phải truyền province_code"):
        _reg().get("a").path(Roots(store=tmp_path))


def test_ten_dataset_la_thi_goi_y(tmp_path):
    with pytest.raises(KeyError, match="ý bạn là"):
        _reg().get("aa")


# --- audit ---------------------------------------------------------------
def _viet(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.table({"x": [1]}), p)


def test_soi_bat_duoc_doc_khong_khai(tmp_path):
    """Cổng chặn phải BÁO khi bước đọc một file ngoài bản khai — nếu không nó vô dụng."""
    khai = tmp_path / "khai.parquet"
    len_ = tmp_path / "len.parquet"
    _viet(khai)
    _viet(len_)

    with record_reads([tmp_path]) as rec:
        pq.read_table(khai)
        pq.read_table(len_)  # ← đọc mà không khai

    la = undeclared(rec.opened, declared={khai}, written=set())
    assert la == [len_.resolve()]


def test_soi_im_lang_khi_khai_du(tmp_path):
    khai = tmp_path / "khai.parquet"
    _viet(khai)
    with record_reads([tmp_path]) as rec:
        pq.read_table(khai)
    assert undeclared(rec.opened, declared={khai}, written=set()) == []


def test_soi_khong_bao_file_do_chinh_buoc_vua_ghi(tmp_path):
    ra = tmp_path / "ra.parquet"
    _viet(ra)
    with record_reads([tmp_path]) as rec:
        pq.read_table(ra)
    assert undeclared(rec.opened, declared=set(), written={ra}) == []


def test_soi_bo_qua_file_ngoai_vung_theo_doi(tmp_path):
    ngoai = tmp_path / "ngoai" / "x.parquet"
    _viet(ngoai)
    theo_doi = tmp_path / "trong"
    theo_doi.mkdir()
    with record_reads([theo_doi]) as rec:
        pq.read_table(ngoai)
    assert rec.opened == set()


def test_soi_tra_lai_ham_goc_sau_khi_thoat(tmp_path):
    goc = pq.read_table
    with record_reads([tmp_path]):
        assert pq.read_table is not goc
    assert pq.read_table is goc


# --- vân tay --------------------------------------------------------------
def _pipeline(tmp_path) -> Pipeline:
    return Pipeline(_reg(), _steps(), Roots(store=tmp_path), sources=[], provinces=["01"])


def test_van_tay_doi_khi_nguon_doi(tmp_path):
    pl = _pipeline(tmp_path)
    s2 = pl.steps["s2"]
    a = _reg().get("a").path(pl.roots, "01")
    _viet(a)
    _viet(_reg().get("c").path(pl.roots, "01"))
    v1 = pl.fingerprint(s2, "01")
    pq.write_table(pa.table({"x": [1, 2, 3]}), a)
    assert pl.fingerprint(s2, "01") != v1


def test_van_tay_doi_khi_version_doi(tmp_path):
    pl = _pipeline(tmp_path)
    s2 = pl.steps["s2"]
    v1 = pl.fingerprint(s2, "01")
    s2b = Step("s2", "province", "2", s2.run, reads=s2.reads, writes=s2.writes)
    assert pl.fingerprint(s2b, "01") != v1


def test_van_tay_phu_thu_muc_khong_chi_parquet(tmp_path):
    """Bản cũ glob riêng `*.parquet`, nên thư mục tile `.tif` có vân tay `0:0:0`."""
    from evcs.pipeline.runner import _stat

    d = tmp_path / "tiles"
    d.mkdir()
    v0 = _stat(d)
    (d / "a.tif").write_bytes(b"x" * 100)
    assert _stat(d) != v0


# --- resume: đây là lỗi §3 sửa -------------------------------------------
def test_chay_lai_thuong_nguon_lam_ha_nguon_het_han(tmp_path):
    """Lỗi cũ, đo được ở 7/12 bước: `n08` đọc `grid_cell` nhưng không khai nó.

    Chạy lại `n04` (đổi `commune_code`) để lại `n08` ở trạng thái "đã xong" — resume phục
    vụ một kết quả đã hết hạn, đúng thứ mà chính docstring của nó gọi là cách sai tệ nhất.

    Ở đây `reads` là bản khai DUY NHẤT, nên bỏ sót không còn là một lựa chọn.
    """
    pl = _pipeline(tmp_path)
    s1, s2 = pl.steps["s1"], pl.steps["s2"]
    for n in ("a", "c", "b"):
        _viet(_reg().get(n).path(pl.roots, "01"))

    state = {"steps": {}}
    pl.mark_done(state, s2, "01")
    assert pl.is_done(state, s2, "01")[0]

    # `s1` chạy lại và ghi ra nội dung khác ⇒ `s2` PHẢI hết hạn.
    a = _reg().get("a").path(pl.roots, "01")
    pq.write_table(pa.table({"x": [9, 9, 9]}), a)
    ok, why = pl.is_done(state, s2, "01")
    assert not ok
    assert "vân tay" in why


def test_xoa_tay_mot_san_pham_thi_buoc_do_chay_lai(tmp_path):
    pl = _pipeline(tmp_path)
    s2 = pl.steps["s2"]
    for n in ("a", "c", "b"):
        _viet(_reg().get(n).path(pl.roots, "01"))
    state = {"steps": {}}
    pl.mark_done(state, s2, "01")
    _reg().get("b").path(pl.roots, "01").unlink()
    ok, why = pl.is_done(state, s2, "01")
    assert not ok and "thiếu sản phẩm" in why


def test_state_hong_thi_coi_nhu_chua_chay_khong_no(tmp_path):
    pl = _pipeline(tmp_path)
    pl.roots.store.mkdir(parents=True, exist_ok=True)
    pl.roots.state_file.write_text("{ khong phai json", encoding="utf-8")
    assert pl.load_state() == {"steps": {}}


def test_ghi_state_la_atomic(tmp_path):
    """Ctrl-C giữa lúc ghi không được để lại file state hỏng — nó là thứ DUY NHẤT biết
    đã chạy tới đâu."""
    pl = _pipeline(tmp_path)
    pl.save_state({"steps": {"x|01": {"fingerprint": "v=1"}}})
    assert pl.load_state()["steps"]["x|01"]["fingerprint"] == "v=1"
    assert not pl.roots.state_file.with_suffix(".json.tmp").exists()


def test_mot_tinh_hong_khong_lam_chet_ca_lan_chay(tmp_path):
    """34 tỉnh mà một tỉnh hỏng thì 33 tỉnh còn lại vẫn phải ra sản phẩm."""
    goi = []

    def no(p):
        goi.append(p)
        if p == "02":
            raise RuntimeError("tỉnh 02 hỏng")

    steps = [Step("s", "province", "1", no, reads=("nguon",), writes=("a",))]
    pl = Pipeline(_reg(), steps, Roots(store=tmp_path), sources=[], provinces=["01", "02", "03"])
    hong = 0
    for p in pl.provinces:
        try:
            pl.run_one(pl.steps["s"], p)
        except RuntimeError:
            hong += 1
    assert goi == ["01", "02", "03"] and hong == 1
