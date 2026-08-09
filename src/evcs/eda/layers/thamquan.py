"""LỚP 5 — tham quan (di tích, bảo tàng, thờ tự, cảnh quan, thiết chế văn hoá).

Port đẳng cấu của `notebooks/eda_thamquan.ipynb`. Đọc `..._con_lai_sau_giaitri.parquet`.

Lớp DUY NHẤT phải làm việc trên bản CÒN DẤU. Bỏ dấu ĐẬP BẸP những từ vốn khác hẳn nhau:
chùa/chữa/chưa → `chua`, đình/định/đinh → `dinh`, phủ/phú/phụ → `phu`, lăng/làng/láng →
`lang`, tháp/thấp/thập → `thap`. Với token MỘT ÂM TIẾT thì nhiễu lớn hơn tín hiệu.

Hai bẫy đã trả giá, cả hai đều TRƯỢT IM LẶNG:
  · dtype `str` (Arrow) chạy RE2, `\\b` của RE2 chỉ hiểu ASCII ⇒ `\\bđình\\b` khớp 1 dòng
    thay vì 1.317. Phải ép `astype(object)` (ở đây: `common.chua_co_dau`).
  · 176 tên ở dạng tổ hợp NFD ("Chùa" = "Chu" + dấu huyền rời). Regex viết bằng ký tự dựng
    sẵn NFC trượt hết. Chuẩn hoá NFC MỘT lần tại nguồn.

Và một bẫy KHÔNG cứu được bằng dấu: "bia" (đá tưởng niệm) trùng "bia" (để uống) cả khi còn
dấu. Chỉ CỤM TỪ mới tách được.
"""

from __future__ import annotations

import unicodedata

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

N_LANG_DA_NGU = 4  # biến thể ngôn ngữ để tự nó là nhánh tuyển. HỌC TỪ DỮ LIỆU: ≥4 là hiếm
#                    (0,5% toàn bộ) và gần như chỉ có ở điểm đến du lịch.
N_LANG_VUNG = 2  # ≥2 ngôn ngữ ⇒ bậc sức hút VÙNG. HỌC TỪ DỮ LIỆU (bảng lift ở bước hiệu chuẩn).
# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (30) hiệu chỉnh trên bộ vào 11.394 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 30 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 30 / 11_394  # ≈ 0.2633% bộ vào
SAN_XUNG_DOT = 30  # sàn: scope nhỏ không bị siết chặt hơn notebook
# Chuông bẫy RE2 — TỶ LỆ, không phải số tuyệt đối. Nếu `\bđình\b` khớp ít hơn ngưỡng thì
# `name_dau` đã tuột về dtype `str` và cả lớp âm thầm mất hàng nghìn dòng. Ngưỡng cũ (200
# trên bộ vào 171.224 = 0,117%) giữ nguyên dưới dạng tỷ lệ; quan sát thật là 0,78%, tức
# chuông còn dư 6,7 lần biên trước khi kêu oan.
TY_LE_CHUONG_DINH = 200 / 171_224  # ≈ 0,117% bộ vào
SAN_CHUONG_DINH = 200  # sàn: scope nhỏ không bị đòi cao hơn notebook

KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

TAG_BUOC_1 = (
    "tourism", "historic", "amenity", "building", "religion", "denomination", "natural",
    "leisure", "shop", "office", "landuse", "man_made", "highway", "public_transport",
    "railway", "aeroway", "waterway", "power", "barrier", "craft", "healthcare", "place",
)  # fmt: skip

TQ_TOURISM = [
    "attraction", "museum", "artwork", "viewpoint", "gallery", "information",
    "picnic_site", "zoo", "aquarium", "theme_park",
]  # fmt: skip
TQ_AMENITY = [
    "place_of_worship", "cinema", "theatre", "arts_centre", "library",
    "exhibition_centre", "planetarium",
]  # fmt: skip
TQ_BUILDING = [
    "temple", "church", "mosque", "cathedral", "museum", "chapel", "shrine", "pagoda", "synagogue",
]  # fmt: skip
TQ_NATURAL = ["beach", "cave_entrance", "peak", "hot_spring"]
THO_TU_BUILDING = ["temple", "church", "mosque", "cathedral", "chapel", "shrine", "pagoda"]

