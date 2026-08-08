"""Cổng chặn golden phải NỔ, và phải nổ khác nhau cho ba loại thay đổi.

Một cổng chặn luôn báo "không sao" thì tệ hơn không có cổng nào — nó mua sự yên tâm mà
không mua sự an toàn. Test này gọi thẳng ``compare`` với các baseline giả để chứng minh
từng loại chênh lệch đều bị bắt.

Ba loại KHÔNG cùng mức nghiêm trọng, và đó là cả điểm:

    MỚI       thêm một bảng ⇒ hợp lệ khi đang thêm một lớp. ``--ghi`` là bước tiếp theo ĐÚNG.
    BIẾN MẤT  bảng cũ không còn ⇒ có thể hợp lệ, nhưng phải CỐ Ý.
    ĐỔI SỐ    cùng bảng, khác giá trị ⇒ KHÔNG BAO GIỜ tự động hợp lệ. ``--ghi`` là bước SAI.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from golden.fingerprint import column_fingerprint, compare, table_fingerprint


def _fp(**cols) -> dict:
    return {
        "n_rows": len(next(iter(cols.values()))),
        "n_cols": len(cols),
        "columns": sorted(cols),
        "col": {k: column_fingerprint(pd.Series(v)) for k, v in cols.items()},
    }


# --- bắt được thay đổi giá trị ------------------------------------------
def test_bat_doi_mot_gia_tri():
    a = _fp(x=[1.0, 2.0, 3.0])
    b = _fp(x=[1.0, 2.0, 3.5])
    assert compare(a, b, "t") != []


def test_bat_hoan_vi_gia_tri_giua_hai_dong():
    """Tổng không đổi khi hoán vị — nên phải có tổng bình phương, nếu không sẽ lọt."""
    a = _fp(x=[1.0, 5.0], y=[5.0, 1.0])
    b = _fp(x=[5.0, 1.0], y=[5.0, 1.0])
    # Cột `x` giữ nguyên tập giá trị nhưng đổi thứ tự ⇒ KHÔNG được báo (bất biến thứ tự)
    assert compare(a, b, "t") == []
    # Còn đổi THẬT thì phải báo
    c = _fp(x=[2.0, 4.0], y=[5.0, 1.0])
    assert compare(a, c, "t") != []


def test_bat_them_null():
    a = _fp(x=[1.0, 2.0, 3.0])
    b = _fp(x=[1.0, 2.0, np.nan])
    assert any("n_null" in d or "n_finite" in d for d in compare(a, b, "t"))


def test_bat_doi_nhan_chuoi():
    """`HANOI` → `IN` là đúng loại trôi đã xảy ra thật giữa hai gói."""
    a = _fp(scope=["HANOI", "BUFFER"])
    b = _fp(scope=["IN", "BUFFER"])
    assert any("hash" in d for d in compare(a, b, "t"))


def test_bat_them_cot_va_mat_cot():
    a = _fp(x=[1.0])
    b = _fp(x=[1.0], y=[2.0])
    assert any("THÊM cột" in d for d in compare(a, b, "t"))
    assert any("MẤT cột" in d for d in compare(b, a, "t"))


def test_bat_doi_so_dong():
    a = _fp(x=[1.0, 2.0])
    b = _fp(x=[1.0, 2.0, 3.0])
    assert any("n_rows" in d for d in compare(a, b, "t"))


# --- KHÔNG báo động giả --------------------------------------------------
def test_khong_bao_khi_chi_doi_thu_tu_dong():
    """Đây là điều kiện để cổng dùng được: đổi thứ tự merge không được thành báo động."""
    a = _fp(x=[3.0, 1.0, 2.0], k=["c", "a", "b"])
    b = _fp(x=[1.0, 2.0, 3.0], k=["a", "b", "c"])
    assert compare(a, b, "t") == []


def test_khong_bao_khi_cong_don_theo_thu_tu_khac(tmp_path):
    """Nhiễu dấu phẩy động của phép cộng KHÔNG được thành báo động ở mỗi lần chạy."""
    rng = np.random.default_rng(0)
    v = rng.random(50_000) * 1e6
    a = tmp_path / "a.parquet"
    b = tmp_path / "b.parquet"
    pq.write_table(pa.table({"x": v}), a)
    pq.write_table(pa.table({"x": rng.permutation(v)}), b)
    assert compare(table_fingerprint(a), table_fingerprint(b), "t") == []


def test_giong_het_thi_rong():
    a = _fp(x=[1.0, 2.0], k=["a", "b"])
    assert compare(a, dict(a), "t") == []


# --- độ nhạy: ĐO ĐƯỢC, không phải ước lượng ------------------------------
#
# Ngưỡng phát hiện là TƯƠNG ĐỐI, không phải tuyệt đối — hệ quả trực tiếp của việc làm tròn
# theo 12 CHỮ SỐ CÓ NGHĨA (`fingerprint.SIGDIGITS`). Đo trên giá trị cỡ 10³:
#
#     1e-2 … 1e-11 tương đối  →  BẮT
#     1e-12 trở xuống         →  lọt
#
# Ranh giới ấy được chọn có chủ ý. Thay đổi nhỏ nhất ĐÁNG quan tâm là một ô đổi nhóm màu,
# cỡ 1e-4 tương đối — trên ngưỡng bảy bậc độ lớn. Còn 1e-12 là vùng của nhiễu dấu phẩy
# động, và một cổng chặn nổ vì nhiễu sẽ bị người ta tắt đi.
@pytest.mark.parametrize("rel", [1e-2, 1e-4, 1e-8, 1e-11])
def test_bat_moi_thay_doi_tren_nguong(rel: float):
    a = _fp(x=[1000.0, 2000.0])
    b = _fp(x=[1000.0 * (1 + rel), 2000.0])
    assert compare(a, b, "t") != [], f"lọt thay đổi tương đối {rel}"


@pytest.mark.parametrize("rel", [1e-12, 1e-15])
def test_khong_nhay_toi_vung_nhieu_dau_phay_dong(rel: float):
    a = _fp(x=[1000.0, 2000.0])
    b = _fp(x=[1000.0 * (1 + rel), 2000.0])
    assert compare(a, b, "t") == [], f"báo động giả ở mức {rel}"


def test_nguong_la_TUONG_DOI_khong_phai_tuyet_doi():
    """Cùng một delta tuyệt đối: bắt được trên số nhỏ, lọt trên số lớn. Đó là đúng —
    1 mét trên 3 km là tín hiệu, 1 mét trên 3.000 km là làm tròn."""
    d = 1e-6
    assert compare(_fp(x=[1e-3]), _fp(x=[1e-3 + d]), "t") != []
    assert compare(_fp(x=[1e9]), _fp(x=[1e9 + d]), "t") == []


# --- cột hình học -------------------------------------------------------
def test_cot_wkb_khong_fingerprint_theo_gia_tri(tmp_path):
    """Cột hình học chỉ đếm — băm hàng triệu byte WKB không mua thêm độ an toàn nào."""
    p = tmp_path / "g.parquet"
    pq.write_table(pa.table({"geometry_wkb": [b"\x01\x02", None, b"\x03"]}), p)
    fp = table_fingerprint(p)
    assert fp["col"]["geometry_wkb"]["dtype"] == "opaque"
    assert fp["col"]["geometry_wkb"]["n_null"] == 1
