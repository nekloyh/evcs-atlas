"""Nguyên hàm của miền — THUẦN, không IO, không biết tỉnh nào đang chạy.

Ranh giới của gói này là một luật: **không module nào ở đây được đọc đĩa.** Vào là giá trị
và hình học, ra là giá trị và hình học. Vì thế test chúng không cần store, không cần nguồn,
không cần đợi 9 phút.

Mọi thứ ở đây từng tồn tại hai tới năm lần trong repo, dưới hai gói ``hanoi`` và ``vn``:

    geo         12 định nghĩa "mét trên một độ kinh", 4 giá trị khác nhau
    grid        2 bản sinh ứng viên + tỉ lệ diện tích (một bản thiếu ``abs()`` ở phép kiểm)
    admin       5 bản ``commune_kind``, 3 bản dán nhãn XA cho 13 đặc khu
    supply      2 bản phân loại scope, phát hai bộ nhãn khác nhau cho cùng khái niệm
    roadgraph   2 bản dựng đồ thị + Dijkstra, cộng bản thứ ba đã trôi ở ``analysis/``
    osm         2 bản taxonomy đường và POI
    screening   ngưỡng chính sách khai ở gói này, đọc ở gói kia bằng import chéo
    landcover   bảng 11 lớp, một bên phát đủ, một bên phát theo nội dung
"""