# CỤM đa âm tiết — đủ dài để không đồng âm với gì cả sau khi bỏ dấu, nên chạy trên
# `name_norm` để khớp được cả tên người map viết thiếu dấu.
TQ_RX = (
    r"bao tang|nha trung bay|nha truyen thong|phong trung bay"
    r"|di tich|di san|thang canh|danh lam|khu di tich"
    r"|\brap (?:phim|chieu|hat)?\b|\bcgv\b|lotte cinema|\bbhd\b|galaxy cinema|cinestar|beta cinemas"
    r"|nha hat|san khau kich|\bcung van hoa\b|trung tam van hoa|nha van hoa|thu vien"
    r"|nha thieu nhi|cung thieu nhi"
    r"|\btu vien\b|\bthien vien\b|nha tho|giao xu|thanh duong|nha nguyen"
    r"|thanh that|toa thanh|tinh xa|tinh that|niem phat duong"
    r"|thanh co|hoang thanh|van mieu|khue van|cot co"
    r"|diem tham quan|khu du lich|\bkdl\b|bai bien|\bbeach\b|hang dong|thac \b|suoi khoang"
    # CÔNG TRÌNH TƯỞNG NIỆM — do ĐẦU DÒ CỨNG của cổng recall 2 phát hiện: 41 "Đài tưởng
    # niệm" và 94 "nghĩa trang liệt sĩ" không mang một tag `historic` nào. Ở VN đây là điểm
    # đến thật (27/7, ngày rằm), khác hẳn nghĩa trang thường.
    r"|dai tuong niem|nha tuong niem|khu tuong niem|tuong dai|dai liet si|bia liet si|nha bia"
    r"|nghia? ?tran[hg] liet si|den liet si"
    r"|nha giao ly|nha xu\b"
)

# BẢNG TOKEN ĐƠN ÂM. Khoá = dạng CÒN DẤU (khớp trên `name_dau`); giá trị = dạng BỎ DẤU
# (chỉ dùng cho cửa dự phòng khi tên viết không dấu).
DON_AM = {
    r"\bchùa\b": r"\bchua\b",
    r"\bđình\b": r"\bdinh\b",
    r"\bđền\b": r"\bden\b",
    r"\bphủ\b": r"\bphu\b",
    r"\blăng\b": r"\blang\b",
    r"\btháp\b": r"\bthap\b",
    # "miễu" là biến thể Nam Bộ của "miếu" — bỏ nó là mất 31 miễu thật ở Nam Bộ.
    r"\bmi[ếễ]u\b": r"\bmieu\b",
    # "chúa" KHÁC "chùa" và trước đây chỉ lọt vào lớp nhờ đồng âm sau khi bỏ dấu — tức đúng
    # vì lý do sai. Đo riêng: 45/45 là tôn giáo. Token sạch, giữ tường minh.
    r"\bchúa\b": r"\bchua\b",
}

# TỪ VỰNG LOẠI HÌNH THỜ TỰ — trục chỉ tồn tại trong tiếng Việt. OSM cho tất cả một tag
# `amenity=place_of_worship`, nhưng CHÙA (mở cho khách thập phương) ≠ ĐÌNH (thiết chế của
# một làng) ≠ ĐỀN (điểm hành hương) ≠ MIẾU (nhỏ, thờ tại chỗ). Đo được: ĐÌNH trung vị
# 281 m², CHÙA 2.716 m² — chênh gần 10 lần, cùng một tag.
LOAI_THO_TU = [
    ("chùa / tự viện", r"\bchùa\b|\btự viện\b|\bthiền viện\b|\bam\b"),
    ("nhà thờ / giáo xứ", r"nhà thờ|giáo xứ|giáo họ|nhà nguyện|thánh đường"),
    ("đình", r"\bđình\b"),
    ("đền / miếu", r"\bđền\b|\bmi[ếễ]u\b|\bphủ\b|\bquán\b"),
    ("thánh thất / thánh tịnh", r"thánh thất|thánh tịnh|tòa thánh|toà thánh"),
    ("tịnh xá / tịnh thất / niệm phật đường", r"tịnh xá|tịnh thất|niệm phật đường"),
    # "nhà thờ họ / từ đường" KHÔNG phải nhà thờ Công giáo — nơi thờ tổ tiên một dòng họ.
    ("lăng / mộ / nhà thờ họ", r"\blăng\b|\bmộ\b|nhà thờ (?:tổ|họ|dòng)|từ đường"),
]

