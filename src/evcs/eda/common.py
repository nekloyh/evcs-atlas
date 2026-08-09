"""Nguyên hàm dùng chung của chuỗi ETL bóc lớp POI.

Mọi thứ ở đây là CHÉP LẠI hành vi của notebook, không phải cải tiến. Chỗ nào notebook làm
một việc trông lạ mà kết quả phụ thuộc vào nó, chỗ đó có comment giải thích vì sao KHÔNG
được "sửa cho đẹp" — sửa là lệch chuẩn vàng.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[3]
EDA_DIR = ROOT / "data/qa/eda"
GOC_DIR = ROOT / "data/qa/critique"
# Chỗ DUY NHẤT mà ETL được phép ghi. `_gold/` và các file gốc trong `data/qa/eda/` bất khả
# xâm phạm — cổng đỏ cũng đổ dòng phạm vào đây, không đổ ra ngoài.
ETL_DIR = EDA_DIR / "_etl"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Chuẩn hoá chuỗi & tag
# ─────────────────────────────────────────────────────────────────────────────


def parse_tags(x) -> dict:
    """tags → dict; chịu được NaN / chuỗi hỏng / đã là dict.

    Parse MỘT lần cho cả lớp. Hai chỗ parse bằng hai hàm khác nhau là hai nguồn sự thật.
    """
    if isinstance(x, dict):
        return x
    if isinstance(x, str):
        try:
            return json.loads(x)
        except json.JSONDecodeError:
            return {}
    return {}


def strip_accents(s) -> str:
    """Hạ chữ + bỏ dấu tiếng Việt (đ/Đ xử lý riêng vì NFD không tách được).

    CHÉP nguyên bản notebook, kể cả `str(s)` — nên `None` thành chuỗi `"none"`, không phải
    chuỗi rỗng. Hành vi đó có thật trong chuẩn vàng ở vài chỗ dùng `.map(strip_accents)`
    trên cột có NaN.
    """
    s = unicodedata.normalize("NFD", str(s)).replace("đ", "d").replace("Đ", "D")
    return re.sub(r"[̀-ͯ]", "", s).lower()


def them_uid(df: pd.DataFrame) -> pd.DataFrame:
    """Khoá thực thể: `osm_id` trần va chạm giữa node và way — mọi phép so/loại dùng `uid`."""
    df["uid"] = df["osm_type"].astype(str) + ":" + df["osm_id"].astype(str)
    return df


def bung_tags(df: pd.DataFrame, khoa: Iterable[str], *, ha_chu: bool = False) -> None:
    """Bung các khoá tag chưa có sẵn thành cột. Sửa `df` tại chỗ.

    `ha_chu=True` chép biến thể `tag()` của các notebook từ `luutru` trở đi:
    `str(t[k]).lower() if k in t else None`. Khác biệt với nhánh không hạ chữ là CÓ NGHĨA
    (giá trị tag OSM viết hoa vẫn khớp `isin`), nên là tham số chứ không phải mặc định.
    """
    td = df["tags_dict"]
    if ha_chu:
        for k in khoa:
            df[k] = td.map(lambda t, k=k: str(t[k]).lower() if k in t else None)
    else:
        for k in khoa:
            df[k] = td.map(lambda t, k=k: t.get(k))


def ghep_ten_norm(df: pd.DataFrame, khoa_alt: Sequence[str]) -> pd.Series:
    """`name_norm` = tên chính + mọi biến thể tên, đã bỏ dấu.

    Chỉ nạp các trường là TÊN CỦA CHÍNH VẬT THỂ. `operator`/`brand`/`addr:housename` mô tả
    NGƯỜI VẬN HÀNH hoặc VẬT CHỨA — nạp vào là kéo nhầm cửa hàng bên trong vào lớp.
    """
    td = df["tags_dict"]
    alt = td.map(lambda t: " ".join(v for v in (t.get(k) for k in khoa_alt) if v))
    return (df["name"].fillna("").map(strip_accents) + " " + alt.map(strip_accents)).str.strip()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Regex — hai máy khác nhau, phải gọi tên rõ ràng
# ─────────────────────────────────────────────────────────────────────────────
#
# BẪY ĐÃ TRẢ GIÁ: pandas 3 trả cột chuỗi ở dtype `str` (nền Arrow) và `.str.contains(
# regex=True)` khi đó chạy bằng RE2, nơi `\b` CHỈ hiểu ASCII. `\bchợ\b` khớp 3 dòng thay vì
# 1.417 — trượt hoàn toàn im lặng.
#
# Hệ quả cho một bản PORT: hai máy cho hai kết quả khác nhau, nên chọn máy là chọn kết quả.
# Chuẩn vàng được sinh ra bởi đúng những lời gọi mà notebook đã viết, nên ở đây KHÔNG có
# hàm nào "sửa" giúp — có hai hàm, mỗi hàm khai rõ mình chạy máy nào, và lớp nào dùng hàm
# nào là chép theo notebook lớp đó. Gọi `.str.contains` trần bị cấm vì nó giấu lựa chọn này.


def chua(s: pd.Series, rx: str, *, na: bool = False) -> pd.Series:
    """Khớp regex GIỮ NGUYÊN dtype của cột — cột `str` (Arrow) ⇒ máy RE2.

    Dùng cho `name_norm` và các cột tag: chúng đã bỏ dấu / là giá trị OSM thuần ASCII, nên
    RE2 và `re` cho cùng kết quả ở gần hết các dòng. "Gần hết" chứ không phải "mọi dòng" —
    xem `do_lech_may_regex()`; các dòng tên Khmer/Hàn/Nhật trong `name_norm` là chỗ hai máy
    có thể tách nhau, và chuẩn vàng đứng về phía RE2.
    """
    return s.str.contains(rx, regex=True, na=na)


def chua_co_dau(s: pd.Series, rx: str, *, na: bool = False) -> pd.Series:
    """Khớp regex trên cột CÒN DẤU — ép `astype(object)` để chạy `re` của Python.

    Bắt buộc cho mọi regex chạm chữ tiếng Việt còn dấu (`name_dau`). Không ép thì `\\b`
    trượt im lặng.
    """
    return s.astype(object).str.contains(rx, regex=True, na=na)


def bat_dau_bang(s: pd.Series, rx: str, *, na: bool = False) -> pd.Series:
    """`.str.match` — neo đầu chuỗi. Giữ nguyên dtype, cùng lý do với `chua()`."""
    return s.str.match(rx, na=na)


def do_lech_may_regex(s: pd.Series, rx: str) -> dict:
    """CHẨN ĐOÁN (không dùng trong luật): cùng regex, RE2 vs `re` lệch bao nhiêu dòng.

    Công cụ để soi bẫy `\\b`, dùng khi viết báo cáo port. Không gọi từ mã sản xuất.
    """
    a = s.str.contains(rx, regex=True, na=False)
    b = s.astype(object).str.contains(rx, regex=True, na=False)
    return {
        "re2": int(a.sum()),
        "python_re": int(b.sum()),
        "lech": int((a != b).sum()),
        "vi_du": s[a != b].head(5).tolist(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Dây chuyền luật xoá — `drop_rule` của bước 3
# ─────────────────────────────────────────────────────────────────────────────


class DayChuyenLoc:
    """Bước 3 của mọi lớp: áp lần lượt từng luật, ghi `drop_reason`, giữ phần bị xoá.

    Chép đúng ngữ nghĩa `drop_rule()` của notebook:
      * `cond` được `reindex` về index HIỆN TẠI của `con_lai` (luật viết trên `con_lai` của
        thời điểm nào cũng chạy được, dòng đã bị luật trước xoá thì rơi ra);
      * dòng khớp được `assign(drop_reason=luat)` rồi cất vào `phan_bi_xoa`;
      * `ham_tha` là van MIỄN TRỪ: dòng khớp luật NHƯNG có bằng chứng thuộc lớp này thì
        được GIỮ và cắm cờ `cot_co` thay vì xoá.

    Thứ tự luật quyết định `drop_reason` của dòng khớp NHIỀU luật ⇒ không đổi được.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        *,
        ham_tha: Callable[[pd.DataFrame], pd.Series] | None = None,
        cot_co: str | None = "mixed_use",
    ):
        self.con_lai = df.copy()
        if cot_co is not None:
            self.con_lai[cot_co] = False
        self.cot_co = cot_co
        self.ham_tha = ham_tha
        self.phan_bi_xoa: list[pd.DataFrame] = []
        self._n_vao = len(df)

    def xoa(self, cond: pd.Series, luat: str, *, tha: bool = False) -> None:
        m = cond.reindex(self.con_lai.index, fill_value=False)
        if tha:
            if self.ham_tha is None:
                raise ValueError(f"luật {luat} xin miễn trừ nhưng lớp không khai `ham_tha`")
            duoc_tha = m & self.ham_tha(self.con_lai)
            if duoc_tha.any():
                if self.cot_co is not None:
                    self.con_lai.loc[duoc_tha, self.cot_co] = True
                m = m & ~duoc_tha
        self.phan_bi_xoa.append(self.con_lai[m].assign(drop_reason=luat))
        self.con_lai = self.con_lai[~m]

    def ket(self) -> tuple[pd.DataFrame, pd.DataFrame]:
        """(giữ, bị xoá). Chặn thất thoát dòng — bất biến của cả bước 3."""
        bi_xoa = pd.concat(self.phan_bi_xoa)
        if len(bi_xoa) + len(self.con_lai) != self._n_vao:
            raise AssertionError(
                f"thất thoát dòng giữa các luật: {len(bi_xoa)} + {len(self.con_lai)}"
                f" ≠ {self._n_vao}"
            )
        return self.con_lai, bi_xoa


