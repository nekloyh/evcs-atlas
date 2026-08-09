"""LỚP 3 — thương mại (TTTM, siêu thị, chợ, showroom, cửa hàng chuyên ngành lớn).

Port đẳng cấu của `notebooks/eda_thuongmai.ipynb`. Đọc `..._con_lai_sau_luutru.parquet`.

Ba đặc thù, không lớp nào khác có:
  · `shop=*` LÀ một thang bậc thật, tự kiểm bằng diện tích ⇒ ngưỡng học từ dữ liệu;
  · THỪA KẾ THEO THƯƠNG HIỆU — quy mô học từ vài điểm bán có polygon rồi truyền cho node
    trần cùng brand. Lớp nhà ở thừa kế theo VỊ TRÍ, lớp này theo DANH TÍNH;
  · `chợ` phải bắt bằng tên CÒN DẤU (`name_dau`), vì `strip_accents` gộp "chợ" với "cho".

Lớp duy nhất dùng THƯỚC NGOÀI: vị trí trạm sạc thật ở `store/p/*/stations.parquet`.
"""

from __future__ import annotations

import glob

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

DT_LON = 1_000  # m² — ranh giới "bán lẻ loại lớn". ĐẶT TAY, có luận chứng: dưới mức đó tập
#                 nở ra bằng cửa hàng phố; trên 1.500 thì mất `supermarket`. 2D xác nhận lại
#                 bằng phép đo độc lập (khe giữa p90 chuỗi nhỏ và p10 chuỗi lớn).
DO_PHU_TOI_THIEU = 0.15  # tỷ lệ polygon tối thiểu để tin trung vị diện tích của một bậc.
#                          ĐẶT TAY — cổng sửa lỗi gốc "trung vị không kèm ĐỘ PHỦ".
BAC_N_TOI_THIEU = 20  # dòng — bậc `shop` phải đủ lớn mới vào bảng đo. ĐẶT TAY.
TOI_THIEU_DO = 3  # điểm bán đo được diện tích, để học định dạng một thương hiệu. ĐẶT TAY —
#                   thiếu chốt này thì một polygon vẽ sai kéo cả chuỗi theo.
NGUONG_GAN = 100.0  # m — "gần trạm sạc". ĐẶT TAY.
R_TRAI_DAT = 6_371_000.0
# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (12) hiệu chỉnh trên bộ vào 20.287 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 12 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 12 / 20_287  # ≈ 0.0592% bộ vào
SAN_XUNG_DOT = 12  # sàn: scope nhỏ không bị siết chặt hơn notebook
#                       là 8, ngưỡng đặt sát để assert thật sự có răng.

KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

TAG_BUOC_1 = (
    "shop", "amenity", "landuse", "building", "office", "leisure", "tourism", "craft",
    "highway", "public_transport", "railway", "aeroway", "man_made", "historic",
    "natural", "waterway", "power", "healthcare", "barrier", "military",
)  # fmt: skip

# Họ amenity thuộc LỚP KHÁC — dùng để loại khỏi đầu dò, không phải để chối bỏ chúng.
AMENITY_NGOAI_LOP = [
    "fuel", "bank", "atm", "bureau_de_change", "post_office", "restaurant", "cafe",
    "fast_food", "bar", "pub", "ice_cream", "food_court", "pharmacy", "car_wash",
    "car_rental", "charging_station", "parking",
    # THIẾT BỊ ĐẶT NHỜ ĐỊA ĐIỂM: vật thể là THIẾT BỊ, cái tên là ĐỊA ĐIỂM CHỦ
    # ("TNGo - Bảo tàng Chiến thắng B52"). Chặn theo TAG để khỏi đuổi theo từng thương hiệu.
    "bicycle_rental", "vending_machine", "parcel_locker",
]  # fmt: skip

# Neo biên mọi token ngắn: `mall` trần khớp "Small", `go` trần khớp mọi thứ.
TM_RX = (
    r"trung tam thuong mai|\btttm\b|\bttm\b|trung tam mua sam|thuong xa"
    r"|sieu thi|\bsupermarket\b|dai sieu thi|\bhypermarket\b"
    r"|showroom|\bshow room\b|trung bay san pham"
    r"|\bplaza\b|\bmall\b|shopping cent|trung tam bach hoa|bach hoa tong hop"
)
CHAIN_RX = (
    r"\bvincom\b|\baeon\b|lotte mart|lotte department|\bbig ?c\b|\bgo!|mega market|\bmm mega\b"
    r"|co\.?op ?mart|co\.?op ?xtra|\bsatra\b|\bbach hoa xanh\b|\bwinmart\b|\bvinmart\b"
    r"|\bemart\b|\bnguyen kim\b|\bdien may xanh\b|\bthe gioi di dong\b|\bfpt shop\b"
    r"|\bparkson\b|\btrang tien plaza\b|\bcrescent mall\b|\bvivo ?city\b|\bsc vivocity\b"
    r"|\bvinfast\b|\bhonda\b|\btoyota\b|\bmazda\b|\bkia\b|\bford\b|\bmercedes\b|\bhyundai\b"
    r"|\bfamilymart\b|\bcircle ?k\b|\bgs25\b|\bministop\b|\bsatrafoods\b|\bco\.?op ?food\b"
)
TM_BUILDING = ["retail", "supermarket", "mall", "kiosk"]
RETAIL_LIFECYCLE_VALUES = {
    "supermarket",
    "mall",
    "department_store",
    "convenience",
    "retail",
    "yes",
}
CUA_HANG_RX = r"cua hang|dai ly |sieu thi mini"

