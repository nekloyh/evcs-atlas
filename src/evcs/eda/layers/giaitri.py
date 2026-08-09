"""LỚP 4 — giải trí, thể thao, công viên.

Port đẳng cấu của `notebooks/eda_giaitri.ipynb`. Đọc `..._con_lai_sau_thuongmai.parquet`.

Trục CHÍNH của lớp là VAI TRÒ KHÔNG GIAN — lần đầu trong chuỗi quan hệ bao-chứa được dùng
để PHÂN LOẠI chứ không chỉ chống đếm đôi: một `leisure=pitch` nằm trong khuôn viên trường là
sân của trường, không phải điểm đến. Cột `ben_trong_uid` tính MỘT lần trên bộ vào (nơi
trường học/bệnh viện còn nguyên), nên nó là thuộc tính BẤT BIẾN và các luật vẫn giao hoán.

Trục thứ hai: ĐỘ PHỦ TÊN × DIỆN TÍCH. Với 87% vô danh, việc CÓ TÊN tự nó là bằng chứng —
người map chỉ đặt tên cho thứ họ coi là MỘT NƠI.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

NGUONG_DT = 1_000  # m² — dưới mức này + vô danh ⇒ loại. HỌC TỪ DỮ LIỆU: độ phủ tên nhảy
#                    gấp đôi tại đúng mốc này (5,5% → 10,8%); con số tròn là do người chọn.
DT_DIEM_DEN = 2_000  # m² — ngưỡng để TÊN giải trí được quyền ân xá. ĐẶT TAY. Nó là thứ
#                      ngăn 182 điểm dừng xe buýt tên "Công viên Thống Nhất - …" quay lại:
#                      chúng là NODE, diện tích = 0.
DT_SAN_DON_MON = 2_000  # m² — dưới mức này, sân đơn môn là SÂN chứ không phải SÂN VẬN ĐỘNG.
DT_LON, DT_VUA = 20_000, 2_000  # m² — bậc quy mô.
# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (30) hiệu chỉnh trên bộ vào 17.305 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 30 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 30 / 17_305  # ≈ 0.1734% bộ vào
SAN_XUNG_DOT = 30  # sàn: scope nhỏ không bị siết chặt hơn notebook

KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

TAG_BUOC_1 = (
    "leisure", "landuse", "amenity", "sport", "building", "tourism", "natural", "shop",
    "office", "historic", "man_made", "highway", "public_transport", "railway", "aeroway",
    "waterway", "power", "barrier", "craft", "healthcare", "military", "place",
)  # fmt: skip

GT_TOURISM = ["theme_park", "zoo", "aquarium", "water_park"]
GT_BUILDING = ["stadium", "sports_hall", "sports_centre", "grandstand", "pavilion"]
GT_LANDUSE = ["recreation_ground", "village_green", "grass", "winter_sports"]

# TỪ VỰNG khai bằng BẢNG, không bằng một chuỗi nối. Mỗi mục có HAI vai KHÁC nhau:
#   vai 1 — TUYỂN (bước 1, recall): token khớp ⇒ mời vào lớp. Mọi mục đều có.
#   vai 2 — BẰNG CHỨNG (bước 3): token khớp + đủ lớn ⇒ được MIỄN các luật xoá.
#           Chỉ mục ghi rõ `BANG_CHUNG` mới có. **Mặc định là KHÔNG.**
# Mặc định phải là KHÔNG vì bản trước viết `GT_RX_DIEM_DEN = GT_RX.replace(...)` — trừ tay
# đúng hai token, nghĩa là mọi từ THÊM SAU NÀY tự động có quyền miễn tội mà không ai bấm nút.
BANG_CHUNG = True

GT_TU_VUNG = [
    # ── công viên / vườn hoa ──
    ("cong vien", BANG_CHUNG),
    (r"\bcvien\b", BANG_CHUNG),
    ("vuon hoa", BANG_CHUNG),
    ("vuon dao", BANG_CHUNG),
    ("thao cam vien", BANG_CHUNG),
    ("cong vien nuoc", BANG_CHUNG),
    ("water ?park", BANG_CHUNG),
    ("cong vien cay xanh", BANG_CHUNG),
    ("vuon uom", BANG_CHUNG),
    ("quang truong", BANG_CHUNG),
    # ── sân bãi thể thao ──
    ("san van dong", BANG_CHUNG),
    (r"\bsvd\b", BANG_CHUNG),
    (r"\bstadium\b", BANG_CHUNG),
    ("san the thao", BANG_CHUNG),
    ("san bong", BANG_CHUNG),
    ("san tennis", BANG_CHUNG),
    ("san cau long", BANG_CHUNG),
    ("san golf", BANG_CHUNG),
    (r"\bgolf\b", BANG_CHUNG),
    ("nha thi dau", BANG_CHUNG),
    (r"\bntd\b", BANG_CHUNG),
    ("be boi", BANG_CHUNG),
    ("ho boi", BANG_CHUNG),
    (r"\bbe ?boi\b", BANG_CHUNG),
    ("san dua", BANG_CHUNG),
    ("truong dua", BANG_CHUNG),
    ("karting", BANG_CHUNG),
    ("go-?kart", BANG_CHUNG),
    ("dua xe", BANG_CHUNG),
    # ── vui chơi ──
    ("khu vui choi", BANG_CHUNG),
    ("khu giai tri", BANG_CHUNG),
    ("cong vien giai tri", BANG_CHUNG),
    ("theme ?park", BANG_CHUNG),
    (r"\bsan choi\b", BANG_CHUNG),
    ("san choi tre em", BANG_CHUNG),
    # ── CƠ SỞ văn hoá–thể thao cấp xã/phường: không mang một tag `leisure` nào, chỉ có tên.
    #    Nhóm này do ĐẦU DÒ CỨNG của cổng recall 2 phát hiện ở vòng chạy trước. ──
    ("trung tam the thao", BANG_CHUNG),
    ("khu the thao", BANG_CHUNG),
    ("nha van hoa the thao", BANG_CHUNG),
    ("trung tam (?:the duc )?the thao", BANG_CHUNG),
    # `[^|]` chứ không `.`: chặn khoảng đệm nuốt qua ranh giới alternation khi nối bảng lại.
    ("trung tam van hoa[^|]{0,25}the thao", BANG_CHUNG),
    ("cung the thao", BANG_CHUNG),
    ("khu lien hop the thao", BANG_CHUNG),
    ("cau lac bo[^|]{0,12}the thao", BANG_CHUNG),
    (r"\bclb\b[^|]{0,14}the thao", BANG_CHUNG),
    (r"\btdtt\b", BANG_CHUNG),
    ("trung tam tdtt", BANG_CHUNG),
    # ══ CHỈ TUYỂN, KHÔNG làm bằng chứng ══════════════════════════════════════════
    # `name_norm` gộp `name:en`/`alt_name`/`old_name`, nên một danh từ chung tiếng Anh mở
    # cửa rộng hơn nó trông rất nhiều.
    r"\bpark\b",  # "Car Park", "Industrial Park", "Sky Park", "Hi-Tech Park"
    "san tap",  # "Sân tập lái" — trường dạy lái xe
]


# ─────────────────────────────────────────────────────────────────────────────
# SỔ NỢ RECALL ĐÃ ĐIỀU TRA — uid → phán quyết. KHÔNG phải whitelist tiện tay.
# Ngưỡng của đầu dò cứng vẫn là 0: một dòng LẠ vẫn làm đỏ ngay lập tức. Sổ này chỉ nói
# "uid đúng bằng chừng này đã được soi mắt, đây là kết luận, đây là lý do chưa vá".
# ─────────────────────────────────────────────────────────────────────────────
NO_DA_DIEU_TRA = {
    # LỖ RECALL THẬT, ĐÃ XÁC MINH — không phải nhiễu.
    #   `way:968202817` "Nhà thể thao đa năng" (Thái Nguyên, `building=university`,
    #   2.246 m² polygon) là một nhà thi đấu đa năng thật.
    #   Nguyên nhân gốc: từ vựng `GT_TU_VUNG` có `cung the thao`, `khu the thao`,
    #   `nha van hoa the thao`, `trung tam the thao` — nhưng KHÔNG có `nha the thao`.
    #   Đây là lỗi TỔNG QUÁT HOÁ của lexicon (loại A), chỉ SCOPE=vn mới lộ.
    # VÌ SAO CHƯA VÁ: thêm token `nha the thao` sẽ kéo THÊM 1 dòng vào lớp ở 7 tỉnh
    #   ("Nhà thể thao Khu phố 22", TP.HCM) ⇒ PHÁ parity 45/45 với `_gold/`. Mở lại chuẩn
    #   vàng là quyết định của người chủ dự án, không phải của bước chạy toàn quốc này.
    # KHI VÁ: thêm ("nha the thao", BANG_CHUNG) vào GT_TU_VUNG, đóng băng lại `_gold/`,
    #   rồi xoá dòng này khỏi sổ nợ.
    "way:968202817": (
        "LỖ RECALL THẬT — lexicon thiếu token `nha the thao`. Hoãn vá vì sẽ phá parity"
        " 7tinh (+1 dòng 'Nhà thể thao Khu phố 22', TP.HCM). Cần mở lại chuẩn vàng."
    ),
}


def _tach(muc):
    """Mục viết trần ⇒ chỉ tuyển. Chỉ tuple `(token, BANG_CHUNG)` mới có quyền miễn tội."""
    return muc if isinstance(muc, tuple) else (muc, False)


_TV = [_tach(m) for m in GT_TU_VUNG]
_DUP = {t for t, _ in _TV if [x for x, _ in _TV].count(t) > 1}
assert not _DUP, f"token trùng trong GT_TU_VUNG: {_DUP}"
for _t, _ in _TV:
    re.compile(_t)  # nổ ngay tại dòng khai, không nổ ở giữa pipeline

GT_RX = "|".join(t for t, _ in _TV)
GT_RX_DIEM_DEN = "|".join(t for t, bc in _TV if bc)
assert [t for t, bc in _TV if not bc], "bảng không còn mục CHỈ TUYỂN — mặc định an toàn đã hỏng"

# CƠ QUAN QUẢN LÝ nhà nước về thể thao ("Sở Văn hoá và Thể thao") KHÔNG phải cơ sở thể thao.
# Đã trả giá một vòng: tiền tố `phong ` trần chặn nhầm "Phòng Tập California Wow Yoga".
CO_QUAN_RX = (
    r"^(?:so|cuc|chi cuc|tong cuc|vu|ban quan ly|ban chi dao|uy ban)\s"
    r"|\bso van hoa|\bphong van hoa (?:va|thong tin)|\bso van hoa the thao"
)

# KHUÔN VIÊN CHỦ — lấy từ BỘ VÀO chứ không từ tập tuyển: trường học và bệnh viện chưa được
# bóc ra, và chúng chính là chủ nhà quan trọng nhất.
CHU_AMENITY = [
    "school", "university", "college", "kindergarten", "hospital", "prison",
    "community_centre", "place_of_worship",
]  # fmt: skip
CHU_LEISURE = ["sports_centre", "stadium", "park", "recreation_ground", "golf_course", "water_park"]
CHU_LANDUSE = ["education", "military", "recreation_ground", "religious"]

LOAI_DIEM_DEN = [
    "park", "stadium", "sports_centre", "sports_hall", "golf_course", "water_park",
    "amusement_arcade", "marina", "fitness_centre", "dance", "bowling_alley", "ice_rink",
    "horse_riding", "nature_reserve", "beach_resort",
]  # fmt: skip
LOAI_THANH_PHAN = [
    "pitch", "track", "fitness_station", "playground", "swimming_pool", "picnic_table",
    "outdoor_seating", "bleachers", "firepit", "bandstand",
]  # fmt: skip
NGOAI_LOP_AMENITY = [
    "cinema", "theatre", "nightclub", "bar", "pub", "restaurant", "cafe", "fast_food",
    "parking", "fuel", "bank", "place_of_worship", "school", "hospital", "clinic",
    "marketplace", "bus_station", "toilets", "shelter", "waste_basket", "drinking_water",
    # bổ sung sau thẩm định: ba họ này lọt vào final qua nhánh TÊN
    "bicycle_rental", "driving_school", "library",
]  # fmt: skip
NGOAI_LOP_TOURISM = ["museum", "artwork", "attraction", "viewpoint", "gallery", "hotel"]
AMENITY_GT_OK = ["swimming_pool", "community_centre", "dojo", "gym", "public_bath"]

# LUẬT 6 tách LÀM HAI TẦNG, vì quyền ân xá cũng đọc cái TÊN.
#   CỨNG — tên TỰ KHAI loại hình, không nhập nhằng được. Thắng mọi ân xá.
TEN_CUNG_RX = (
    r"benh vien|phong kham|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc|cao dang)"
    r"|\bubnd\b|uy ban nhan dan|\bcong an\b|nha may|xi nghiep|\bkcn\b|khu cong nghiep"
    r"|nghia trang|nghia dia|\brap \b|nha hat|bao tang|nha tang le"
    r"|khu cong nghe cao|hi-? ?tech park|khu che xuat|cum cong nghiep|khu cong nghe"
    r"|bai do xe|\bnha xe\b|ben xe|cay xang|tram xang|khach san|nha nghi"
)
#   MỀM — token nhập nhằng vì MẤT DẤU: `\bdinh \b` khớp "Ba Đình", `\bden \b` khớp "Đền Lừ".
#   Thua BẤT KỲ bằng chứng TAG nào, KHÔNG đòi ngưỡng diện tích.
TEN_MEM_RX = r"nha tho|\bchua \b|\bdinh \b|\bden \b"
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)

LUAT_CO_Y = {
    "MAT_PHU_KHONG_PHAI_CO_SO", "THANH_PHAN_KHUON_VIEN", "QUA_NHO_VO_DANH",
    "TAG_LOP_KHAC", "CHI_TEN_TAG_LOP_KHAC",
}  # fmt: skip


def _co_bang_chung_diem_den(df: pd.DataFrame, cho_phep_ten: bool = True) -> pd.Series:
    """Bằng chứng ĐIỂM ĐẾN: loại hình tự nó là điểm đến, hoặc TÊN GIẢI TRÍ + đủ lớn.

    Mệnh đề TÊN đòi tên khớp `GT_RX_DIEM_DEN`, không phải "có tên bất kỳ" — bản trước dùng
    `name.notna() & area>=2000`, một lệnh ân xá vô điều kiện.

    `cho_phep_ten=False` tắt hẳn mệnh đề tên. Dùng cho các luật mà chính cái TÊN đang đóng
    vai BẰNG CHỨNG BUỘC TỘI ("Nghĩa trang Công viên Châu Đức"): không thể để một chuỗi ký tự
    vừa kết tội vừa đứng ra ân xá.
    """
    bc = (
        df["leisure"].isin(LOAI_DIEM_DEN)
        | df["tourism"].isin(["theme_park", "zoo", "aquarium"])
        | df["building"].isin(["stadium", "sports_hall", "sports_centre"])
    )
    if cho_phep_ten:
        bc = bc | (
            c.chua(df["name_norm"], GT_RX_DIEM_DEN) & df["area_m2"].fillna(0).ge(DT_DIEM_DEN)
        )
    return bc


def chay(poi: pd.DataFrame, *, scope: str) -> dict:
    poi = poi.copy()

    # ── BƯỚC 1 — filter MỎNG ────────────────────────────────────────────────
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)
    poi["brand"] = td.map(lambda t: t.get("brand"))
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    # Lớp này chỉ dùng `name_norm` (đã bỏ dấu ⇒ thuần ASCII, `\b` an toàn). Giữ `name_dau`
    # ở dtype object phòng khi cần.
    poi["name_dau"] = poi["name"].fillna("").astype(object).str.lower()
    name_norm = poi["name_norm"]

    GT_TAG = (
        poi["leisure"].notna() | poi["tourism"].isin(GT_TOURISM) | poi["building"].isin(GT_BUILDING)
    )
    # đất công cộng / mặt phủ: tuyển để ĐO rồi mới cắt, không bỏ ngoài từ đầu
    GT_DAT = poi["landuse"].isin(GT_LANDUSE)
    GT_NAME = c.chua(name_norm, GT_RX) & ~c.chua(name_norm, CO_QUAN_RX)
    GT_SPORT = poi["sport"].notna() & poi["leisure"].isna()
    GT_VONG_DOI = td.map(
        lambda t: any(":" in k and k.split(":")[-1] in {"leisure", "sport"} for k in t)
    )

    poi["is_gt"] = GT_TAG | GT_DAT | GT_NAME | GT_SPORT | GT_VONG_DOI
    # Dòng CHỈ vào bằng nhánh TÊN — cả lớp đứng trên đúng một chuỗi ký tự. Nhánh mỏng nhất,
    # bước 3 phải có luật riêng cho nó.
    poi["gt_chi_ten"] = GT_NAME & ~(GT_TAG | GT_DAT | GT_SPORT | GT_VONG_DOI)

    c.cong_toan_ven(
        {
            "leisure=park": poi["leisure"].eq("park"),
            "leisure=stadium": poi["leisure"].eq("stadium"),
            "leisure=pitch": poi["leisure"].eq("pitch"),
            "leisure=sports_centre": poi["leisure"].eq("sports_centre"),
            "leisure=golf_course": poi["leisure"].eq("golf_course"),
            "leisure=water_park": poi["leisure"].eq("water_park"),
            "leisure=playground": poi["leisure"].eq("playground"),
            "landuse=recreation_ground": poi["landuse"].eq("recreation_ground"),
            "landuse=grass": poi["landuse"].eq("grass"),
            "có sport=*": poi["sport"].notna(),
            # trừ CƠ QUAN QUẢN LÝ — cổng phải phản ánh đúng luật tuyển, kể cả phần CỐ Ý loại
            "tên 'công viên' (trừ cơ quan)": c.chua(name_norm, r"cong vien")
            & ~c.chua(name_norm, CO_QUAN_RX),
            "tên 'sân vận động|SVĐ'": c.chua(name_norm, r"san van dong|\bsvd\b"),
            "tên 'khu vui chơi'": c.chua(name_norm, r"khu vui choi"),
            "tên 'nhà thi đấu'": c.chua(name_norm, r"nha thi dau"),
        },
        poi["is_gt"],
        lop="giaitri",
    )

    # ── CỔNG RECALL ĐỘC LẬP ─────────────────────────────────────────────────
    _bo = poi[~poi["is_gt"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="giaitri",
        scope=scope,
        mien_tru=NO_DA_DIEU_TRA,
        dau_do_cung={
            "có `pitch:*` / `golf:*`": _tags.map(
                lambda t: any(k.startswith(("pitch:", "golf:")) for k in t)
            ),
            "`building=grandstand|stadium` (khán đài)": _bo["building"].isin(
                ["grandstand", "stadium"]
            ),
            # "thể thao/thi đấu" trong tên là tín hiệu ĐỘC LẬP với mọi nhánh tag. Phải trừ
            # hai họ, nếu không cổng đỏ vĩnh viễn vì lý do sai.
            "tên có 'thể thao/thi đấu' mà bị loại": (
                c.chua(_ten, r"the thao|thi dau")
                & _bo["amenity"].isna()
                & _bo["shop"].isna()
                & _bo["office"].isna()
                & _bo["tourism"].isna()
                & _bo["highway"].isna()
                & _bo["public_transport"].isna()
                & _bo["historic"].isna()
                & ~c.chua(_ten, CO_QUAN_RX)
            ),
        },
        dau_do_mem={
            "`amenity=cinema|theatre` → lớp tham quan": _bo["amenity"].isin(["cinema", "theatre"]),
            "`tourism=museum|…` → lớp tham quan": _bo["tourism"].isin(
                ["museum", "artwork", "attraction", "viewpoint", "gallery"]
            ),
            "`amenity=nightclub` → lớp ăn uống, ngoài MVP": _bo["amenity"].eq("nightclub"),
            "tên có 'sân'": c.chua(_ten, r"\bsan\b"),
            "`natural=beach` → lớp tham quan": _bo["natural"].eq("beach"),
        },
    )

    gt = poi[poi["is_gt"]].copy()
    b1 = gt.copy()  # ghi đĩa TẠI ĐÂY, trước cột vai trò không gian của bước 2

    # ── BƯỚC 2 — VAI TRÒ KHÔNG GIAN ─────────────────────────────────────────
    chu = c.nap_geom(
        poi[
            poi["is_area"]
            & (
                poi["amenity"].isin(CHU_AMENITY)
                | poi["leisure"].isin(CHU_LEISURE)
                | poi["landuse"].isin(CHU_LANDUSE)
            )
        ]
    )
    chi_muc_gt = c.ChiMucKhongGian(gt)
    # duyệt từ TO xuống NHỎ ⇒ khuôn viên sát nhất ghi đè
    gt["ben_trong_uid"] = gt["uid"].map(
        c.gan_container(chu, chi_muc_gt, np.ones(len(gt), dtype=bool))
    )
    _host = poi.set_index("uid").reindex(gt["ben_trong_uid"])
    gt["ben_trong_loai"] = np.where(
        _host["amenity"].notna().values,
        "amenity:" + _host["amenity"].fillna("").values,
        np.where(
            _host["leisure"].notna().values,
            "leisure:" + _host["leisure"].fillna("").values,
            "landuse:" + _host["landuse"].fillna("").values,
        ),
    )
    gt.loc[gt["ben_trong_uid"].isna(), "ben_trong_loai"] = None

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    dc = c.DayChuyenLoc(gt, ham_tha=_co_bang_chung_diem_den, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường. `tha` BẮT BUỘC ở lớp NÀY, khác ba lớp trước: OSM vẽ QUẢNG
    # TRƯỜNG bằng `highway=pedestrian` và trường đua bằng `highway=raceway` — hai loại điểm
    # đến thuần tuý mang tag họ `highway`.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
        tha=True,
    )

    # LUẬT 2 — MẶT PHỦ, không phải cơ sở. `landuse=grass` là lớp phủ mặt đất: dải phân cách,
    # bồn cỏ vòng xoay. Nó KHÔNG phải một nơi.
    r = dc.con_lai
    dc.xoa(
        r["landuse"].isin(["grass", "village_green"]) & r["leisure"].isna(),
        "MAT_PHU_KHONG_PHAI_CO_SO",
        tha=True,
    )

    # LUẬT 3 — THÀNH PHẦN CỦA KHUÔN VIÊN KHÁC. Luật đặc trưng của lớp. Ba điều kiện cùng
    # đúng; TÊN RIÊNG là quyền phủ quyết — người map đặt tên nghĩa là họ coi nó là một nơi.
    r = dc.con_lai
    dc.xoa(
        r["leisure"].isin(LOAI_THANH_PHAN) & r["ben_trong_uid"].notna() & r["name"].isna(),
        "THANH_PHAN_KHUON_VIEN",
    )

    # LUẬT 4 — QUÁ NHỎ VÀ VÔ DANH. `cho_phep_ten=False`: dòng vô danh thì mệnh đề tên vô
    # nghĩa, nhưng `building=stadium|sports_hall|…` vẫn là bằng chứng.
    r = dc.con_lai
    dc.xoa(
        r["name"].isna()
        & ~_co_bang_chung_diem_den(r, cho_phep_ten=False)
        & r["is_area"]
        & r["area_m2"].lt(NGUONG_DT),
        "QUA_NHO_VO_DANH",
    )

    # LUẬT 5 — họ tag thuộc LỚP KHÁC. Rạp phim/bảo tàng → lớp THAM QUAN (chạy ngay sau).
    r = dc.con_lai
    dc.xoa(
        r["amenity"].isin(NGOAI_LOP_AMENITY)
        | r["tourism"].isin(NGOAI_LOP_TOURISM)
        | r["shop"].isin(["ticket"])
        | r["historic"].notna(),
        "TAG_LOP_KHAC",
        tha=True,
    )

    # LUẬT 6 — tên nói thẳng là loại khác, HAI TẦNG (xem TEN_CUNG_RX / TEN_MEM_RX).
    r = dc.con_lai
    BANG_CHUNG_TAG = (
        r["leisure"].notna()
        | r["sport"].notna()
        | r["building"].isin(["stadium", "sports_hall", "sports_centre", "grandstand"])
        | r["amenity"].eq("community_centre")
    )
    nn_r = r["name_norm"]
    dc.xoa(
        (c.chua(nn_r, TEN_CUNG_RX) & ~_co_bang_chung_diem_den(r, cho_phep_ten=False))
        | (c.chua(nn_r, TEN_MEM_RX) & ~_co_bang_chung_diem_den(r) & ~BANG_CHUNG_TAG),
        "TEN_LOAI_KHAC",
    )

    # LUẬT 7 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    # LUẬT 8 — CHỈ VÀO BẰNG TÊN mà lại MANG TAG CHỨC NĂNG CỦA LỚP KHÁC. `\bpark\b` kéo vào
    # "Bau Xeo Industrial Park" (5,3 km² KCN), "Imperia Sky Park" (chung cư). KHÔNG `tha`:
    # mệnh đề tên của hàm ân xá chính là thứ vừa kéo chúng vào.
    r = dc.con_lai
    dc.xoa(
        r["gt_chi_ten"]
        & (r["amenity"].notna() | r["shop"].notna() | r["office"].notna())
        & ~r["amenity"].isin(AMENITY_GT_OK),
        "CHI_TEN_TAG_LOP_KHAC",
    )

    clean, removed = dc.ket()

    conflict = removed[_co_bang_chung_diem_den(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="giaitri",
        nhan="có bằng chứng ĐIỂM ĐẾN",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    nn_c = clean["name_norm"]
    hang = pd.Series("KHAC", index=clean.index)
    for cond, val in [
        # `nature_reserve` phải RA KHỎI CONG_VIEN: 15 dòng chiếm 96,7% toàn bộ diện tích lớp
        # trên 0,28% số dòng. Gộp chung thì mọi thống kê theo diện tích là thống kê về RỪNG.
        (
            clean["leisure"].eq("nature_reserve")
            | c.chua(nn_c, r"vuon quoc gia|khu bao ton|rung dac dung|khu du tru sinh quyen"),
            "THIEN_NHIEN",
        ),
        # Quảng trường là hình thái RIÊNG: mặt lát, không cây, nhu cầu đỗ xe theo SỰ KIỆN.
        (c.chua(nn_c, r"quang truong") & clean["leisure"].isna(), "QUANG_TRUONG"),
        # `leisure=stadium` KHÔNG đủ để gọi là sân vận động: sân đơn môn < 2.000 m² là SÂN.
        (
            (
                clean["leisure"].eq("stadium")
                | clean["building"].eq("stadium")
                | c.chua(nn_c, r"san van dong|\bsvd\b|\bstadium\b")
            )
            & ~(
                clean["sport"].isin(
                    ["badminton", "basketball", "volleyball", "table_tennis", "pickleball"]
                )
                & clean["area_m2"].fillna(0).lt(DT_SAN_DON_MON)
            ),
            "SAN_VAN_DONG",
        ),
        (
            clean["leisure"].isin(["water_park", "amusement_arcade"])
            | clean["tourism"].isin(["theme_park", "zoo", "aquarium"])
            | c.chua(
                nn_c,
                r"khu vui choi|cong vien nuoc|water ?park|theme ?park|khu giai tri|thao cam vien",
            ),
            "KHU_VUI_CHOI",
        ),
        (
            clean["leisure"].eq("park")
            | clean["landuse"].eq("recreation_ground")
            | c.chua(nn_c, r"cong vien|vuon hoa|quang truong"),
            "CONG_VIEN",
        ),
        (
            clean["leisure"].isin(
                [
                    "sports_centre",
                    "sports_hall",
                    "fitness_centre",
                    "golf_course",
                    "pitch",
                    "track",
                    "swimming_pool",
                    "horse_riding",
                    "ice_rink",
                    "bowling_alley",
                ]
            )
            | clean["sport"].notna()
            | c.chua(
                nn_c,
                r"nha thi dau|san the thao|trung tam the thao|san golf|be boi|ho boi|san tap"
                r"|\btdtt\b|karting|go-?kart|dua xe",
            ),
            "CO_SO_THE_THAO",
        ),
        (
            clean["leisure"].isin(["playground", "garden", "picnic_table", "fitness_station"]),
            "TIEN_ICH_KHU_DAN_CU",
        ),
    ]:
        hang[cond & hang.eq("KHAC")] = val
    clean["hang_gt"] = hang
    clean["vai_tro"] = np.where(clean["ben_trong_uid"].notna(), "THANH_PHAN", "CHINH_THE")

    _dt = clean["area_m2"].fillna(0)
    clean["quy_mo_gt"] = np.select(
        [_dt.ge(DT_LON), _dt.ge(DT_VUA), _dt.gt(0)],
        ["LON_TREN_2HA", "VUA_2000_20000M2", "NHO_DUOI_2000M2"],
        default="KHONG_DO_DUOC",
    )

    chi_muc = c.ChiMucKhongGian(clean)
    vung = c.nap_geom(clean[clean["is_area"]])
    clean["container_uid"] = clean["uid"].map(
        c.gan_container(vung, chi_muc, np.ones(len(clean), dtype=bool))
    )
    clean["fragment_group"] = c.nhom_manh(clean, clean["name"].notna())

    # ── BƯỚC 5 — FINAL + bộ CÒN LẠI ─────────────────────────────────────────
    final = clean.copy()
    con_lai = c.con_lai_sau(poi, final)
    thieu = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu:
        raise AssertionError(f"mất {thieu} dòng bị luật xoá khỏi bộ còn lại")

    return {
        f"poi_giaitri_{scope}_b1.parquet": b1,
        f"poi_giaitri_{scope}_b3.parquet": b3,
        f"poi_giaitri_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_giaitri_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_giaitri.parquet": con_lai,
        "_params": {
            "dat_tay": {
                "DT_DIEM_DEN": DT_DIEM_DEN,
                "DT_SAN_DON_MON": DT_SAN_DON_MON,
                "DT_LON": DT_LON,
                "DT_VUA": DT_VUA,
            },
            "hoc_tu_du_lieu": {"NGUONG_DT": NGUONG_DT},
            "do_duoc": {
                "n_khuon_vien_chu": len(chu),
                "ty_le_nam_trong_khuon_vien": round(float(gt["ben_trong_uid"].notna().mean()), 4),
            },
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot},
    }