# ─────────────────────────────────────────────────────────────────────────────
# 4. Cổng recall hai tầng
# ─────────────────────────────────────────────────────────────────────────────


class CongDo(Exception):
    """Cổng đỏ CÓ NGỮ CẢNH — các dòng phạm đã được ghi ra đĩa trước khi ném.

    Khác `AssertionError` trần ở đúng một điểm, và điểm đó đáng giá cả buổi: khi cổng đỏ ở
    quy mô toàn quốc, thứ cần biết không phải "có đỏ" mà là "dòng nào, vì đầu dò nào". Ném
    trần thì tập dòng phạm chết theo stack, phải chạy lại cả chuỗi mới dựng lại được.
    """

    def __init__(self, thong_bao: str, *, lop: str, duong_dan: Path | None = None, chi_tiet=None):
        super().__init__(thong_bao)
        self.lop = lop
        self.duong_dan = duong_dan
        self.chi_tiet = chi_tiet or {}


def tran_theo_ty_le(n_vao: int, ty_le: float, san: int) -> int:
    """Trần của một cổng "xung đột", tính THEO TỶ LỆ trên cỡ bộ vào.

    Vì sao không dùng số tuyệt đối: mọi ngưỡng trong notebook được hiệu chỉnh trên bộ 7 tỉnh
    (193.509 dòng). Toàn quốc lớn hơn nhiều lần, nên một trần cố định sẽ đỏ chỉ vì bộ to
    hơn — đỏ mà không mang thông tin gì, đúng loại cổng tệ nhất.

    `san` giữ đúng trần cũ làm SÀN, nên một scope NHỎ không bao giờ bị siết chặt hơn
    notebook. Mỗi lớp khai `ty_le` = trần_cũ / cỡ_bộ_vào_7tinh, nhờ vậy chạy lại 7 tỉnh cho
    ra đúng con số cũ — parity không đổi một dòng nào.
    """
    return max(san, round(ty_le * n_vao))


