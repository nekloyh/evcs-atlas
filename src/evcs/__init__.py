"""EVCS — bộ dữ liệu nền cho bài toán đặt trạm sạc xe điện, phạm vi toàn quốc.

Ba tầng, ranh giới giữa chúng là ranh giới về QUYỀN ĐỌC ĐĨA:

    evcs.core     nguyên hàm miền — THUẦN, không IO. Test không cần store.
    evcs.schema   khai cột của các bảng phát hành. Một chỗ, mọi thứ khác suy ra.
    evcs.pipeline bước ETL — chỗ DUY NHẤT được đọc/ghi đĩa.

Luật một chiều: ``pipeline`` gọi ``core`` và ``schema``; ``core`` không gọi ai; ``schema``
không gọi ai. Vi phạm chiều này là cách gói ``hanoi`` khoá mình vào một tỉnh — ``aoi.py``
vừa dựng hình học vừa đọc parquet, nên "chạy cho tỉnh khác" không phải chuyện đổi tham số
mà là chuyện sửa 12 file.
"""

__all__ = ["core"]