AMENITY_LOP_KHAC = [
    "restaurant", "cafe", "fast_food", "bar", "pub", "parking", "fuel", "bank", "atm",
    "pharmacy", "school", "kindergarten", "university", "college", "hospital", "clinic",
    "doctors", "dentist", "marketplace", "bus_station", "toilets", "shelter", "police",
    "fire_station", "post_office", "townhall", "courthouse", "prison",
    # THIẾT BỊ ĐẶT NHỜ ĐỊA ĐIỂM: "TNGo - Bảo tàng Chiến thắng B52" — node trần không mang
    # `highway` nên luật hạ tầng KHÔNG bắt được.
    "bicycle_rental", "vending_machine", "parcel_locker",
]  # fmt: skip
# ⚠ `events_venue` ĐÃ THỬ VÀ BỊ GỠ: thêm nó xoá đúng 1 dòng đáng xoá nhưng kéo theo 5 dòng
# đúng ("Cung Văn hóa Thể thao Thanh niên Hà Nội"). Bài học: danh sách tag "lớp khác" chỉ
# được nhận tag mà TOÀN BỘ họ của nó thuộc lớp khác, không nhận tag chỉ ĐA SỐ thuộc lớp khác.
LEISURE_LOP_KHAC = ["pitch", "swimming_pool", "fitness_centre", "playground"]
# ĐƠN VỊ CƯ TRÚ / HÀNH CHÍNH — NHÃN ĐỊA LÝ, không phải cơ sở. Phải nằm ở đây chứ không chỉ
# ở LUẬT 4B: luật đó chạy kèm van tha, mà "Hà Nội", "Hội An" có `wikidata` nên nhánh wiki
# gọi chúng là bằng chứng và tha ngược lại đúng cái luật sinh ra để xoá chúng (182 dòng).
PLACE_CU_TRU = [
    "city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood", "borough",
    "district", "province", "region", "county", "municipality", "state", "city_block",
]  # fmt: skip
# `island`/`islet`/`archipelago` KHÔNG có trong PLACE_CU_TRU: đảo là điểm đến thật (Cát Bà,
# Ngọc Vừng). LUẬT 4B vẫn xử chúng riêng và vẫn cho tha.
PLACE_DIA_LY_VALUES = [
    "city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood", "borough",
    "district", "province", "region", "county", "municipality", "locality", "island",
    "islet", "archipelago", "sea", "ocean", "state", "city_block", "square",
]  # fmt: skip

TU_DUONG_RX = r"nha tho (?:to|ho|dong|chi)|\btu duong\b|nha tho gia toc|mo gia dinh|mo to|khu mo"
TEN_LOAI_KHAC_RX = (
    r"benh vien|phong kham|\bubnd\b|uy ban nhan dan|\bcong an\b|toa an|kho bac|buu dien"
    r"|\bngan hang\b|nha may|xi nghiep|\bkcn\b|khach san|nha nghi|\bcay xang\b|tram xang"
    r"|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc|cao dang)|\bcho \b"
    r"|sieu thi|trung tam thuong mai|\bbai do xe\b|\bnha xe\b|ben xe|\bkhu cong nghiep\b"
)
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)

LUAT_CO_Y = {"TU_DUONG_MO_GIA_DINH", "BIEN_CHI_DAN", "TAG_LOP_KHAC"}


def _mang_tag_lop_khac(df: pd.DataFrame) -> pd.Series:
    """Dòng TỰ KHAI mình thuộc họ của một lớp khác trong dây chuyền.

    MỘT nguồn sự thật, dùng ở hai chỗ: LUẬT 4 (xoá) và nhánh wiki của
    `_co_bang_chung_tham_quan` (tha). Trước đây hai chỗ có hai danh sách khác nhau và đó
    chính là kẽ hở: luật xoá biết `amenity=hospital` là lớp khác, nhánh tha thì không, nên
    "Bệnh viện Bạch Mai" bị THA vì có `wikidata` — rồi bị trừ khỏi bộ CÒN LẠI nên lớp y tế
    chạy sau không còn nhìn thấy nó nữa.
    """
    return (
        df["amenity"].isin(AMENITY_LOP_KHAC)
        | df["shop"].notna()
        | df["office"].notna()
        | df["healthcare"].notna()
        | df["leisure"].isin(LEISURE_LOP_KHAC)
        | df["highway"].notna()
        | df["public_transport"].notna()
        | df["railway"].notna()
        | df["aeroway"].notna()
        # NHÀ GA DẠNG POLYGON: khối nhà ga không mang `railway=*`, nó mang
        # `building=transportation`. Cùng một bài học, lần thứ ba, ở một khoá tag khác.
        | df["building"].isin(["transportation", "train_station"])
        | df["place"].isin(PLACE_CU_TRU)
    )