def _gom_dong_pham(dau_do: dict[str, pd.Series], df: pd.DataFrame) -> pd.DataFrame:
    """Gộp các dòng bị đầu dò bắt, kèm cột `dau_do` cho biết đầu dò nào bắt."""
    phan = [df[m].assign(dau_do=ten) for ten, m in dau_do.items() if int(m.sum())]
    return pd.concat(phan) if phan else df.iloc[:0].assign(dau_do=pd.Series(dtype=object))


def cong_recall(
    dau_do_cung: dict[str, pd.Series],
    dau_do_mem: dict[str, pd.Series] | None = None,
    *,
    df: pd.DataFrame | None = None,
    lop: str = "",
    scope: str = "",
    thu_muc: Path | None = ETL_DIR,
    mien_tru: dict[str, str] | None = None,
) -> dict:
    """Cổng recall: đầu dò CỨNG phải = 0 (lỗ vá được), đầu dò MỀM chỉ theo dõi drift.

    Cổng đỏ ⇒ GHI các dòng phạm ra `<thu_muc>/gate_do_<lop>_<scope>.parquet` rồi ném
    `CongDo` kèm: lớp nào, đầu dò nào, bao nhiêu dòng, 5 mẫu tên. Truyền `df` (bộ BỊ LOẠI mà
    các đầu dò chạy trên đó) để có gì mà ghi.

    `mien_tru` — SỔ NỢ ĐÃ ĐIỀU TRA, `uid` → phán quyết bằng chữ. ĐÂY KHÔNG PHẢI HẠ NGƯỠNG:
    ngưỡng vẫn là 0 cho MỌI dòng chưa từng được soi, một dòng lạ vẫn làm đỏ ngay. Nó chỉ ghi
    nhận "những uid này đã được người đọc mắt, đây là kết luận, đây là lý do hoãn vá". Mỗi
    lần chạy đều IN RA và ghi vào manifest, nên nó không bao giờ im lặng được — đúng chỗ mà
    một whitelist âm thầm sẽ biến cổng thành luôn-xanh-theo-cấu-tạo.
    """
    mien_tru = mien_tru or {}
    if mien_tru and df is not None and "uid" in df.columns:
        _tha = df["uid"].isin(mien_tru)
        dau_do_cung = {ten: (m & ~_tha) for ten, m in dau_do_cung.items()}

    cung = {ten: int(m.sum()) for ten, m in dau_do_cung.items()}
    mem = {ten: int(m.sum()) for ten, m in (dau_do_mem or {}).items()}
    thung = sum(cung.values())
    if not thung:
        if mien_tru:
            print(f"  ⚠ {lop}: {len(mien_tru)} nợ recall ĐÃ ĐIỀU TRA, đang hoãn vá:")
            for u, ly_do in mien_tru.items():
                print(f"      · {u} — {ly_do}")
        return {"cung": cung, "mem": mem, "no_da_dieu_tra": mien_tru}

    vo = {k: v for k, v in cung.items() if v}
    duong_dan = None
    mau: dict[str, list] = {}
    if df is not None:
        pham = _gom_dong_pham({k: dau_do_cung[k] for k in vo}, df)
        for ten in vo:
            s = df.loc[dau_do_cung[ten], "name"].dropna().head(5)
            mau[ten] = s.tolist()
        if thu_muc is not None:
            thu_muc.mkdir(parents=True, exist_ok=True)
            duong_dan = thu_muc / f"gate_do_{lop}_{scope}.parquet"
            ghi_parquet(pham, duong_dan)

    dong = [f"CỔNG RECALL CỨNG ĐỎ — lớp `{lop}`, scope `{scope}`: {thung:,} dòng lọt lưới."]
    for ten, n in sorted(vo.items(), key=lambda x: -x[1]):
        dong.append(f"    · đầu dò «{ten}»: {n:,} dòng")
        if mau.get(ten):
            dong.append(f"        mẫu tên: {mau[ten]}")
    if duong_dan is not None:
        dong.append(f"    → đã ghi toàn bộ dòng phạm ra: {duong_dan}")
        dong.append("      (cột `dau_do` cho biết đầu dò nào bắt dòng đó)")
    dong.append("    Cách sửa: mở rộng luật TUYỂN cho đúng nhóm này — KHÔNG hạ ngưỡng cổng.")
    raise CongDo("\n".join(dong), lop=lop, duong_dan=duong_dan, chi_tiet=vo)


