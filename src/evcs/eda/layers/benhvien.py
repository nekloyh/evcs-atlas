"""LỚP 7 — y tế (bệnh viện, phòng khám, trạm y tế).

Port đẳng cấu của `notebooks/eda_benhvien.ipynb`. Đọc `..._con_lai_sau_truonghoc.parquet`.

Hai thang VUÔNG GÓC, cả hai đọc từ tên tiếng Việt: LOẠI HÌNH × TUYẾN. Đây là chỗ khác lớp
trường học — cấp học là thang MỘT chiều, y tế là hai chiều.

Bài học "một KHOÁ không phải một KHÁI NIỆM" lặp lại BA lần trong lớp này, ở ba khoá khác
nhau: `emergency` (phủ cả trụ nước chữa cháy, chòi cứu hộ), `social_facility` (phủ cả trại
trẻ mồ côi), `healthcare` (phủ cả tiệm tóc). Mỗi lần đều phải đọc GIÁ TRỊ, không đọc khoá.

`beds` — thước quy mô chuẩn của ngành — bằng **0 dòng** trong dữ liệu VN.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

DT_LON, DT_VUA = 10_000, 2_000  # m² — bậc quy mô. ĐẶT TAY (`beds` = 0 nên không có gì khác).
BAN_KINH_M = 1_000  # m — trạm buýt luôn đặt ở cổng; xa hơn thì tên chỉ là mốc vùng. ĐẶT TAY.
# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (30) hiệu chỉnh trên bộ vào 4.728 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 30 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 30 / 4_728  # ≈ 0.6345% bộ vào
SAN_XUNG_DOT = 30  # sàn: scope nhỏ không bị siết chặt hơn notebook

KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name")

TAG_BUOC_1 = (
    "amenity", "healthcare", "building", "office", "shop", "landuse", "leisure", "tourism",
    "emergency", "historic", "man_made", "highway", "public_transport", "railway", "aeroway",
    "craft", "place", "military", "religion", "social_facility",
)  # fmt: skip
TAG_THO = ("healthcare:speciality", "operator:type", "operator", "beds", "capacity")

# `building` phải nhận CẢ HỌ giá trị y tế, không riêng `hospital`: cổng recall độc lập bắt
# được 1 polygon `building=clinic` vô danh bị bỏ ngoài lớp — bất đối xứng thuần tuý.
BLD_YT = ["hospital", "clinic", "healthcare", "pharmacy", "medical"]
YT_AMENITY = [
    "hospital", "clinic", "doctors", "dentist", "pharmacy", "veterinary",
    "nursing_home", "social_facility", "blood_donation",
]  # fmt: skip

# Neo biên: `\bbv\b` là viết tắt bệnh viện nhưng cũng là chữ đầu nhiều tên riêng; `mat`
# (mắt) khớp "Mật", "Mất"; `nhi` khớp "Nhị", "Nhì" — cả ba chỉ dùng trong CỤM.
YT_RX = (
    r"benh vien|\bbv \b|\bbvdk\b|benh xa|nha ho sinh|vien (?:tim|mat|nhi|phoi|huyet hoc|dinh duong|y hoc)"
    r"|phong kham|\bpk \b|\bpkdk\b|phong mach|phong chan tri|noi soi"
    r"|tram y te|\btyt\b|trung tam y te|\bttyt\b|trung tam cap cuu|trung tam kiem soat benh tat|\bcdc\b"
    r"|nha thuoc|hieu thuoc|quay thuoc|\bpharmacy\b|duoc pham"
    r"|nha khoa|rang ham mat|\bclinic\b|\bhospital\b|y hoc co truyen|dong y|cham cuu"
    r"|xet nghiem|chuan doan hinh anh|trung tam tiem chung|tiem chung"
    # từ vựng CHUYÊN KHOA: cơ sở tuyến tỉnh thường CHỈ ghi chuyên khoa, không ghi loại hình.
    # KHÔNG thêm `nhi dong` — "Nhị Đồng" (địa danh Đồng Nai) bỏ dấu trùng hoàn toàn.
    r"|y te du phong|\btam than\b|\bduong lao\b|\bdieu duong\b|phuc hoi chuc nang"
    r"|\bphu san\b|\bsan nhi\b|\bung buou\b|\bda lieu\b|truyen mau|\bnoi tiet\b"
    r"|\bchinh hinh\b|\bnam hoc\b|\blao va benh phoi\b|\bbenh nhiet doi\b"
)

# Bảng chuẩn hoá dùng cho ĐỐI CHỨNG CHÉO hai lược đồ tag.
CHUAN_LOAI = {
    "hospital": "BENH_VIEN",
    "clinic": "PHONG_KHAM",
    "doctors": "PHONG_KHAM",
    "doctor": "PHONG_KHAM",
    "dentist": "NHA_KHOA",
    "pharmacy": "NHA_THUOC",
    "centre": "PHONG_KHAM",
    "center": "PHONG_KHAM",
}

THU_Y_RX = r"\bthu y\b|thu cung|\bpet\b|petshop|pet shop|petcare|pet care|animal hospital"
# BẢO TRỢ XÃ HỘI ≠ Y TẾ. `social_facility` có sẵn KHOÁ CON mang giá trị — phải đọc nó.
SF_YT = ["nursing_home", "assisted_living", "hospice", "ambulatory_care"]
XH_YT_RX = (
    r"\bduong lao\b|\bdieu duong\b|phuc hoi chuc nang|nguoi cao tuoi|\ban duong\b"
    r"|\bhospice\b|cai nghien|nuoi duong nguoi (?:gia|tam than)"
)
# Khoá con `social_facility` cũng sai được ("Trại trẻ mồ côi An Thạnh" mang `nursing_home`).
# Khi một tag ĐÃ ĐO ĐƯỢC là không tin cậy thì TÊN thắng TAG — ngược chiều mặc định của cả
# chuỗi, và đó là lý do phải ghi rõ.
XH_KHONG_YT_RX = (
    r"mo coi|co nhi|\blang tre\b|\bmai am\b|\btre em\b|thieu nien|bao tro"
    r"|\bbep an\b|tu thien|nguoi mu|khuyet tat|cong tac xa hoi|\bnha tro\b"
)

LOAI_YT = [
    ("BENH_VIEN", r"benh vien|\bbv \b|\bbvdk\b|benh xa|vien (?:tim|mat|nhi|phoi|huyet hoc|y hoc)"),
    (
        "TRUNG_TAM_Y_TE",
        (
            r"trung tam y te|\bttyt\b|trung tam cap cuu|trung tam kiem soat benh tat|\bcdc\b"
            r"|trung tam tiem chung|nha ho sinh|y te du phong|\bduong lao\b|\bdieu duong\b"
        ),
    ),
    ("TRAM_Y_TE", r"tram y te|\btyt\b"),
    ("PK_DA_KHOA", r"phong kham da khoa|\bpkdk\b|da khoa"),
    (
        "PK_CHUYEN_KHOA",
        (
            r"phong kham|\bpk \b|phong mach|nha khoa|rang ham mat|chuyen khoa"
            r"|xet nghiem|chuan doan hinh anh|noi soi|y hoc co truyen|dong y|cham cuu"
        ),
    ),
    ("NHA_THUOC", r"nha thuoc|hieu thuoc|quay thuoc|\bpharmacy\b"),
]

# Danh mục 63 tên tỉnh CŨ là sự kiện lịch sử, không đổi nữa, nên viết cứng — OSM còn đầy
# tên trước sáp nhập. Danh mục 34 tên HIỆN đọc thẳng từ store nên tự cập nhật.
TINH_CU_RAW = [
    "An Giang", "Bà Rịa Vũng Tàu", "Bắc Giang", "Bắc Kạn", "Bạc Liêu", "Bến Tre",
    "Bình Định", "Bình Dương", "Bình Phước", "Bình Thuận", "Đắk Nông", "Hà Giang",
    "Hà Nam", "Hải Dương", "Hậu Giang", "Hòa Bình", "Kiên Giang", "Kon Tum",
    "Long An", "Nam Định", "Ninh Thuận", "Phú Yên", "Quảng Bình", "Quảng Nam",
    "Sóc Trăng", "Thái Bình", "Thừa Thiên Huế", "Tiền Giang", "Trà Vinh",
    "Vĩnh Phúc", "Yên Bái",
]  # fmt: skip
# "thành phố" ĐỨNG CUỐI tên = thành phố CHỦ QUẢN của chính POI ("Bệnh viện Mắt Thành phố").
# CHỈ "thành phố", KHÔNG có "tỉnh" trần: nhánh `\btinh\s*$` bắt 3 dòng và SAI cả 3 — bỏ dấu
# làm "tỉnh" trùng khít "Tĩnh"/"Tịnh". Token "tinh" TRẦN không bao giờ an toàn.
RX_TP_TRONG = r"\bthanh pho\s*(?:[-–,(]|$)"

CO_QUAN_YT_RX = (
    r"^(?:so|phong|bo|cuc|vu|ban|chi cuc|tong cuc)\s+(?:quan ly\s+)?y (?:te|duoc)\b"
    r"|^cuc quan ly (?:duoc|kham chua benh|moi truong y te|y duoc co truyen)"
    r"|^chi cuc (?:an toan ve sinh thuc pham|dan so|thu y|bao ve moi truong)"
    r"|^(?:trung tam|van phong) giam dinh y khoa"
    r"|cong doan y te|bao hiem y te|\bbhyt\b|bao hiem xa hoi"
)
CTY_DUOC_RX = (
    r"cong ty|\bcty\b|\btnhh\b|\bcp \b|tap doan|nha may|xi nghiep|thiet bi y te|vat tu y te"
    r"|kho duoc|phan phoi duoc"
)
NGOAI_LOP_AMENITY = [
    "restaurant", "cafe", "fast_food", "parking", "bank", "atm", "fuel", "marketplace",
    "school", "kindergarten", "place_of_worship", "police", "post_office", "townhall",
    "toilets", "bus_station",
    # THIẾT BỊ ĐẶT NHỜ ĐỊA ĐIỂM — node trần, luật hạ tầng đường KHÔNG bắt được.
    "bicycle_rental", "vending_machine", "parcel_locker",
]  # fmt: skip
TEN_LOAI_KHAC_RX = (
    r"\bubnd\b|uy ban nhan dan|\bcong an\b|toa an|kho bac|buu dien|\bngan hang\b"
    r"|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc)|khach san|nha nghi|sieu thi"
    r"|\bcay xang\b|tram xang|\bchung cu\b|\bnha tho\b|\bchua \b|nghia trang"
)
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)

# `CO_QUAN_QUAN_LY_YT` ĐÃ BỊ RÚT khỏi miễn trừ: trước đây `drop_rule` in ra "⚠ 9 dòng có tag
# y tế cứng" đúng như thiết kế, rồi luật lại được cho vào đây để `assert` khỏi đỏ — chuông
# báo cháy kêu và người ta tháo pin. Một cơ quan hành chính lẽ ra không mang
# `amenity=hospital`; xung đột ở đó là TÍN HIỆU LỖI, phải để nó chạm ngưỡng.
LUAT_CO_Y = {"NGOAI_PHAM_VI_NHA_THUOC_THU_Y", "TAG_LOP_KHAC"}

# Cờ phi lâm sàng: HAI cờ, KHÔNG một. Lần gộp đầu đã dán "phi lâm sàng" lên "Phòng khám
# Đông y" và "trạm xá" — cả hai SAI: y học cổ truyền là khám chữa bệnh có phép ở VN.
# `optometrist` ĐÃ BỊ RÚT: OSM xếp cả "Kính Thuốc Điện Biên Phủ" (bán lẻ) lẫn "Trung tâm Mắt
# Kỹ thuật cao Nam Việt" (nhãn khoa lâm sàng) vào cùng giá trị. Chỉ `hair` không hiểu nhầm được.
HC_PHI_LAM_SANG = {"hair"}
PHI_LS_RX = r"\btiem toc\b|\bcat toc\b|\bsalon\b|kinh thuoc|mat kinh|\bmassage\b"
THAM_MY_RX = r"tham my|\bspa\b|\bbeauty\b|lam dep|\bnails?\b"
AMEN_LAM_SANG = ["hospital", "clinic", "doctors", "dentist"]


def _co_bang_chung_yte(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng CƠ SỞ Y TẾ — tag tự khai."""
    return (
        df["amenity"].isin(["hospital", "clinic", "doctors", "dentist", "pharmacy", "nursing_home"])
        | df["healthcare"].notna()
        | df["building"].isin(BLD_YT)
        | df["healthcare_speciality"].notna()
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

    YT_TAG = (
        poi["amenity"].isin(YT_AMENITY)
        | poi["healthcare"].notna()
        | poi["building"].isin(BLD_YT)
        | poi["emergency"].eq("ambulance_station")
        | poi["healthcare_speciality"].notna()
    )
    YT_NAME = c.chua(name_norm, YT_RX)
    YT_VONG_DOI = td.map(
        lambda t: any(
            ":" in k
            and k.split(":")[-1] in {"healthcare", "amenity"}
            and str(v).lower() in {"hospital", "clinic", "doctors", "pharmacy", "dentist"}
            for k, v in t.items()
        )
    )
    poi["is_yt"] = YT_TAG | YT_NAME | YT_VONG_DOI

    c.cong_toan_ven(
        {
            "amenity=hospital": poi["amenity"].eq("hospital"),
            "amenity=clinic": poi["amenity"].eq("clinic"),
            "amenity=doctors": poi["amenity"].eq("doctors"),
            "amenity=dentist": poi["amenity"].eq("dentist"),
            "amenity=pharmacy": poi["amenity"].eq("pharmacy"),
            "healthcare=*": poi["healthcare"].notna(),
            "building=hospital": poi["building"].eq("hospital"),
            "có healthcare:speciality": poi["healthcare_speciality"].notna(),
            "tên 'bệnh viện'": c.chua(name_norm, r"benh vien"),
            "tên 'phòng khám'": c.chua(name_norm, r"phong kham"),
            "tên 'trạm y tế'": c.chua(name_norm, r"tram y te"),
            "tên 'nhà thuốc'": c.chua(name_norm, r"nha thuoc|hieu thuoc|quay thuoc"),
        },
        poi["is_yt"],
        lop="benhvien",
    )

    # ── CỔNG RECALL ĐỘC LẬP ─────────────────────────────────────────────────
    _bo = poi[~poi["is_yt"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]
    do_recall = c.cong_recall(
        df=_bo,
        lop="benhvien",
        scope=scope,
        dau_do_cung={
            # Tripwire TỰ BẢO TRÌ: bắt mọi GIÁ TRỊ `building` mang nghĩa y tế mà danh mục
            # tuyển `BLD_YT` chưa liệt kê. Không lặp lại danh mục nên không thể thành vòng
            # tròn, và tự đỏ khi OSM sinh giá trị mới ở tỉnh khác.
            # (Chỗ này TRƯỚC ĐÂY là `emergency=ambulance_station` — chính điều kiện đó nằm
            # trong `YT_TAG`, nên nó = 0 VĨNH VIỄN: một tautology, không đo được gì.)
            "`building` nghĩa y tế nhưng NGOÀI danh mục tuyển": c.chua(
                _bo["building"].fillna(""),
                r"hospital|clinic|health|medic|pharma|ambulance|nursing",
            )
            & ~_bo["building"].isin(BLD_YT),
            "khoá `medical_system` / `health_facility:*`": _tags.map(
                lambda t: (
                    bool(t.get("medical_system")) or any(k.startswith("health_facility") for k in t)
                )
            ),
            "có khoá `health_*` / `medical_*`": _tags.map(
                lambda t: any(k.startswith(("health_", "medical_")) for k in t)
            )
            & _bo["amenity"].isna()
            & _bo["shop"].isna()
            & _bo["office"].isna(),
            "tên có 'y tế / khám chữa bệnh' + polygon": c.chua(_ten, r"\by te\b|kham chua benh")
            & _bo["is_area"]
            & ~c.chua(
                _ten,
                r"^(?:so|phong|bo|cuc|vu|ban|chi cuc)\s|van phong|dai dien|cong ty|\bcty\b|thiet bi",
            ),
        },
        dau_do_mem={
            # `operator` là CHỦ SỞ HỮU, không phải LOẠI CÔNG TRÌNH — "Nhà Tang lễ Quốc gia"
            # do bệnh viện vận hành.
            "`operator` là Sở/Bộ Y tế hoặc Bệnh viện": c.chua(
                _bo["operator"].fillna("").map(c.strip_accents),
                r"\bbenh vien\b|\bso y te\b|\bbo y te\b|\btrung tam y te\b",
            ),
            "`emergency` ở giá trị PHI y tế": _bo["emergency"].notna()
            & ~_bo["emergency"].eq("ambulance_station"),
            "từ vựng lâm sàng còn sót ngoài lớp": c.chua(
                _ten, r"\bcap cuu\b|\bso cuu\b|\bquan y\b|\bbac si\b|\bdental\b|\bmedical\b"
            ),
            "tên có 'viện'": c.chua(_ten, r"\bvien \b"),
            "tên có 'dược'": c.chua(_ten, r"\bduoc\b"),
            "tên có 'sở/phòng y tế' → lớp hành chính": c.chua(_ten, r"(?:so|phong) y te"),
        },
    )

    yt = poi[poi["is_yt"]].copy()
    b1 = yt.copy()  # ghi đĩa TẠI ĐÂY, trước hai thang của bước 2

    # ── BƯỚC 2 — hai thang VUÔNG GÓC ────────────────────────────────────────
    # ĐỐI CHỨNG CHÉO `amenity` × `healthcare` — chuẩn hoá hai lược đồ về CÙNG một bảng từ
    # TRƯỚC khi so, nếu không thì `amenity=doctors` vs `healthcare=doctor` bị tính là bất
    # đồng chỉ vì một chữ "s". Ba cột dưới đây là PHÉP ĐO, không tham gia luật nào — nhưng
    # chúng đi vào parquet nên vẫn phải sinh đúng chỗ.
    # ⚠ Phép đo này YẾU hơn phép của lớp trường học dù con số cao hơn: hai lược đồ do CÙNG
    # một người map điền một lần.
    yt["loai_amenity"] = yt["amenity"].map(CHUAN_LOAI)
    yt["loai_healthcare"] = yt["healthcare"].map(CHUAN_LOAI)
    _ca_hai = yt["loai_amenity"].notna() & yt["loai_healthcare"].notna()
    yt["loai_xung_dot"] = False
    yt.loc[_ca_hai, "loai_xung_dot"] = (
        yt.loc[_ca_hai, "loai_amenity"] != yt.loc[_ca_hai, "loai_healthcare"]
    )

    # THANG 1 — LOẠI HÌNH. THỨ TỰ Ở ĐÂY LÀ MỘT QUYẾT ĐỊNH: TÊN mô tả *hình thức tổ chức*
    # ("bệnh viện"), TAG mô tả *đối tượng phục vụ* (người/thú). Chiều nào CỤ THỂ hơn chạy
    # trước — "Bệnh viện Thú y Petpro" phải ra THU_Y, không ra BENH_VIEN.
    la_thu_y = yt["amenity"].eq("veterinary") | c.chua(yt["name_norm"], THU_Y_RX)
    la_bao_tro = yt["amenity"].isin(["social_facility", "nursing_home"])
    xh_la_yt = pd.Series(
        np.select(
            [
                c.chua(yt["name_norm"], XH_YT_RX),
                c.chua(yt["name_norm"], XH_KHONG_YT_RX),
                yt["social_facility"].isin(SF_YT),
            ],
            [True, False, True],
            default=False,
        ),
        index=yt.index,
    )

    loai = pd.Series(None, index=yt.index, dtype=object)
    loai[la_thu_y] = "THU_Y"  # chiều ĐỐI TƯỢNG, quyết trước chiều HÌNH THỨC
    for val, rx in LOAI_YT:
        loai[c.chua(yt["name_norm"], rx) & loai.isna()] = val
    # bảo trợ xã hội: sau vòng TÊN (một "Bệnh viện" thật vẫn thắng), trước vòng TAG
    _bt = la_bao_tro & loai.isna()
    loai[_bt] = np.where(xh_la_yt[_bt], "TRUNG_TAM_Y_TE", "CS_XA_HOI")
    loai = loai.fillna(
        yt["amenity"].map(
            {
                "hospital": "BENH_VIEN",
                "clinic": "PK_DA_KHOA",
                "doctors": "PK_CHUYEN_KHOA",
                "dentist": "PK_CHUYEN_KHOA",
                "pharmacy": "NHA_THUOC",
                "veterinary": "THU_Y",
            }
        )
    )
    loai = loai.fillna(
        yt["healthcare"].map(
            {
                "hospital": "BENH_VIEN",
                "clinic": "PK_DA_KHOA",
                "doctor": "PK_CHUYEN_KHOA",
                "dentist": "PK_CHUYEN_KHOA",
                "pharmacy": "NHA_THUOC",
                "veterinary": "THU_Y",
            }
        )
    )
    yt["loai_yt"] = loai.fillna("KHONG_XAC_DINH")

    # THANG 2 — TUYẾN. KHÔNG dựa vào vị trí chữ mà dựa vào DANH MỤC ĐƠN VỊ HÀNH CHÍNH:
    # "thành phố X" là tuyến tỉnh khi và chỉ khi X là một tỉnh/thành trực thuộc TW.
    _prov = pq.read_table(c.ROOT / "store/admin/provinces.parquet", columns=["province_name"])
    tinh_hien = [
        c.strip_accents(re.sub(r"^(?:Tỉnh|Thành phố)\s+", "", p))
        for p in _prov.to_pandas()["province_name"]
    ]
    ten_tinh = sorted(
        set(tinh_hien + [c.strip_accents(x) for x in TINH_CU_RAW]), key=len, reverse=True
    )
    rx_ten_tinh = "|".join(re.escape(t) for t in ten_tinh)
    tuyen_yt = [
        (
            "TRUNG_UONG",
            (
                r"trung uong|\bquan y (?:vien)?\b|\b108\b|bach mai|cho ray|viet duc|\bk\b co so"
                r"|\bbo y te\b|\bviet nam\b\s*$"
            ),
        ),
        (
            "TINH_THANH",
            (
                rf"\b(?:tinh|thanh pho|tp\.?)\s+(?:{rx_ten_tinh})\b"
                rf"|benh vien (?:tinh|thanh pho)|\bda khoa (?:tinh|thanh pho)\b|\bso y te\b"
                rf"|{RX_TP_TRONG}"
            ),
        ),
        # `\bquan [a-z]` cũ nuốt "quân y", "quân đội" (23 dòng); `\bxa \b` nuốt "xã hội"
        # (9 dòng). Chặn bằng lookahead — danh sách từ-chặn ngắn và ổn định.
        (
            "QUAN_HUYEN",
            (
                r"\bquan \d|\bquan (?!y\b|dan\b|doi\b|ly\b|trac\b|su\b|the\b|khu\b|diem\b)[a-z]"
                r"|\bhuyen \b|\bthi xa\b|\bthanh pho \b"
            ),
        ),
        ("PHUONG_XA", r"\bphuong \b|\bxa (?!hoi\b)\w|\bthi tran\b"),
        (
            "TU_NHAN",
            r"quoc te|\bdr\b|\bvinmec\b|\bhoan my\b|\bfv\b|\bcolumbia\b|\bfamily\b|\btam anh\b",
        ),
    ]
    tuyen = pd.Series(None, index=yt.index, dtype=object)
    for val, rx in tuyen_yt:
        tuyen[c.chua(yt["name_norm"], rx) & tuyen.isna()] = val
    yt["tuyen_yt"] = tuyen.fillna("KHONG_KHAI")

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    dc = c.DayChuyenLoc(yt, ham_tha=_co_bang_chung_yte, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường. Lần thứ BẢY. Trạm buýt tên "Bệnh viện Bạch Mai".
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — CƠ QUAN QUẢN LÝ Y TẾ. Hai lỗ đã siết, cả hai thuộc loại "regex quá rộng theo
    # một PATTERN": (1) "Phòng" vừa là CƠ QUAN vừa là PHÒNG KHÁM — chỉ vị trí LIỀN KỀ mới
    # phân biệt được; (2) OSM hay ghi CƠ QUAN CHỦ QUẢN vào ĐUÔI tên, nên `\bso y te\b` ở
    # bất kỳ đâu đã xoá mất cơ sở chính của một bệnh viện tuyến tỉnh.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], CO_QUAN_YT_RX), "CO_QUAN_QUAN_LY_YT")

    # LUẬT 3 — CÔNG TY DƯỢC / THIẾT BỊ Y TẾ. Doanh nghiệp ngành y ≠ cơ sở y tế.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], CTY_DUOC_RX) & ~_co_bang_chung_yte(r),
        "DOANH_NGHIEP_NGANH_Y",
    )

    # LUẬT 4 — CẮT PHẠM VI: nhà thuốc và thú y. Cắt theo NHÃN `loai_yt` VÀ theo tag/tên thú y
    # trực tiếp — hai lớp chồng nhau là CỐ Ý: nhãn có thể lệch khi thang được sửa về sau,
    # còn `amenity=veterinary` thì không bao giờ lệch.
    r = dc.con_lai
    dc.xoa(
        r["loai_yt"].isin(["NHA_THUOC", "THU_Y"])
        | r["amenity"].eq("veterinary")
        | c.chua(r["name_norm"], THU_Y_RX),
        "NGOAI_PHAM_VI_NHA_THUOC_THU_Y",
    )

    # LUẬT 5 — họ tag thuộc LỚP KHÁC: cửa hàng, quán, bãi đỗ trong khuôn viên bệnh viện.
    r = dc.con_lai
    dc.xoa(
        r["shop"].notna()
        | r["office"].notna()
        | r["amenity"].isin(NGOAI_LOP_AMENITY)
        | r["tourism"].notna()
        | r["leisure"].notna(),
        "TAG_LOP_KHAC",
        tha=True,
    )

    # LUẬT 6 — tên nói thẳng là loại khác.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], TEN_LOAI_KHAC_RX) & ~_co_bang_chung_yte(r),
        "TEN_LOAI_KHAC",
    )

    # LUẬT 7 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    clean, removed = dc.ket()

    conflict = removed[_co_bang_chung_yte(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="benhvien",
        nhan="có tag y tế CỨNG",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    # QUY MÔ — `beds` không tồn tại, nên dùng ba dấu vết gián tiếp, ghi rõ nguồn.
    _dt = clean["area_m2"].fillna(0)
    clean["quy_mo_yt"] = np.select(
        [clean["emergency"].eq("yes") | _dt.ge(DT_LON), _dt.ge(DT_VUA), _dt.gt(0)],
        ["LON", "VUA", "NHO"],
        default="KHONG_DO_DUOC",
    )
    clean["quy_mo_nguon"] = np.select(
        [clean["emergency"].eq("yes"), _dt.gt(0)], ["cap_cuu", "dien_tich"], default="khong_co"
    )
    # Cờ chỉ cắm khi KHÔNG có amenity lâm sàng tự khai: "Vietnamese Traditional Massage
    # Institute" mang `amenity=clinic` là xoa bóp trị liệu. Nguyên tắc cho MỌI cờ dùng để
    # LOẠI: thiếu bằng chứng thì KHÔNG cắm, vì downstream đọc cờ như một lời khẳng định.
    clean["phi_lam_sang"] = clean["healthcare"].isin(HC_PHI_LAM_SANG) | (
        c.chua(clean["name_norm"], PHI_LS_RX) & ~clean["amenity"].isin(AMEN_LAM_SANG)
    )
    clean["tham_my"] = c.chua(clean["name_norm"], THAM_MY_RX)

    chi_muc = c.ChiMucKhongGian(clean)
    vung = c.nap_geom(clean[clean["is_area"]])
    clean["container_uid"] = clean["uid"].map(
        c.gan_container(vung, chi_muc, np.ones(len(clean), dtype=bool))
    )
    clean["vai_tro"] = np.where(
        clean["container_uid"].notna(), "KHOA_TRONG_KHUON_VIEN", "CO_SO_DOC_LAP"
    )
    clean["fragment_group"] = c.nhom_manh(clean, clean["name"].notna())

    # ── BƯỚC 5 — FINAL + bộ CÒN LẠI ─────────────────────────────────────────
    final = clean.copy()
    con_lai = c.con_lai_sau(poi, final)
    thieu_dong = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu_dong:
        raise AssertionError(f"mất {thieu_dong} dòng bị luật xoá khỏi bộ còn lại")

    # ĐO RECALL BẰNG NHÂN CHỨNG NGOÀI LỚP. LUẬT 1 xoá 505 trạm buýt mang tên cơ sở y tế —
    # xoá là ĐÚNG, nhưng cái TÊN là một NHÂN CHỨNG ĐỘC LẬP: ai đó đặt tên trạm theo một cơ
    # sở có thật ở đó. Không có cơ sở nào trong bán kính 1 km ⇒ cơ sở đó TỒN TẠI mà OSM chưa
    # vẽ. Cùng mẹo "tên là mốc tham chiếu" nhưng đọc NGƯỢC: dùng để ĐO cái mình không có.
    from scipy.spatial import cKDTree

    _ht = removed[removed["drop_reason"].eq("HA_TANG_DUONG")].copy()
    _ht = _ht[
        c.chua(
            _ht["name_norm"],
            r"benh vien|\bbv \b|trung tam y te|tram y te|phong kham|nha khoa|\bttyt\b",
        )
    ]

    def _xy(d):
        return np.c_[
            d["lng"].values * np.cos(np.radians(d["lat"].values)) * 111_320,
            d["lat"].values * 111_320,
        ]

    _ht["kc_m"] = cKDTree(_xy(final)).query(_xy(_ht))[0].round(0)

    def _loi_ten(s):
        s = re.sub(
            r"^(doi dien|truoc cong|truoc|he truoc|he doi dien|ben canh|duong vao|qua san|qua"
            r"|cong|cach)\s+",
            "",
            s,
        )
        s = re.sub(r"\s*\d+\s*m\b.*", "", s)
        s = re.sub(r"\s*-\s*.*", "", s)
        m = re.search(r"(benh vien|trung tam y te|tram y te|phong kham|nha khoa)[a-z0-9 ]*", s)
        return (m.group(0).strip() if m else s.strip())[:40]

    _ht["co_so"] = _ht["name_norm"].map(_loi_ten)
    thieu = _ht[_ht["kc_m"] > BAN_KINH_M].sort_values("kc_m", ascending=False)
    thieu_gom = thieu.drop_duplicates("co_so")[
        ["name", "name_norm", "co_so", "lat", "lng", "kc_m", "province_name", "uid"]
    ]

    return {
        f"poi_benhvien_{scope}_b1.parquet": b1,
        f"poi_benhvien_{scope}_b3.parquet": b3,
        f"poi_benhvien_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_benhvien_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_sau_benhvien.parquet": con_lai,
        f"poi_benhvien_{scope}_thieu_bang_chung.parquet": thieu_gom,
        "_params": {
            "dat_tay": {"DT_LON": DT_LON, "DT_VUA": DT_VUA, "BAN_KINH_M": BAN_KINH_M},
            "hoc_tu_du_lieu": {"n_ten_tinh_danh_muc": len(ten_tinh)},
            "do_duoc": {
                "n_loai_xung_dot": int(yt["loai_xung_dot"].sum()),
                "tuyen_yt": final["tuyen_yt"].value_counts().to_dict(),
            },
        },
        "_do": {"recall": do_recall, "xung_dot": do_xung_dot, "thieu_bang_chung": len(thieu_gom)},
    }
