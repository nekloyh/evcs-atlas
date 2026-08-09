"""LỚP 9 — văn phòng. Lớp CUỐI của dây chuyền.

Port đẳng cấu của `notebooks/eda_vanphong.ipynb`. Đọc `..._con_lai_sau_hanhchinh.parquet`.

Lớp này khác tám lớp trước ở chỗ CĂN BẢN: nó được định nghĩa bằng PHỦ ĐỊNH. OSM không có
tag nào nghĩa là "toà nhà văn phòng" — `building=office` chỉ phủ một phần nhỏ, `office=*`
mô tả một DOANH NGHIỆP THUÊ CHỖ chứ không mô tả TOÀ NHÀ. Định nghĩa thực tế: *một công
trình đủ lớn, KHÔNG thuộc tám lớp trước, và có dấu hiệu hoạt động kinh tế.*

Hệ quả phải nói thẳng: **sai số của tám lớp trên dồn hết xuống đây**, và mọi con số của lớp
này kém tin hơn tám lớp trên.

⚠ ĐÂY LÀ LỚP CUỐI — luật xoá ở đây KHÔNG CÓ LƯỚI ĐỠ. Vì thế mọi điều kiện xoá phải là DANH
SÁCH, không được là ký tự đại diện: `man_made.notna()` cũ đã ăn oan 6 dòng, và `man_made` có
~80 giá trị nên ở SCOPE="vn" nó sẽ ăn lớn hơn nhiều bậc mà không ai thấy.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from evcs.eda import common as c

# ═══════════════════════════════════════════════════════════════════════════════
# HẰNG SỐ
# ═══════════════════════════════════════════════════════════════════════════════

TANG_CAO = 8  # tầng — ngưỡng "cao tầng". ĐẶT TAY, cố ý kế thừa ĐÚNG ngưỡng mà `eda_chungcu`
#               dùng cho nhóm `morph_review`, để hai lớp nói cùng ngôn ngữ về món nợ chung.
#               Chiều cao KHÔNG tách được nhóm ở thân phân phối (trung vị hai nhóm bằng nhau:
#               8,0 và 8,0) — nó chỉ tách ở ĐUÔI (13,0% vs 1,7% chạm ngưỡng).
# Trần cổng HẬU KIỂM — TỶ LỆ trên cỡ bộ vào. KHÔNG phải số tuyệt đối. Trần cũ
# (30) hiệu chỉnh trên bộ vào 5.108 dòng của 7 tỉnh; toàn quốc lớn hơn nhiều lần
# nên số tuyệt đối sẽ đỏ chỉ vì bộ to hơn. Giữ ĐÚNG tỷ lệ cũ ⇒ chạy lại 7tinh cho ra
# đúng trần 30 như trước. parity không đổi một dòng.
TY_LE_XUNG_DOT = 30 / 5_108  # ≈ 0.5873% bộ vào
SAN_XUNG_DOT = 30  # sàn: scope nhỏ không bị siết chặt hơn notebook

# Chỉ nạp các trường là TÊN CỦA CHÍNH VẬT THỂ. `official_name`/`short_name` thuộc nhóm này
# và trước đây bị bỏ quên — cổng độc lập đo được 2 dòng lọt lưới vì thế. CỐ Ý KHÔNG nạp
# `operator`/`brand`/`addr:housename`/`description`: chúng mô tả NGƯỜI VẬN HÀNH hoặc VẬT
# CHỨA — nạp vào sẽ kéo 305 cây xăng "CTXD Quân đội" và cửa hàng trong toà nhà vào lớp.
KHOA_TEN_ALT = ("name:vi", "name:en", "alt_name", "old_name", "official_name", "short_name")

TAG_BUOC_1 = (
    "office", "building", "landuse", "amenity", "shop", "leisure", "tourism", "healthcare",
    "historic", "man_made", "highway", "public_transport", "railway", "aeroway", "craft",
    "place", "military", "religion", "government", "boundary", "power", "industrial",
)  # fmt: skip

# `\btoa\b` trần khớp "Toà án" (đã bóc ở lớp hành chính) và "Toạ"; `\bthap\b` khớp "Tháp"
# (tháp nước, tháp truyền hình). Cả hai chỉ dùng kèm ngữ cảnh.
VP_RX = (
    r"toa nha|\bcao oc\b|\btower\b|\btrung tam thuong mai va van phong\b"
    r"|van phong|\boffice\b|\bbuilding\b|\bcomplex\b|\bcenter\b|\bcentre\b"
    r"|tru so (?:cong ty|chinh|lam viec)|cong ty|\bcty\b|\btnhh\b|\bcp \b|tap doan|tong cong ty"
    r"|chi nhanh|van phong dai dien|\bvpdd\b|coworking|\bstartup\b"
)

# `FUNC_KEYS` giống hệt danh sách của `eda_chungcu` — cố ý, vì nhóm này chính là món nợ mà
# lớp đó treo lại. KHÁC một điểm có chủ ý: lớp đó đòi KHÔNG có tag chức năng nào; lớp này
# KHÔNG đòi — một toà 15 tầng có chi nhánh ngân hàng ở tầng trệt vẫn là toà văn phòng.
FUNC_KEYS = {
    "amenity", "shop", "office", "tourism", "leisure", "man_made", "historic",
    "highway", "public_transport", "railway", "power", "natural", "craft",
    "healthcare", "military", "government",
}  # fmt: skip

MAN_MADE_CONG_NGHIEP = [
    "works", "water_works", "wastewater_plant", "gasometer", "silo", "storage_tank",
    "pipeline", "kiln", "mineshaft", "adit", "petroleum_well", "oil_well", "chimney",
    "crane", "goods_conveyor", "quarry",
]  # fmt: skip
RX_CN = r"nha may|xi nghiep|kho bai|\bkho \b|xuong san xuat|tram bien ap|\btba\b|nha kho"
# `kcn|khu cong nghiep` chỉ tính khi đứng ĐẦU tên ("KCN Đại An"). Ở GIỮA tên nó là ĐỊA CHỈ:
# đo 7/7 dòng khớp-giữa đều KHÔNG phải khu công nghiệp ("Argibank KCN Tân Thành").
RX_KCN = r"(?:\bkcn\b|khu cong nghiep|khu che xuat)"
TEN_VP_MANH_RX = r"toa nha|\bcao oc\b|\btower\b|van phong|\boffice\b"

NGOAI_LOP_AMENITY = [
    "restaurant", "cafe", "fast_food", "bar", "pub", "parking", "fuel", "bank", "atm",
    "pharmacy", "school", "kindergarten", "college", "university", "hospital", "clinic",
    "marketplace", "place_of_worship", "toilets", "bus_station", "townhall", "police",
    "post_office", "courthouse", "library", "cinema",
    # THIẾT BỊ ĐẶT NHỜ ĐỊA ĐIỂM — node trần, luật hạ tầng đường KHÔNG bắt được.
    "bicycle_rental", "vending_machine", "parcel_locker",
]  # fmt: skip

# LUẬT 5 — MỞ RỘNG do MẪU NGẪU NHIÊN 50 DÒNG chỉ ra: 4 nhóm bổ sung, mỗi nhóm đo riêng.
# CỐ Ý KHÔNG thêm `^thap ` dù "Lầu/Tháp" cùng họ: "Tháp" là tên rất thường của chính TOÀ
# VĂN PHÒNG ("Tháp Bitexco"), ở SCOPE="vn" nó sẽ ăn nhầm hàng loạt.
TEN_LOAI_KHAC_RX = (
    r"benh vien|phong kham|nha thuoc|truong (?:tieu hoc|thcs|thpt|mam non|mau giao|dai hoc)"
    r"|khach san|nha nghi|sieu thi|trung tam thuong mai|\bcay xang\b|tram xang|\bchung cu\b"
    r"|\bnha tho\b|\bchua \b|nghia trang|\bbai do xe\b|ben xe|cong vien|\bubnd\b|\bcong an\b"
    r"|\blobby\b|\bsanh\b|drop.?off|thang may|\belevator\b|\breception\b"
    r"|ky tuc xa|\bktx\b"
    r"|tram vien thong|tram thu phat|tram bts|cot ang ten"
    r"|^lau |\bden tho\b|\bmieu\b"
)
MOC_RX = (
    r"^(?:doi dien|truoc cong|he truoc|he doi dien|diem xen|cong khu|ben canh|duong vao|qua san)"
)

TOA_VP_LOAI_TRU_BUILDING = ["warehouse", "industrial", "parking"]
LUAT_CO_Y = {"TAG_LOP_KHAC", "CONG_NGHIEP_NGOAI_MVP", "O_DAT_VO_DANH"}


def _co_bang_chung_vp(df: pd.DataFrame) -> pd.Series:
    """Bằng chứng VĂN PHÒNG — tag tự khai hoặc hình thái cao tầng."""
    return (
        df["building"].eq("office")
        | df["office"].notna()
        | (df["levels"].ge(TANG_CAO) & df["is_area"])
    )


def chay(poi: pd.DataFrame, *, scope: str, morph_uids: set[str] | None = None) -> dict:
    """`morph_uids` — món nợ bàn giao từ lớp 1 (`poi_morph_review_<scope>.parquet`)."""
    poi = poi.copy()
    morph_uids = morph_uids or set()

    # ── BƯỚC 1 — filter MỎNG ────────────────────────────────────────────────
    td = poi["tags_dict"]
    c.bung_tags(poi, TAG_BUOC_1, ha_chu=True)
    poi["levels"] = pd.to_numeric(td.map(lambda t: t.get("building:levels")), errors="coerce")
    poi["operator"] = td.map(lambda t: t.get("operator"))
    poi["brand"] = td.map(lambda t: t.get("brand"))
    poi["name_norm"] = c.ghep_ten_norm(poi, KHOA_TEN_ALT)
    name_norm = poi["name_norm"]

    VP_TAG = (
        poi["office"].notna()
        | poi["building"].isin(["office", "commercial"])
        | poi["landuse"].eq("commercial")
    )
    VP_NAME = c.chua(name_norm, VP_RX)
    VP_HINH_THAI = poi["building"].notna() & poi["levels"].ge(TANG_CAO) & poi["is_area"]
    VP_MORPH = poi["uid"].isin(morph_uids)

    poi["is_vp"] = VP_TAG | VP_NAME | VP_HINH_THAI | VP_MORPH

    # Cổng TOÀN VẸN. ⚠ ĐÂY KHÔNG PHẢI BẰNG CHỨNG RECALL: cả 9 phép thử đều là TẬP CON của
    # điều kiện tuyển theo cấu tạo, nên "mất 0" là tất yếu. Giữ làm cổng HỒI QUY.
    c.cong_toan_ven(
        {
            "office=* (mọi giá trị)": poi["office"].notna(),
            "building=office": poi["building"].eq("office"),
            "building=commercial": poi["building"].eq("commercial"),
            "landuse=commercial": poi["landuse"].eq("commercial"),
            "tên 'toà nhà'": c.chua(name_norm, r"toa nha"),
            "tên 'tower'": c.chua(name_norm, r"\btower\b"),
            "tên 'văn phòng'": c.chua(name_norm, r"van phong"),
            "tên 'công ty'": c.chua(name_norm, r"cong ty|\bcty\b"),
            "hình thái ≥8 tầng": VP_HINH_THAI,
        },
        poi["is_vp"],
        lop="vanphong",
    )

    # ── CỔNG RECALL 2 — ĐỘC LẬP THẬT ────────────────────────────────────────
    # Chỉ dùng những trường KHÔNG hề tham gia tuyển: `building:use`, `operator`, `brand`,
    # `addr:housename`, và khe hẹp của nhánh C. Mỗi đầu dò còn phải tự thu hẹp về VẬT THỂ,
    # vì các trường này nổi tiếng mô tả nhầm chỗ: `addr:housename` của "Techcombank" là tên
    # TOÀ NHÀ chứa nó (11 dòng), `operator` của cây xăng là "CTXD Quân đội" (305 dòng).
    _bo = poi[~poi["is_vp"]]
    _ten = _bo["name_norm"]
    _tags = _bo["tags_dict"]

    def _f(key):
        """Giá trị một khoá TRONG BỘ BỊ BỎ, đã bỏ dấu — các khoá này KHÔNG dùng để tuyển."""
        return _tags.map(lambda t, k=key: c.strip_accents(t[k]) if k in t else "")

    FUNC_KHAC = FUNC_KEYS | {"landuse"}
    _vo_chuc_nang = _tags.map(lambda t: not (FUNC_KHAC & t.keys()))
    _co_building = _tags.map(lambda t: "building" in t)
    # `building` phải là giá trị TRUNG TÍNH: `building=train_station`/`church`/`school` là
    # lời tự khai thuộc lớp khác ("Ga Hà Nội", "Bến xe Mỹ Đình").
    _la_cong_trinh = (
        _bo["is_area"] & _bo["building"].isin(["yes", "office", "commercial"]) & _vo_chuc_nang
    )

    do_recall = c.cong_recall(
        df=_bo,
        lop="vanphong",
        scope=scope,
        dau_do_cung={
            # Khe của nhánh C: nhánh C đòi `building` notna, nên polygon cao tầng KHÔNG khai
            # `building` sẽ lọt. Đây là chỗ DUY NHẤT điều kiện tuyển tự để hở.
            "polygon ≥ 8 tầng mà THIẾU tag `building`": _bo["levels"].ge(TANG_CAO)
            & _bo["is_area"]
            & ~_co_building,
            # `building:use` mô tả CÔNG NĂNG TOÀ NHÀ. Chỉ tin khi vật thể chính là công
            # trình. (`retail` cố ý không nhận: đó là lớp thương mại.)
            "`building:use=office|commercial` trên công trình vô chức năng": _f(
                "building:use"
            ).isin(["office", "commercial"])
            & _bo["is_area"]
            & _vo_chuc_nang,
            "`operator`/`brand` là công ty, trên công trình vô chức năng": c.chua(
                _f("operator") + " " + _f("brand"), r"cong ty|tap doan|tong cong ty"
            )
            & _la_cong_trinh,
            "`addr:housename` nói 'toà nhà/cao ốc/tower'": c.chua(
                _f("addr:housename"), r"toa nha|\bcao oc\b|\btower\b"
            )
            & _bo["is_area"]
            & _vo_chuc_nang,
        },
        dau_do_mem={
            # `building:use` mô tả TOÀ NHÀ, nhưng POI lại là một CỬA HÀNG bên trong
            # ("Circle K"). Thuộc tính của VẬT CHỨA bị gắn lên VẬT ĐƯỢC CHỨA.
            "`building:use`/`addr:housename` toà nhà, nhưng vật thể CÓ tag chức năng": (
                _f("building:use").isin(["commercial", "office", "retail"])
                | c.chua(_f("addr:housename"), r"toa nha|\bcao oc\b|\btower\b")
            )
            & ~_vo_chuc_nang,
            "`building=yes` ≥ 2.000 m², vô danh — TỐI, không rule nào chạm": (
                _bo["building"].eq("yes")
                & _bo["is_area"]
                & _bo["area_m2"].ge(2_000)
                & _bo["name"].isna()
            ),
            "tên có 'trung tâm'": c.chua(_ten, r"trung tam"),
            "`landuse=industrial` — khu công nghiệp, ngoài phạm vi MVP": _bo["landuse"].eq(
                "industrial"
            ),
        },
    )

    vp = poi[poi["is_vp"]].copy()
    b1 = vp.copy()  # ghi đĩa TẠI ĐÂY, trước cờ cao_tang của bước 2

    # ── BƯỚC 2 — hiệu chuẩn chiều cao ───────────────────────────────────────
    vp["cao_tang"] = vp["levels"].ge(TANG_CAO).fillna(False)

    # ── BƯỚC 3 — precision ──────────────────────────────────────────────────
    dc = c.DayChuyenLoc(vp, ham_tha=_co_bang_chung_vp, cot_co="mixed_use")
    r = dc.con_lai

    # LUẬT 1 — hạ tầng đường. Lần thứ CHÍN và cuối cùng. Chín lớp, chín lần cùng một luật
    # đứng đầu: ở OSM Việt Nam, tên trạm xe buýt là nguồn nhiễu SỐ MỘT của mọi lớp POI.
    dc.xoa(
        r["highway"].notna()
        | r["public_transport"].notna()
        | r["railway"].notna()
        | r["aeroway"].notna(),
        "HA_TANG_DUONG",
    )

    # LUẬT 2 — Ô ĐẤT, không phải công trình. Lớp thương mại CỐ Ý không nhận `landuse=commercial`
    # và bàn giao xuống đây; quyết định cuối: giữ nếu CÓ TÊN, loại nếu vô danh và không công trình.
    r = dc.con_lai
    dc.xoa(
        r["landuse"].eq("commercial")
        & r["name"].isna()
        & r["office"].isna()
        & r["building"].isna(),
        "O_DAT_VO_DANH",
    )

    # LUẬT 3 — họ tag thuộc LỚP KHÁC. Bảy lớp trước đã dọn phần lớn; đây là phần lọt lưới
    # qua nhánh TÊN (một công ty tên "Công ty TNHH Nhà hàng ABC" thì vẫn là nhà hàng).
    r = dc.con_lai
    dc.xoa(
        r["shop"].notna()
        | r["healthcare"].notna()
        | r["tourism"].notna()
        | r["leisure"].notna()
        | r["government"].notna()
        | r["military"].notna()
        | r["amenity"].isin(NGOAI_LOP_AMENITY),
        "TAG_LOP_KHAC",
        tha=True,
    )

    # LUẬT 4 — CÔNG NGHIỆP, ngoài phạm vi MVP. TÁCH HAI NHÁNH vì độ tin KHÁC HẲN NHAU:
    #   TAG mô tả VẬT THỂ (`landuse=industrial` = "tôi là nhà máy"). `office=*` KHÔNG cãi
    #     lại được — nó chỉ nói có một doanh nghiệp ở đây, mà nhà máy nào cũng có. Miễn trừ
    #     cũ `~co_bang_chung_vp` (gồm `office.notna()`) đã giữ lại nhầm 7 nhà máy.
    #     Nhánh TAG nay chỉ miễn trừ HÌNH THÁI — thứ duy nhất mô tả chính công trình.
    #   TÊN thì ngược lại, yếu và hay là MỐC THAM CHIẾU. Giữ nguyên miễn trừ rộng: đo thử
    #     siết nhánh này thì 30 dòng bị đụng, ≥10 dòng sai = 33% ≫ ngưỡng 1% ⇒ BÁC.
    r = dc.con_lai
    CN_TAG = (
        r["landuse"].isin(["industrial", "warehouse", "quarry", "port"])
        | r["building"].isin(["industrial", "warehouse", "factory", "hangar"])
        | r["man_made"].isin(MAN_MADE_CONG_NGHIEP)
        | r["power"].notna()
    )
    _nn = r["name_norm"]
    TEN_VP_MANH = c.chua(_nn, TEN_VP_MANH_RX)
    CN_TEN = (c.chua(_nn, RX_CN) | c.bat_dau_bang(_nn, RX_KCN + r"\b")) & ~TEN_VP_MANH
    # HÌNH THÁI = bằng chứng duy nhất cãi lại được một tag công nghiệp.
    HINH_THAI_VP = r["building"].eq("office") | (r["levels"].ge(TANG_CAO) & r["is_area"])
    dc.xoa(
        (CN_TAG & ~HINH_THAI_VP) | (CN_TEN & ~_co_bang_chung_vp(r)),
        "CONG_NGHIEP_NGOAI_MVP",
    )

    # LUẬT 5 — tên nói thẳng là loại khác + bộ phận toà nhà / hạ tầng.
    r = dc.con_lai
    dc.xoa(
        c.chua(r["name_norm"], TEN_LOAI_KHAC_RX) & ~_co_bang_chung_vp(r),
        "TEN_LOAI_KHAC",
    )

    # LUẬT 6 — MỐC THAM CHIẾU.
    r = dc.con_lai
    dc.xoa(c.chua(r["name_norm"], MOC_RX), "MOC_THAM_CHIEU")

    clean, removed = dc.ket()

    conflict = removed[_co_bang_chung_vp(removed)]
    cf_ngoai_y = conflict[~conflict["drop_reason"].isin(LUAT_CO_Y)]
    do_xung_dot = c.cong_xung_dot(
        len(cf_ngoai_y),
        len(clean) + len(removed),
        ty_le=TY_LE_XUNG_DOT,
        san=SAN_XUNG_DOT,
        lop="vanphong",
        nhan="có bằng chứng VĂN PHÒNG",
        df_pham=cf_ngoai_y,
        scope=scope,
    )

    b3 = clean.copy()  # ghi đĩa TẠI ĐÂY, trước các cột của bước 4

    # ── BƯỚC 4 — ĐO, không quyết ────────────────────────────────────────────
    nn_c = clean["name_norm"]
    hang = pd.Series("DIEM_DOANH_NGHIEP", index=clean.index)
    # `TOA_VAN_PHONG` phải là một CÔNG TRÌNH nên đòi `is_area`: 33/592 dòng là NODE mang tên
    # "Toà Nhà X" — điểm chỉ chỗ, không có mặt bằng, làm con số "số TOÀ" phồng lên.
    hang[
        (
            clean["building"].eq("office")
            | clean["cao_tang"]
            | c.chua(nn_c, r"toa nha|\bcao oc\b|\btower\b|\bbuilding\b")
        )
        & clean["is_area"]
        # `building` tự khai là loại công trình KHÁC thì thắng cả chiều cao: một khối
        # `building=warehouse` 8 tầng không phải toà văn phòng. (`retail` KHÔNG loại —
        # "Tòa nhà Zen Plaza" 12 tầng là toà thật.)
        & ~clean["building"].isin(TOA_VP_LOAI_TRU_BUILDING)
    ] = "TOA_VAN_PHONG"
    hang[clean["office"].isin(["diplomatic"])] = "NGOAI_GIAO"
    hang[clean["office"].isin(["ngo", "association", "charity", "religion", "political_party"])] = (
        "TO_CHUC_XA_HOI"
    )
    hang[clean["landuse"].eq("commercial") & clean["building"].isna() & clean["office"].isna()] = (
        "O_DAT_DICH_VU"
    )
    clean["hang_vp"] = hang
    # Món nợ từ lớp nhà ở là một TRẠNG THÁI ("chưa biết chung cư hay văn phòng"), không phải
    # một HẠNG. Trước đây nó được gán đè lên `hang_vp` và chạy CUỐI, nên nuốt trọn 38 dòng —
    # cả 38 đều có `levels ≥ 8` tức đều thuộc `TOA_VAN_PHONG`. Nay tách thành CỜ riêng.
    clean["no_tu_lop_nha_o"] = clean["uid"].isin(morph_uids) if morph_uids else False

    # Ở lớp này `container_uid` có nghĩa RIÊNG: nó tách 'toà nhà' khỏi 'doanh nghiệp thuê
    # chỗ trong toà' — hai thực thể khác nhau, và bài toán trạm sạc chỉ cần cái thứ nhất.
    chi_muc = c.ChiMucKhongGian(clean)
    vung = c.nap_geom(clean[clean["is_area"]])
    clean["container_uid"] = clean["uid"].map(
        c.gan_container(vung, chi_muc, np.ones(len(clean), dtype=bool))
    )
    clean["fragment_group"] = c.nhom_manh(clean, clean["name"].notna())

    # ── BƯỚC 5 — FINAL + bộ CÒN LẠI CUỐI CÙNG ───────────────────────────────
    final = clean.copy()
    con_lai = c.con_lai_sau(poi, final)
    thieu = len(removed) - int(removed["uid"].isin(con_lai["uid"]).sum())
    if thieu:
        raise AssertionError(f"mất {thieu} dòng bị luật xoá khỏi bộ còn lại")

    return {
        f"poi_vanphong_{scope}_b1.parquet": b1,
        f"poi_vanphong_{scope}_b3.parquet": b3,
        f"poi_vanphong_{scope}_b3_bi_xoa.parquet": removed,
        f"poi_vanphong_{scope}_final.parquet": final,
        f"poi_extended_{scope}_con_lai_cuoi.parquet": con_lai,
        "_params": {
            "dat_tay": {"TANG_CAO": TANG_CAO},
            "hoc_tu_du_lieu": {},
            "do_duoc": {
                "n_no_tu_lop_nha_o": int(clean["no_tu_lop_nha_o"].sum())
                if hasattr(clean["no_tu_lop_nha_o"], "sum")
                else 0,
                "hang_vp": final["hang_vp"].value_counts().to_dict(),
            },
        },
        "_do": {
            "recall": do_recall,
            "xung_dot": do_xung_dot,
            "no_tu_lop_nha_o": int(clean["no_tu_lop_nha_o"].sum()),
        },
    }