CHUOI_NHO_RX = (
    r"circle ?k|\bgs ?25\b|family ?mart|mini ?stop|ministop|7[- ]?eleven|b'?s ?mart"
    r"|shop ?& ?go|\bcheers\b|vinshop|winmart ?\+|vinmart ?\+|winmart plus"
    r"|bach hoa xanh|\bbhx\b|co\.?op ?food|satra ?food"
)
CHUOI_LON_RX = (
    r"co\.?op ?mart|co\.?op ?xtra|\bbig ?c\b|(?<!&)\bgo!|mega market|\bmm mega\b"
    r"|\bemart\b|lotte ?mart|lotte department|\baeon\b|\bvincom\b|\bparkson\b"
    r"|crescent mall|vivo ?city|trang tien plaza"
)
# "Plaza"/"Tower" trong tiếng Việt là hậu tố TOÀ NHÀ, không phải loại hình.
TOA_NHA_RX = r"toa nha|\btower\b|van phong|\boffice\b|tiec cuoi|hoi nghi|can ho|chung cu"
DINH_DANG_NHO_RX = (
    r"tap hoa|tien loi|\bmini\b|mini ?(?:mart|stop|shop|market)|\bkiosk\b|ki ?-?ot|tu chon"
)
KHO_RX = r"\bkho\b|kho hang|warehouse|trung tam phan phoi"

INFRA_BUILDING = ["train_station", "transportation", "bus_station"]
# Neo biên `\b` BẮT BUỘC: `nha tro` không neo thì khớp bên trong "nhà TRỒng".
INFRA_TEN_RX = r"^ga |\bnha ga\b|\bben xe\b|\bphong tro\b|\bnha tro\b"
SHOP_DICH_VU_VALUES = [
    "hairdresser", "beauty", "massage", "laundry", "dry_cleaning", "tattoo", "copyshop",
    "travel_agency", "funeral_directors", "estate_agent", "insurance", "money_lender",
    "pawnbroker", "ticket", "photo", "tailor", "shoe_repair", "car_repair",
    "motorcycle_repair", "bicycle_repair", "repair", "locksmith", "vacant", "storage_rental",
]  # fmt: skip
AMENITY_LOP_DA_BOC = [
    "school", "kindergarten", "college", "university", "driving_school", "childcare",
    "police", "fire_station", "townhall", "courthouse", "prison", "embassy",
    "place_of_worship", "clinic", "hospital", "doctors", "dentist",
    "library", "community_centre", "social_facility", "public_building",
    # `amenity=cinema` là nguyên liệu của lớp THAM QUAN (lớp 5). Giữ lại là CƯỚP DÒNG lớp sau.
    "cinema", "theatre", "arts_centre",
]  # fmt: skip
MIEN_SIEU_THI_RX = (
    r"nha sach|dien may|noi that|vat lieu xay dung|\bvlxd\b|showroom|trang suc|\bsach\b"
)
TEN_LOAI_KHAC_RX = (
    r"benh vien|phong kham|\bubnd\b|uy ban nhan dan|\bcong an\b|toa an|kho bac|buu dien"
    r"|\bngan hang\b|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc|cao dang)"
    r"|nha tho|\bchua \b|\bdinh \b|tram y te|khach san|nha nghi|\bbai do xe\b|\bnha xe\b"
    r"|tram xang|cay xang|xang dau|nha may |xi nghiep|\bxuong \b"
)
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)

