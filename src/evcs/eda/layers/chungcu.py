"""LỚP 1 — chung cư + khu đô thị. Port đẳng cấu của `notebooks/eda_chungcu.ipynb`.

Đọc THẲNG bộ gốc `data/qa/critique/poi_extended_<scope>.parquet` (lớp duy nhất không đọc
`con_lai` của lớp trước) và ghi `con_lai` không hậu tố — di sản của notebook đầu tiên.

Artefact: `poi_chungcu_<scope>.parquet` (b1, tên không hậu tố — cũng là di sản),
`_b3`, `_b3_bi_xoa`, `_final`, `poi_extended_<scope>_con_lai.parquet`, và
`poi_morph_review_<scope>.parquet` (món nợ bàn giao xuống lớp 9).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ — mọi ngưỡng của lớp gom lên đây, GIỮ NGUYÊN giá trị của notebook.
# Cột "học từ dữ liệu?" ghi trong comment vì nó quyết định ngưỡng nào được phép chỉnh.
# ═══════════════════════════════════════════════════════════════════════════════

AREA_MIN, AREA_MAX = 300, 20_000  # m² — dải mặt bằng của MỘT toà. ĐẶT TAY (bước 4A).
HA_MIN, HA_MAX = 5, 300  # ha — dải quy mô một KĐT thật. HỌC TỪ DỮ LIỆU (bước 5A).
NB_MIN = 10  # số công trình bên trong để xác nhận KĐT. HỌC TỪ DỮ LIỆU (5D):
#             nhóm tên nói "khu đô thị" trung vị 4, p75 = 13; nhóm vô danh p90 = 1
#             ⇒ mốc 10 nằm gọn giữa hai phân bố.
HA_MIN_XN, HA_MAX_XN = 5, 300  # ha — bản sao của HA_MIN/HA_MAX dùng ở 5D. Notebook khai
#                                hai lần bằng hai tên; giữ nguyên cả hai để không giấu đi
#                                việc chúng có thể trôi khỏi nhau.
MORPH_LEVELS_MIN = 8  # tầng — ngưỡng "toà cao" của nhóm bàn giao. ĐẶT TAY.
# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (20) hiệu chỉnh trên bộ vào 11.397 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 20 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 20 / 11_397  # ≈ 0.1755% bộ vào
SAN_XUNG_DOT = 20  # sàn: scope nhỏ không bị siết chặt hơn notebook
CTX_HOST_HA_MAX = 300  # ha — trần host KĐT khi tuyển bồi. Cùng gốc HA_MAX.
KDT_NB_COMPLEX = 2  # công trình — "một toà không chứa được hai toà" (4D). ĐẶT TAY.
KDT_SERVICE_MIN = 3  # dịch vụ — ngưỡng "CÓ RUỘT" khi chưa vẽ nhà (5B). ĐẶT TAY.
RING_SERVICE_MAX = 2  # dịch vụ ở vành đai — ngưỡng "MÙ OSM" (5B). ĐẶT TAY.
RING_HE_SO = 0.5  # vành đai dày ~nửa cạnh polygon (5B). ĐẶT TAY.

# Tên biến thể được nạp vào `name_norm` — TÊN CỦA CHÍNH VẬT THỂ.
KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

# Các khoá tag bung ở bước 1.
TAG_BUOC_1 = ("residential", "construction", "place")

# Các khoá tag bung thêm ở bước 3. `construction` lặp lại của bước 1 — chép nguyên.
TAG_BUOC_3 = (
    "highway",
    "public_transport",
    "man_made",
    "historic",
    "natural",
    "waterway",
    "power",
    "aeroway",
    "railway",
    "barrier",
    "craft",
    "construction",
)

# --- bước 1, nhánh A: tag cấu trúc ---
HOUSING_BUILDING = ["apartments", "residential", "dormitory", "terrace", "house"]
HOUSING_RESIDENTIAL = ["apartments", "dormitory", "block", "urban", "estate", "gated", "terrace"]
HOUSING_PLACE = ["neighbourhood", "quarter", "city_block"]
HOUSING_CONSTRUCTION = ["residential", "apartments", "dormitory", "terrace", "house"]

# --- bước 1, nhánh B: từ khoá tên (đã bỏ dấu) ---
# Danh sách brand chủ đầu tư là danh sách ĐÓNG, nghiêng Hà Nội — trần recall không đo được.
HOUSING_RX = (
    r"chung ?cu|\bchcc\b|cu xa|tap the|\bktt\b|cao oc|to hop|can ho|khu can ho|apartment|residence|residential|condo"
    r"|nha o xa hoi|noxh|tai dinh cu|\btdc\b|ky tuc xa|\bktx\b|dormitory"
    r"|nha cong vu|du an nha o|nha o can bo|khu biet thu|khu villa"
    r"|khu do thi|\bkdtm?\b|khu dan cu|\bkdc\b|khu nha o|\bcity\b|garden city|riverside"
    r"|\btower|\bthap\b|\btoa\b|\bblock\b|\bhh\d|\bct\d|\bn0\d"
    r"|vinhomes|masteri|ecopark|times city|royal city|goldmark|the manor|sunshine|gamuda"
    r"|ciputra|park hill|smart city|ocean park|celadon|midtown"
)

# --- bước 2: gán nhãn ---
A_TAG_BUILDING = ["apartments", "dormitory"]
A_TAG_RESIDENTIAL = ["apartments", "dormitory", "block", "terrace"]
A_TAG_CONSTRUCTION = ["apartments", "dormitory"]
B_NAME_RX = (
    r"chung ?cu|\bchcc\b|cu xa|tap the|\bktt\b|can ho|\bapartment|condo|residence|cao oc"
    r"|nha o xa hoi|noxh|tai dinh cu|\btdc\b|ky tuc xa|\bktx\b|dormitory"
)
C_CODE_RX = r"\bhh\d|\bct\d|\bn0\d"
D_KDT_RX = r"khu do thi|\bkdtm?\b|khu dan cu|\bkdc\b|khu nha o|garden city"
D_KDT_CONSTRUCTION = ["residential", "terrace", "house"]
E_SHAPE_RX = r"\btower|\bthap\b|\btoa\b|\bblock\b|riverside|to hop|\bcity\b"

# --- rà không gian âm (hình thái) ---
FUNC_KEYS = {
    "amenity",
    "shop",
    "office",
    "tourism",
    "leisure",
    "man_made",
    "historic",
    "highway",
    "public_transport",
    "railway",
    "power",
    "natural",
    "craft",
}

# --- cổng recall độc lập ---
BLACKLIST_BUILDING = {
    "church", "office", "commercial", "industrial", "retail", "school", "university", "hospital",
    "government", "warehouse", "train_station", "kiosk", "hut", "shed", "garage", "garages",
    "house", "roof", "construction", "service", "civic", "public", "temple", "mosque", "stadium",
    "hangar", "greenhouse", "farm", "barn", "transportation", "college", "kindergarten",
    "sports_hall", "supermarket", "bunker", "toilets", "carport", "hotel", "tower", "museum",
}  # fmt: skip

# --- bước 3: danh sách giá trị của các luật ---
BUILDING_OTHER_VALUES = [
    "church", "office", "commercial", "industrial", "retail", "school", "university",
    "hospital", "government", "warehouse", "train_station", "kiosk", "hut", "shed",
    "garage", "garages", "house", "roof", "construction", "service", "civic", "public",
    "temple", "mosque", "stadium", "hangar", "greenhouse", "farm", "barn",
    "transportation", "college", "kindergarten", "sports_hall", "supermarket",
    "bunker", "toilets", "carport", "hotel", "tower", "museum",
]  # fmt: skip
LANDUSE_OTHER_VALUES = [
    "industrial", "commercial", "retail", "cemetery", "construction", "forest",
    "farmland", "military", "religious", "quarry", "grass", "orchard", "meadow",
    "brownfield", "greenfield", "landfill", "allotments", "recreation_ground", "basin",
    "aquaculture", "farmyard", "plant_nursery", "salt_pond", "flowerbed", "paddy",
    "railway", "garages", "education", "reservoir",
]  # fmt: skip
PLACE_GEO_VALUES = [
    "island", "archipelago", "islet", "city", "town", "village", "hamlet", "suburb",
    "locality", "square", "county", "province", "municipality", "borough", "district",
    "region", "sea", "ocean",
]  # fmt: skip
KTX_POLYGON_RX = r"\bktx\b|ky tuc xa|tap the|cu xa"
LANDMARK_REF_RX = r"^(?:doi dien|truoc |he truoc|he doi dien|diem xen)"
NAME_OTHER_TYPE_RX = (
    r"\bnha tho\b|\bnha hang\b|\bnha tang le\b|\bnha thi dau\b|\bnha sach\b"
    r"|\bnha nuoc\b|\bnha van hoa\b|\bnha thieu nhi\b|\bnha khach\b|\bdai ly\b|\bdai li\b"
    r"|toa an|vien kiem sat|\bubnd\b|uy ban nhan dan|kho bac|lanh su quan"
    r"|dai su quan|thap truyen hinh|thap nuoc|cot co|nghia trang"
    r"|truong tieu hoc|truong thcs|truong thpt|truong mam non"
)
REGEX_SAI_RX = r"\bcondore?\b|\bcondom\b"

# --- bước 6: tuyển bồi theo không gian ---
CTX_FUNC_KEYS = {
    "amenity", "shop", "office", "tourism", "leisure", "man_made", "historic",
    "highway", "public_transport", "railway", "power", "natural", "craft",
}  # fmt: skip
CTX_BUILDING_OK = {"yes", "residential", "apartments", "dormitory", "terrace"}
IS_SERVICE_KEYS = {"amenity", "shop", "office", "leisure", "tourism"}

# Cột của artefact b1 — thứ tự này ĐI VÀO schema parquet, không đổi được.
COLS_B1 = [
    "uid", "osm_type", "osm_id", "is_area", "lat", "lng", "area_m2", "geometry_wkb", "h3_r8",
    "name", "name_norm",
    "building", "residential", "construction", "landuse", "place", "amenity", "shop", "office",
    "tourism", "leisure",
    "levels", "operator", "brand",
    "area_outlier", "dup_coord", "province_code", "province_name",
    "label", "evidence",
    "src_tag", "src_name", "src_code", "src_kdt", "src_shape", "src_manual",
    "n_tags", "tags", "tags_dict",
]  # fmt: skip

NHANH_SRC = ["src_tag", "src_name", "src_code", "src_kdt", "src_shape", "src_manual"]


def _co_tag_nha_o_cung(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng nhà ở CỨNG — dùng để cảnh báo khi một luật đang xoá quá tay."""
    return df["building"].isin(["apartments", "dormitory"]) | df["residential"].isin(
        ["apartments", "dormitory", "block"]
    )