def cong_toan_ven(
    phep_thu: dict[str, pd.Series],
    da_tuyen: pd.Series,
    *,
    lop: str = "",
) -> dict:
    """Cổng "vòng tròn": mọi tín hiệu đã dùng để tuyển phải nằm trong tập tuyển.

    Là tautology theo cấu tạo ở phần lớn các lớp — giữ làm cổng HỒI QUY: sửa regex tuyển mà
    quên một nhánh thì chỗ này gãy.
    """
    mat = {ten: int((m & ~da_tuyen).sum()) for ten, m in phep_thu.items()}
    tong = sum(mat.values())
    if tong:
        vo = {k: v for k, v in mat.items() if v}
        raise CongDo(
            f"CỔNG TOÀN VẸN GÃY — lớp `{lop}`: {tong:,} dòng khớp mệnh đề con của điều kiện"
            f" tuyển mà lại KHÔNG được tuyển: {vo}\n"
            "    Đây là lỗi ĐỒNG BỘ trong chính biểu thức tuyển (sửa regex mà quên một nhánh"
            " tag, hoặc ngược lại).",
            lop=lop,
            chi_tiet=vo,
        )
    return mat


def cong_xung_dot(
    n_pham: int,
    n_vao: int,
    *,
    ty_le: float,
    san: int,
    lop: str,
    nhan: str,
    df_pham: pd.DataFrame | None = None,
    scope: str = "",
    thu_muc: Path | None = ETL_DIR,
) -> dict:
    """Cổng HẬU KIỂM: bao nhiêu dòng mang bằng chứng của lớp mà vẫn bị luật NGOÀI Ý xoá.

    Trần tính theo tỷ lệ (xem `tran_theo_ty_le`). Đỏ ⇒ ghi dòng phạm ra đĩa rồi ném `CongDo`.
    """
    tran = tran_theo_ty_le(n_vao, ty_le, san)
    if n_pham <= tran:
        return {"n_pham": n_pham, "tran": tran, "n_vao": n_vao}

    duong_dan = None
    if df_pham is not None and thu_muc is not None:
        thu_muc.mkdir(parents=True, exist_ok=True)
        duong_dan = thu_muc / f"gate_do_{lop}_xung_dot_{scope}.parquet"
        ghi_parquet(df_pham, duong_dan)
    mau = df_pham["name"].dropna().head(5).tolist() if df_pham is not None else []
    raise CongDo(
        f"CỔNG HẬU KIỂM ĐỎ — lớp `{lop}`, scope `{scope}`: {n_pham:,} dòng {nhan} bị luật"
        f" NGOÀI Ý xoá, trần {tran:,} ({ty_le:.4%} của bộ vào {n_vao:,} dòng, sàn {san}).\n"
        f"    mẫu tên: {mau}\n"
        + (f"    → đã ghi dòng phạm ra: {duong_dan}\n" if duong_dan else "")
        + "    Nghĩa là một luật đang QUÁ TAY, không phải ngưỡng quá chặt.",
        lop=lop,
        duong_dan=duong_dan,
        chi_tiet={"n_pham": n_pham, "tran": tran},
    )


