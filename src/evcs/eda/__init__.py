"""Chuỗi ETL bóc lớp POI — bản port ĐẲNG CẤU của 9 notebook `notebooks/eda_*.ipynb`.

Hợp đồng: chạy trên `SCOPE="7tinh"` phải tái tạo ĐÚNG BẰNG chuẩn vàng đóng băng ở
`data/qa/eda/_gold/` (xem `gold_manifest.json`). Cổng parity so `set(uid)` hai chiều và
phân phối `drop_reason` từng luật — không có ngưỡng dung sai.

Vì là port đẳng cấu, mã ở đây CHÉP luật/regex/ngưỡng của notebook từng ký tự, kể cả những
chỗ đọc ra là hớ. Chỗ nghi sai được ghi vào báo cáo port, KHÔNG sửa tại chỗ — sửa là việc
của bước sau, khi parity đã xanh.

    evcs.eda.common       nguyên hàm dùng chung: chuẩn hoá tên, regex an toàn, dây chuyền
                          luật xoá, chỉ mục không gian, IO parquet
    evcs.eda.layers.<lop> một file một lớp, hàm `chay(df_vao, ...)` -> dict artefact
    evcs.eda.run          chạy 9 lớp đúng thứ tự, ghi `data/qa/eda/_etl/` + manifest
"""

__all__ = ["common"]