# --- bước 4A: nhãn loại hình ---
BRAND_HANG = {
    "TTTM": r"\bvincom\b|\baeon\b|lotte department|\bparkson\b|crescent mall|vivo ?city|\bsc ?vivo",
    # `bach hoa xanh`/`satrafoods` BỎ khỏi đây: chúng là minimart (đo 308 và 187 m²).
    "SIEU_THI": r"\bwinmart\b(?! ?\+)|\bvinmart\b(?! ?\+)|co\.?op ?mart|co\.?op ?xtra|\bbig ?c\b"
    r"|(?<!&)\bgo!|mega market|\bemart\b|lotte mart|\bsatra mart\b",
    "SHOWROOM": r"\bhonda\b|\btoyota\b|\bford\b|\bmazda\b|\bkia\b|\bhyundai\b|\bmercedes\b"
    r"|\bvinfast\b|\byamaha\b|\bsuzuki\b|\bnissan\b|\bmitsubishi\b|\bpiaggio\b"
    r"|\bhead \b|nguyen kim|dien may xanh|the gioi di dong",
}
CN_SHOP_VALUES = [
    "books", "electronics", "furniture", "doityourself", "hardware", "trade",
    "bathroom_furnishing", "kitchen", "bed", "houseware", "interior_decoration",
]  # fmt: skip
CN_TEN_RX = r"nha sach|dien may|noi that|vat lieu xay dung|\bvlxd\b"
ST_SHOP_VALUES = ["supermarket", "wholesale", "greengrocer", "general"]
SHOWROOM_SHOP_VALUES = ["car", "motorcycle", "car_parts", "tyres"]
TTTM_MANH_RX = r"trung tam thuong mai|\btttm\b|thuong xa|trung tam mua sam"
TTTM_YEU_RX = r"\bplaza\b|\bmall\b"

LUAT_CO_Y = {
    "BAN_LE_NHO", "MAY_BAN_TU_DONG", "DICH_VU_KHONG_BAN_LE", "O_DAT_VO_DANH",
    "NHA_PHO_BUILDING_RETAIL", "DINH_DANG_NHO", "SIEU_THI_KHONG_BANG_CHUNG",
}  # fmt: skip


def _co_tag_ban_le_lon(df: pd.DataFrame, bac_lon: set) -> pd.Series:
    """Bằng chứng bán lẻ QUY MÔ LỚN — tag hoặc thừa kế thương hiệu, KHÔNG phải tên.

    ⚠ NGUYÊN BẢN NOTEBOOK CÓ MÃ CHẾT SAU `return` NÀY và bản port giữ nguyên hành vi.
    Trong notebook, sau câu `return (...)` còn hai khối `k &= ~df["dinh_dang_nho"]` (quyền
    phủ quyết của ĐỊNH DẠNG NHỎ) và `k |= (...)` (cứu ngược `department_store`) — cả hai
    KHÔNG BAO GIỜ CHẠY. Chuẩn vàng vì thế được sinh ra bởi đúng ba nhánh dưới đây. Không
    "sửa lại cho đúng ý comment": sửa là lệch chuẩn vàng. Đã ghi vào báo cáo port.

    Loại trừ `AMENITY_NGOAI_LOP` CHỈ áp cho nhánh thừa kế thương hiệu, không áp cho cả tấm
    khiên — cái cần chặn là `Petrolimex` học ra bậc LỚN từ sân cây xăng rộng.
    """
    return (
        df["shop"].isin(bac_lon)
        | df["amenity"].eq("marketplace")
        | (df["brand_tier"].eq("LON") & ~df["amenity"].isin(AMENITY_NGOAI_LOP))
    )


