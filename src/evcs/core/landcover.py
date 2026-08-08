"""Bảng lớp phủ ESA WorldCover.

Cố ý KHÔNG có trường ``buildable``. Bản trước có, dựng từ hai ngưỡng lớp phủ đặt tay; quét
ngưỡng cho thấy hàm số-ô **trơn, không có vai** nào — mọi ngưỡng tuỳ tiện như nhau — và
ngưỡng đang dùng **loại nhầm 3,3% trạm đang vận hành thật**. Cộng thêm ảnh nguồn là 2021
dùng cho 2026, điểm mù lệch có hệ thống vào đúng vành đai ven đô mới xây.

Các ``*_frac`` vẫn phát bình thường; ai muốn đặt ngưỡng thì tự đặt và tự chịu trách nhiệm.
Xem ``DECISIONS.md`` §7. Ghi ở đây để không ai "khôi phục" nó khi mở rộng phạm vi.
"""

from __future__ import annotations

CLASSES = {
    10: "tree",
    20: "shrub",
    30: "grass",
    40: "crop",
    50: "built",
    60: "bare",
    70: "snow",
    80: "water",
    90: "wetland",
    95: "mangrove",
    100: "moss",
}

# Mọi phân mảnh phát ĐỦ 11 cột, kể cả cột toàn 0.
#
# Gói ``hanoi`` chỉ phát cột ``*_frac`` khi ``sum > 0``, nên schema đổi theo dữ liệu: Hà Nội
# không có tuyết/ngập mặn/rêu ⇒ 3 cột biến mất. Đó chính là toàn bộ chênh lệch 56 cột (hanoi)
# so với 61 cột (vn). Schema phụ thuộc nội dung là schema không dùng được cho 34 phân mảnh.
FRAC_COLUMNS = [f"{name}_frac" for name in CLASSES.values()]