# ─────────────────────────────────────────────────────────────────────────────
# 5. Chỉ mục không gian — POI nằm trong polygon
# ─────────────────────────────────────────────────────────────────────────────


class ChiMucKhongGian:
    """STRtree trên toạ độ điểm của một bộ POI + phép "POI nào nằm trong geom này".

    Chép `poi_inside()` của notebook từng bước, kể cả `geom.contains(...)` (contains, KHÔNG
    phải `intersects`: điểm nằm ĐÚNG trên biên bị loại — hành vi đó nằm trong chuẩn vàng).
    """

    def __init__(self, df: pd.DataFrame):
        from shapely.geometry import Point
        from shapely.strtree import STRtree

        self.diem = [Point(x, y) for x, y in zip(df["lng"].values, df["lat"].values)]
        self.cay = STRtree(self.diem)
        self.uid = df["uid"].values

    def ben_trong(self, geom, self_uid=None) -> np.ndarray:
        """Chỉ số các POI có toạ độ nằm TRONG `geom` (loại chính nó theo uid)."""
        idx = self.cay.query(geom)
        idx = idx[[geom.contains(self.diem[j]) for j in idx]] if len(idx) else np.array([], int)
        if self_uid is not None and len(idx):
            idx = idx[self.uid[idx] != self_uid]
        return idx


