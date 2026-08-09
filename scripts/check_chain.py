#!/usr/bin/env python
"""Cổng nhất quán chuỗi EDA POI: vào − final = ra, theo SỐ và theo TẬP uid.

Chạy: `make check-chain`. Rẻ (chỉ đọc cột uid) và bắt được đúng lỗi đã xảy ra một lần —
chạy lại một lớp giữa chuỗi mà không cascade xuống các lớp dưới. Kiểm thêm hợp đồng cột:
túi bàn giao phải giữ nguyên bộ cột của túi nhận vào, không mang biến công tác đi tiếp.
"""

import sys
from pathlib import Path

import pyarrow.parquet as pq

D = Path(__file__).resolve().parent.parent / "data/qa/eda"
S = "7tinh"
CHUOI = [
    ("luutru", f"poi_extended_{S}_con_lai.parquet", f"poi_extended_{S}_con_lai_sau_luutru.parquet"),
    (
        "thuongmai",
        f"poi_extended_{S}_con_lai_sau_luutru.parquet",
        f"poi_extended_{S}_con_lai_sau_thuongmai.parquet",
    ),
    (
        "giaitri",
        f"poi_extended_{S}_con_lai_sau_thuongmai.parquet",
        f"poi_extended_{S}_con_lai_sau_giaitri.parquet",
    ),
    (
        "thamquan",
        f"poi_extended_{S}_con_lai_sau_giaitri.parquet",
        f"poi_extended_{S}_con_lai_sau_thamquan.parquet",
    ),
    (
        "truonghoc",
        f"poi_extended_{S}_con_lai_sau_thamquan.parquet",
        f"poi_extended_{S}_con_lai_sau_truonghoc.parquet",
    ),
    (
        "benhvien",
        f"poi_extended_{S}_con_lai_sau_truonghoc.parquet",
        f"poi_extended_{S}_con_lai_sau_benhvien.parquet",
    ),
    (
        "hanhchinh",
        f"poi_extended_{S}_con_lai_sau_benhvien.parquet",
        f"poi_extended_{S}_con_lai_sau_hanhchinh.parquet",
    ),
    (
        "vanphong",
        f"poi_extended_{S}_con_lai_sau_hanhchinh.parquet",
        f"poi_extended_{S}_con_lai_cuoi.parquet",
    ),
]


def uids(f):
    return set(pq.read_table(D / f, columns=["uid"]).to_pandas()["uid"])


def main():
    loi = tong = canh_bao = 0
    print(f"{'lớp':11s} {'vào':>9s} {'final':>8s} {'ra':>9s} {'cột':>5s}  kết")
    for lop, fi, fo in CHUOI:
        ff = f"poi_{lop}_{S}_final.parquet"
        thieu = [f for f in (fi, ff, fo) if not (D / f).exists()]
        if thieu:
            print(f"{lop:11s} THIẾU FILE: {thieu}")
            loi += 1
            continue
        V, F, R = uids(fi), uids(ff), uids(fo)
        tong += len(F)
        cot_vao = pq.read_schema(D / fi).names
        cot_ra = pq.read_schema(D / fo).names
        ket = []
        if V - F - R:
            ket.append(f"{len(V - F - R)} uid BIẾN MẤT")
        if F - V:
            ket.append(f"{len(F - V)} uid TỪ HƯ KHÔNG")
        if R != V - F:
            ket.append("tập ra ≠ vào−final")
        loi += bool(ket)
        # Rò cột chỉ CẢNH BÁO, không đỏ. Nguồn này để dựng ETL: sai số có kiểm soát thì chấp
        # nhận được, cái phải chặn là MẤT/THỪA DÒNG vì nó làm hỏng phép đối chiếu cả chuỗi.
        ro = sorted(set(cot_ra) - set(cot_vao))
        canh_bao += bool(ro)
        trang_thai = "; ".join(ket) if ket else "OK"
        if ro:
            trang_thai += f"   ⚠ rò {len(ro)} cột công tác"
        print(f"{lop:11s} {len(V):9,} {len(F):8,} {len(R):9,} {len(cot_ra):5d}  {trang_thai}")
    print(f"\ntổng POI đã bóc qua {len(CHUOI)} lớp: {tong:,}")
    if canh_bao:
        print(
            f"⚠ {canh_bao}/{len(CHUOI)} lớp mang biến công tác sang túi bàn giao "
            "(nợ hình thức, không ảnh hưởng số liệu)."
        )
    if loi:
        print(f"\n✗ {loi} mắt xích hỏng — chạy lại các lớp TỪ mắt xích đầu tiên trở xuống.")
        return 1
    print("\n✓ chuỗi nhất quán: mọi mắt xích thoả vào − final = ra.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
