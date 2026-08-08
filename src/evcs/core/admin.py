"""Luật về chiều địa giới — thuần giá trị, không đọc nguồn.

``commune_kind`` từng có **5 bản cài đặt** trong repo, **3 bản sai**: luật hai nhánh
(``startswith("Phường")`` → PHUONG, còn lại → XA) đúng 100% ở Hà Nội vì Hà Nội không có đặc
khu, nhưng toàn quốc có **13 đặc khu** (Phú Quốc, Côn Đảo, Vân Đồn, Cát Hải, Lý Sơn, Cô Tô,
Kiên Hải, Phú Quý, Thổ Châu, Bạch Long Vĩ, Cồn Cỏ, Trường Sa, Hoàng Sa) và luật ấy dán nhãn
``XA`` cho cả 13.

Ở ``screening`` nhãn đó CHỌN NGƯỠNG CHÍNH SÁCH: đặc khu bị áp ngưỡng 2.000 m của Xã. Một
quyết định quy hoạch do một tiền tố chuỗi quyết định — và nó được nhân bản 5 lần.
"""

from __future__ import annotations

KINDS = ("PHUONG", "XA", "DAC_KHU")
UNKNOWN_KIND = "KHONG_RO"

# --- ngưỡng bắt lỗi công bố của nguồn ------------------------------------
# Không SỬA dữ liệu nguồn, chỉ GẮN CỜ. Một luật một chỗ; bước dân số chỉ ĐỌC cờ.
MAX_COMMUNE_KM2 = 1_200.0
MIN_DENSITY_PPKM2 = 20.0
AREA_DRIFT_MAX = 0.25  # lệch giữa diện tích công bố và diện tích đo từ đa giác

FLAG_AREA_WRONG_MAGNITUDE = "DIENTICH_CONG_BO_SAI_BAC"
FLAG_POP_TOO_LOW = "DANSO_CONG_BO_QUA_THAP"
FLAG_AREA_DRIFT = "DIENTICH_LECH_HINH_HOC"


def commune_kind(name: str) -> str:
    """``PHUONG`` · ``XA`` · ``DAC_KHU`` từ tiền tố tên VNSDI.

    BA nhánh, không phải hai. Tên VNSDI luôn mang tiền tố loại đơn vị, nên đây là đọc một
    trường có sẵn chứ không phải suy đoán; bước địa giới kiểm rằng mọi dòng rơi vào một
    trong ba nhánh và không có nhánh "còn lại".
    """
    s = str(name)
    if s.startswith("Phường"):
        return "PHUONG"
    if s.startswith("Đặc khu"):
        return "DAC_KHU"
    if s.startswith("Xã"):
        return "XA"
    return UNKNOWN_KIND


def quality_flags(area_km2: float, population: float, area_km2_geom: float) -> str | None:
    """Cờ chất lượng ở cấp xã, ngăn bằng ``|``, hoặc None nếu sạch.

    Ba vết hỏng ĐO ĐƯỢC của nguồn VNSDI, gắn cờ chứ không sửa âm thầm:

    * **diện tích sai bậc** — Phường Phú Lợi (TP.HCM) công bố 17.956 km², lớn hơn tỉnh lớn
      nhất nước; một mình nó làm diện tích TP.HCM cộng lại sai gần 4 lần.
    * **dân số quá thấp** — 52 xã toàn quốc công bố mật độ dưới 20 người/km². Một phần là
      lỗi nhập liệu, một phần là xã miền núi thưa THẬT; cờ này nói "đừng neo vào con số
      này", không nói "con số này sai".
    * **diện tích lệch hình học** — công bố và đo từ đa giác lệch quá 25%.
    """
    flags = []
    if area_km2 > MAX_COMMUNE_KM2:
        flags.append(FLAG_AREA_WRONG_MAGNITUDE)
    if area_km2 > 0 and population / area_km2 < MIN_DENSITY_PPKM2:
        flags.append(FLAG_POP_TOO_LOW)
    if area_km2_geom > 0 and abs(area_km2 - area_km2_geom) / area_km2_geom > AREA_DRIFT_MAX:
        flags.append(FLAG_AREA_DRIFT)
    return "|".join(flags) if flags else None


def has_flag(flags: str | None, flag: str) -> bool:
    return bool(flags) and flag in str(flags).split("|")
