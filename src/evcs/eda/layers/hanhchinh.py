"""LỚP 8 — hành chính (cơ quan nhà nước, công an, toà án, quân đội, đảng–đoàn thể).

Port đẳng cấu của `notebooks/eda_hanhchinh.ipynb`. Đọc `..._con_lai_sau_benhvien.parquet`.

CHẠY TRƯỚC lớp văn phòng, ngược danh sách gốc — `office=government` chiếm 42% mọi
`office=*`, để văn phòng chạy trước thì nó nuốt trọn khối cơ quan nhà nước.

Trục chính: CẤP HÀNH CHÍNH — hệ danh pháp CHẶT NHẤT mà chuỗi gặp, chặt hơn cả cấp học, vì
nó do luật quy định chứ không do thói quen đặt tên. Trục vuông góc: NGÀNH.

`operator` KHÔNG được dùng làm nhánh tuyển. Ở VN gần như MỌI thứ đều do một cơ quan nhà
nước đứng tên — đây là lớp mà bài học "chủ sở hữu ≠ loại" nặng nhất.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (30) hiệu chỉnh trên bộ vào 5.161 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 30 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 30 / 5_161  # ≈ 0.5813% bộ vào
SAN_XUNG_DOT = 30  # sàn: scope nhỏ không bị siết chặt hơn notebook
KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

TAG_BUOC_1 = (
    "amenity", "office", "government", "military", "boundary", "building", "landuse",
    "shop", "leisure", "tourism", "healthcare", "historic", "man_made", "highway",
    "public_transport", "railway", "aeroway", "craft", "place", "religion", "emergency",
)  # fmt: skip

HC_OFFICE = ["government", "administrative", "diplomatic", "political_party", "quango"]
HC_AMENITY = [
    "townhall", "courthouse", "police", "fire_station", "post_office", "prison",
    "public_building", "embassy", "customs",
]  # fmt: skip
HC_BUILDING = ["government", "civic", "public"]
HC_OPERATOR_TYPE = ["government", "public/government", "military"]

# Từ vựng hành chính ĐỊNH DANH — mỗi cụm tự nó đã đủ chỉ ra một cơ quan.
HC_RX = (
    r"\bubnd\b|uy ban nhan dan|uy ban nd|\bhdnd\b|hoi dong nhan dan"
    r"|\bcong an\b|\bdon cong an\b|canh sat|\bpccc\b|phong chay|\bcsgt\b"
    r"|toa an|vien kiem sat|\bvksnd\b|thi hanh an|trai giam|nha tam giu"
    r"|kho bac|\bchi cuc thue\b|\bcuc thue\b|hai quan|bao hiem xa hoi|\bbhxh\b"
    r"|buu dien|\bbuu cuc\b"
    r"|dang uy|quan uy|huyen uy|tinh uy|thanh uy|xa uy|thi uy|ban tuyen giao|ban dan van"
    r"|hoi (?:phu nu|nong dan|cuu chien binh)|doan thanh nien|mat tran to quoc|\bmttq\b"
    r"|ban chi huy quan su|\bbchqs\b|don bien phong|bo tu lenh|quan khu|su doan|trung doan"
    # Lưới rộng quét bộ CÒN LẠI bắt được 7 dòng cơ quan thật lọt ra ngoài — 4 lỗ của từ vựng.
    r"|doanh trai|quan doi nhan dan|lu doan|tieu doan|binh doan|binh chung|hai doan"
    r"|dai su quan|lanh su quan|tong lanh su|\bembassy\b|\bconsulate\b"
    r"|khu hanh chinh"
    r"|trung tam hanh chinh|trung tam phuc vu hanh chinh cong|bo phan mot cua"
    r"|\btru so\b|lien co quan|nha khach chinh phu"
    # `co quan hanh chinh` — do ĐẦU DÒ CỨNG bắt được: 5 toà nhà ở Hải Phòng mang đúng cái
    # tên này mà không cụm nào khác chạm tới. Lỗ recall THẬT, sửa bằng cách mở rộng luật.
    r"|co quan (?:nha nuoc|hanh chinh|dai dien)"
    r"|tro giup phap ly|du tru (?:nha nuoc|quoc gia)|so huu tri tue|quan ly thi truong"
    r"|van phong (?:ubnd|uy ban|chinh phu|quoc hoi|tinh uy|thanh uy)|doan dai bieu quoc hoi"
    r"|thanh tra (?:tinh|thanh pho|quan|huyen|so|chinh phu|nha nuoc|xay dung|giao thong)"
    r"|\bso (?:y te|giao duc|xay dung|tai chinh|noi vu|tu phap|cong thuong|nong nghiep|giao thong"
    r"|van hoa|lao dong|khoa hoc|thong tin|ngoai vu|tai nguyen|ke hoach)"
)

# NHÁNH C — DANH TỪ CẤP + LĨNH VỰC. Bản cũ tuyển bằng tiền tố TRẦN; sau khi bỏ dấu, `bo` =
# "bò/bồ/bờ", `vu` = "vũ/vụ", `ban` = "bán/bàn", `so` = "số". Đo: 84 dòng (2,1% bộ final)
# vào lớp CHỈ vì tiền tố — "Bò Né Sài Gòn", "Phòng vé xe giường nằm Đà Nẵng".
# Sửa ở tầng LUẬT: danh từ cấp chỉ có giá trị khi ĐI KÈM một danh từ LĨNH VỰC quản lý nhà
# nước. "Sở" + "tài chính" là cơ quan; "Số" + "10 Trần Phú" thì không.
HC_TIEN_TO = r"^(?:so|cuc|chi cuc|tong cuc|vu|bo|ban|phong|doi(?! dien)|ban chi dao)\s"
HC_LINH_VUC = (
    r"y te|giao duc|dao tao|\bgd ?& ?dt\b|\bgddt\b|xay dung|tai chinh|ngan sach|noi vu|tu phap"
    r"|cong thuong|nong nghiep|nong thon|giao thong|van tai|van hoa|the thao|the duc|lao dong"
    r"|thuong binh|xa hoi|khoa hoc|cong nghe|thong tin|truyen thong|ngoai vu|ngoai giao"
    r"|tai nguyen|moi truong|ke hoach|dau tu|\bthue\b|thong ke|hai quan|kho bac|kiem lam"
    r"|thuy loi|thuy san|chan nuoi|thu y|trong trot|bao ve thuc vat|do dac|ban do|dang kiem"
    r"|dang ky|ho tich|cong chung|thi hanh an|quan ly thi truong|an toan|ve sinh|dan so"
    r"|dan toc|ton giao|du lich|buu chinh|vien thong|hang hai|hang khong|duong bo|duong thuy"
    r"|do thi|kinh te|ha tang|quy hoach|thanh tra|tiep dan|noi chinh|to chuc|kiem tra|giam sat"
    r"|tuyen giao|dan van|van phong|hanh chinh|tu lenh|tham muu|chinh tri|hau can|quan su"
    r"|bien phong|canh sat|cong an|bao hiem|tu phap|phap che|thi dua|khen thuong|dan quan"
    r"|tai dinh cu|giai phong mat bang|ho tro|tro giup|cuu tro|phong chong"
    r"|xuat nhap canh|xuat canh|nhap canh|co yeu|chinh phu|quoc hoi|du an|khu pho|to dan pho"
    r"|di tich|di san|khi tuong|thuy van"
)
# Các cụm KHÔNG phải phòng ban nhà nước dù bắt đầu bằng đúng danh từ cấp. Đây là LỚP TỪ,
# không phải danh sách dòng.
HC_TIEN_TO_LOAI = (
    r"^so \d|^so nha|phong kham|phong tro|phong ve|phong giao dich|phong tranh|phong thuy"
    r"|phong net|phong tap|phong gym|phong tra|phong thu|phong karaoke|ban dao|bo bao|bo ke"
    r"|bo bien|ban le|ban buon|bo de"
)

# THANG CẤP — (nhãn, regex TIỀN TỐ phải qua cổng lĩnh vực, regex ĐỊNH DANH tự đủ).
# Gán từ CAO xuống THẤP; `chi cuc` xét trước `cuc` để "Chi cục Thuế Quận 1" ra cấp HUYỆN.
CAP_HC = [
    (
        "TRUNG_UONG",
        r"^(?:bo(?! chi huy)|tong cuc|vu)\s",
        (
            r"chinh phu|quoc hoi|trung uong|quoc gia|dai su quan|lanh su quan|\bembassy\b"
            r"|bo tu lenh|quan khu"
        ),
    ),
    (
        "TINH_THANH",
        r"^(?:so|cuc)\s",
        (
            r"\bso (?:y te|giao duc|xay dung|tai chinh|noi vu|tu phap|cong thuong"
            r"|nong nghiep|giao thong|van hoa|lao dong|khoa hoc|thong tin|ngoai vu"
            r"|tai nguyen|ke hoach)|(?:ubnd|uy ban nhan dan) (?:tinh|thanh pho)|tinh uy|thanh uy"
            r"|bo chi huy[^|]*?(?:tinh|thanh pho)"
            r"|cong an (?:tinh|thanh pho)|toa an nhan dan (?:tinh|thanh pho)"
        ),
    ),
    (
        "QUAN_HUYEN",
        r"^(?:chi cuc|phong)\s",
        (
            r"(?:ubnd|uy ban nhan dan) (?:quan|huyen|thi xa)|quan uy|huyen uy"
            r"|ban chi huy quan su[^|]*?(?:quan|huyen|thi xa|phuong|xa)"
            r"|bo chi huy[^|]*?(?:quan|huyen|thi xa)"
            r"|cong an (?:quan|huyen|thi xa)|toa an nhan dan (?:quan|huyen)"
        ),
    ),
    (
        "PHUONG_XA",
        r"(?!x)x",  # không có nhánh tiền tố
        (
            r"(?:ubnd|uy ban nhan dan) (?:phuong|xa|thi tran)|\bxa uy\b|dang uy (?:phuong|xa)"
            r"|cong an (?:phuong|xa|thi tran)|\bdon cong an\b"
        ),
    ),
]

NGANH_HC = [
    ("CONG_AN", r"\bcong an\b|canh sat|\bcsgt\b|\bpccc\b|phong chay|don bien phong|trai giam"),
    (
        "QUAN_DOI",
        (
            r"quan su|bo tu lenh|quan khu|su doan|trung doan|lu doan|tieu doan|binh doan"
            r"|binh chung|hai doan|bien phong|\bbchqs\b|quan doi|doanh trai"
        ),
    ),
    ("TU_PHAP", r"toa an|vien kiem sat|\bvksnd\b|thi hanh an|\bcong chung\b|\btu phap\b"),
    ("TAI_CHINH", r"kho bac|\bthue\b|hai quan|bao hiem xa hoi|\bbhxh\b|ngan hang nha nuoc"),
    ("BUU_CHINH", r"buu dien|\bbuu cuc\b|vien thong"),
    (
        "DANG_DOAN_THE",
        (
            r"dang uy|quan uy|huyen uy|tinh uy|thanh uy|xa uy|thi uy|ban tuyen giao"
            r"|ban dan van|mat tran to quoc|\bmttq\b|doan thanh nien"
            r"|hoi (?:phu nu|nong dan|cuu chien binh)"
        ),
    ),
    ("NGOAI_GIAO", r"dai su quan|lanh su quan|\bembassy\b|\bconsulate\b"),
]

PLACE_DIA_LY_VALUES = [
    "village", "hamlet", "suburb", "neighbourhood", "quarter", "town", "city", "borough",
    "locality", "isolated_dwelling", "county", "district", "province", "municipality",
]  # fmt: skip
DOANH_NGHIEP_RX = (
    r"cong ty|\bcty\b|\btnhh\b|\bcp \b|tap doan|tong cong ty|xi nghiep|nha may|\bevn\b"
    r"|dien luc|cap nuoc|\bvnpt\b|\bviettel\b|mobifone|vinaphone|\bctcp\b"
)
NGOAI_LOP_AMENITY = [
    "restaurant", "cafe", "fast_food", "bar", "parking", "fuel", "bank", "atm", "pharmacy",
    "school", "kindergarten", "college", "university", "hospital", "clinic", "marketplace",
    "toilets", "place_of_worship", "bus_station", "library", "cinema",
    # THIẾT BỊ ĐẶT NHỜ ĐỊA ĐIỂM — node trần, luật hạ tầng đường KHÔNG bắt được.
    "bicycle_rental", "vending_machine", "parcel_locker",
]  # fmt: skip
# BẪY BỎ DẤU: `chua ` khớp cả "chữa" — "Tiểu đoàn SỬA CHỮA Tổng hợp 79", "Cục Cảnh sát
# phòng cháy, CHỮA CHÁY". Đo: 4/7 dòng của luật này bị xoá sai vì đúng một ký tự. Chặn hai
# ngữ cảnh sinh ra nó thay vì bỏ từ khoá.
# (Lookbehind `(?<!sua )` KHÔNG chạy được trên RE2; pandas vì thế lùi về `re` của Python cho
#  riêng biểu thức này. Hành vi đó nằm trong chuẩn vàng — đừng "sửa cho nhất quán".)
TEN_LOAI_KHAC_RX = (
    r"benh vien|phong kham|nha thuoc|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc)"
    r"|khach san|nha nghi|sieu thi|trung tam thuong mai|\bcay xang\b|tram xang|\bchung cu\b"
    r"|\bnha tho\b|(?<!sua )\bchua (?!chay)|nghia trang|\bbai do xe\b|ben xe|cong vien"
)
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)
LUAT_CO_Y = {"RANH_GIOI_KHONG_PHAI_TRU_SO", "TAG_LOP_KHAC", "PLACE_DIA_LY"}


def _co_bang_chung_hc(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng CƠ QUAN HÀNH CHÍNH — tag tự khai, KHÔNG tính `operator`."""
    return (
        df["office"].isin(["government", "administrative", "diplomatic", "political_party"])
        | df["government"].notna()
        | df["amenity"].isin(
            ["townhall", "courthouse", "police", "fire_station", "post_office", "prison", "embassy"]
        )
        | df["military"].notna()
    )


