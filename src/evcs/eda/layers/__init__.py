"""Chín lớp của dây chuyền bóc lớp POI, mỗi lớp một file.

Thứ tự KHÔNG đổi được — mỗi lớp đọc `con_lai` của lớp trước:

    chungcu → luutru → thuongmai → giaitri → thamquan → truonghoc → benhvien
    → hanhchinh → vanphong

Ngoại lệ duy nhất so với danh sách gốc: *hành chính* chạy TRƯỚC *văn phòng*, vì
`office=government` chiếm 42% mọi `office=*` — để văn phòng chạy trước thì nó nuốt trọn
khối cơ quan nhà nước.
"""
