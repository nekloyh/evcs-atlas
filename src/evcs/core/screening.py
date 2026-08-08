"""Engine sàng lọc đơn — ngưỡng CHÍNH SÁCH và luật quyết định.

Ngưỡng ở đây **không phải thống kê**, chúng do khách hàng chốt. Nghĩa là chúng không được
"hiệu chuẩn lại theo tỉnh": đổi chúng là đổi chính sách, và đó là việc có người ký.

Nhưng có một điều PHẢI đo theo tỉnh, và nó ghi ở đây để không ai quên: ngưỡng cao tải 40%
được chọn vì nó *phân biệt được ở Hà Nội* (23,4% so với 71,7%). Ở tỉnh mà mức sử dụng thấp
hơn hẳn, cùng ngưỡng có thể chọn ra 0 trạm. Giữ ngưỡng, nhưng ĐO độ phân biệt của nó theo
từng tỉnh và báo cáo.

Đầu ra của module này **không phải một số đo** — nó là đầu ra của một RULE. Đừng đọc
``screen_decision`` như đọc ``population``.
"""

from __future__ import annotations

import numpy as np

# Khoảng cách tối thiểu tới trạm gần nhất để một ô được ĐỀ XUẤT, theo loại đơn vị.
NGUONG_M = {"PHUONG": 500.0, "XA": 2000.0}

# Đặc khu dùng ngưỡng của PHƯỜNG. Đây là một SUY LUẬN, không phải điều khoản: đặc khu là đơn
# vị đô thị/đảo có mật độ và bán kính đi lại gần phường hơn xã. Nó được đếm riêng ở QA
# (``stats.n_o_dac_khu``) để người ký nhìn thấy nó tác động tới bao nhiêu ô.
NGUONG_DAC_KHU = NGUONG_M["PHUONG"]

# Sàn tuyệt đối cho ngoại lệ: dưới mức này thì không có cửa nào, kể cả trạm gần nhất cao tải.
NGUONG_NGOAI_LE_M = 500.0

# Ngưỡng "trạm gần nhất đang cao tải".
CAO_TAI = 0.40

DE_XUAT = "DE_XUAT"
DE_XUAT_NEU_CO_DC = "DE_XUAT_NEU_CO_DC"
TU_CHOI = "TU_CHOI"


def threshold_for(kind):
    """Ngưỡng mét theo ``commune_kind`` — vector hoá, ba nhánh.

    Luật hai nhánh (``PHUONG`` / còn lại) là chỗ 13 đặc khu bị áp ngưỡng của Xã.
    """
    kind = np.asarray(kind)
    return np.where(
        kind == "PHUONG",
        NGUONG_M["PHUONG"],
        np.where(kind == "DAC_KHU", NGUONG_DAC_KHU, NGUONG_M["XA"]),
    )


def decide(dist_m, kind, nearest_high_load):
    """(quyết định, biên độ mét) cho từng ô.

    ``dist_m``            khoảng cách chim bay tới trạm gần nhất
    ``kind``              ``commune_kind`` của ô
    ``nearest_high_load`` trạm gần nhất ĐO ĐƯỢC và đang cao tải

    Ngoại lệ CHỈ cho Xã: chưa đủ xa theo ngưỡng 2 km, nhưng vẫn trên sàn 500 m và trạm gần
    nhất đang cao tải ⇒ đơn có cửa NẾU mang theo trụ DC.

    Ô không có khoảng cách hữu hạn thì quyết định là ``None``, **không phải** ``TU_CHOI`` —
    "không tính được" khác "đã xét và từ chối".
    """
    d = np.asarray(dist_m, dtype="float64")
    kind = np.asarray(kind)
    high = np.asarray(nearest_high_load, dtype=bool)

    nguong = threshold_for(kind)
    margin = d - nguong
    du_xa = d > nguong
    ngoai_le = (kind == "XA") & ~du_xa & (d > NGUONG_NGOAI_LE_M) & high

    decision = np.where(du_xa, DE_XUAT, np.where(ngoai_le, DE_XUAT_NEU_CO_DC, TU_CHOI))
    finite = np.isfinite(d)
    return np.where(finite, decision, None), np.where(finite, margin, np.nan)
