"""Bộ dữ liệu EVCS phạm vi TOÀN QUỐC — 34 đơn vị hành chính cấp tỉnh.

Gói này KHÔNG thay gói ``hanoi``. Hai gói sống cạnh nhau có chủ ý:

* ``hanoi``  — bộ dữ liệu Hà Nội đã hoàn chỉnh, gồm cả các lớp TÍNH TOÁN (dân số dasymetric,
  lớp phủ, Dijkstra, engine sàng lọc). Web hiện tại đọc thẳng sản phẩm của nó.
* ``vn``     — tầng DỮ LIỆU + DỮ LIỆU ĐỂ NHÌN cho cả nước, tham số hoá theo tỉnh. Không
  chứa lớp tính toán nào; xem ``docs`` của từng bước để biết cái gì cố ý vắng mặt.

Đổi ``hanoi`` thành trường hợp riêng của ``vn`` là việc ĐÚNG nhưng không làm ở lần này:
nó sẽ dựng lại mọi con số đã công bố của Hà Nội trong cùng một lần thay đổi, và không có
cách nào tách "số đổi vì sửa đúng" khỏi "số đổi vì lỗi mới". Thay vào đó ``n01_admin`` có
một phép kiểm ĐỐI CHIẾU hình học: ranh giới ``vn`` dựng cho tỉnh 01 phải trùng khít ranh
giới mà ``hanoi.aoi`` dựng. Trôi khỏi nhau là FAIL, không phải im lặng.
"""