def _co_bang_chung_tham_quan(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng ĐIỂM THAM QUAN — tự khai bằng tag, hoặc được ghi nhận ngoài OSM.

    `co_wiki`/`co_heritage` là bằng chứng BỔ TRỢ, không ĐỊNH DANH — đã trả giá HAI lần.
    Lần 1: 127 GA ĐƯỜNG SẮT có `wikidata`. Lần 2: 34 BỆNH VIỆN TRUNG ƯƠNG (Bạch Mai, Nhi TƯ,
    108, Quân y 175), 155 trường/ĐH và 120 `office` vẫn lọt — và vì dây chuyền TRỪ `final`
    khỏi bộ còn lại, lớp y tế chạy sau mất trắng cả 34. Tiêu chí lọc nhầm chính là "nổi
    tiếng đến mức có Wikipedia", nên thứ bị nuốt đúng là các cơ sở đầu ngành lớn nhất.
    """
    return (
        df["tourism"].isin(
            ["attraction", "museum", "viewpoint", "zoo", "aquarium", "theme_park", "gallery"]
        )
        | df["historic"].notna()
        | df["religion_that"]
        | df["amenity"].eq("place_of_worship")
    ) | ((df["co_wiki"] | df["co_heritage"]) & ~_mang_tag_lop_khac(df))


def _khop_don_am(df: pd.DataFrame) -> pd.Series:
    """Token một âm tiết trên bản CÒN DẤU, chia theo VỊ TRÍ trong tên.

    Tiếng Việt đặt danh từ loại hình ở ĐẦU cụm định danh: "Chùa Một Cột", "Đền Hùng". Khi âm
    tiết đó nằm ở CUỐI tên thì gần như luôn là địa danh — đo được 315/377 dòng cuối-tên là
    "Ba Đình", "Điện Biên Phủ", "Đồng Tháp", "Xóm Chùa".

    Ngoại lệ có thật: cụm Hán-Việt chính-phụ đảo ("Văn Miếu", "Bắc Bộ Phủ"). Chúng nổi tiếng
    nên gần như luôn được map kỹ ⇒ dùng TAG HẬU THUẪN làm cửa cứu thay vì liệt kê tay.

    Ba mức, một cơ chế:
      · ĐẦU cụm (có từ theo sau)   → bằng chứng ĐỦ
      · CUỐI tên                   → YẾU, cần tag hậu thuẫn
      · tên viết KHÔNG DẤU (22,6%) → YẾU, cần tag hậu thuẫn (không tách được đồng âm)
    """
    nd, nn = df["name_dau"], df["name_norm"]
    manh = np.logical_or.reduce([c.chua_co_dau(nd, rx + r"(?=\s+\w)").values for rx in DON_AM])
    co_dau = np.logical_or.reduce([c.chua_co_dau(nd, rx).values for rx in DON_AM])
    bo_dau = np.logical_or.reduce([c.chua_co_dau(nn, rx).values for rx in DON_AM.values()])
    yeu = (co_dau & ~manh) | (df["ten_khong_dau"].values & bo_dau)
    return pd.Series(manh | (yeu & df["tag_ho_tro_tq"].values), index=df.index)


def chay(poi: pd.DataFrame, *, scope: str) -> dict:
    poi = poi.copy()

    # ── BƯỚC 1 — chuẩn bị cột ───────────────────────────────────────────────
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    name_norm = poi["name_norm"]

    # BA DẤU VẾT SỨC HÚT. `name:vi` bị loại khỏi phép đếm ngôn ngữ: tên tiếng Việt không nói
    # gì về khách phương xa.
    poi["n_lang"] = td.map(lambda t: sum(1 for k in t if k.startswith("name:") and k != "name:vi"))
    poi["co_wiki"] = td.map(
        lambda t: any(k == "wikidata" or k.startswith(("wikipedia", "wikimedia")) for k in t)
    )
    poi["co_heritage"] = td.map(lambda t: any(k.startswith("heritage") for k in t))

    # BẢN CÒN DẤU. NFC là BẮT BUỘC, không phải cho đẹp: 176 tên ở dạng tổ hợp (NFD).
    # Cột `name_dau` do lớp giải trí sinh ra bị parquet round-trip thành `str`, nên dựng lại
    # ở đây thay vì tin cột cũ.
    alt_dau = td.map(lambda t: " ".join(str(v) for v in (t.get(k) for k in KHOA_TEN_ALT) if v))
    poi["name_dau"] = (
        (poi["name"].fillna("") + " " + alt_dau)
        .str.strip()
        .map(lambda s: unicodedata.normalize("NFC", s).lower())
        .astype(object)
    )
    name_dau = poi["name_dau"]
    # Tên do người map viết KHÔNG DẤU: bản còn dấu không tồn tại, không tách đồng âm được.
    poi["ten_khong_dau"] = poi["name"].notna() & name_dau.map(lambda s: s == c.strip_accents(s))

    # `religion=none` là giá trị OSM HỢP LỆ nghĩa là "cơ sở này KHÔNG theo tôn giáo nào".
    # Đọc `religion.notna()` thành bằng chứng tôn giáo là đọc NGƯỢC — giá đo được: 13 trường
    # học được THA khỏi luật "tag lớp khác" đúng nhờ cái tag nói rằng chúng phi tôn giáo.
    poi["religion_that"] = poi["religion"].notna() & ~poi["religion"].isin(["none", "no"])

    # TAG HẬU THUẪN — độc lập hoàn toàn với tên, nên dùng được làm chứng cứ bổ trợ cho token
    # đơn âm.
    poi["tag_ho_tro_tq"] = (
        poi["amenity"].eq("place_of_worship")
        | poi["tourism"].notna()
        | poi["historic"].notna()
        | poi["religion_that"]
        | poi["building"].isin(THO_TU_BUILDING)
        | poi["co_wiki"]
        | poi["co_heritage"]
    )

    # CHUÔNG BẪY RE2 — nếu `name_dau` lại tuột về dtype `str`, mọi token bắt đầu bằng "đ"
    # trượt về gần 0 và cả lớp âm thầm mất hàng nghìn dòng. Chặn ngay tại đây.
    n_dinh = int(c.chua_co_dau(name_dau, r"\bđình\b").sum())
    nguong_dinh = c.tran_theo_ty_le(len(poi), TY_LE_CHUONG_DINH, SAN_CHUONG_DINH)
    if n_dinh <= nguong_dinh:
        raise c.CongDo(
            f"CHUÔNG BẪY RE2 — lớp `thamquan`, scope `{scope}`: `\\bđình\\b` chỉ khớp "
            f"{n_dinh:,} dòng, dưới ngưỡng {nguong_dinh:,}. `name_dau` đang chạy RE2 "
            f"(dtype {name_dau.dtype}) — biên từ `\\b` của RE2 không hiểu ký tự có dấu, "
            "nên MỌI token đơn âm bắt đầu bằng chữ có dấu đang trượt im lặng.",
            lop="thamquan",
        )

    # ── tuyển ───────────────────────────────────────────────────────────────
    TQ_TAG = (
        poi["tourism"].isin(TQ_TOURISM)
        | poi["historic"].notna()
        | poi["amenity"].isin(TQ_AMENITY)
        | poi["building"].isin(TQ_BUILDING)
        | poi["natural"].isin(TQ_NATURAL)
        # HẢI ĐĂNG — trước đó nhóm này vào lớp một cách TÌNH CỜ: alt_name "đèn biển" bỏ dấu
        # thành "den bien" nên đụng token `\bden \b`. Vá đồng âm làm chúng rụng 24 → 6. Hải
        # đăng là điểm đến thật (Kê Gà, Đại Lãnh bán vé) nên phải giữ — bằng TAG chứ không
        # bằng tên: "Hải Đăng" còn là tên riêng phổ biến ("Cà Phê Hải Đăng").
        | poi["man_made"].eq("lighthouse")
        | poi["religion_that"]
        | poi["denomination"].notna()
    )
    TQ_NAME = c.chua(name_norm, TQ_RX) | _khop_don_am(poi)
    # dấu vết TRI THỨC NGOÀI OSM — bắt được điểm tham quan mà OSM quên gắn tag phân loại.
    TQ_TRI_THUC = (poi["co_wiki"] | poi["co_heritage"]) & poi["name"].notna()
    TQ_DA_NGU = poi["n_lang"] >= N_LANG_DA_NGU
    TQ_VONG_DOI = td.map(
        lambda t: any(
            ":" in k and k.split(":")[-1] in {"tourism", "historic", "religion"} for k in t
        )
    )

    poi["is_tq"] = TQ_TAG | TQ_NAME | TQ_TRI_THUC | TQ_DA_NGU | TQ_VONG_DOI

    c.cong_toan_ven(
        {
            "tourism=attraction": poi["tourism"].eq("attraction"),
            "tourism=museum": poi["tourism"].eq("museum"),
            "tourism=artwork": poi["tourism"].eq("artwork"),
            "tourism=viewpoint": poi["tourism"].eq("viewpoint"),
            "historic=*": poi["historic"].notna(),
            "amenity=place_of_worship": poi["amenity"].eq("place_of_worship"),
            "amenity=cinema": poi["amenity"].eq("cinema"),
            "amenity=theatre": poi["amenity"].eq("theatre"),
            "religion thật (≠ none)": poi["religion_that"],
            "có wikidata/wikipedia (và có tên)": poi["co_wiki"] & poi["name"].notna(),
            "có heritage=* (và có tên)": poi["co_heritage"] & poi["name"].notna(),
            "tên 'bảo tàng'": c.chua(name_norm, r"bao tang"),
            "tên 'di tích'": c.chua(name_norm, r"di tich"),
            # Hỏi ĐÚNG thứ luật tuyển tuyên bố: "chùa" CÒN DẤU, ĐỨNG ĐẦU cụm.
            "tên 'chùa'": c.chua_co_dau(name_dau, r"\bchùa\b(?=\s+\w)"),
            "tên 'nhà thờ'": c.chua(name_norm, r"nha tho"),
            "man_made=lighthouse": poi["man_made"].eq("lighthouse"),
            "tên 'nhà/cung thiếu nhi'": c.chua(name_norm, r"nha thieu nhi|cung thieu nhi"),
        },
        poi["is_tq"],
        lop="thamquan",
    )

    # ── CỔNG RECALL ĐỘC LẬP ─────────────────────────────────────────────────
    _bo = poi[~poi["is_tq"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="thamquan",
        scope=scope,
        dau_do_cung={
            "có `denomination` / `heritage:*` / `ruins:*`": _tags.map(
                lambda t: (
                    "denomination" in t
                    or any(k.startswith(("heritage:", "ruins:", "was:historic")) for k in t)
                )
            ),
            # đòi CÓ TÊN: 5 dòng vô danh mang operator giáo phận là ranh đất của giáo xứ.
            "`operator` là Giáo hội / BQL di tích (và có tên)": c.chua(
                _bo["operator"].fillna("").map(c.strip_accents),
                r"giao hoi|giao phan|ban quan ly di tich|bao tang",
            )
            & _bo["name"].notna(),
            # ⚠ `\bbia \b` ĐÃ BỊ GỠ khỏi đầu dò này sau khi trả giá một vòng: nó khớp 168
            # quán "BIA TƯƠI" chứ không phải bia đá. Bỏ dấu KHÔNG cứu được — "bia" và "bia"
            # trùng nhau cả khi còn dấu. Chỉ CỤM mới tách được.
            # trừ TÊN NÚT GIAO ("Ngã năm Liệt sĩ") — tên một chỗ giao đường, không phải công
            # trình tưởng niệm.
            "tên có 'tưởng niệm / liệt sĩ'": c.chua(_ten, r"tuong niem|liet si")
            & ~c.chua(_ten, r"^(?:nga (?:ba|tu|nam|sau|bay)|duong |pho |ngo |ngach )"),
        },
        dau_do_mem={
            # Nhóm bị tầng VỊ TRÍ loại: âm tiết loại hình ở CUỐI tên, không tag hậu thuẫn.
            # Nếu con số này phình bất thường khi đổi SCOPE thì quy tắc vị trí cần đo lại.
            "đơn âm ở CUỐI tên, không tag (đã loại có chủ ý)": np.logical_or.reduce(
                [c.chua_co_dau(_bo["name_dau"], rx).values for rx in DON_AM]
            )
            & ~np.logical_or.reduce(
                [c.chua_co_dau(_bo["name_dau"], rx + r"(?=\s+\w)").values for rx in DON_AM]
            ),
            "tên có 'đài'": c.chua(_ten, r"\bdai \b"),
            "tên có 'thành'": c.chua(_ten, r"\bthanh \b"),
            "`natural=water|wood` — cảnh quan, chưa phải điểm đến": _bo["natural"].isin(
                ["water", "wood", "scrub"]
            ),
            "`amenity=library` công cộng": _bo["amenity"].eq("library"),
        },
    )

    tq = poi[poi["is_tq"]].copy()
    b1 = tq.copy()  # ghi đĩa TẠI ĐÂY, trước cột sức hút của bước 2

    # ── BƯỚC 2 — thang SỨC HÚT ──────────────────────────────────────────────
    # THANG dựng CHỈ bằng dấu vết TRI THỨC NGOÀI (wiki + heritage) — cố ý không dùng đa ngôn
    # ngữ, để kiểm chéo bằng chính tín hiệu không tham gia dựng thang.
    tq["suc_hut_tri_thuc"] = np.select(
        [tq["co_heritage"], tq["co_wiki"]],
        ["DI_SAN_XEP_HANG", "CO_DAU_VET_WIKI"],
        default="KHONG_CO",
    )
    tq["suc_hut"] = np.select(
        [
            tq["co_heritage"] | (tq["n_lang"] >= N_LANG_DA_NGU),
            tq["co_wiki"] | (tq["n_lang"] >= N_LANG_VUNG),
            tq["tourism"].isin(
                ["attraction", "museum", "viewpoint", "zoo", "aquarium", "theme_park"]
            ),
        ],
        ["QUOC_GIA_QUOC_TE", "VUNG", "DIA_PHUONG_CO_KHAI"],
        default="DIA_PHUONG",
    )
    tq["suc_hut_nguon"] = np.select(
        [tq["co_heritage"], tq["co_wiki"], tq["n_lang"] >= N_LANG_VUNG, tq["tourism"].notna()],
        ["heritage", "wiki", "da_ngon_ngu", "tu_khai_tag"],
        default="khong_co",
    )

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    dc = c.DayChuyenLoc(tq, ham_tha=_co_bang_chung_tham_quan, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường: trạm buýt lấy chùa / bảo tàng làm mốc.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — NHÀ THỜ HỌ / TỪ ĐƯỜNG / LĂNG MỘ GIA ĐÌNH. Bẫy tiếng Việt riêng của lớp: "nhà
    # thờ" trong "nhà thờ họ Nguyễn" KHÔNG phải nhà thờ Công giáo mà là công trình TƯ NHÂN.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], TU_DUONG_RX) | (r["historic"].isin(["tomb"]) & r["name"].isna()),
        "TU_DUONG_MO_GIA_DINH",
        tha=True,
    )

    # LUẬT 3 — BIỂN CHỈ DẪN, không phải điểm đến. `tourism=information` TRỎ TỚI điểm tham
    # quan. Nguyên tắc "mốc tham chiếu" ở dạng tag thay vì dạng tên.
    r = dc.con_lai
    dc.xoa(
        r["tourism"].eq("information") | r["man_made"].isin(["surveillance", "flagpole"]),
        "BIEN_CHI_DAN",
        tha=True,
    )

    # LUẬT 4 — họ tag thuộc LỚP KHÁC.
    r = dc.con_lai
    dc.xoa(_mang_tag_lop_khac(r), "TAG_LOP_KHAC", tha=True)

    # LUẬT 4B — NODE ĐỊA DANH HÀNH CHÍNH. Nhánh wiki đo ĐỘ NỔI TIẾNG, và độ nổi tiếng không
    # phân biệt cái gì là một cơ sở: "Hà Nội", "Hội An" đều có `wikidata`.
    r = dc.con_lai
    dc.xoa(r["place"].isin(PLACE_DIA_LY_VALUES), "PLACE_DIA_LY", tha=True)

    # LUẬT 5 — tên nói thẳng là loại khác. "truong " trần là tên riêng ("Trường Sơn").
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], TEN_LOAI_KHAC_RX) & ~_co_bang_chung_tham_quan(r),
        "TEN_LOAI_KHAC",
    )

    # LUẬT 6 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    clean, removed = dc.ket()

    conflict = removed[_co_bang_chung_tham_quan(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="thamquan",
        nhan="có bằng chứng THAM QUAN",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    # `nn_c` = bỏ dấu (CỤM đa âm) · `nd_c` = còn dấu (token ĐƠN ÂM). Cùng ranh giới như bước
    # 1 — tách tầng ở bước tuyển mà bước gán nhãn vẫn dùng bản bỏ dấu thì "Sữa Chua Trân
    # Châu Hạ Long" vào lớp qua cửa khác rồi vẫn bị dán nhãn CO_SO_THO_TU.
    nn_c = clean["name_norm"]
    nd_c = clean["name_dau"]
    hang = pd.Series("KHAC", index=clean.index)
    for cond, val in [
        (
            clean["tourism"].eq("museum")
            | clean["building"].eq("museum")
            | c.chua(nn_c, r"bao tang|nha trung bay|nha truyen thong"),
            "BAO_TANG",
        ),
        (
            clean["amenity"].isin(["cinema", "theatre", "arts_centre"])
            | c.chua(nn_c, r"\brap (?:phim|chieu|hat)?\b|nha hat|san khau kich|\bcgv\b|cinema"),
            "RAP_PHIM_NHA_HAT",
        ),
        # NGHĨA TRANG đứng TRƯỚC cơ sở thờ tự: nghĩa trang giáo xứ mang `religion=christian`
        # nên trước đây rơi hết vào CO_SO_THO_TU. Nghĩa trang LIỆT SĨ chừa ra để rơi xuống
        # TUONG_NIEM.
        (
            (
                clean["amenity"].eq("grave_yard")
                | clean["landuse"].eq("cemetery")
                | c.chua_co_dau(nd_c, r"nghĩa trang|nghĩa địa|đất thánh")
            )
            & ~c.chua_co_dau(nd_c, r"liệt sĩ|liệt sỹ"),
            "NGHIA_TRANG",
        ),
        (
            clean["amenity"].eq("place_of_worship")
            | clean["religion_that"]
            | clean["building"].isin(THO_TU_BUILDING)
            | c.chua(nn_c, r"nha tho|thanh that|tinh xa|\btu vien\b")
            # Cùng quy tắc VỊ TRÍ như bước tuyển: âm tiết loại hình phải ĐỨNG ĐẦU cụm.
            | c.chua_co_dau(nd_c, r"(?:\bchùa\b|\bđình\b|\bđền\b|\bmi[ếễ]u\b)(?=\s+\w)"),
            "CO_SO_THO_TU",
        ),
        (
            clean["historic"].notna()
            | clean["co_heritage"]
            | c.chua(nn_c, r"di tich|thanh co|hoang thanh|van mieu|cot co"),
            "DI_TICH",
        ),
        (
            clean["historic"].isin(["memorial", "monument"])
            | c.chua(
                nn_c,
                r"dai tuong niem|dai liet si|tuong dai|nha bia|nghia trang liet si|den liet si",
            ),
            "TUONG_NIEM",
        ),
        (clean["tourism"].eq("artwork"), "TAC_PHAM_CONG_CONG"),
        (
            clean["natural"].isin(TQ_NATURAL)
            | c.chua(nn_c, r"bai bien|\bbeach\b|hang dong|thac \b|suoi khoang|thang canh|danh lam"),
            "CANH_QUAN_TU_NHIEN",
        ),
        (
            clean["tourism"].isin(
                ["attraction", "viewpoint", "zoo", "aquarium", "theme_park", "gallery"]
            )
            | clean["man_made"].eq("lighthouse")
            | c.chua(nn_c, r"diem tham quan|khu du lich|\bkdl\b"),
            "DIEM_THAM_QUAN_KHAC",
        ),
        (
            clean["amenity"].isin(["library"])
            | c.chua(
                nn_c,
                r"thu vien|trung tam van hoa|nha van hoa|cung van hoa|nha thieu nhi|cung thieu nhi",
            ),
            "THIET_CHE_VAN_HOA",
        ),
    ]:
        hang[cond & hang.eq("KHAC")] = val
    clean["hang_tq"] = hang

    lt = pd.Series(None, index=clean.index, dtype=object)
    for ten, rx in LOAI_THO_TU:
        lt[clean["hang_tq"].eq("CO_SO_THO_TU") & c.chua_co_dau(nd_c, rx) & lt.isna()] = ten
    clean["loai_tho_tu"] = lt

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
        f"poi_thamquan_{scope}_b1.parquet": b1,
        f"poi_thamquan_{scope}_b3.parquet": b3,
        f"poi_thamquan_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_thamquan_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_thamquan.parquet": con_lai,
        "_params": {
            "dat_tay": {"N_LANG_DA_NGU": N_LANG_DA_NGU, "N_LANG_VUNG": N_LANG_VUNG},
            "hoc_tu_du_lieu": {},
            "do_duoc": {
                "chuong_re2_n_dinh": n_dinh,
                "chuong_re2_nguong": nguong_dinh,
                "ty_le_ten_khong_dau": round(float(poi["ten_khong_dau"].mean()), 4),
                "suc_hut": final["suc_hut"].value_counts().to_dict(),
            },
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot, "chuong_dinh": n_dinh},
    }