def chay(poi: pd.DataFrame, *, scope: str) -> dict:
    poi = poi.copy()

    # ── BƯỚC 1 — filter MỎNG ────────────────────────────────────────────────
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["operator_type"] = td.map(lambda t: t.get("operator:type"))
    poi["admin_level"] = td.map(lambda t: t.get("admin_level"))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    name_norm = poi["name_norm"]

    HC_TAG = (
        poi["office"].isin(HC_OFFICE)
        | poi["government"].notna()
        | poi["amenity"].isin(HC_AMENITY)
        | poi["military"].notna()
        | poi["landuse"].eq("military")
        | poi["building"].isin(HC_BUILDING)
        | poi["operator_type"].isin(HC_OPERATOR_TYPE)
    )
    HC_NAME = c.chua(name_norm, HC_RX)
    HC_CAP_DANH = (
        c.chua(name_norm, HC_TIEN_TO)
        & c.chua(name_norm, HC_LINH_VUC)
        & ~c.chua(name_norm, HC_TIEN_TO_LOAI)
    )
    poi["is_hc"] = HC_TAG | HC_NAME | HC_CAP_DANH

    # Cổng DỰNG — KHÔNG phải phép đo recall: mọi phép thử là mệnh đề con nguyên văn của
    # `HC_TAG`/`HC_RX` nên chúng BẮT BUỘC ra 0. Giữ vì nó vẫn bắt được một lỗi thật: sửa
    # `HC_RX` mà quên đồng bộ danh sách tag.
    c.cong_toan_ven(
        {
            "office=government": poi["office"].eq("government"),
            "government=*": poi["government"].notna(),
            "amenity=townhall": poi["amenity"].eq("townhall"),
            "amenity=police": poi["amenity"].eq("police"),
            "amenity=courthouse": poi["amenity"].eq("courthouse"),
            "amenity=post_office": poi["amenity"].eq("post_office"),
            "amenity=fire_station": poi["amenity"].eq("fire_station"),
            "military=*": poi["military"].notna(),
            "tên 'UBND'": c.chua(name_norm, r"\bubnd\b|uy ban nhan dan"),
            "tên 'công an'": c.chua(name_norm, r"\bcong an\b"),
            "tên 'toà án|VKS'": c.chua(name_norm, r"toa an|vien kiem sat"),
            "tên 'bưu điện'": c.chua(name_norm, r"buu dien"),
        },
        poi["is_hc"],
        lop="hanhchinh",
    )

    # ── ĐẦU DÒ TUYỂN — từ vựng NGOÀI biểu thức tuyển ────────────────────────
    # Ba đầu dò cứng của bản cũ đều là cụm nằm sẵn trong `HC_RX` nên bằng 0 theo định nghĩa.
    # Thay bằng từ vựng hành chính KHÔNG xuất hiện trong `HC_RX`.
    _bo = poi[~poi["is_hc"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="hanhchinh",
        scope=scope,
        dau_do_cung={
            # `& HC_LINH_VUC` — CHỐT MÀ CHÍNH LUẬT TUYỂN ĐÃ DỰNG còn đầu dò thì quên. Nhánh
            # C của bước 1 đòi danh từ cấp phải ĐI KÈM một danh từ lĩnh vực quản lý nhà
            # nước, đúng vì bỏ dấu làm tiền tố va chạm từ đời thường ("Bò Né" ← `^bo\s`).
            # Đầu dò này lại đòi MỌI dòng chứa `chi cuc` phải vào lớp, tức bỏ qua đúng cái
            # chốt đó. Chỉ SCOPE=vn mới lộ, và cả hai ca đều là va chạm ĐỒNG ÂM thuần tuý:
            #   · `node:6702256885` "Chị cúc" — TÊN NGƯỜI; `strip_accents` biến "chị cúc"
            #     thành "chi cuc", trùng khít "chi cục". Nó còn mang `shop=department_store`.
            #   · `node:4950046121` "đò chi cục thế…" — BẾN ĐÒ lấy chi cục thuế làm MỐC,
            #     mang `highway=bus_stop`. Đúng bẫy "tên là mốc tham chiếu" của cả chuỗi.
            # Nghe theo đầu dò là kéo một cái chợ và một bến đò vào lớp cơ quan nhà nước.
            # Sửa ở ĐẦU DÒ, không ở luật tuyển: đầu dò là CỔNG, không sinh/xoá dòng nào.
            "'chi cục …' (ngoài chi cục thuế)": c.chua(_ten, r"\bchi cuc\b")
            & c.chua(_ten, HC_LINH_VUC),
            "'cơ quan nhà nước / hành chính'": c.chua(
                _ten, r"co quan (?:nha nuoc|hanh chinh|dai dien)"
            ),
            "'nhà khách tỉnh / hội trường UBND'": c.chua(
                _ten, r"nha khach (?:tinh|thanh pho|uy ban)|hoi truong (?:ubnd|uy ban)"
            ),
            "'đoàn đại biểu / hội đồng bầu cử'": c.chua(_ten, r"doan dai bieu|hoi dong bau cu"),
            "`official_name` + cụm cơ quan": _tags.map(
                lambda t: any(k.startswith("official_name") for k in t)
            )
            & c.chua(_ten, r"nhan dan|nha nuoc|chinh phu|quoc gia"),
        },
        dau_do_mem={
            "`boundary=administrative` — RANH GIỚI, không phải trụ sở": _bo["boundary"].eq(
                "administrative"
            ),
            "tên bắt đầu 'Số ' (bỏ dấu thành 'so', trùng 'Sở')": c.chua(_ten, r"^so \d"),
            "`operator` là cơ quan nhà nước (chủ sở hữu ≠ loại)": c.chua(
                _bo["operator"].fillna("").map(c.strip_accents),
                r"\bubnd\b|uy ban|nha nuoc|chinh phu",
            ),
            "tên bắt đầu 'ban ' mà KHÔNG có danh từ lĩnh vực": c.chua(_ten, r"^ban "),
            "tên có 'cơ quan'": c.chua(_ten, r"\bco quan\b"),
        },
    )

    hc = poi[poi["is_hc"]].copy()
    b1 = hc.copy()  # ghi đĩa TẠI ĐÂY, trước hai thang của bước 2

    # ── BƯỚC 2 — CẤP và NGÀNH ───────────────────────────────────────────────
    # Cổng LĨNH VỰC dùng lại y hệt Bước 1. Bản cũ gán cấp bằng tiền tố trần, nên `^bo\s` biến
    # "Bò Né Sài Gòn" thành TRUNG_UONG — nhãn MẶC ĐỊNH sai còn tệ hơn nhãn thiếu.
    _n = hc["name_norm"]
    _gate = c.chua(_n, HC_LINH_VUC) & ~c.chua(_n, HC_TIEN_TO_LOAI)

    cap = pd.Series(None, index=hc.index, dtype=object)
    for val, rx_tt, rx_dd in CAP_HC:
        m = (c.chua(_n, rx_tt) & _gate) | c.chua(_n, rx_dd)
        cap[m & cap.isna()] = val
    hc["cap_hc"] = cap.fillna("KHONG_KHAI")

    nganh = pd.Series(None, index=hc.index, dtype=object)
    for val, rx in NGANH_HC:
        nganh[c.chua(hc["name_norm"], rx) & nganh.isna()] = val
    nganh = nganh.fillna(
        hc["amenity"].map(
            {
                "police": "CONG_AN",
                "fire_station": "CONG_AN",
                "courthouse": "TU_PHAP",
                "prison": "TU_PHAP",
                "post_office": "BUU_CHINH",
                "townhall": "CHINH_QUYEN_CHUNG",
                "embassy": "NGOAI_GIAO",
            }
        )
    )
    nganh = nganh.fillna(hc["military"].notna().map({True: "QUAN_DOI", False: None}))
    nganh = nganh.fillna(
        hc["government"].map(
            {
                "tax": "TAI_CHINH",
                "treasury": "TAI_CHINH",
                "customs": "TAI_CHINH",
                "social_security": "TAI_CHINH",
                "prosecutor": "TU_PHAP",
                "ministry": "CHINH_QUYEN_CHUNG",
                "administrative": "CHINH_QUYEN_CHUNG",
            }
        )
    )
    hc["nganh_hc"] = nganh.fillna("CHINH_QUYEN_CHUNG")

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    dc = c.DayChuyenLoc(hc, ham_tha=_co_bang_chung_hc, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — RANH GIỚI HÀNH CHÍNH, không phải TRỤ SỞ. `boundary=administrative` là một khái
    # niệm KHÔNG GIAN, không phải một toà nhà. Bản cũ dùng `boundary.notna()` và nuốt luôn
    # `boundary=postal_code` ("Bưu Điện Việt Nam") — luật phải nêu ĐÚNG giá trị mình nói tới.
    dc.xoa(
        r["boundary"].eq("administrative") | r["admin_level"].notna(),
        "RANH_GIOI_KHONG_PHAI_TRU_SO",
    )

    # LUẬT 2 — hạ tầng đường. Lần thứ TÁM: trạm buýt tên "UBND Quận 1".
    r = dc.con_lai
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 3 — NODE ĐỊA DANH. Bản cũ dùng `place.notna()` và nuốt `place=islet` — "Đồn Biên
    # phòng Tục Lãm" nằm trên đảo nhỏ: `place` ở đó tả CÁI ĐẢO, không tả cái POI.
    r = dc.con_lai
    dc.xoa(r["place"].isin(PLACE_DIA_LY_VALUES), "PLACE_DIA_LY", tha=True)

    # LUẬT 4 — DOANH NGHIỆP NHÀ NƯỚC. Lần thứ BA: sở hữu nhà nước KHÔNG biến một doanh
    # nghiệp thành cơ quan hành chính. EVN, VNPT, Viettel là doanh nghiệp.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], DOANH_NGHIEP_RX) & ~_co_bang_chung_hc(r),
        "DOANH_NGHIEP_NHA_NUOC",
    )

    # LUẬT 5 — họ tag thuộc LỚP KHÁC.
    r = dc.con_lai
    dc.xoa(
        r["shop"].notna()
        | r["healthcare"].notna()
        | r["tourism"].notna()
        | r["leisure"].notna()
        | r["amenity"].isin(NGOAI_LOP_AMENITY),
        "TAG_LOP_KHAC",
        tha=True,
    )

    # LUẬT 6 — tên nói thẳng là loại khác.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], TEN_LOAI_KHAC_RX) & ~_co_bang_chung_hc(r),
        "TEN_LOAI_KHAC",
    )

    # LUẬT 7 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    clean, removed = dc.ket()

    conflict = removed[_co_bang_chung_hc(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="hanhchinh",
        nhan="có tag hành chính CỨNG",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    # BẪY TRÙNG TÊN THEO CẤP: "Công an phường X" có ở mọi phường, tên gần giống nhau. Vì thế
    # `fragment_group` ở lớp này BẮT BUỘC phải có phạm vi H3 r8 (~0,7 km²) — ra khỏi ô đó là
    # một phường khác, một cơ quan khác. Không có phạm vi H3 thì gộp nhầm cả nghìn dòng.
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
        f"poi_hanhchinh_{scope}_b1.parquet": b1,
        f"poi_hanhchinh_{scope}_b3.parquet": b3,
        f"poi_hanhchinh_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_hanhchinh_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_hanhchinh.parquet": con_lai,
        "_params": {
            "dat_tay": {},
            "hoc_tu_du_lieu": {},
            "do_duoc": {"cap_hc": final["cap_hc"].value_counts().to_dict()},
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot},
    }
