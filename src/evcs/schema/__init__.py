"""Khai báo cột của các bảng phát hành — MỘT chỗ, mọi thứ khác suy ra.

Đây là hợp đồng giữa tầng ETL và tầng nhìn. Đẩy dữ liệu vào là hiển thị được ngay, và điều
đó đúng vì bốn thứ dưới đây không còn được viết tay ở bốn nơi nữa:

    n09_assemble    thứ tự cột + phép kiểm "bảng ghi ra đúng bằng bảng đã khai"
    n12_national    SUM_COLS / FRAC_COLS suy từ ``agg`` và ``national`` (trước: 40 tên cứng)
    n11_web_export  manifest khai cột nào CÓ, lớp nào VẮNG — suy từ ``layer``
    web/fields      danh mục trường bắt buộc phủ mọi cột ``mappable``, test nói chỗ nào thiếu

Thêm một cột nghĩa là thêm MỘT dòng ở ``grid.py``. Test sau đó nói chính xác còn thiếu gì.
"""

from .column import ARROW, Column, Table
from .commune import COMMUNE
from .grid import GRID
from .national import NATIONAL_R6

__all__ = ["ARROW", "COMMUNE", "GRID", "NATIONAL_R6", "Column", "Table", "TABLES"]

TABLES: dict[str, Table] = {t.name: t for t in (GRID, COMMUNE, NATIONAL_R6)}
