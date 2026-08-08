"""Mọi script ở ``analysis/`` và ``notebooks/`` phải còn import được.

Vì sao cần: ``make kiem`` hôm nay **mù** với hai thư mục này. ``pyproject.toml`` khoá
``testpaths = ["tests"]`` và không file nào trong ``tests/`` chạm tới chúng — nên xoá gói
``hanoi`` vẫn cho ra ``make kiem`` XANH trong khi hàng chục script đã chết. Một cổng chặn
nói dối đúng lúc cần nó nhất thì tệ hơn không có cổng.

Test này **chỉ import**, không chạy. Ba loại lỗi, ba cách xử lý khác nhau, và phân biệt
được chúng mới là cả điểm:

* ``SystemExit``            — ``assert_sources()`` dừng sớm vì thiếu nguồn. Hành vi ĐÚNG.
* thiếu gói BÊN NGOÀI       — ``matplotlib``/``nbformat`` nằm ở nhóm phụ thuộc ``notebook``,
  không cài trong môi trường mặc định. Đó là chuyện MÔI TRƯỜNG, không phải mã hỏng ⇒ bỏ qua.
* thiếu gói/tên CỦA DỰ ÁN   — ``hanoi``, ``evcs``, ``vn``, ``_common``, ``_graph``. Đây là
  thứ duy nhất test này tồn tại để bắt: một tên đã biến mất khỏi thượng nguồn.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / "analysis"
NOTEBOOKS = ROOT / "notebooks"

# ── Đã hỏng TỪ TRƯỚC đợt refactor, kèm lý do đo được ─────────────────────────
#
# `a02_speed_sensitivity.py` import `DEFAULT_KPH`/`LINK_KPH` từ `hanoi.s03_osm_extract`.
# Kiểm ở commit gốc `a7154c6`: hai tên đó chỉ còn trong MỘT COMMENT ("Bản trước có
# ``DEFAULT_KPH``…"), không còn là mã. Chúng bị bỏ cùng với trường thời-gian-lái —
# DECISIONS §6, sau khi đo được rằng bỏ hẳn tag `maxspeed` vẫn cho Spearman 0,9991.
#
# Hệ quả đáng ghi: mũi phản biện **A2** không chạy lại được nữa. Kết luận của nó còn trong
# `CRITIQUE.md`, nhưng nó đã thành một khẳng định thay vì một phép đo tái lập được. Đây là
# NỢ ĐÃ GHI NHẬN, không phải một chỗ giấu rác.
DA_HONG_TU_TRUOC = {
    "a02_speed_sensitivity.py": (
        "import DEFAULT_KPH/LINK_KPH — đã bị bỏ cùng trường thời-gian-lái (DECISIONS §6). "
        "Mũi phản biện A2 vì thế không tái lập được."
    ),
}


# Gói CỦA DỰ ÁN. Thiếu một trong số này là hồi quy; thiếu gói bên ngoài thì không.
GOI_DU_AN = {"hanoi", "vn", "evcs", "_common", "_graph", "golden"}


def _la_goi_du_an(e: BaseException) -> bool:
    ten = getattr(e, "name", None)
    if ten and ten.split(".")[0] in GOI_DU_AN:
        return True
    # `AttributeError`/`ImportError` dạng "cannot import name X from Y" — nhìn vào chuỗi.
    return any(g in str(e) for g in GOI_DU_AN)


def _modules(d: Path) -> list[Path]:
    if not d.exists():
        return []
    return sorted(p for p in d.glob("*.py") if not p.name.startswith("__"))


MODULES = [*_modules(ANALYSIS), *_modules(NOTEBOOKS)]


@pytest.fixture(scope="module", autouse=True)
def _duong_dan():
    them = [str(ANALYSIS), str(NOTEBOOKS)]
    for p in them:
        if p not in sys.path:
            sys.path.insert(0, p)
    yield


@pytest.mark.skipif(not MODULES, reason="chưa có analysis/ hoặc notebooks/")
@pytest.mark.parametrize("f", MODULES, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_import_duoc(f: Path):
    spec = importlib.util.spec_from_file_location(f.stem, f)
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(m)
    except SystemExit:
        # `assert_sources()` dừng sớm khi thiếu nguồn — đó là hành vi ĐÚNG, không phải hỏng.
        pass
    except (ImportError, AttributeError) as e:
        ly_do = DA_HONG_TU_TRUOC.get(f.name)
        if ly_do:
            pytest.xfail(f"{f.name}: {ly_do}")
        if not _la_goi_du_an(e):
            pytest.skip(f"thiếu gói bên ngoài ({getattr(e, 'name', e)}) — chuyện môi trường")
        raise AssertionError(f"{f.name} không import được: {type(e).__name__}: {e}") from e
    except Exception:
        # Lỗi lúc CHẠY (thiếu file dữ liệu, thiếu cột…) không thuộc phạm vi test này.
        pass


def test_danh_sach_no_khong_giu_file_da_song_lai():
    """Sửa xong một script thì phải bỏ nó khỏi danh sách nợ, nếu không danh sách sẽ nói dối."""
    con = [n for n in DA_HONG_TU_TRUOC if (ANALYSIS / n).exists() or (NOTEBOOKS / n).exists()]
    assert sorted(con) == sorted(DA_HONG_TU_TRUOC), "danh sách nợ trỏ tới file không còn tồn tại"