def chay(poi: pd.DataFrame, *, scope: str) -> dict:
    poi = poi.copy()
    cot_vao = list(poi.columns.drop("tags_dict"))

    # ── BƯỚC 1 — filter MỎNG ────────────────────────────────────────────────
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)  # HẠ CHỮ: dữ liệu có `shop=Supermarket`
    poi["brand"] = td.map(lambda t: t.get("brand"))
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["levels"] = pd.to_numeric(td.map(lambda t: t.get("building:levels")), errors="coerce")
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    # TÊN CÒN DẤU — bắt buộc ở lớp này: "chợ" và "cho" là hai từ khác hẳn nhau mà
    # `strip_accents` gộp làm một. `astype(object)` để `.str.contains` dùng `re` của Python.
    poi["name_dau"] = poi["name"].fillna("").astype(object).str.lower()
    name_norm = poi["name_norm"]

    RETAIL_TAG = (
        poi["shop"].notna()
        | poi["amenity"].isin(["marketplace", "department_store", "vending_machine"])
        # `service:vehicle:*` — dấu vân tay của SHOWROOM ô tô, không mang tag `shop` nào.
        | td.map(lambda t: any(k.startswith("service:vehicle:") for k in t))
    )
    TM_NAME = c.chua(name_norm, TM_RX) | c.chua_co_dau(poi["name_dau"], r"\bchợ\b")
    chain_text = (
        poi["brand"].fillna("") + " " + poi["operator"].fillna("") + " " + poi["name_norm"]
    ).map(c.strip_accents)
    TM_CHAIN = c.chua(chain_text, CHAIN_RX)
    # `landuse=commercial` CỐ Ý không nằm đây: đó là ô đất DỊCH VỤ-VĂN PHÒNG, nhận vào là
    # nuốt trước phần của lớp văn phòng.
    TM_DAT = poi["landuse"].eq("retail") | poi["building"].isin(TM_BUILDING)
    TM_VONG_DOI = td.map(
        lambda t: any(
            ":" in k
            and k.split(":")[-1] in {"shop", "building"}
            and str(v).lower() in RETAIL_LIFECYCLE_VALUES
            for k, v in t.items()
        )
    ) | td.map(
        lambda t: str(t.get("construction", "")).lower() in {"retail", "supermarket", "mall"}
    )
    # Nhánh F sinh ra từ chính ĐẦU DÒ CỨNG của cổng recall 2 ở vòng trước.
    TM_CUA_HANG = (
        c.chua(name_norm, CUA_HANG_RX)
        & poi["brand"].notna()
        & ~poi["amenity"].isin(AMENITY_NGOAI_LOP)
    )

    poi["is_tm"] = RETAIL_TAG | TM_NAME | TM_CHAIN | TM_DAT | TM_VONG_DOI | TM_CUA_HANG

    c.cong_toan_ven(
        {
            "shop=mall": poi["shop"].eq("mall"),
            "shop=department_store": poi["shop"].eq("department_store"),
            "shop=supermarket": poi["shop"].eq("supermarket"),
            "shop=convenience": poi["shop"].eq("convenience"),
            "shop=car (showroom)": poi["shop"].eq("car"),
            "amenity=marketplace": poi["amenity"].eq("marketplace"),
            "landuse=retail": poi["landuse"].eq("retail"),
            "tên 'trung tâm thương mại'": c.chua(name_norm, r"trung tam thuong mai|\btttm\b"),
            "tên 'siêu thị'": c.chua(name_norm, r"sieu thi"),
            "tên 'chợ' (còn dấu)": c.chua_co_dau(poi["name_dau"], r"\bchợ\b"),
            "tên 'showroom'": c.chua(name_norm, r"showroom"),
            "brand chuỗi bán lẻ": TM_CHAIN,
        },
        poi["is_tm"],
        lop="thuongmai",
    )

    # ── CỔNG RECALL ĐỘC LẬP ─────────────────────────────────────────────────
    # ⚠ Nợ đã đo: CHỈ 1/3 ĐẦU DÒ CỨNG THẬT SỰ SỐNG. Đầu dò 2 là tautology (33/33 dòng nó bắt
    # đều do nhánh F tuyển, mà F sinh ra từ chính điều kiện đó); đầu dò 3 chạm 2 dòng.
    _bo = poi[~poi["is_tm"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    # ĐẦU DÒ 1 — NHẤT QUÁN THEO THƯƠNG HIỆU: một thương hiệu là MỘT doanh nghiệp. Nếu lớp đã
    # nhận phần lớn điểm bán của nó thì một điểm bán cùng brand nằm ngoài lớp là LỖ THỦNG.
    _b = poi[poi["brand"].notna()].assign(_sel=poi["is_tm"])
    _bst = _b.groupby("brand").agg(n=("_sel", "size"), ty_le=("_sel", "mean"))
    _brand_cua_lop = _bst[(_bst["n"] >= 5) & (_bst["ty_le"] >= 0.6)].index
    do_recall = c.cong_recall(
        df=_bo,
        lop="thuongmai",
        scope=scope,
        dau_do_cung={
            # `& ~amenity.isin(AMENITY_NGOAI_LOP)` — CHỐT MÀ ĐẦU DÒ #2 ĐÃ CÓ TỪ ĐẦU còn đầu
            # dò này thì quên. Chỉ SCOPE=vn mới lộ ra, vì ở 7 tỉnh không có ca nào:
            # `way:1461459946` (Hưng Yên) là một BƯU ĐIỆN — `amenity=post_office`,
            # `operator=Vietnam Post` — nhưng mang `brand=Viettel Store`. 26/27 outlet
            # "Viettel Store" khác là `shop=mobile_phone`, nên brand này được tính là brand
            # CỦA LỚP, và dòng bưu điện kia bị gọi là "lỗ thủng".
            # Nó KHÔNG phải lỗ thủng: `post_office` nằm trong `AMENITY_NGOAI_LOP` — lớp này
            # CỐ Ý nhường nhóm đó cho lớp dịch vụ công. Đây là bẫy "thuộc tính của VẬT CHỨA
            # gắn lên vật được chứa" (đo: 11/11 dòng `post_office` có brand đều vậy — DHL,
            # VinMart, Giaohangtietkiem). Nghe theo đầu dò là vừa nuốt nhầm một bưu điện vừa
            # CƯỚP DÒNG của lớp sau — đúng họ lỗi `co_wiki` mà `thamquan` đã trả giá.
            # Sửa ở ĐẦU DÒ, không ở luật tuyển: đầu dò là CỔNG, không sinh/xoá dòng nào, nên
            # thay đổi này không đụng được một dòng dữ liệu nào (parity 7tinh giữ nguyên).
            "nhất quán thương hiệu": _bo["brand"].isin(_brand_cua_lop)
            & ~_bo["amenity"].isin(AMENITY_NGOAI_LOP),
            "tên 'cửa hàng/đại lý' + có brand": (
                c.chua(_ten, r"cua hang|dai ly ")
                & _bo["brand"].notna()
                & ~_bo["amenity"].isin(AMENITY_NGOAI_LOP)
            ),
            "`shop` ở dạng tag vòng đời mà nhánh E bỏ lọt": _tags.map(
                lambda t: any(k.endswith(":shop") or k.startswith("shop:") for k in t)
            ),
        },
        dau_do_mem={
            "tên có 'chợ' nhưng đã bị loại": c.chua_co_dau(_bo["name_dau"], r"\bchợ\b"),
            "tên có 'shop/store'": c.chua(_ten, r"\bshop\b|\bstore\b"),
            "`amenity=fuel`": _bo["amenity"].eq("fuel"),
            "`amenity=bank`": _bo["amenity"].eq("bank"),
            "có `opening_hours` + `payment:*` mà không tag phân loại": _tags.map(
                lambda t: "opening_hours" in t and any(k.startswith("payment:") for k in t)
            )
            & _bo["amenity"].isna()
            & _bo["office"].isna()
            & _bo["tourism"].isna()
            & _bo["leisure"].isna(),
        },
    )

    tm = poi[poi["is_tm"]].copy()
    b1 = tm.copy()  # ghi đĩa TẠI ĐÂY, trước mọi cột của bước 2

    # ── BƯỚC 2 — hiệu chuẩn thang QUY MÔ ────────────────────────────────────
    # 2A — bậc `shop=*` cắt ở đâu. CỔNG ĐỘ PHỦ: trung vị diện tích KHÔNG phải bằng chứng nếu
    # nó tính trên một mẩu nhỏ của bậc (`department_store` chỉ 2,5% polygon).
    tm_shop = tm[tm["shop"].notna()]
    bac_dt = (
        tm_shop.groupby("shop")
        .agg(
            n=("shop", "size"),
            dt=("area_m2", lambda s: s[s > 0].median()),
            poly=("is_area", "mean"),
        )
        .dropna(subset=["dt"])
    )
    bac_dt = bac_dt[bac_dt["n"] >= BAC_N_TOI_THIEU].sort_values("dt", ascending=False)
    BAC_LON_DO = set(bac_dt[(bac_dt["dt"] >= DT_LON) & (bac_dt["poly"] >= DO_PHU_TOI_THIEU)].index)
    # `wholesale`/`trade` có n < 20 nên không lọt vào `bac_dt`; giữ bằng ĐỊNH NGHĨA.
    BAC_LON = BAC_LON_DO | {"wholesale", "trade"}

    # 2B — THỪA KẾ THEO THƯƠNG HIỆU. Chỉ học từ dòng KHÔNG thuộc họ amenity ngoài lớp: học
    # trên mọi dòng có brand thì `Petrolimex` (sân cây xăng rộng) được xếp bậc LỚN.
    _co_dt = tm["area_m2"] > 0
    _bt = tm[tm["brand"].notna() & ~tm["amenity"].isin(AMENITY_NGOAI_LOP)].copy()
    _bt["_dt"] = tm["area_m2"].where(_co_dt)
    hoc = _bt.groupby("brand").agg(n=("brand", "size"), n_do=("_dt", "count"), dt=("_dt", "median"))
    hoc = hoc[hoc["n_do"] >= TOI_THIEU_DO]
    hoc["tier"] = np.where(hoc["dt"] >= DT_LON, "LON", "NHO")
    tm["brand_tier"] = tm["brand"].map(hoc["tier"])
    tm["brand_n"] = tm["brand"].map(hoc["n"])
    tm["brand_dt"] = tm["brand"].map(hoc["dt"])

    # 2D — ĐỊNH DẠNG CHUỖI, thang BẤT ĐỐI XỨNG. Định dạng cửa hàng là quyết định của doanh
    # nghiệp, không phải của người map ⇒ tiên nghiệm NHỎ chắc hơn bất kỳ tag nào.
    _ct = (tm["brand"].fillna("") + " " + tm["operator"].fillna("") + " " + tm["name_norm"]).map(
        c.strip_accents
    )
    tm["la_chuoi_nho"] = c.chua(_ct, CHUOI_NHO_RX)
    tm["la_chuoi_lon"] = c.chua(_ct, CHUOI_LON_RX)
    # Ở nhóm chuỗi nhỏ, diện tích LỚN là dấu hiệu của LỖI MAP nhiều hơn là outlet lớn thật
    # ⇒ luật "trên ngưỡng thì giữ" phải loại KHO trước.
    LA_KHO = (
        c.chua(tm["name_norm"].map(c.strip_accents), KHO_RX)
        | tm["building"].eq("warehouse")
        | tm["landuse"].eq("industrial")
    )
    DU_LON_TU_DO = (tm["area_m2"].fillna(0) >= DT_LON) & ~LA_KHO
    TEN_TU_KHAI_NHO = c.chua(tm["name_norm"], DINH_DANG_NHO_RX)
    tm["dinh_dang_nho"] = (
        (tm["la_chuoi_nho"] | (TEN_TU_KHAI_NHO & tm["brand_tier"].ne("LON")))
        & ~DU_LON_TU_DO
        & ~tm["la_chuoi_lon"]
    )

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    candidates = tm.copy()
    khien = lambda df: _co_tag_ban_le_lon(df, BAC_LON)
    dc = c.DayChuyenLoc(candidates, ham_tha=khien, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường. "Ga Chợ Tía" mang `building=train_station` và lọt qua bốn cột
    # tag hạ tầng — nhà ga lấy tên chợ làm mốc, cùng họ nhưng ở một cột khác.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna()
        | r["building"].isin(INFRA_BUILDING)
        | c.chua(r["name_norm"], INFRA_TEN_RX),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — họ amenity thuộc LỚP KHÁC. `tha` bắt buộc: một TTTM mang thêm `amenity=cinema`
    # vẫn là TTTM.
    r = dc.con_lai
    dc.xoa(r["amenity"].isin(AMENITY_NGOAI_LOP), "AMENITY_LOP_KHAC", tha=True)

    # LUẬT 2b — amenity của lớp ĐÃ/SẼ bóc, lọt vào qua TÊN (lấy tên CHỢ làm mốc địa chỉ).
    r = dc.con_lai
    dc.xoa(r["amenity"].isin(AMENITY_LOP_DA_BOC), "AMENITY_LOP_DA_BOC", tha=True)

    # LUẬT 3 — DỊCH VỤ, không phải BÁN HÀNG. Tách khỏi BAN_LE_NHO vì lý do loại khác nhau:
    # nhóm này sai LOẠI HÌNH, nhóm kia đúng loại hình nhưng sai QUY MÔ.
    r = dc.con_lai
    dc.xoa(r["shop"].isin(SHOP_DICH_VU_VALUES), "DICH_VU_KHONG_BAN_LE")

    # LUẬT 4 — BÁN LẺ NHỎ. Luật ăn nhiều nhất và là RANH GIỚI PHẠM VI của cả lớp. Nhóm này
    # KHÔNG phải rác — tra `drop_reason == "BAN_LE_NHO"` là lấy lại được.
    r = dc.con_lai
    BAN_LE_NHO = (
        r["shop"].notna()
        & ~r["shop"].isin(BAC_LON)
        & ~r["brand_tier"].eq("LON")
        # tha polygon đủ to: `shop=clothes` 2.000 m² là cửa hàng flagship, không phải tiệm phố
        & ~(r["area_m2"].fillna(0) >= DT_LON)
    )
    dc.xoa(BAN_LE_NHO & ~khien(r), "BAN_LE_NHO")

    # LUẬT 4b — ĐỊNH DẠNG NHỎ (2D): đúng bậc tag nhưng ĐỊNH DẠNG doanh nghiệp là nhỏ.
    r = dc.con_lai
    dc.xoa(r["dinh_dang_nho"], "DINH_DANG_NHO")

    # LUẬT 4c — `supermarket` qua cổng độ phủ nhưng 81% là node trần ⇒ đòi bằng chứng thứ hai
    # cho RIÊNG node trần. Miễn trừ nhóm nói rõ loại hình chuyên ngành / là chợ.
    r = dc.con_lai
    _mien_st = c.chua(r["name_norm"], MIEN_SIEU_THI_RX) | c.chua_co_dau(
        r["name_dau"].fillna(""), r"\bchợ\b"
    )
    dc.xoa(
        r["shop"].eq("supermarket")
        & r["is_area"].ne(True)
        & ~c.chua(r["name_norm"], r"sieu thi|mart|market")
        & ~c.chua((r["brand"].fillna("") + " " + r["name_norm"]).map(c.strip_accents), CHUOI_LON_RX)
        & r["brand_tier"].ne("LON")
        & ~_mien_st,
        "SIEU_THI_KHONG_BANG_CHUNG",
    )

    # LUẬT 5 — MÁY BÁN HÀNG TỰ ĐỘNG. Bước 1 tuyển đúng tinh thần recall; đây là chỗ trả về.
    r = dc.con_lai
    dc.xoa(r["amenity"].eq("vending_machine"), "MAY_BAN_TU_DONG")

    # LUẬT 6 — Ô ĐẤT, không phải cơ sở. Có tên thì giữ — tên mô tả CHÍNH polygon được vẽ.
    r = dc.con_lai
    dc.xoa(
        r["landuse"].eq("retail") & r["name"].isna() & r["shop"].isna(),
        "O_DAT_VO_DANH",
    )

    # LUẬT 9 — CỤM MAP HÀNG LOẠT: một đợt map gắn `building=retail` cho cả dãy nhà mặt tiền
    # (trung vị 73 m² — mặt bằng NHÀ PHỐ). Cắt theo DIỆN TÍCH chứ không theo tỉnh, để
    # SCOPE="vn" vẫn đúng ở nơi không có cụm này.
    r = dc.con_lai
    dc.xoa(
        r["building"].isin(["retail", "commercial"])
        & r["shop"].isna()
        & r["amenity"].isna()
        & r["brand_tier"].isna()
        & r["is_area"]
        & r["area_m2"].lt(DT_LON),
        "NHA_PHO_BUILDING_RETAIL",
    )

    # LUẬT 7 — tên nói thẳng là loại khác. KHÔNG có "cho" trần: bỏ dấu thì "cho" nuốt cả "chợ".
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], TEN_LOAI_KHAC_RX) & ~khien(r), "TEN_LOAI_KHAC")

    # LUẬT 8 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    clean, removed = dc.ket()

    conflict = removed[khien(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="thuongmai",
        nhan="mang tag bán lẻ BẬC LỚN",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    # 4A — LOẠI HÌNH và QUY MÔ là hai câu hỏi khác nhau, tách thành hai cột.
    _bt_txt = (
        clean["brand"].fillna("") + " " + clean["operator"].fillna("") + " " + clean["name_norm"]
    ).map(c.strip_accents)
    nn_c = clean["name_norm"]
    _ten_cho = c.chua_co_dau(clean["name_dau"].fillna(""), r"\bchợ\b")
    # `department_store` KHÔNG còn tự động lên TTTM (cổng độ phủ ở 2A).
    _ds = clean["shop"].eq("department_store") & ~_ten_cho
    _tttm_manh = c.chua(nn_c, TTTM_MANH_RX)
    _tttm_yeu = c.chua(nn_c, TTTM_YEU_RX) & ~c.chua(nn_c, TOA_NHA_RX)
    _ten_st_thuan = c.chua(nn_c, r"sieu thi") & ~_ten_cho
    _C_TTTM = (clean["shop"].eq("mall") & ~_ten_cho) | _ds | _tttm_manh | _tttm_yeu
    _C_CN = clean["shop"].isin(CN_SHOP_VALUES) | c.chua(nn_c, CN_TEN_RX)
    _C_ST = clean["shop"].isin(ST_SHOP_VALUES) | c.chua(nn_c, r"sieu thi|\bsupermarket\b")

    hang = pd.Series("KHAC", index=clean.index)
    for cond, val in [
        (_C_TTTM, "TTTM"),
        # CHUYÊN NGÀNH xét TRƯỚC siêu thị: tên đầy đủ là "Siêu thị Điện máy Nguyễn Kim".
        (_C_CN, "CH_CHUYEN_NGANH"),
        # CHỢ xét TRƯỚC siêu thị: phép thử ngược của vòng 2.0 chạy trên cột dtype `str` ⇒ RE2
        # ⇒ `\bchợ\b` khớp 1 dòng thay vì 1.417, nên thiệt hại của nó VÔ HÌNH. Đo lại đúng:
        # đặt SIEU_THI trước cứu 5 dòng và làm hỏng 36 ⇒ lỗ ròng.
        ((clean["amenity"].eq("marketplace") | _ten_cho) & ~_ten_st_thuan, "CHO"),
        (_C_ST, "SIEU_THI"),
        (
            clean["shop"].isin(SHOWROOM_SHOP_VALUES)
            | c.chua(nn_c, r"showroom|\bshow room\b|trung bay san pham"),
            "SHOWROOM",
        ),
        # thừa kế loại hình theo THƯƠNG HIỆU, cho nhóm không mang `shop` nào
        (c.chua(_bt_txt, BRAND_HANG["TTTM"]), "TTTM"),
        (c.chua(_bt_txt, BRAND_HANG["SIEU_THI"]), "SIEU_THI"),
        (c.chua(_bt_txt, BRAND_HANG["SHOWROOM"]), "SHOWROOM"),
    ]:
        hang[cond & hang.eq("KHAC")] = val
    # Nhóm còn lại KHÔNG phải "rác": đã qua ngưỡng quy mô, chỉ là nguồn không nói loại hình.
    clean["hang_tm"] = hang.replace("KHAC", "BAN_LE_LON_CHUA_RO_LOAI")

    tu_do = clean["area_m2"].fillna(0) > 0
    clean["quy_mo_tm"] = np.select(
        [
            tu_do & clean["area_m2"].ge(DT_LON),
            tu_do & clean["area_m2"].lt(DT_LON),
            clean["brand_tier"].eq("LON"),
            clean["brand_tier"].eq("NHO"),
        ],
        ["LON_TU_DO", "NHO_TU_DO", "LON_THUA_KE_BRAND", "NHO_THUA_KE_BRAND"],
        default="KHONG_DO_DUOC",
    )
    clean["quy_mo_nguon"] = np.select(
        [tu_do, clean["brand_tier"].notna()], ["dien_tich", "thua_ke_brand"], default="khong_co"
    )

    # 4B — ĐẾM CƠ SỞ: các gian hàng bên trong một TTTM được map thành POI riêng.
    chi_muc = c.ChiMucKhongGian(clean)
    vung = c.nap_geom(clean[clean["is_area"]])
    clean["container_uid"] = clean["uid"].map(
        c.gan_container(vung, chi_muc, np.ones(len(clean), dtype=bool))
    )
    clean["fragment_group"] = c.nhom_manh(clean, clean["name"].notna())

    # 4C — THƯỚC NGOÀI: vị trí trạm sạc thật. Khử nhiễu mật độ bằng kỳ vọng của chính ô H3
    # chứa nó (leave-one-out) — trạm sạc tập trung ở lõi đô thị nên so thẳng với nền là so nhầm.
    # ⚠ Thước này đo "đã được phục vụ", KHÔNG đo "nên đặt trạm".
    from sklearn.neighbors import BallTree

    _fs = sorted(glob.glob(str(c.ROOT / "store/p/*/stations.parquet")))
    st = pd.concat([pd.read_parquet(f) for f in _fs], ignore_index=True)
    _tree = BallTree(np.radians(st[["lat", "lng"]].values), metric="haversine")

    def do_khoang_cach(df):
        return _tree.query(np.radians(df[["lat", "lng"]].values), k=1)[0][:, 0] * R_TRAI_DAT

    poi["d_tram"] = do_khoang_cach(poi)
    poi["near_tram"] = (poi["d_tram"] <= NGUONG_GAN).astype(float)
    _g = poi.groupby("h3_r8")["near_tram"].agg(["sum", "size"])
    _j = poi[["h3_r8"]].join(_g, on="h3_r8")
    poi["ky_vong_o"] = (_j["sum"] - poi["near_tram"]) / (_j["size"] - 1).clip(lower=1)

    clean["d_tram"] = do_khoang_cach(clean)
    clean["near_tram"] = (clean["d_tram"] <= NGUONG_GAN).astype(float)
    clean["ky_vong_o"] = poi.set_index("uid")["ky_vong_o"].reindex(clean["uid"]).values

    # ── BƯỚC 5 — FINAL + bộ CÒN LẠI ─────────────────────────────────────────
    final = clean.copy()
    con_lai = c.con_lai_sau(poi, final)
    thieu = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu:
        raise AssertionError(f"mất {thieu} dòng bị luật xoá khỏi bộ còn lại")

    # HỢP ĐỒNG BÀN GIAO — túi trao cho lớp sau phải có ĐÚNG bộ cột của túi nhận vào, không
    # hơn. Vòng trước mỗi lớp để lại biến công tác của mình: chuỗi phình 39 → 75 cột, và
    # `is_tm` đi tới tận `con_lai_cuoi` — một cái tên mời gọi đúng cách đọc SAI.
    con_lai_ra = con_lai.reindex(columns=cot_vao)

    return {
        f"poi_thuongmai_{scope}_b1.parquet": b1,
        f"poi_thuongmai_{scope}_b3.parquet": b3,
        f"poi_thuongmai_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_thuongmai_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_thuongmai.parquet": con_lai_ra,
        "_params": {
            "dat_tay": {
                "DT_LON": DT_LON,
                "DO_PHU_TOI_THIEU": DO_PHU_TOI_THIEU,
                "BAC_N_TOI_THIEU": BAC_N_TOI_THIEU,
                "TOI_THIEU_DO": TOI_THIEU_DO,
                "NGUONG_GAN_m": NGUONG_GAN,
            },
            "hoc_tu_du_lieu": {
                "BAC_LON": sorted(BAC_LON),
                "bac_shop_do_duoc": {
                    k: {
                        "n": int(v["n"]),
                        "dt_trung_vi": round(float(v["dt"]), 1),
                        "ty_le_polygon": round(float(v["poly"]), 4),
                    }
                    for k, v in bac_dt.to_dict("index").items()
                },
                "brand_hoc_dinh_dang": {
                    "n_brand": len(hoc),
                    "n_LON": int((hoc["tier"] == "LON").sum()),
                    "n_NHO": int((hoc["tier"] == "NHO").sum()),
                },
                "n_brand_cua_lop_dau_do": len(_brand_cua_lop),
                "n_tram_thuoc_ngoai": len(st),
            },
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot, "bac_lon": sorted(BAC_LON)},
    }
