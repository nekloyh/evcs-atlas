"""LỚP 2 — lưu trú ngắn ngày (khách sạn, nhà nghỉ, resort, homestay).

Port đẳng cấu của `notebooks/eda_luutru.ipynb`. Đọc `poi_extended_<scope>_con_lai.parquet`.

Đặc thù lớp này: **KHÔNG có khiên tag.** Notebook đã GỠ cơ chế "dòng mang tag lưu trú cứng
thì được tha khỏi mọi luật", vì tag OSM VN sai quá nhiều ("Circle K" mang `tourism=hotel`).
Nguyên tắc thay thế: **TÊN QUYẾT ĐỊNH CẢ HAI CHIỀU** — mọi luật đều giao với `~CO_TU_HANG`.
Cột `mixed_use` vì thế là hằng `False`, giữ lại cho schema downstream không vỡ.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

SAO_LON, PHONG_LON, TANG_LON = 3, 40, 7
#   3 sao  — ĐẶT TAY, là mốc hành chính của phân hạng lưu trú VN
#   40 phòng — HỌC TỪ DỮ LIỆU: trung vị số phòng của nhóm tự khai `khách sạn`
#   7 tầng — ĐẶT TAY (proxy hình thái, xem bảng lift ở bước 2)
HA_VUNG = 50  # ha — trên mức này polygon là VÙNG, không phải một cơ sở. ĐẶT TAY, nằm giữa
#               p95 và p99 của phân bố diện tích polygon lưu trú.
NGUONG_DI_THUONG = 2  # lần trung vị — ngưỡng "tỉnh có tỷ lệ `tourism=apartment` bất thường".
#                       HỌC TỪ DỮ LIỆU (tính từ chính bảng tỷ lệ, không hardcode tên tỉnh).
MA_KHAO_SAT_MIN_SO = 9  # chữ số ở đuôi tên — dấu vân tay của đợt nhập liệu hàng loạt.
N_TAGS_THOAI_HOA = 3  # hồ sơ "thoái hoá" = ≤ 3 tag. ĐẶT TAY.

KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

LODGING_VALUES_CORE = {"hotel", "hostel", "motel", "guest_house", "resort", "chalet", "love_hotel"}

TAG_BUOC_1 = ("tourism", "building", "leisure", "amenity", "construction")
TAG_BUOC_3 = (
    "highway", "public_transport", "railway", "aeroway", "man_made", "historic",
    "natural", "waterway", "power", "barrier", "craft", "office", "shop", "landuse", "sport",
)  # fmt: skip

# --- bước 1, nhánh A: tag chức năng ---
LODGING_TOURISM = [
    "hotel", "hostel", "motel", "guest_house", "apartment", "chalet", "resort",
    "villa", "alpine_hut", "wilderness_hut", "camp_site", "caravan_site", "love_hotel",
]  # fmt: skip
LODGING_BUILDING = ["hotel", "guest_house"]
LODGING_LEISURE = ["resort", "beach_resort"]
LODGING_AMENITY = ["love_hotel", "hostel", "motel_month"]
LODGING_CONSTRUCTION = ["hotel", "hostel", "motel", "guest_house", "resort", "chalet"]

# --- bước 1, nhánh B: tên, nhóm theo HẠNG (cách gọi là tín hiệu quy mô mạnh nhất) ---
LODGING_RX = (
    r"khach san|\bks\b|\bhotel\b|\bhotels\b|khach xa"
    r"|nha nghi|nha khach|\bmotel\b|quan tro|nghi chan"
    r"|homestay|home stay|hostel|guest ?house|\binn\b|backpacker"
    r"|resort|nghi duong|nghi mat|khu du lich|\bkdl\b|bungalow|farmstay|ecolodge|\blodge\b"
    r"|condotel|can ho dich vu|serviced apartment|apart ?hotel|hometel"
    r"|\bvillas?\b|biet thu|\bresidence inn\b"
)

# --- bước 1, nhánh C: chuỗi khách sạn. Neo biên BẮT BUỘC — `lotte` khớp 161 dòng mà chỉ 3
# có tag lưu trú (Lotteria, Lotte Department Store); `melia` khớp "Ca-melia".
HOTEL_CHAIN_RX = (
    r"muong thanh|vinpearl|\bmelia\b|accor|novotel|marriott|sheraton|intercontinental"
    r"|best western|\bibis\b|pullman|sofitel|hilton|hyatt|radisson|wyndham|anantara"
    r"|movenpick|silk path|\ba25\b|\bnesta\b|furama|banyan tree|six senses|amanoi"
    r"|regent|centara|lotte hotel|lotte legend|fusion (?:maia|suites|resort|originals)"
)

# --- trục 1: HẠNG theo tên. Gán từ hạng CAO xuống THẤP, hạng cao thắng khi tên nhiều từ ---
HANG = [
    ("resort / nghỉ dưỡng", r"resort|nghi duong|nghi mat|khu du lich|\bkdl\b|bungalow|farmstay"),
    ("khách sạn", r"khach san|\bks\b|\bhotel\b|khach xa"),
    ("căn hộ DV / condotel", r"condotel|can ho dich vu|serviced apartment|apart ?hotel|hometel"),
    ("villa / biệt thự", r"\bvillas?\b|biet thu"),
    ("homestay / hostel", r"homestay|home stay|hostel|guest ?house|backpacker|\binn\b"),
    ("nhà nghỉ / nhà khách", r"nha nghi|nha khach|\bmotel\b|quan tro"),
]
HANG_MAC_DINH = "(tên không nói hạng)"

# TẤM KHIÊN của bước 3. PHẢI hẹp hơn `LODGING_RX`: lấy nguyên regex tuyển làm khiên thì
# "Pizza Inn", "Mekong Inn" (`\binn\b`), "Backpackers Bar" được miễn trừ khỏi luật ăn uống.
# Loại khỏi khiên: `inn` · `villa/biệt thự` · `lodge` · `residence` · `retreat`.
HANG_RX_CHAC = (
    r"khach san|\bks\b|\bhotel\b|\bhotels\b|khach xa"
    r"|nha nghi|nha khach|\bmotel\b|quan tro"
    r"|homestay|home stay|hostel|guest ?house"
    r"|resort|nghi duong|nghi mat|bungalow|farmstay"
    r"|condotel|can ho dich vu|serviced apartment|apart ?hotel|hometel"
)

PROBE_FUNC_KEYS = {
    "amenity", "shop", "office", "tourism", "leisure", "man_made", "historic",
    "highway", "public_transport", "railway", "power", "craft", "healthcare",
}  # fmt: skip

# --- bước 3: danh sách của từng luật ---
KDL_RX = r"khu du lich|\bkdl\b|lang du lich"
AN_UONG_AMENITY = [
    "restaurant", "cafe", "fast_food", "bar", "pub", "food_court", "ice_cream", "biergarten",
    "nightclub", "casino", "bureau_de_change", "atm", "parking", "community_centre", "school",
    "place_of_worship", "ferry_terminal", "fuel", "toilets", "bench", "bicycle_rental",
]  # fmt: skip
AN_UONG_RX = (
    r"nha hang|\bquan an\b|\bquan com\b|\bquan nhau\b|\bquan oc\b|\bcafe\b|\bcf\b|ca phe|coffee"
    r"|\beatery\b|karaoke|\bmassage\b|\bspa\b|bia hoi|\blau \b|buffet|tra sua|\bpho \b|com tam"
    r"|chao vit|\boc dem\b|be thui|can tin|bep an|\bpizza\b|\bbbq\b|\bgrill\b"
    r"|\bnuong\b|hai san|\bkem\b|\bbanh \b|\bbun \b|\bmi \b|\bchao \b"
)
BAN_LE_RX = (
    r"sieu thi|cua hang|\bshowroom\b|\btap hoa\b|\bdai ly \b|\bgroup\b|cong ty|\bcty\b"
    r"|san bat dong san|\bstore\b|\bphoto\b|cay xang"
)
# Neo biên bắt buộc: "tro" trần khớp "Trở", "Trợ" — chỉ dùng cụm hai từ.
NHA_TRO_RX = r"nha tro|phong tro|khu tro|cho thue phong|\bktx\b|ky tuc xa"
DI_TICH_TOURISM = [
    "attraction", "museum", "artwork", "viewpoint", "information", "theme_park",
    "zoo", "aquarium", "gallery", "picnic_site",
]  # fmt: skip
KHU_O_RX = r"khu (?:biet thu|villas?|nha biet thu|do thi|dan cu)"
BUILDING_GIU = {
    "hotel", "guest_house", "yes", "apartments", "residential", "house", "terrace",
    "bungalow", "cabin", "hut", "detached", "dormitory", "roof", "construction",
}  # fmt: skip
TEN_LOAI_KHAC_RX = (
    r"benh vien|phong kham|\bubnd\b|uy ban nhan dan|\bcong an\b|toa an|vien kiem sat|kho bac"
    r"|buu dien|\bngan hang\b|nha may|xi nghiep|\bkcn\b|khu cong nghiep|tram thu phi|\btba\b"
    r"|tram bien ap|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc|cao dang|nghe)"
    r"|\btram y te\b|nha tang le|tiec cuoi|nha tho (?:to|ho|dong)"
)
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao"
    r"|ngo vao|loi vao|qua san)"
)

# Luật được miễn khỏi bất biến hậu kiểm — ranh giới lớp, hoặc "tên là mốc" có bằng chứng
# CẤU TRÚC (hạ tầng) thắng được cái tên.
LUAT_CO_Y = {
    "LUU_TRU_DAI_HAN", "KHU_DU_LICH", "DI_TICH_THAM_QUAN", "KHU_O_KHONG_LUU_TRU",
    "TAG_SAI_HE_THONG", "HA_TANG_DUONG", "MOC_THAM_CHIEU",
}  # fmt: skip


def _co_tag_luu_tru_cung(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng lưu trú CỨNG — chỉ dùng để ĐO tag OSM sai tới đâu, KHÔNG còn là khiên.

    `stars` CỐ Ý không nằm ở đây dù nó là nhánh D của bước 1: OSM VN dùng `stars` cho cả
    xếp hạng NHÀ HÀNG. Đủ tốt để TUYỂN, không đủ để MIỄN TRỪ.
    """
    return (
        df["tourism"].isin(
            {
                "hotel", "hostel", "motel", "guest_house", "resort", "chalet", "villa",
                "apartment", "love_hotel", "alpine_hut", "wilderness_hut", "camp_site",
                "caravan_site",
            }
        )
        | df["building"].isin(["hotel", "guest_house"])
        | df["leisure"].isin(["resort", "beach_resort"])
        | df["amenity"].isin(["love_hotel", "hostel"])
        | df["construction"].isin(LODGING_CONSTRUCTION)
        | df["lifecycle_lodging"]
    )  # fmt: skip


