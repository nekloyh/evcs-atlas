"""LỚP 6 — trường học, cơ sở giáo dục.

Port đẳng cấu của `notebooks/eda_truonghoc.ipynb`. Đọc `..._con_lai_sau_thamquan.parquet`.

Lớp DUY NHẤT có hai nguồn mã hoá CẤP HỌC đối chứng chéo được: tên tiếng Việt vs
`grades`/`isced:level`. Nhưng phải PHÂN RÃ — `amenity=kindergarten|university|college` là
preset người map bấm chọn SAU KHI đọc tên, tức chính cái tên nói lại lần thứ hai. Chỉ
`grades`/`isced` (gõ tay khoảng lớp) mới độc lập thật.

Notebook này mang theo BỘ MÁY LUẬT riêng (`Luat` + fixture), vì ba lỗi hạng-ETL mà luật viết
rời rạc không tự chặn được: sai cột nguồn trượt IM LẶNG · `\\b` cạnh chữ có dấu hỏng dưới
RE2 · token chết không phải lỗi nhưng không biết nó chết mới là lỗi. Bản port giữ nguyên bộ
máy đó — nó là một phần của đặc tả, không phải trang trí.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (30) hiệu chỉnh trên bộ vào 13.486 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 30 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 30 / 13_486  # ≈ 0.2225% bộ vào
SAN_XUNG_DOT = 30  # sàn: scope nhỏ không bị siết chặt hơn notebook
KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

TAG_BUOC_1 = (
    "amenity", "building", "landuse", "office", "shop", "leisure", "tourism", "healthcare",
    "historic", "man_made", "highway", "public_transport", "railway", "aeroway", "craft",
    "place", "military", "religion",
)  # fmt: skip
TAG_THO = ("education", "grades", "isced:level", "operator:type", "operator")

# BẰNG CHỨNG CƠ SỞ GIÁO DỤC — MỘT danh sách duy nhất, cả nhánh tuyển lẫn hàm bằng chứng đều
# đọc nó. BA LẦN cùng một lỗi cấu trúc trong notebook: danh sách TUYỂN và danh sách BẰNG
# CHỨNG viết rời nhau rồi trôi khỏi nhau, mỗi lần trôi là một nhóm bị xoá oan:
#   · `office=university`           — tuyển thiếu → 6 trường thành viên ĐHBK bị LUẬT 4 xoá
#   · `amenity=research_institute`  — tuyển có, bằng chứng thiếu → 7 Viện bị LUẬT 4 xoá
#   · `amenity=driving_school`      — tuyển có, bằng chứng thiếu → 3 trường lái xe bị xoá
AMENITY_GD = [
    "school", "kindergarten", "college", "university", "language_school", "driving_school",
    "music_school", "childcare", "prep_school", "training", "research_institute",
]  # fmt: skip
BUILDING_GD = ["school", "university", "college", "kindergarten"]
OFFICE_GD = ["educational_institution", "university", "research"]

CAP_BAC = ["MAM_NON", "TIEU_HOC", "THCS", "THPT", "LIEN_CAP", "NGHE_TRUNG_CAP", "DAI_HOC", "KHAC"]
CAP_PHO_THONG = {"TIEU_HOC", "THCS", "THPT", "LIEN_CAP"}
HANG_CHUA_RO = {"KHONG_XAC_DINH", "TRUONG_CHUA_RO_CAP", "TRUNG_TAM_DAO_TAO", "VIEN_NGHIEN_CUU"}


@dataclass(frozen=True)
class Luat:
    """Một luật regex KÈM cột nguồn và fixture. Cột nguồn phải khai, không để lời gọi quyết
    định: `\\bchùa\\b` chạy đúng trên `name_dau` (386 dòng) và khớp 0 trên `name_norm` —
    không lỗi, không cảnh báo, chỉ là kết quả rỗng."""

    ma: str
    cot: str  # "name_norm" (đã bỏ dấu) | "name_dau" (còn dấu)
    rx: str
    khop: tuple = ()  # fixture BẮT BUỘC khớp
    truot: tuple = ()  # fixture BẮT BUỘC trượt
    ghi_chu: str = ""


def _chuoi(df: pd.DataFrame, cot: str) -> pd.Series:
    """Cột nguồn ở dạng đã chuẩn hoá. `name_dau` hạ chữ TẠI ĐÂY, không để nơi gọi tự nhớ —
    quên một lần là luật trượt im lặng."""
    s = df[cot].fillna("")
    return s.str.lower() if cot == "name_dau" else s


def _mask(df: pd.DataFrame, l: Luat) -> pd.Series:
    return _chuoi(df, l.cot).str.contains(l.rx, na=False, regex=True)


def _kiem_luat(luats: list[Luat], df: pd.DataFrame) -> None:
    """Chạy fixture của MỌI luật trên ĐÚNG dtype của cột đích. Vỡ ở đây là vỡ lúc định
    nghĩa, không phải lúc ra số — đó là toàn bộ mục đích."""
    for l in luats:
        dt = df[l.cot].dtype
        for s in l.khop:
            fx = pd.Series([s], dtype=dt)
            fx = fx.str.lower() if l.cot == "name_dau" else fx
            if not bool(fx.str.contains(l.rx, na=False).iloc[0]):
                raise AssertionError(
                    f"[{l.ma}] fixture PHẢI khớp mà trượt: {s!r} — nghi bẫy `\\b` + chữ có dấu"
                )
        for s in l.truot:
            fx = pd.Series([s], dtype=dt)
            fx = fx.str.lower() if l.cot == "name_dau" else fx
            if bool(fx.str.contains(l.rx, na=False).iloc[0]):
                raise AssertionError(f"[{l.ma}] fixture PHẢI trượt mà khớp: {s!r}")


# Neo biên là sống còn: `truong ` trần khớp TÊN RIÊNG ("Trường Sơn", "Trường Giang") — bài
# học lặp lại lần thứ sáu. Nhánh này cố ý tuyển RỘNG, bước 3 dọn.
TH_RX_STR = (
    r"\btruong (?:tieu hoc|thcs|thpt|mam non|mau giao|trung hoc|pho thong|quoc te|lien cap"
    r"|chuyen|nang khieu|day nghe|trung cap|cao dang|dai hoc|nghe|hoc)"
    r"|\bthcs\b|\bthpt\b|tieu hoc|trung hoc co so|trung hoc pho thong|mam non|mau giao|nha tre"
    r"|dai hoc|hoc vien|cao dang|trung cap|day nghe|\bgdtx\b|\bgdnn\b|truong nghe"
    r"|trung tam ngoai ngu|trung tam anh ngu|trung tam tin hoc|trung tam day nghe"
    r"|trung tam giao duc thuong xuyen|giao duc thuong xuyen|trung tam gdtx"
    r"|trung tam[^|]{0,30}(?:giao duc|dao tao)"
    r"|\buniversity\b|\bcollege\b|\bschool\b|\bacademy\b|\bkindergarten\b"
    # ── BỔ SUNG sau kiểm toán recall 2026-08-09, mỗi token kèm số dòng và precision đọc tay
    r"|\btruong (?:quan su|sy quan|si quan|trinh sat|bien phong|dao tao|huan luyen|giao duc"
    r"|boi duong|nghiep vu|chinh tri|nuoi day|nuoi duong|chuyen biet|hoa nhap|lai xe)\b"
    r"|\btruong cap\b|\btruong.{0,4}cap [123]\b"
    r"|\bptcs\b|\btruong ptth\b"
    r"|\btrung tam boi duong\b"
    r"|\btrung tam tieng anh\b|\btt tieng anh\b|\btrung tam (?:nuoi day|nuoi duong) tre\b"
    r"|\bgiang duong\b"
    # ĐÃ THỬ VÀ LOẠI — đừng thử lại:
    #   · `\bcampus\b`              2/6 đúng — `name:en` của bệnh viện/toà án có "Campus"
    #   · `\btrung tam nuoi duong\b` 3/12 đúng — còn lại là BẢO TRỢ XÃ HỘI (người già/tâm thần)
    #   · `\bvien dao tao\b`        "Viện Đào tạo và Nghiên cứu BIDV" — đào tạo nội bộ
    #   · `\bkhoa\b`                566 dòng, gần như toàn "đa khoa / nha khoa" — y tế
)

# LUẬT 4 — bẫy đắt nhất, và nó KHÔNG nằm ở tên riêng: bỏ dấu xong thì "môi trường" chứa
# `\btruong\b`. Cùng họ: "thị trường", "quảng trường", "nông trường". RE2 KHÔNG có
# lookbehind nên không viết được `(?<!moi )truong` — phải dựng mask riêng rồi trừ.
DANH_TU_GHEP_TRUONG_RX = (
    r"\b(?:moi|thi|quang|nong|cong|chien|phi|hien|thao|doanh|lam|ngu|dong) truong\b"
)
# "Trường" còn đi với DANH TỪ TRƯỜNG HỌC ngoài thang cấp — trường thật, chỉ là cấp học không
# đọc được từ tên.
DANH_TU_TRUONG_HOC_RX = (
    r"\btruong (?:day lai xe|lai xe|quan su|nghiep vu|chinh tri|can bo|dan toc|chuyen biet"
    r"|quoc te|song ngu|nuoi day|thuc hanh|huan luyen|boi duong|nang khieu|chuyen)\b"
)

CO_QUAN_GD_RX = (
    r"^(?:so|phong|bo|cuc|vu|ban)\s.*(?:giao duc|dao tao)|\bgd\s?&?\s?dt\b|phong gd|so gd"
    r"|cong doan giao duc|hoi khuyen hoc"
)
NGOAI_LOP_AMENITY = [
    "restaurant", "cafe", "fast_food", "bar", "pub", "parking", "fuel", "bank", "atm",
    "pharmacy", "hospital", "clinic", "doctors", "dentist", "marketplace", "police",
    "fire_station", "post_office", "townhall", "courthouse", "place_of_worship", "toilets",
    "shelter", "bus_station", "library", "theatre", "cinema",
    # THIẾT BỊ ĐẶT NHỜ ĐỊA ĐIỂM ("TNGo - Học viện Ngoại giao") — node trần, luật hạ tầng
    # đường KHÔNG bắt được.
    "bicycle_rental", "vending_machine", "parcel_locker",
]  # fmt: skip
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)
LUAT_CO_Y = {"CO_QUAN_QUAN_LY_GD", "TAG_LOP_KHAC"}

# --- thang CẤP HỌC từ TÊN. Gán từ CỤ THỂ xuống CHUNG: "Trường Tiểu học và THCS" phải ra
# LIEN_CAP nên liên cấp xét trước. MỌI token NEO BIÊN — `nha tre` trần khớp "Ngôi nhà TRÊn mây".
# `\bacademy\b` và `\bcollege\b` trần BỊ LOẠI khỏi thang: trong tên tiếng Anh ở VN chúng
# KHÔNG chỉ bậc học ("Maikan Spa & Academy", "Brighton College" là K-12).
CAP_TU_TEN = [
    (
        "LIEN_CAP",
        (
            r"\blien cap\b|\btieu hoc va thcs\b|\bthcs va thpt\b|\bths\b|\bcap 1[,-]?2\b"
            r"|\bcap 2[,-]?3\b|\bth ?& ?thcs\b|\bth ?- ?thcs\b|\bthcs ?- ?thpt\b|\bth-thcs-thpt\b"
        ),
    ),
    ("MAM_NON", r"\bmam non\b|\bmau giao\b|\bnha tre\b|\bmn \b|\bnhom tre\b"),
    ("TIEU_HOC", r"\btieu hoc\b|\bcap 1\b|\bprimary\b"),
    ("THCS", r"\bthcs\b|\btrung hoc co so\b|\bcap 2\b|\bsecondary\b"),
    ("THPT", r"\bthpt\b|\btrung hoc pho thong\b|\bcap 3\b|\bhigh school\b"),
    ("DAI_HOC", r"\bdai hoc\b|\bhoc vien\b|\buniversity\b"),
    (
        "NGHE_TRUNG_CAP",
        r"\bcao dang\b|\btrung cap\b|\bday nghe\b|\bgdnn\b|\bgdtx\b|\btruong nghe\b|\bcdsp\b",
    ),
]
# VIẾT TẮT — chỉ mở khoá KHI CÓ NGỮ CẢNH. Đây là LUẬT, không phải danh sách ngoại lệ: `\btt\b`
# = THỊ TRẤN (387 dòng), `\bcd\b` = mã cáp điện, `ptth` = Đài PHÁT THANH TRUYỀN HÌNH.
VIET_TAT = [
    ("THPT", r"\bptth\b"),
    ("THCS", r"\bptcs\b"),
    ("DAI_HOC", r"\bdh\b|\bhv\b"),
    ("NGHE_TRUNG_CAP", r"\bcd\b"),
]
NGU_CANH_TRUONG_RX = (
    r"\btruong\b|\bkhoa\b|\bktx\b|\bky tuc xa\b|\bco so\b|\bphan hieu\b|\bgiang duong\b"
)
TTDT_RX = (
    r"\btrung tam (?:ngoai ngu|anh ngu|tin hoc|day nghe|boi duong|luyen thi|du hoc)\b"
    r"|\btt (?:ngoai ngu|anh ngu|tin hoc|day nghe|boi duong|luyen thi|du hoc)\b"
    r"|\bluyen thi\b|\bltdh\b|\banh ngu\b|\bngoai ngu\b|\banh van\b|\btu van du hoc\b"
    r"|\bielts\b|\btoeic\b|\btoefl\b"
    r"|\bgiao duc thuong xuyen\b|\bgiao duc nghe nghiep\b|\bsat hach lai xe\b"
)


def _cap_tu_grades(g):
    """`grades=6-9` → THCS. Đọc khoảng lớp theo hệ 12 năm của VN."""
    if not isinstance(g, str):
        return None
    nums = [int(x) for x in re.findall(r"\d+", g) if 1 <= int(x) <= 12]
    if not nums:
        return None
    lo, hi = min(nums), max(nums)
    if hi <= 5:
        return "TIEU_HOC"
    if lo >= 10:
        return "THPT"
    if lo >= 6 and hi <= 9:
        return "THCS"
    return "LIEN_CAP"


def _cap_tu_isced(v):
    """ISCED: 0 mầm non · 1 tiểu học · 2 THCS · 3 THPT. Nhiều giá trị ⇒ liên cấp."""
    if not isinstance(v, str):
        return None
    lv = {x for x in re.findall(r"\d", v)}
    if not lv:
        return None
    if len(lv) > 1:
        return "LIEN_CAP"
    return {"0": "MAM_NON", "1": "TIEU_HOC", "2": "THCS", "3": "THPT"}.get(lv.pop())


def _co_bang_chung_truong(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng CƠ SỞ GIÁO DỤC — tag tự khai, không phải tên."""
    return (
        df["amenity"].isin(AMENITY_GD)
        | df["building"].isin(BUILDING_GD)
        | df["landuse"].eq("education")
        | df["office"].isin(OFFICE_GD)
        | df["grades"].notna()
        | df["isced_level"].notna()
        | df["education"].notna()
    )