def nap_geom(df: pd.DataFrame, cot: str = "geometry_wkb") -> pd.DataFrame:
    """Bản sao chỉ giữ dòng có hình học HỢP LỆ và diện tích > 0, kèm cột `_geom`.

    `wkb.loads(bytes(x))` — `bytes()` là bắt buộc: cột parquet trả memoryview.
    """
    from shapely import wkb

    g = df[df[cot].notna()].copy()
    g["_geom"] = [wkb.loads(bytes(x)) for x in g[cot]]
    return g[[x.is_valid and x.area > 0 for x in g["_geom"]]]


def gan_container(
    vung: pd.DataFrame,
    chi_muc: ChiMucKhongGian,
    la_ung_vien: np.ndarray,
) -> dict[str, str]:
    """`container_uid`: dòng nào nằm TRONG polygon nào của cùng lớp.

    Duyệt polygon từ TO xuống NHỎ nên host nhỏ/cụ thể ghi đè host to ⇒ mỗi dòng nhận
    container SÁT NHẤT.

    CỐ Ý dùng `sort_values` mặc định (quicksort, KHÔNG ổn định) đúng như notebook: đổi sang
    `kind="stable"` là đổi thứ tự các polygon cùng diện tích, tức đổi kết quả ghi đè và
    lệch chuẩn vàng. Với cùng một bộ vào, quicksort của numpy vẫn cho cùng một hoán vị, nên
    tất định vẫn được bảo đảm — chỉ là bảo đảm bởi "cùng đầu vào" chứ không bởi thuật toán.
    """
    container: dict[str, str] = {}
    for i, geom in vung.sort_values("area_m2", ascending=False)["_geom"].items():
        self_uid = vung.at[i, "uid"]
        ben_trong = chi_muc.ben_trong(geom, self_uid=self_uid)
        for j in ben_trong[la_ung_vien[ben_trong]]:
            container[chi_muc.uid[j]] = self_uid
    return container


def nhom_manh(df: pd.DataFrame, loc: pd.Series) -> pd.Series:
    """`fragment_group`: (h3_r8 + tên) trùng nhau ⇒ một thực thể bị vẽ thành nhiều mảnh.

    Phạm vi H3 là bắt buộc: "Block A" ở hai đầu đất nước là hai khu khác nhau.
    """
    khoa = df.loc[loc, ["h3_r8", "name_norm"]].astype(str).agg("|".join, axis=1)
    return khoa[khoa.duplicated(keep=False)].reindex(df.index)


# ─────────────────────────────────────────────────────────────────────────────
# 6. IO
# ─────────────────────────────────────────────────────────────────────────────

# Cột dict chỉ sống trong RAM — bản đĩa giữ chuỗi `tags` gốc.
COT_CHI_TRONG_RAM = ("tags_dict", "_geom")


def doc_parquet(duong_dan: Path) -> pd.DataFrame:
    """Đọc parquet + parse `tags_dict` một lần cho cả lớp."""
    df = pq.read_table(duong_dan).to_pandas()
    df["tags_dict"] = df["tags"].map(parse_tags)
    return df


def ghi_parquet(df: pd.DataFrame, duong_dan: Path) -> Path:
    duong_dan.parent.mkdir(parents=True, exist_ok=True)
    bo = [c for c in COT_CHI_TRONG_RAM if c in df.columns]
    df.drop(columns=bo).to_parquet(duong_dan, index=False)
    return duong_dan


def doc_uid(duong_dan: Path) -> set[str]:
    return set(pq.read_table(duong_dan, columns=["uid"]).to_pandas()["uid"])


def con_lai_sau(poi: pd.DataFrame, final: pd.DataFrame) -> pd.DataFrame:
    """Bộ CÒN LẠI = bộ vào TRỪ ĐÚNG các dòng đã thuộc lớp.

    CHỈ trừ `final`. KHÔNG trừ phần bị luật bước 3 xoá — phần đó là nguyên liệu của lớp
    sau (lớp nhà ở loại hàng trăm khách sạn; lớp lưu trú cần đúng chúng).
    """
    da_thuoc_lop = set(final["uid"])
    return poi[~poi["uid"].isin(da_thuoc_lop)].copy()
