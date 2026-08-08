"""Bộ dữ liệu Hà Nội — **ĐÓNG BĂNG**. Không sửa, không mở rộng, không thêm bước.

Gói này là bản dựng đầu tiên, phạm vi một tỉnh. Mọi luật của nó đã được port sang
``evcs.core`` (nguyên hàm thuần) và ``vn`` (bước ETL tham số hoá theo tỉnh), và bảng đối
chứng ở ``AUDIT_TOAN_QUOC.md §F`` chứng minh hai đường mã cho ra cùng số trên 12 chỉ số.

**Vì sao vẫn còn ở đây, và điều kiện để xoá: ``docs/adr/0003-chua-xoa-goi-hanoi.md``.**

Tóm tắt: hai lớp chỉ gói này dựng được — ``substations.geojson`` (không có bước ``n`` tương
ứng) và ``routes_showcase.geojson`` (cần ``way_nodes`` + ``return_predecessors`` mà
``core.roadgraph`` đã bỏ). Xoá bây giờ là MẤT TÍNH NĂNG, không phải refactor.

Sửa một luật ở đây mà không sửa ở ``evcs.core`` là dựng lại đúng cái fork mà cả đợt refactor
vừa gỡ. Nếu phải sửa: sửa ở ``core``, rồi port, rồi chạy ``make golden``.
"""