def chay(poi: pd.DataFrame, *, scope: str) -> dict:
    poi = poi.copy()

    # ── BƯỚC 1 — filter MỎNG ────────────────────────────────────────────────
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)
    for k in TAG_THO:
        poi[k.replace(":", "_")] = td.map(lambda t, k=k: t.get(k))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    name_norm = poi["name_norm"]

    TH_TAG = (
        poi["amenity"].isin(AMENITY_GD)
        | poi["building"].isin(BUILDING_GD)
        | poi["landuse"].eq("education")
        | poi["office"].isin(OFFICE_GD)
        | poi["education"].notna()
        | poi["grades"].notna()
        | poi["isced_level"].notna()
    )
    luat_tuyen = Luat(
        ma="TH_RX",
        cot="name_norm",
        rx=TH_RX_STR,
        khop=(
            "truong tieu hoc kim dong", "truong thcs nguyen du", "dai hoc bach khoa",
            "truong mam non hoa sen", "trung tam giao duc thuong xuyen quan 7",
            "truong quan su quan khu 5", "truong cap 3 giong ong to", "truong ptcs tan hoi",
            "trung tam boi duong chinh tri quan 6", "truong chinh tri thanh pho can tho",
        ),
        truot=(
            "cong ty co phan truong thanh", "ngo 12 truong chinh", "cho truong bien",
            "dai ptth hai phong", "trung tam nuoi duong nguoi gia ha noi",
        ),
        ghi_chu="nhánh TÊN của bước 1 — cố ý tuyển rộng, bước 3 dọn",
    )  # fmt: skip
    _kiem_luat([luat_tuyen], poi)
    TH_NAME = _mask(poi, luat_tuyen)
    TH_VONG_DOI = td.map(
        lambda t: any(
            ":" in k
            and k.split(":")[-1] in {"amenity", "building"}
            and str(v).lower() in {"school", "university", "college", "kindergarten"}
            for k, v in t.items()
        )
    )
    # NHÁNH D — tên miền `.edu.vn`: ĐỘC LẬP với cả tên lẫn tag phân loại (nó là địa chỉ liên
    # hệ). Vào bộ luật vì đầu dò recall đã BÁO ĐỎ trên nó — nhiều Khoa/Viện chỉ có tín hiệu này.
    TH_WEB = td.map(
        lambda t: (
            "edu.vn"
            in " ".join(
                str(t.get(k, ""))
                for k in (
                    "website",
                    "contact:website",
                    "url",
                    "contact:url",
                    "email",
                    "contact:email",
                )
            ).lower()
        )
    )

    poi["is_th"] = TH_TAG | TH_NAME | TH_VONG_DOI | TH_WEB

    c.cong_toan_ven(
        {
            "amenity=school": poi["amenity"].eq("school"),
            "amenity=kindergarten": poi["amenity"].eq("kindergarten"),
            "amenity=university": poi["amenity"].eq("university"),
            "amenity=college": poi["amenity"].eq("college"),
            "building=school": poi["building"].eq("school"),
            "building=university": poi["building"].eq("university"),
            "landuse=education": poi["landuse"].eq("education"),
            "có grades=*": poi["grades"].notna(),
            "có isced:level=*": poi["isced_level"].notna(),
            "tên 'THCS'": c.chua(name_norm, r"\bthcs\b"),
            "tên 'THPT'": c.chua(name_norm, r"\bthpt\b"),
            "tên 'tiểu học'": c.chua(name_norm, r"tieu hoc"),
            "tên 'mầm non|mẫu giáo'": c.chua(name_norm, r"mam non|mau giao"),
            "tên 'đại học|học viện'": c.chua(name_norm, r"dai hoc|hoc vien"),
        },
        poi["is_th"],
        lop="truonghoc",
    )

    # ── CỔNG RECALL ĐỘC LẬP ─────────────────────────────────────────────────
    _bo = poi[~poi["is_th"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="truonghoc",
        scope=scope,
        dau_do_cung={
            "có `school:*` / `capacity:students`": _tags.map(
                lambda t: any(
                    k.startswith("school:") or k in ("capacity:students", "students") for k in t
                )
            ),
            # `operator:type=university` KHÔNG dùng làm đầu dò cứng: nó bắt "Hầm giữ xe Toà
            # D,E" — bãi xe DO trường vận hành. Chủ sở hữu ≠ loại công trình.
            "tên có 'giáo dục / đào tạo' + polygon (trừ cơ quan)": c.chua(_ten, r"giao duc|dao tao")
            & ~c.chua(
                _ten,
                r"^(?:so|phong|bo|cuc|vu|ban)\s|\bgd\s?&?\s?dt\b|lien co quan"
                r"|cong ty|\bcty\b|\bcp \b|thiet bi|xuat ban|nha sach",
            )
            & _bo["is_area"]
            & _bo["amenity"].isna()
            & _bo["office"].isna()
            & _bo["shop"].isna(),
        },
        dau_do_mem={
            "tên có 'phòng/sở giáo dục' → lớp hành chính": c.chua(
                _ten, r"(?:phong|so|bo) giao duc|\bgd&?dt\b|phong gd"
            ),
            "tên có 'trường' (đa số là TÊN RIÊNG)": c.chua(_ten, r"\btruong\b"),
            "`amenity=library` — thiết chế văn hoá, lớp trước": _bo["amenity"].eq("library"),
            "`operator:type=university` (bãi xe DO trường vận hành)": _bo["operator_type"].eq(
                "university"
            ),
            "tên có 'lớp / trung tâm' (dạy thêm tại nhà)": c.chua(_ten, r"\blop \b|trung tam "),
        },
    )

    th = poi[poi["is_th"]].copy()
    b1 = th.copy()  # ghi đĩa TẠI ĐÂY, trước các cột cấp học của bước 2

    # ── BƯỚC 2 — thang CẤP HỌC, hai nguồn ───────────────────────────────────
    cap_ten = pd.Series("KHAC", index=th.index)
    for val, rx in CAP_TU_TEN:
        cap_ten[c.chua(th["name_norm"], rx) & cap_ten.eq("KHAC")] = val
    _guard = c.chua(th["name_norm"], NGU_CANH_TRUONG_RX) | _co_bang_chung_truong(th)
    for val, rx in VIET_TAT:
        cap_ten[c.chua(th["name_norm"], rx) & _guard & cap_ten.eq("KHAC")] = val
    th["cap_ten"] = cap_ten

    # NGUỒN 2: TAG — không đọc tên một chữ nào.
    cap_tag = th["grades"].map(_cap_tu_grades)
    cap_tag = cap_tag.fillna(th["isced_level"].map(_cap_tu_isced))
    # `amenity`/`education` chỉ phân biệt được mầm non và bậc cao — dùng làm lớp đáy.
    cap_tag = cap_tag.fillna(
        th["amenity"].map(
            {
                "kindergarten": "MAM_NON",
                "childcare": "MAM_NON",
                "university": "DAI_HOC",
                "college": "NGHE_TRUNG_CAP",
            }
        )
    )
    cap_tag = cap_tag.fillna(
        th["education"].map(
            {"kindergarten": "MAM_NON", "university": "DAI_HOC", "college": "NGHE_TRUNG_CAP"}
        )
    )
    # `building=school`/`college` KHÔNG phân biệt được bậc (school phủ cả K-12) nên CỐ Ý
    # không map — thà không biết còn hơn đoán.
    cap_tag = cap_tag.fillna(
        th["building"].map({"university": "DAI_HOC", "kindergarten": "MAM_NON"})
    )
    th["cap_tag"] = cap_tag

    ca_hai = th["cap_ten"].ne("KHAC") & th["cap_tag"].notna()
    th["cap_xung_dot"] = ca_hai & ~(th["cap_ten"] == th["cap_tag"])

    # THỨ TỰ ƯU TIÊN — sửa sau khi ma trận nhầm lẫn chỉ ra một sai hệ thống: 25 trường ĐẠI
    # HỌC mang `amenity=college`. Ở VN người map dùng `college` cho cả đại học lẫn cao đẳng
    # ⇒ chỉ tag CÓ CẤU TRÚC (`grades`, `isced`) mới được thắng tên; `amenity`/`education` là
    # lớp đáy, xếp SAU tên.
    cap_tag_manh = th["grades"].map(_cap_tu_grades).fillna(th["isced_level"].map(_cap_tu_isced))
    th["cap_tag_manh"] = cap_tag_manh
    th["cap_chot"] = (
        cap_tag_manh.fillna(th["cap_ten"].replace("KHAC", np.nan))
        .fillna(th["cap_tag"])
        .fillna("KHAC")
    )

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    dc = c.DayChuyenLoc(th, ham_tha=_co_bang_chung_truong, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường: trạm buýt tên "Trường THPT Chu Văn An". Lần thứ SÁU.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — CƠ QUAN QUẢN LÝ GIÁO DỤC, không phải trường. "Ban Đào tạo" của một trường đại
    # học KHÔNG phải cơ quan nhà nước — phân biệt bằng TAG (`office=university`), không bằng tên.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], CO_QUAN_GD_RX) & ~r["office"].eq("university"),
        "CO_QUAN_QUAN_LY_GD",
    )

    # LUẬT 3 — họ tag thuộc LỚP KHÁC: căng tin, nhà sách, phòng khám trong trường.
    r = dc.con_lai
    dc.xoa(
        r["amenity"].isin(NGOAI_LOP_AMENITY)
        | r["shop"].notna()
        | r["healthcare"].notna()
        | r["tourism"].notna()
        | r["leisure"].notna(),
        "TAG_LOP_KHAC",
        tha=True,
    )

    # LUẬT 4 — TÊN RIÊNG "TRƯỜNG". Bẫy tiếng Việt đắt nhất, và nó KHÔNG nằm ở tên riêng mà ở
    # DANH TỪ GHÉP: "môi trường" chứa `\btruong\b`. Trong 14 dòng luật này xoá thì 8 — 57% —
    # là do bẫy đó, gồm 7 Viện nghiên cứu môi trường.
    r = dc.con_lai
    luat_ghep = Luat(
        ma="DANH_TU_GHEP_TRUONG",
        cot="name_norm",
        rx=DANH_TU_GHEP_TRUONG_RX,
        khop=("vien moi truong va tai nguyen", "quang truong 2/9", "nong truong pham van coi"),
        truot=("truong tieu hoc kim dong", "truong son", "cong ty truong thanh"),
    )
    luat_th_khac = Luat(
        ma="DANH_TU_TRUONG_HOC",
        cot="name_norm",
        rx=DANH_TU_TRUONG_HOC_RX,
        khop=("truong day lai xe tien phat", "truong quoc te viet uc", "truong quan su tinh"),
        truot=("truong son", "vien moi truong va tai nguyen", "cong ty truong thanh"),
    )
    _kiem_luat([luat_ghep, luat_th_khac], r)
    dc.xoa(
        c.chua(r["name_norm"], r"\btruong\b")
        & ~_mask(r, luat_ghep)
        & ~_mask(r, luat_th_khac)
        & r["cap_ten"].eq("KHAC")
        & ~_co_bang_chung_truong(r),
        "TEN_RIENG_KHONG_PHAI_TRUONG",
    )

    # LUẬT 5 — tên nói thẳng là loại khác. Token nào phân biệt được BẰNG DẤU thì đọc trên
    # `name_dau`: `\bchua \b` bỏ dấu khớp 520 dòng mà chỉ 386 là CHÙA — 110 là "phòng cháy
    # CHỮA cháy", 22 là "sữa CHUA". Chưa gây oan ở 7 tỉnh nhưng sẽ xoá "Đại học Phòng cháy
    # Chữa cháy" ở SCOPE="vn".
    r = dc.con_lai
    luat_loai_khac = [
        Luat(
            ma="LOAI_KHAC_khong_dau",
            cot="name_norm",
            rx=(
                r"\bbenh vien\b|\bphong kham\b|\bubnd\b|\buy ban nhan dan\b|\bcong an\b|\btoa an\b"
                r"|\bkho bac\b|\bbuu dien\b|\bngan hang\b|\bnha may\b|\bxi nghiep\b|\bkcn\b"
                r"|\bkhach san\b|\bnha nghi\b|\bcay xang\b|\btram xang\b|\bsieu thi\b"
                r"|\btrung tam thuong mai\b|\bbai do xe\b|\bben xe\b|\bchung cu\b|\bnha tho\b"
            ),
            khop=("benh vien cho ray", "nha tho lon ha noi", "sieu thi co.opmart"),
            truot=("truong tieu hoc kim dong", "truong mam non hoa sen"),
        ),
        Luat(
            ma="LOAI_KHAC_co_dau",
            cot="name_dau",
            rx=r"\bchùa\b",
            khop=("Chùa Trấn Quốc", "chùa bộc"),
            truot=("Sửa chữa xe máy Giang Nam", "Sữa chua nếp cẩm", "Phòng cháy Chữa cháy Quận 1"),
        ),
    ]
    _kiem_luat(luat_loai_khac, r)
    ten_loai_khac = pd.Series(
        np.logical_or.reduce([_mask(r, l).values for l in luat_loai_khac]), index=r.index
    )
    dc.xoa(ten_loai_khac & ~_co_bang_chung_truong(r), "TEN_LOAI_KHAC")

    # LUẬT 6 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    clean, removed = dc.ket()

    conflict = removed[_co_bang_chung_truong(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="truonghoc",
        nhan="có tag giáo dục CỨNG",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐẾM TRƯỜNG, không đếm dòng ─────────────────────────────────
    # Bệnh nặng nhất của lớp: một ngôi trường được vẽ HAI lần — polygon khuôn viên
    # (`amenity=school`) và nhiều polygon dãy nhà (`building=school`) bên trong nó.
    chi_muc = c.ChiMucKhongGian(clean)
    vung = c.nap_geom(clean[clean["is_area"]])
    clean["container_uid"] = clean["uid"].map(
        c.gan_container(vung, chi_muc, np.ones(len(clean), dtype=bool))
    )
    clean["vai_tro"] = np.where(
        clean["container_uid"].notna(), "TOA_TRONG_KHUON_VIEN", "KHUON_VIEN_HOAC_DIEM"
    )
    clean["fragment_group"] = c.nhom_manh(clean, clean["name"].notna())

    # BỆNH CŨ: `hang` khởi tạo "PHO_THONG" cho MỌI dòng rồi mới override — 1.215/5.189 dòng
    # mắc kẹt ở PHO_THONG mà không ai bảo chứng. NGUYÊN TẮC MỚI: mặc định là KHÔNG BIẾT,
    # mỗi hạng phải có đường dẫn bằng chứng và `cap_nguon` ghi lại bằng chứng đó là gì.
    nn_c = clean["name_norm"]
    # Toà nhà trong khuôn viên kế thừa cấp của khuôn viên chứa nó — suy diễn có bằng chứng
    # KHÔNG GIAN. Cố ý KHÔNG ghi đè `cap_chot`: trộn giá trị kế thừa vào cột đo thì phép đối
    # chứng chéo ở bước 2 mất tính trong sạch.
    _cap_theo_uid = clean.drop_duplicates("uid").set_index("uid")["cap_chot"]
    _ke_thua = clean["container_uid"].map(_cap_theo_uid)
    _ke_thua = _ke_thua.where(_ke_thua.ne("KHAC"))
    clean["cap_hieu_luc"] = (
        clean["cap_chot"].where(clean["cap_chot"].ne("KHAC")).fillna(_ke_thua).fillna("KHAC")
    )

    nguon = pd.Series("khong_ro", index=clean.index)
    nguon[clean["cap_tag"].notna() & clean["cap_chot"].ne("KHAC")] = "tag_day"
    nguon[clean["cap_ten"].ne("KHAC")] = "ten"
    nguon[clean["cap_tag_manh"].notna()] = "tag_co_cau_truc"
    nguon[clean["cap_chot"].eq("KHAC") & _ke_thua.notna()] = "ke_thua_khuon_vien"
    clean["cap_nguon"] = nguon

    hang = pd.Series("KHONG_XAC_DINH", index=clean.index)
    hang[clean["cap_hieu_luc"].isin(CAP_PHO_THONG)] = "PHO_THONG"
    hang[clean["cap_hieu_luc"].eq("MAM_NON")] = "MAM_NON"
    hang[clean["cap_hieu_luc"].eq("DAI_HOC")] = "DAI_HOC_HOC_VIEN"
    hang[clean["cap_hieu_luc"].eq("NGHE_TRUNG_CAP")] = "NGHE_CAO_DANG"
    # CÓ bằng chứng là cơ sở giáo dục nhưng KHÔNG suy ra được bậc → hạng riêng, không đoán bừa.
    hang[clean["cap_hieu_luc"].eq("KHAC") & _co_bang_chung_truong(clean)] = "TRUONG_CHUA_RO_CAP"
    hang[
        clean["amenity"].isin(["language_school", "music_school", "driving_school", "prep_school"])
        | c.chua(nn_c, TTDT_RX)
    ] = "TRUNG_TAM_DAO_TAO"
    hang[clean["amenity"].eq("research_institute")] = "VIEN_NGHIEN_CUU"
    clean["hang_th"] = hang

    # CỔNG: không hạng nào được chứa dòng vô bảo chứng, trừ ba hạng ĐỊNH NGHĨA là chưa rõ cấp.
    n_vo_bao_chung = int(
        (clean["cap_hieu_luc"].eq("KHAC") & ~clean["hang_th"].isin(HANG_CHUA_RO)).sum()
    )
    if n_vo_bao_chung:
        raise AssertionError(f"{n_vo_bao_chung} dòng mang nhãn cấp mà không có bảo chứng")

    # ── BƯỚC 5 — FINAL + bộ CÒN LẠI ─────────────────────────────────────────
    final = clean.copy()
    con_lai = c.con_lai_sau(poi, final)
    thieu = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu:
        raise AssertionError(f"mất {thieu} dòng bị luật xoá khỏi bộ còn lại")

    return {
        f"poi_truonghoc_{scope}_b1.parquet": b1,
        f"poi_truonghoc_{scope}_b3.parquet": b3,
        f"poi_truonghoc_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_truonghoc_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_truonghoc.parquet": con_lai,
        "_params": {
            "dat_tay": {},
            "hoc_tu_du_lieu": {},
            "do_duoc": {
                "cap_nguon": final["cap_nguon"].value_counts().to_dict(),
                "n_doi_chung_ca_hai_nguon": int(ca_hai.sum()),
                "n_cap_xung_dot": int(th["cap_xung_dot"].sum()),
            },
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot},
    }