def chay(poi: pd.DataFrame, *, scope: str, whitelist_uids: set[str] | None = None) -> dict:
    """Bóc lớp chung cư + khu đô thị khỏi bộ gốc.

    `poi` là bộ gốc đã có `tags_dict` (xem `common.doc_parquet`). Hàm KHÔNG ghi đĩa —
    trả về dict artefact để `run.py` quyết ghi ở đâu.
    """
    poi = poi.copy()
    whitelist_uids = whitelist_uids or set()

    # ── BƯỚC 1 — filter MỎNG, ưu tiên recall ────────────────────────────────
    c.them_uid(poi)
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1)
    poi["levels"] = pd.to_numeric(td.map(lambda t: t.get("building:levels")), errors="coerce")
    poi["rooms"] = pd.to_numeric(td.map(lambda t: t.get("rooms")), errors="coerce")
    poi["stars"] = td.map(lambda t: t.get("stars"))
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["brand"] = td.map(lambda t: t.get("brand"))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    name_norm = poi["name_norm"]

    # nhánh A: tag cấu trúc. `construction=residential|...` PHẢI tuyển — nguyên tắc của
    # bước này là KHÔNG BỎ SÓT; quyết định giữ/bỏ dự án đang xây là việc của bước 3.
    HOUSING_TAG = (
        poi["building"].isin(HOUSING_BUILDING)
        | poi["residential"].isin(HOUSING_RESIDENTIAL)
        | poi["landuse"].eq("residential")
        | poi["place"].isin(HOUSING_PLACE)
        | poi["construction"].isin(HOUSING_CONSTRUCTION)
    )
    HOUSING_NAME = c.chua(name_norm, HOUSING_RX)
    # nhánh W: whitelist duyệt tay — bằng chứng NGƯỜI, xếp trên mọi nhánh máy.
    WHITELIST = poi["uid"].isin(whitelist_uids)
    poi["is_housing"] = HOUSING_TAG | HOUSING_NAME | WHITELIST

    # Rà KHÔNG GIAN ÂM bằng HÌNH THÁI — tín hiệu ĐỘC LẬP với regex. Nhóm này LẪN toà văn
    # phòng, không auto-tuyển được ⇒ xuất đi duyệt tay, và là món nợ bàn giao xuống lớp 9.
    morph = (
        ~poi["is_housing"]
        & poi["building"].notna()
        & (poi["levels"] >= MORPH_LEVELS_MIN)
        & poi["is_area"]
        & poi["area_m2"].between(AREA_MIN, AREA_MAX)
        & ~td.map(lambda t: bool(FUNC_KEYS & t.keys()))
    )
    morph_review = poi.loc[morph]

    # ── CỔNG RECALL ĐỘC LẬP — dò phần BỊ LOẠI bằng tín hiệu KHÔNG nằm trong luật tuyển ──
    _bo = poi[~poi["is_housing"]]
    _bo_ten = _bo["name_norm"]
    _bo_tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="chungcu",
        scope=scope,
        dau_do_cung={
            "tag vòng đời = nhà ở": _bo_tags.map(
                lambda t: any(
                    k.split(":")[-1] in {"building", "landuse"}
                    and str(v) in {"apartments", "residential", "dormitory", "terrace"}
                    for k, v in t.items()
                )
            ),
            "tên: nhà ở công vụ/dự án": c.chua(_bo_ten, r"nha cong vu|du an nha o|nha o can bo"),
            "tên: khu biệt thự": c.chua(_bo_ten, r"khu biet thu|khu villa"),
            "tên: chung cư mini": c.chua(_bo_ten, r"chung cu mini|cc mini"),
        },
        dau_do_mem={
            "tên: apartment sai chính tả": c.chua(_bo_ten, r"appartment|apartement|aparment"),
            "hình thái: toà ≥8 tầng, building=yes": (
                _bo["building"].notna()
                & ~_bo["building"].isin(BLACKLIST_BUILDING)
                & (_bo["levels"] >= MORPH_LEVELS_MIN)
                & _bo["is_area"]
                & _bo["area_m2"].between(AREA_MIN, AREA_MAX)
            ),
        },
    )

    # ── BƯỚC 2 — gán nhãn CHUNG_CU / KHU_DO_THI / BO ────────────────────────
    housing = poi[poi["is_housing"]].copy()
    t = housing["name_norm"]

    A_TAG = (
        housing["building"].isin(A_TAG_BUILDING)
        | housing["residential"].isin(A_TAG_RESIDENTIAL)
        | housing["construction"].isin(A_TAG_CONSTRUCTION)
    )
    B_NAME = c.chua(t, B_NAME_RX)
    C_CODE = c.chua(t, C_CODE_RX)
    D_KDT = (
        c.chua(t, D_KDT_RX)
        | housing["landuse"].eq("residential")
        | housing["residential"].eq("urban")
        | housing["construction"].isin(D_KDT_CONSTRUCTION)
    )
    E_SHAPE = c.chua(t, E_SHAPE_RX)
    W_MANUAL = housing["uid"].isin(whitelist_uids)

    # Thứ tự gán = thứ tự ưu tiên. Toà hỗn hợp (chung cư + siêu thị / + văn phòng) rơi vào
    # A/B trước nên luôn được nhận là CHUNG_CU, bất kể có shop/office/amenity gì kèm theo.
    label = pd.Series("BO", index=housing.index)
    for cond, val in [
        (W_MANUAL, "CHUNG_CU"),
        (A_TAG | B_NAME, "CHUNG_CU"),
        (C_CODE, "CHUNG_CU"),
        (D_KDT, "KHU_DO_THI"),
        (E_SHAPE, "CHUNG_CU"),
    ]:
        label[cond & label.eq("BO")] = val
    housing["label"] = label

    # NGUỒN TUYỂN — dữ kiện "nhánh nào khớp", KHÔNG phải điểm tin cậy.
    housing["src_tag"] = A_TAG
    housing["src_name"] = B_NAME
    housing["src_code"] = C_CODE
    housing["src_kdt"] = D_KDT
    housing["src_shape"] = E_SHAPE
    housing["src_manual"] = W_MANUAL
    housing["evidence"] = np.select(
        [W_MANUAL, A_TAG, B_NAME | C_CODE | D_KDT],
        ["manual", "hard_tag", "explicit_name"],
        default="token_only",
    )

    # Cổng recall "vòng tròn": mọi dấu hiệu chung cư/KĐT phải nằm ngoài nhóm BO.
    khong_bo = ~housing["label"].eq("BO")
    c.cong_toan_ven(
        {
            "building=apartments": housing["building"].eq("apartments"),
            "building=dormitory": housing["building"].eq("dormitory"),
            "residential=apartments": housing["residential"].eq("apartments"),
            "residential=urban": housing["residential"].eq("urban"),
            "landuse=residential": housing["landuse"].eq("residential"),
            "tên 'chung cư'": c.chua(t, r"chung ?cu"),
            "tên 'CHCC'": c.chua(t, r"\bchcc\b"),
            "tên 'tập thể|cư xá'": c.chua(t, r"tap the|cu xa"),
            "tên 'tái định cư|TĐC'": c.chua(t, r"tai dinh cu|\btdc\b"),
            "tên 'KTX|ký túc xá'": c.chua(t, r"\bktx\b|ky tuc xa"),
            # neo biên: "can ho" trần khớp nhầm "Can Hoạch"
            "tên 'căn hộ|apartment'": c.chua(t, r"\bcan ho\b|\bapartment"),
            "tên 'nhà ở xã hội'": c.chua(t, r"nha o xa hoi|noxh"),
            "tên 'khu đô thị|KĐT|KĐTM'": c.chua(t, r"khu do thi|\bkdtm?\b"),
            "mã toà HH/CT/N0": C_CODE,
        },
        khong_bo,
        lop="chungcu",
    )

    candidates = housing[housing["label"].ne("BO")].copy()[COLS_B1]
    # Bản b1 GHI ĐĨA được chụp Ở ĐÂY, trước khi bước 3 bung thêm 11 khoá tag vào
    # `candidates`. Notebook ghi file ngay tại chỗ này rồi mới bung, nên b1 chỉ có 38 cột —
    # chụp muộn hơn là schema phình ra và lệch chuẩn vàng dù `set(uid)` vẫn khớp.
    b1 = candidates
    candidates = candidates.copy()

    # ── BƯỚC 3 — xoá cái CHẮC CHẮN SAI, 14 luật, chạy tuần tự ───────────────
    # Nguyên tắc: tag mô tả VẬT THỂ, tên chỉ mô tả MỐC THAM CHIẾU. Node `highway=bus_stop`
    # tên "Chung cư Ngô Gia Tự" vẫn là trạm buýt ⇒ tên KHÔNG được phép cứu tag.
    #
    # 14 luật GIAO HOÁN: mỗi điều kiện chỉ đọc thuộc tính bất biến của dòng, không luật nào
    # đọc kết quả của luật khác. Thứ tự chỉ quyết định `drop_reason` của dòng khớp NHIỀU
    # luật — nhưng vì thế nó vẫn không đổi được.
    c.bung_tags(candidates, TAG_BUOC_3)

    dc = c.DayChuyenLoc(
        candidates,
        ham_tha=lambda df: _co_tag_nha_o_cung(df) & df["is_area"],
        cot_co="mixed_use",
    )
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường. Luật ăn nhiều nhất của mọi lớp: 143 POI tên có "chung cư"
    # nằm ở đây, tất cả đều là TÊN TRẠM BUÝT lấy chung cư làm mốc.
    # `barrier` KHÔNG nằm trong luật này: `barrier=wall/fence` là tường rào QUANH khu.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — amenity: mọi giá trị đều là chức năng KHÁC chức năng ở.
    r = dc.con_lai
    dc.xoa(r["amenity"].notna(), "AMENITY_KHAC", tha=True)

    # LUẬT 3 — cửa hàng / văn phòng / xưởng thủ công. Bắt cả sàn giao dịch BĐS mang tên
    # dự án ("Chung Cư Sunshine Diamond River") — đó là văn phòng bán hàng.
    r = dc.con_lai
    dc.xoa(
        r["shop"].notna() | r["office"].notna() | r["craft"].notna(),
        "SHOP_OFFICE",
        tha=True,
    )

    # LUẬT 4 — leisure: công viên, sân bãi, phòng gym, bể bơi.
    r = dc.con_lai
    dc.xoa(r["leisure"].notna(), "LEISURE", tha=True)

    # LUẬT 5 — lưu trú. GIỮ LẠI `tourism=apartment` (căn hộ dịch vụ, chốt ở lớp 2).
    # NGOẠI LỆ KTX: OSM VN hay gắn `tourism=hostel` cho ký túc xá. Ở đây tên ĐƯỢC PHÉP cứu
    # tag vì chỉ tha POLYGON — với polygon, tên đang mô tả CHÍNH vật thể được vẽ.
    r = dc.con_lai
    KTX_POLYGON = r["is_area"] & c.chua(r["name_norm"], KTX_POLYGON_RX)
    dc.xoa(
        r["tourism"].notna() & r["tourism"].ne("apartment") & ~KTX_POLYGON,
        "LUU_TRU",
    )

    # LUẬT 6 — building nói thẳng đây là loại công trình khác. Áp KHÔNG điều kiện: tag nói
    # building này LÀ khách sạn thì tên "…Apartment" chỉ là thương hiệu kinh doanh.
    r = dc.con_lai
    dc.xoa(r["building"].isin(BUILDING_OTHER_VALUES), "BUILDING_KHAC")

    # LUẬT 6B — DỰ ÁN NHÀ Ở ĐANG XÂY. Đặt TRƯỚC luật landuse để có lý do loại RIÊNG: nhóm
    # này bị loại vì CHƯA CÓ CƯ DÂN, không phải vì "landuse sai".
    r = dc.con_lai
    dc.xoa(r["construction"].isin(HOUSING_CONSTRUCTION), "DU_AN_DANG_XAY")

    # LUẬT 7 — landuse không phải đất ở.
    r = dc.con_lai
    dc.xoa(r["landuse"].isin(LANDUSE_OTHER_VALUES), "LANDUSE_KHAC")

    # LUẬT 8 — công trình kỹ thuật & tự nhiên.
    r = dc.con_lai
    dc.xoa(
        r["man_made"].notna() | r["power"].notna() | r["waterway"].notna() | r["natural"].notna(),
        "CONG_TRINH_KY_THUAT",
    )

    # LUẬT 9 — di tích, tượng đài, bia tưởng niệm.
    r = dc.con_lai
    dc.xoa(r["historic"].notna(), "DI_TICH")

    # LUẬT 10 — place hành chính / địa lý. `neighbourhood`/`quarter`/`city_block` KHÔNG
    # nằm đây — đó là cách OSM map khu đô thị.
    r = dc.con_lai
    dc.xoa(r["place"].isin(PLACE_GEO_VALUES), "PLACE_DIA_LY")

    # LUẬT 11 — tên mở đầu bằng giới từ vị trí ⇒ POI là điểm mốc TRỎ TỚI chung cư.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], LANDMARK_REF_RX), "MOC_THAM_CHIEU")

    # LUẬT 12 — danh từ chính của tên nói thẳng đây là loại khác. KHÔNG có "cong an" /
    # "nha may": đó là CHỦ SỞ HỮU, không phải loại công trình.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], NAME_OTHER_TYPE_RX), "TEN_LOAI_KHAC")

    # LUẬT 13 — vá lỗi regex bước 1: `condo` không neo biên nên khớp "Poulo Condore".
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], REGEX_SAI_RX), "REGEX_SAI")

    # LUẬT 14 — brand CHUỖI BÁN LẺ. Chỉ xoá khi brand KHÔNG khớp regex tuyển nhà ở: bước 1
    # tuyển vào bằng chính brand chủ đầu tư, xoá trần thì nhóm chỉ-có-tên chết im lặng.
    r = dc.con_lai
    brand_norm = r["brand"].fillna("").map(c.strip_accents)
    dc.xoa(r["brand"].notna() & ~c.chua(brand_norm, HOUSING_RX), "BRAND")

    clean, removed = dc.ket()

    # Cổng hậu kiểm: cái bị xoá có mang bằng chứng nhà ở CỨNG không.
    _cf = removed[_co_tag_nha_o_cung(removed)]
    do_xung_dot = c.cong_xung_dot(
        len(_cf),
        len(candidates),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="chungcu",
        nhan="mang tag nhà ở cứng",
        df_pham=_cf,
        scope=scope,
    )

    # ── BƯỚC 4 — ĐO lớp CHUNG_CU (diện tích, ruột) ──────────────────────────
    apt = clean[clean["label"].eq("CHUNG_CU")].copy()
    apt["area_band"] = pd.cut(
        apt["area_m2"].where(apt["is_area"]),
        [0, AREA_MIN, AREA_MAX, np.inf],
        labels=["qua_nho", "hop_ly", "ca_khu"],
    )

    # Hạ tầng không gian dùng chung cho 4D / 4E / 5B — dựng MỘT lần, trên TOÀN bộ `poi`.
    chi_muc = c.ChiMucKhongGian(poi)
    IS_BUILDING = poi["building"].notna().values
    IS_SERVICE = poi["tags_dict"].map(lambda x: bool(IS_SERVICE_KEYS & x.keys())).values
    IS_APT = poi["uid"].isin(set(clean.loc[clean["label"].eq("CHUNG_CU"), "uid"])).values

    # 4D — polygon CHUNG_CU > 2 ha: có thật là KHU không, hay một toà vẽ rộng tay?
    # "Có POI bên trong" CHƯA đủ — bằng chứng CỨNG là nhiều CÔNG TRÌNH RIÊNG BIỆT.
    from shapely import wkb

    apt_big = apt[apt["is_area"] & (apt["area_m2"] > AREA_MAX)].copy()
    apt_big["ha"] = apt_big["area_m2"] / 1e4
    dem = []
    for i, w in zip(apt_big.index, apt_big["geometry_wkb"]):
        geom = wkb.loads(bytes(w))
        ben_trong = chi_muc.ben_trong(geom, self_uid=apt_big.at[i, "uid"])
        dem.append(
            (
                i,
                int(IS_BUILDING[ben_trong].sum()),
                int(IS_APT[ben_trong].sum()),
                int(IS_SERVICE[ben_trong].sum()),
            )
        )
    apt_big = apt_big.join(
        pd.DataFrame(dem, columns=["idx", "n_building", "n_apt", "n_service"]).set_index("idx")
    )
    la_khu = (apt_big["n_building"] >= KDT_NB_COMPLEX) | (apt_big["n_apt"] >= KDT_NB_COMPLEX)
    trong_ruot = ~la_khu & apt_big[["n_building", "n_apt", "n_service"]].sum(axis=1).eq(0)
    apt_big["verdict"] = np.select(
        [la_khu, trong_ruot],
        ["LÀ KHU — sai lớp", "trống ruột — chưa kết luận"],
        default="một toà, vẽ rộng",
    )

    # 4E — `geoms` dựng ở cell đo ngưỡng nhưng được DÙNG LẠI ở bước 6 (host tuyển bồi).
    geoms = c.nap_geom(apt[apt["is_area"]])

    # ── BƯỚC 5 — ĐO lớp KHU_DO_THI ──────────────────────────────────────────
    kdt = clean[clean["label"].eq("KHU_DO_THI")].copy()
    kdt["ha"] = kdt["area_m2"] / 1e4
    _t = kdt["name_norm"].fillna("")
    kdt["name_group"] = np.select(
        [
            c.chua(_t, r"khu do thi|\bkdtm?\b|garden city"),
            c.chua(_t, r"khu dan cu|\bkdc\b|khu nha o"),
            kdt["name"].notna(),
        ],
        ["tên nói 'khu đô thị'", "tên nói 'khu dân cư'", "có tên khác"],
        default="KHÔNG có tên",
    )

    # 5B — RUỘT + VÀNH ĐAI. "Rỗng" có HAI nguyên nhân khác hẳn nhau: chưa xây, và OSM chưa
    # vẽ. Vành đai cũng rỗng ⇒ vùng đó chưa ai map ⇒ sự vắng mặt KHÔNG phải bằng chứng.
    g = c.nap_geom(kdt)
    dem = []
    for i, geom in zip(g.index, g["_geom"]):
        ben_trong = chi_muc.ben_trong(geom, self_uid=g.at[i, "uid"])
        vanh = geom.buffer(np.sqrt(geom.area) * RING_HE_SO).difference(geom)
        vanh_trong = chi_muc.ben_trong(vanh)
        dem.append(
            (
                i,
                int(IS_BUILDING[ben_trong].sum()),
                int(IS_SERVICE[ben_trong].sum()),
                int(IS_BUILDING[vanh_trong].sum()),
                int(IS_SERVICE[vanh_trong].sum()),
            )
        )
    kdt = kdt.join(
        pd.DataFrame(
            dem, columns=["idx", "n_building", "n_service", "ring_building", "ring_service"]
        ).set_index("idx")
    )
    co_ruot = (kdt["n_building"] > 0) | (kdt["n_service"] >= KDT_SERVICE_MIN)
    mu_osm = ~co_ruot & kdt["ring_building"].eq(0) & (kdt["ring_service"] <= RING_SERVICE_MAX)
    kdt["status"] = np.select([co_ruot, mu_osm], ["CÓ RUỘT", "MÙ OSM"], default="RỖNG THẬT")

    # 5D — siết nhãn. KHÔNG đo thêm, chỉ dịch bằng chứng của 5A/5B thành nhãn.
    # TRẦN TRÊN là bắt buộc: không chặn thì "≥10 công trình" bị thoả chỉ vì polygon quá to.
    khai_ten = kdt["name_group"].isin(["tên nói 'khu đô thị'", "tên nói 'khu dân cư'"])
    du_quy_mo = kdt["ha"].between(HA_MIN_XN, HA_MAX_XN) & (kdt["n_building"] >= NB_MIN)
    qua_kho = kdt["is_area"] & (kdt["ha"] > HA_MAX_XN) & ~khai_ten
    kdt["kdt_class"] = np.select(
        [qua_kho, khai_ten | du_quy_mo, kdt["is_area"] & (kdt["ha"] < HA_MIN_XN)],
        ["NGHI_RANH_HANH_CHINH", "KDT_XAC_NHAN", "DAT_O"],
        default="KHONG_KET_LUAN",
    )

    # ── BƯỚC 6 — FINAL: b3 + cờ bước 4–5 + TUYỂN BỒI theo không gian ────────
    final = clean.copy()
    final = final.join(apt_big["verdict"])
    final = final.join(apt["area_band"])
    final = final.join(kdt[["name_group", "status", "kdt_class", "n_building", "n_service"]])

    # container_uid: duyệt polygon từ TO xuống NHỎ — mỗi dòng nhận container sát nhất.
    container = c.gan_container(geoms, chi_muc, IS_APT)
    final["container_uid"] = final["uid"].map(container)
    final.loc[final["label"].ne("CHUNG_CU"), "container_uid"] = None
    final["context_host_uid"] = None

    # F_CONTEXT — tuyển bồi: building thường nằm TRONG polygon đã xác nhận. Bằng chứng là
    # VỊ TRÍ, độc lập với tag lẫn tên. Hai chốt an toàn, thiếu là hỏng cả lớp:
    #   1. building phải thuộc nhóm Ở-TẬP-TRUNG-ĐƯỢC (nếu không, cả xóm nhà liền kề thành
    #      chung cư);  2. host KĐT chặn ≤ 300 ha (polygon "to bằng cả xã" là ranh hành chính).
    PLAIN = (
        ~poi["is_housing"]
        & poi["building"].isin(CTX_BUILDING_OK)
        & ~poi["tags_dict"].map(lambda x: bool(CTX_FUNC_KEYS & x.keys()))
    ).values

    kdt_hosts = g[
        g["name_group"].isin(["tên nói 'khu đô thị'", "tên nói 'khu dân cư'"])
        & (g["ha"] <= CTX_HOST_HA_MAX)
    ]
    recruit_host: dict[str, str] = {}
    recruit_container: dict[str, str] = {}
    for host_df, la_host_apt in [
        (kdt_hosts.sort_values("area_m2", ascending=False), False),  # host to quét trước,
        (geoms.sort_values("area_m2", ascending=False), True),  # host nhỏ/cụ thể ghi đè sau
    ]:
        for i, geom in host_df["_geom"].items():
            host_uid = host_df.at[i, "uid"]
            ben_trong = chi_muc.ben_trong(geom, self_uid=host_uid)
            for j in ben_trong[PLAIN[ben_trong]]:
                recruit_host[chi_muc.uid[j]] = host_uid
                if la_host_apt:
                    recruit_container[chi_muc.uid[j]] = host_uid

    recruits = poi[poi["uid"].isin(recruit_host)].copy()
    recruits["label"] = "CHUNG_CU"
    recruits["evidence"] = "context"
    for col in NHANH_SRC:
        recruits[col] = False
    recruits["context_host_uid"] = recruits["uid"].map(recruit_host)
    recruits["container_uid"] = recruits["uid"].map(recruit_container)
    recruits = recruits.reindex(columns=final.columns)

    final = pd.concat([final, recruits])

    # fragment_group: tính SAU tuyển bồi.
    final["fragment_group"] = c.nhom_manh(
        final, final["label"].eq("CHUNG_CU") & final["name"].notna()
    )

    # ── BƯỚC 7 — bộ CÒN LẠI ─────────────────────────────────────────────────
    con_lai = c.con_lai_sau(poi, final)
    thieu = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu:
        raise AssertionError(f"mất {thieu} dòng bị luật xoá khỏi bộ còn lại")

    return {
        f"poi_morph_review_{scope}.parquet": morph_review,
        f"poi_chungcu_{scope}.parquet": b1,
        f"poi_chungcu_{scope}_b3.parquet": clean,
        f"poi_chungcu_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_chungcu_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai.parquet": con_lai,
        "_params": {
            "dat_tay": {
                "AREA_MIN": AREA_MIN,
                "AREA_MAX": AREA_MAX,
                "MORPH_LEVELS_MIN": MORPH_LEVELS_MIN,
                "KDT_NB_COMPLEX": KDT_NB_COMPLEX,
                "KDT_SERVICE_MIN": KDT_SERVICE_MIN,
                "RING_SERVICE_MAX": RING_SERVICE_MAX,
            },
            "hoc_tu_du_lieu": {"HA_MIN": HA_MIN, "HA_MAX": HA_MAX, "NB_MIN": NB_MIN},
            "do_duoc": {
                "n_morph_ban_giao": len(morph_review),
                "n_tuyen_boi_context": int(final["evidence"].eq("context").sum()),
                "kdt_class": final["kdt_class"].value_counts(dropna=True).to_dict(),
                "verdict": final["verdict"].value_counts(dropna=True).to_dict(),
                "status": final["status"].value_counts(dropna=True).to_dict(),
            },
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot},
    }