def chay(poi: pd.DataFrame, *, scope: str) -> dict:
    poi = poi.copy()

    # ── BƯỚC 1 — filter MỎNG ────────────────────────────────────────────────
    c.them_uid(poi)
    td = poi["tags_dict"]
    # HẠ CHỮ bắt buộc: dữ liệu có `tourism=Villa` viết hoa — khớp thẳng vào danh sách chữ
    # thường sẽ trượt im lặng.
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)
    poi["stars"] = td.map(lambda t: t.get("stars"))
    # tag VÒNG ĐỜI (`disused:tourism=hotel`): khách sạn đã đóng cửa. Bước 1 vẫn phải tuyển.
    poi["lifecycle_lodging"] = td.map(
        lambda t: any(
            ":" in k and k.split(":")[-1] == "tourism" and str(v).lower() in LODGING_VALUES_CORE
            for k, v in t.items()
        )
    )
    poi["rooms"] = pd.to_numeric(td.map(lambda t: t.get("rooms")), errors="coerce")
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["brand"] = td.map(lambda t: t.get("brand"))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    name_norm = poi["name_norm"]

    LODGING_TAG = (
        poi["tourism"].isin(LODGING_TOURISM)
        | poi["building"].isin(LODGING_BUILDING)
        | poi["leisure"].isin(LODGING_LEISURE)
        | poi["amenity"].isin(LODGING_AMENITY)
        # KHÁCH SẠN ĐANG XÂY — không đọc `construction` thì "Wyndham Soleil Danang" biến mất.
        | poi["construction"].isin(LODGING_CONSTRUCTION)
        | poi["lifecycle_lodging"]
    )
    LODGING_NAME = c.chua(name_norm, LODGING_RX)
    # Quét chuỗi khách sạn trên CẢ TÊN, không chỉ brand/operator: "Wyndham Soleil Danang"
    # không có chữ "hotel" nào trong tên.
    chain_text = (
        poi["brand"].fillna("") + " " + poi["operator"].fillna("") + " " + poi["name_norm"]
    ).map(c.strip_accents)
    LODGING_CHAIN = c.chua(chain_text, HOTEL_CHAIN_RX)
    LODGING_STARS = poi["stars"].notna()

    poi["is_lodging"] = LODGING_TAG | LODGING_NAME | LODGING_CHAIN | LODGING_STARS

    # ── CỔNG RECALL ĐỘC LẬP ─────────────────────────────────────────────────
    _bo = poi[~poi["is_lodging"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="luutru",
        scope=scope,
        dau_do_cung={
            "tag vòng đời lưu trú": _tags.map(
                lambda t: any(
                    k.split(":")[-1] in {"tourism", "building", "construction"}
                    and str(v).lower() in LODGING_VALUES_CORE
                    for k, v in t.items()
                )
            ),
            "brand/operator là chuỗi khách sạn": c.chua(
                _bo["brand"].fillna("").add(" " + _bo["operator"].fillna("")).map(c.strip_accents),
                HOTEL_CHAIN_RX,
            ),
            "tự khai hạng sao (stars)": _bo["stars"].notna(),
        },
        dau_do_mem={
            # `addr:housename` mô tả TOÀ NHÀ CHỨA: Starbucks trong khách sạn vẫn là Starbucks.
            "addr:housename là KS (đơn vị THUÊ bên trong)": _tags.map(
                lambda t: (
                    bool(
                        re.search(
                            r"hotel|resort|khach san",
                            c.strip_accents(str(t.get("addr:housename", ""))),
                        )
                    )
                    and not re.search(
                        r"hotel|resort|khach san", c.strip_accents(str(t.get("name", "")))
                    )
                )
            ),
            "có rooms=* (trường học khai số phòng học)": _bo["rooms"].notna(),
            "tên có lodge/camping/house": c.chua(_ten, r"\blodge\b|camping|glamping|\bhouse\b"),
            "nhà trọ / phòng trọ — lưu trú DÀI HẠN": c.chua(_ten, r"nha tro|phong tro|khu tro"),
            # Đầu dò HÌNH THÁI: không đọc tag lưu trú, không đọc lexicon tên, không đọc brand.
            # Gần nhất với một phép đo recall thật — nhưng `building:levels` phủ quá thấp ở VN
            # nên xếp MỀM.
            "HÌNH THÁI: ≥5 tầng, vô danh, không tag chức năng": (
                pd.to_numeric(_tags.map(lambda t: t.get("building:levels")), errors="coerce").ge(5)
                & _bo["name"].isna()
                & ~_tags.map(lambda t: bool(PROBE_FUNC_KEYS & t.keys()))
            ),
        },
    )

    # ── b1: tập tuyển + hạng theo tên ───────────────────────────────────────
    lodging = poi[poi["is_lodging"]].copy()
    hang = pd.Series(HANG_MAC_DINH, index=lodging.index)
    for ten, rx in HANG:
        hang[c.chua(lodging["name_norm"], rx) & hang.eq(HANG_MAC_DINH)] = ten
    lodging["hang_ten"] = hang
    b1 = lodging.copy()  # ghi đĩa TẠI ĐÂY, trước 5 cột hồ sơ của bước 2

    # ── BƯỚC 2 — cột hồ sơ dùng cho hiệu chuẩn quy mô ───────────────────────
    lodging["levels"] = pd.to_numeric(
        lodging["tags_dict"].map(lambda t: t.get("building:levels")), errors="coerce"
    )
    lodging["stars_n"] = pd.to_numeric(lodging["stars"], errors="coerce")
    lodging["n_lang"] = lodging["tags_dict"].map(
        lambda t: sum(1 for k in t if k.startswith("name:"))
    )
    lodging["co_web"] = lodging["tags_dict"].map(
        lambda t: any(k in t for k in ("website", "contact:website", "url"))
    )
    lodging["co_addr"] = lodging["tags_dict"].map(lambda t: any(k.startswith("addr:") for k in t))

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    candidates = lodging.copy()
    c.bung_tags(candidates, TAG_BUOC_3, ha_chu=True)

    CO_TU_HANG = c.chua(candidates["name_norm"], HANG_RX_CHAC)

    dc = c.DayChuyenLoc(candidates, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường. Node `highway=bus_stop` tên "Khách sạn Kim Liên" là TÊN TRẠM.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — "KHU DU LỊCH" KHÔNG phải cơ sở lưu trú. Ranh giới lớp, chuyển sang lớp THAM
    # QUAN. Bước 1 tuyển chúng vì regex có "khu du lich" — đó là lỗi của bước 1.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], KDL_RX) & ~CO_TU_HANG.reindex(r.index, fill_value=False),
        "KHU_DU_LICH",
    )

    # LUẬT 3 — ĂN UỐNG / GIẢI TRÍ ĐÊM. Luật nguy hiểm nhất: 173/198 dòng có từ ăn uống trong
    # tên VẪN mang tag lưu trú cứng (87%) ⇒ chỉ xoá khi tên KHÔNG mang từ hạng lưu trú nào.
    r = dc.con_lai
    dc.xoa(
        (r["amenity"].isin(AN_UONG_AMENITY) | c.chua(r["name_norm"], AN_UONG_RX)) & ~CO_TU_HANG,
        "AN_UONG_GIAI_TRI",
    )

    # LUẬT 4 — BÁN LẺ / VĂN PHÒNG. Bắt cái bẫy của nhánh C: brand chuỗi khách sạn khớp ĐÚNG
    # TẬP ĐOÀN nhưng SAI LOẠI HÌNH ("Siêu thị Mường Thanh", "Pullman - W.M. Store").
    r = dc.con_lai
    dc.xoa(
        (
            r["shop"].notna()
            | r["office"].notna()
            | r["craft"].notna()
            | c.chua(r["name_norm"], BAN_LE_RX)
        )
        & ~CO_TU_HANG,
        "BAN_LE_VAN_PHONG",
    )

    # LUẬT 5 — LƯU TRÚ DÀI HẠN (nhà trọ, KTX). Lớp này là lưu trú NGẮN NGÀY.
    r = dc.con_lai
    dc.xoa(
        (c.chua(r["name_norm"], NHA_TRO_RX) | r["amenity"].eq("motel_month"))
        & ~CO_TU_HANG.reindex(r.index, fill_value=False),
        "LUU_TRU_DAI_HAN",
    )

    # LUẬT 6 — LEISURE không phải lưu trú: các mảnh của một tập đoàn nghỉ dưỡng map thành POI
    # riêng ("Vinpearl Golf Haiphong"). `resort`/`beach_resort` KHÔNG nằm đây — đó là nhánh A.
    r = dc.con_lai
    dc.xoa(
        r["leisure"].notna()
        & ~r["leisure"].isin(LODGING_LEISURE)
        & ~CO_TU_HANG.reindex(r.index, fill_value=False),
        "LEISURE_KHAC",
    )

    # LUẬT 7 — DI TÍCH / ĐIỂM THAM QUAN. Dinh thự cổ nay là bảo tàng vẫn mang chữ "Biệt thự".
    r = dc.con_lai
    dc.xoa(
        r["tourism"].isin(DI_TICH_TOURISM)
        | r["historic"].notna()
        | (r["building"].eq("manor") & r["tourism"].isna()),
        "DI_TICH_THAM_QUAN",
    )

    # LUẬT 8 — KHU BIỆT THỰ / KHU Ở, không phải villa cho thuê. ĐO ĐƯỢC 0 ở 7 tỉnh: cả 10
    # dòng kiểu này đã bị LUẬT 1 bắt vì là TRẠM BUÝT. Giữ làm lưới an toàn cho SCOPE="vn".
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], KHU_O_RX) & ~CO_TU_HANG.reindex(r.index, fill_value=False),
        "KHU_O_KHONG_LUU_TRU",
    )

    # LUẬT 9 — building nói thẳng đây là loại công trình khác. Miễn trừ theo TÊN, không theo
    # `tourism`: `tourism` ở OSM VN không đáng tin hơn `building` chút nào.
    r = dc.con_lai
    dc.xoa(
        r["building"].notna()
        & ~r["building"].isin(BUILDING_GIU)
        & ~CO_TU_HANG.reindex(r.index, fill_value=False),
        "BUILDING_KHAC",
    )

    # LUẬT 10 — tên nói thẳng là loại khác. Neo biên chặt: "truong " trần khớp "Nhà Nghỉ
    # Trường Thuỷ" — đó là TÊN RIÊNG.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], TEN_LOAI_KHAC_RX) & ~CO_TU_HANG, "TEN_LOAI_KHAC")

    # LUẬT 11 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    # LUẬT 12 — CỤM TAG SAI HỆ THỐNG (bước 3B). Không phải mọi nhiễu đều ngẫu nhiên: một đợt
    # khảo sát ở Bình Phước cũ gắn `tourism=apartment` cho quán ăn, cây xăng, trạm biến áp.
    # Đầu dò chính là MÃ KHẢO SÁT ở đuôi tên — không phụ thuộc tỉnh nên còn đúng ở SCOPE="vn".
    # Vùng dị thường TÍNH TỪ DỮ LIỆU (2× trung vị của chính bảng tỷ lệ), không hardcode tỉnh.
    r = dc.con_lai
    _ap = candidates["tourism"].eq("apartment")
    tong_tinh = poi["province_name"].value_counts()
    ty_le = (
        (candidates.loc[_ap, "province_name"].value_counts() / tong_tinh * 100)
        .dropna()
        .sort_values(ascending=False)
    )
    MA_KHAO_SAT = c.chua(r["name"].fillna(""), rf"-\d{{{MA_KHAO_SAT_MIN_SO},}}")
    HO_SO_THOAI_HOA = (
        r["tourism"].eq("apartment")
        & ~r["is_area"]
        & r["n_tags"].le(N_TAGS_THOAI_HOA)
        & ~r["co_addr"]
        & ~CO_TU_HANG
        & r["province_name"].isin(ty_le[ty_le > NGUONG_DI_THUONG * ty_le.median()].index)
    )
    dc.xoa(MA_KHAO_SAT | HO_SO_THOAI_HOA, "TAG_SAI_HE_THONG")

    clean, removed = dc.ket()

    # CỔNG HẬU KIỂM — bất biến: KHÔNG dòng nào có TỪ HẠNG lưu trú trong tên được phép bị một
    # luật NGOÀI Ý xoá. Tên là trọng tài duy nhất.
    ten_khai_hang = c.chua(removed["name_norm"], HANG_RX_CHAC)
    vi_pham = removed[ten_khai_hang & ~removed["drop_reason"].isin(LUAT_CO_Y)]
    if len(vi_pham):
        raise AssertionError(
            f"{len(vi_pham)} dòng tên tự khai hạng lưu trú bị luật NGOÀI Ý xoá — quá tay"
        )

    # Bản b3 GHI ĐĨA chụp TẠI ĐÂY — notebook ghi file ngay sau cổng hậu kiểm, rồi bước 4 mới
    # bồi thêm cột vào cùng biến `clean`. Chụp muộn hơn là schema b3 phình ra.
    b3 = clean.copy()

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    # 4A — dịch bằng chứng bước 2 thành nhãn quy mô.
    tu_khai = clean["stars_n"].notna() | clean["rooms"].notna() | clean["levels"].notna()
    lon_tu_khai = (
        clean["stars_n"].ge(SAO_LON) | clean["rooms"].ge(PHONG_LON) | clean["levels"].ge(TANG_LON)
    )
    clean["quy_mo"] = np.select(
        [tu_khai & lon_tu_khai, tu_khai & ~lon_tu_khai, ~tu_khai & clean["is_area"]],
        ["LON_TU_KHAI", "NHO_TU_KHAI", "LON_SUY_TU_HINH_THAI"],
        default="KHONG_DO_DUOC",
    )
    clean["quy_mo_nguon"] = np.select(
        [tu_khai, clean["is_area"]], ["tu_khai", "hinh_thai"], default="khong_co"
    )

    # 4B — ĐẾM CƠ SỞ, KHÔNG ĐẾM DÒNG. Các way nhỏ vô danh `leisure=resort` nằm gọn trong một
    # resort lớn là bungalow con của CÙNG MỘT cơ sở, không phải 19 cơ sở.
    chi_muc = c.ChiMucKhongGian(clean)
    vung = c.nap_geom(clean[clean["is_area"]])
    clean["container_uid"] = clean["uid"].map(
        c.gan_container(vung, chi_muc, np.ones(len(clean), dtype=bool))
    )
    clean["fragment_group"] = c.nhom_manh(clean, clean["name"].notna())

    # 4C — polygon quá TO thì là ranh giới VÙNG, không phải một cơ sở lưu trú.
    clean["verdict"] = np.where(
        clean["is_area"] & clean["area_m2"].gt(HA_VUNG * 1e4), "VUNG_KHONG_PHAI_CO_SO", None
    )
    # Nhóm CHƯA KẾT LUẬN: `tourism=apartment` hồ sơ mỏng. Ghi CỜ chứ không ép nhãn — rủi ro
    # bất đối xứng: gán nhầm nhà riêng thành lưu trú sẽ thổi phồng cầu sạc ở khu dân cư.
    KHONG_RO = (
        clean["tourism"].eq("apartment")
        & ~c.chua(clean["name_norm"], LODGING_RX)
        & ~clean["is_area"]
    )
    clean.loc[KHONG_RO & clean["verdict"].isna(), "verdict"] = "CAN_HO_CHUA_KET_LUAN"

    # ── BƯỚC 5 — FINAL + bộ CÒN LẠI ─────────────────────────────────────────
    final = clean.copy()
    con_lai = c.con_lai_sau(poi, final)
    thieu = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu:
        raise AssertionError(f"mất {thieu} dòng bị luật xoá khỏi bộ còn lại")

    return {
        f"poi_luutru_{scope}_b1.parquet": b1,
        f"poi_luutru_{scope}_b3.parquet": b3,
        f"poi_luutru_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_luutru_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_luutru.parquet": con_lai,
        "_params": {
            "dat_tay": {
                "SAO_LON": SAO_LON,
                "TANG_LON": TANG_LON,
                "HA_VUNG": HA_VUNG,
                "N_TAGS_THOAI_HOA": N_TAGS_THOAI_HOA,
            },
            "hoc_tu_du_lieu": {
                "PHONG_LON": PHONG_LON,
                "NGUONG_DI_THUONG_lan_trung_vi": NGUONG_DI_THUONG,
                "ty_le_apartment_theo_tinh_pct": {k: round(float(v), 4) for k, v in ty_le.items()},
                "trung_vi_pct": round(float(ty_le.median()), 4),
                "nguong_di_thuong_pct": round(float(NGUONG_DI_THUONG * ty_le.median()), 4),
                "tinh_bi_coi_la_di_thuong": sorted(
                    ty_le[ty_le > NGUONG_DI_THUONG * ty_le.median()].index.tolist()
                ),
            },
        },
        "_do": {"recall": do_recall},
    }
