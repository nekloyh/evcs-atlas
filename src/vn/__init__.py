"""Pipeline ETL toàn quốc — 34 đơn vị hành chính cấp tỉnh.

14 bước, tham số hoá theo tỉnh, resume theo cặp (bước, tỉnh). Ghi vào ``store/``.

Gói này giữ phần BIẾT VỀ MIỀN NÀY: bước nào đọc gì, ghi gì, và các bảng nguồn nằm ở đâu.
Phần CƠ CHẾ — Dataset, Step, DAG, vân tay, audit — ở ``evcs.pipeline``; phần LUẬT — hình
học, taxonomy, ngưỡng chính sách — ở ``evcs.core``.

    datasets.py   34 bảng có TÊN, kèm tier (source · product · interim · cache · qa)
    runner.py     CLI mỏng: `python -m vn all --tinh 01 --soi`
    nXX_*.py      một bước một file, khai `reads`/`writes` bằng tên dataset

Thứ tự chạy KHÔNG viết tay ở đâu cả — nó là topo sort trên (reads, writes). Xem nó bằng
``python -m vn --do-thi``.

── QUAN HỆ VỚI GÓI ``hanoi`` ──────────────────────────────────────────────────────────

Bản trước của docstring này nói việc gộp ``hanoi`` vào đây là ĐÚNG nhưng hoãn, vì "không có
cách nào tách 'số đổi vì sửa đúng' khỏi 'số đổi vì lỗi mới'". Lý do đó **đã hết hiệu lực**:
``golden/`` phủ 863 bảng và DỪNG khi một con số đổi.

Nay việc gộp bị chặn bởi một ràng buộc khác và là ràng buộc thật — hai lớp chỉ ``hanoi``
dựng được. Xem ``docs/adr/0003-chua-xoa-goi-hanoi.md`` để biết ba việc phải xong trước.
"""
