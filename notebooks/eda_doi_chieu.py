"""Đối chiếu toàn chuỗi EDA POI — cổng chặn của dây chuyền bóc lớp.

    uv run python notebooks/eda_doi_chieu.py [SCOPE]

DỪNG nếu một trong ba bất biến hỏng:
  1. tổng dòng của 9 lớp + phần thừa cuối = bộ gốc (không thất thoát)
  2. không hai lớp nào chia sẻ một `uid` (không đếm đôi)
  3. mỗi bộ `con_lai` đúng bằng bộ vào của lớp sau (dây chuyền liền mạch)

Chạy sau khi thực thi lại bất kỳ notebook nào trong chuỗi.
"""

import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
EDA = ROOT / "data/qa/eda"
SCOPE = sys.argv[1] if len(sys.argv) > 1 else "7tinh"

# Thứ tự dây chuyền. `nguon` = bộ mà lớp đó ĐỌC vào; `con_lai` = bộ nó GHI ra cho lớp sau.
# Lớp nhà ở đọc thẳng bộ gốc và ghi `con_lai` không hậu tố (di sản của notebook đầu tiên).
CHUOI = [
    (
        "chungcu",
        f"../critique/poi_extended_{SCOPE}.parquet",
        f"poi_extended_{SCOPE}_con_lai.parquet",
    ),
    (
        "luutru",
        f"poi_extended_{SCOPE}_con_lai.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_luutru.parquet",
    ),
    (
        "thuongmai",
        f"poi_extended_{SCOPE}_con_lai_sau_luutru.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_thuongmai.parquet",
    ),
    (
        "giaitri",
        f"poi_extended_{SCOPE}_con_lai_sau_thuongmai.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_giaitri.parquet",
    ),
    (
        "thamquan",
        f"poi_extended_{SCOPE}_con_lai_sau_giaitri.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_thamquan.parquet",
    ),
    (
        "truonghoc",
        f"poi_extended_{SCOPE}_con_lai_sau_thamquan.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_truonghoc.parquet",
    ),
    (
        "benhvien",
        f"poi_extended_{SCOPE}_con_lai_sau_truonghoc.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_benhvien.parquet",
    ),
    (
        "hanhchinh",
        f"poi_extended_{SCOPE}_con_lai_sau_benhvien.parquet",
        f"poi_extended_{SCOPE}_con_lai_sau_hanhchinh.parquet",
    ),
    (
        "vanphong",
        f"poi_extended_{SCOPE}_con_lai_sau_hanhchinh.parquet",
        f"poi_extended_{SCOPE}_con_lai_cuoi.parquet",
    ),
]

# Cột nhãn chính của mỗi lớp — thứ downstream phải đọc thay cho `label` thô.
NHAN = {
    "chungcu": ("kdt_class / label", "container_uid"),
    "luutru": ("hang_ten + quy_mo", "container_uid"),
    "thuongmai": ("hang_tm + quy_mo_tm", "container_uid"),
    "giaitri": ("hang_gt + vai_tro", "container_uid"),
    "thamquan": ("hang_tq + suc_hut", "container_uid"),
    "truonghoc": ("cap_chot + hang_th", "container_uid"),
    "benhvien": ("loai_yt + tuyen_yt", "container_uid"),
    "hanhchinh": ("cap_hc + nganh_hc", "container_uid"),
    "vanphong": ("hang_vp", "container_uid"),
}


def doc_uid(p: Path) -> set:
    return set(pq.read_table(p, columns=["uid"]).to_pandas()["uid"])


goc_path = EDA / CHUOI[0][1]
n_goc = pq.ParquetFile(goc_path).metadata.num_rows
print(f"bộ GỐC: {goc_path.name} = {n_goc:,} dòng\n")

rows, moi_uid, loi = [], {}, []
for lop, nguon, con_lai in CHUOI:
    f_final = EDA / f"poi_{lop}_{SCOPE}_final.parquet"
    f_nguon, f_con = EDA / nguon, EDA / con_lai
    for f in (f_final, f_nguon, f_con):
        if not f.exists():
            loi.append(f"THIẾU FILE: {f.name}")
    if loi:
        break

    uid_final = doc_uid(f_final)
    n_nguon = pq.ParquetFile(f_nguon).metadata.num_rows
    n_con = pq.ParquetFile(f_con).metadata.num_rows

    # (3) dây chuyền liền mạch: bộ vào − lớp = bộ ra
    if n_nguon - len(uid_final) != n_con:
        loi.append(f"{lop}: {n_nguon:,} − {len(uid_final):,} ≠ {n_con:,}")

    # (2) không đếm đôi
    for lop_khac, uid_khac in moi_uid.items():
        giao = uid_final & uid_khac
        if giao:
            loi.append(f"{lop} ∩ {lop_khac} = {len(giao):,} uid")
    moi_uid[lop] = uid_final

    bi_xoa = EDA / f"poi_{lop}_{SCOPE}_b3_bi_xoa.parquet"
    rows.append(
        {
            "lớp": lop,
            "dòng": len(uid_final),
            "cơ sở": None,
            "bị luật xoá": pq.ParquetFile(bi_xoa).metadata.num_rows if bi_xoa.exists() else 0,
            "còn lại sau lớp": n_con,
            "nhãn chính": NHAN[lop][0],
        }
    )

# đếm CƠ SỞ (lọc container_uid) — con số dùng được, khác con số dòng
for r in rows:
    f = EDA / f"poi_{r['lớp']}_{SCOPE}_final.parquet"
    cols = pq.ParquetFile(f).schema_arrow.names
    if "container_uid" in cols:
        s = pq.read_table(f, columns=["container_uid"]).to_pandas()["container_uid"]
        r["cơ sở"] = int(s.isna().sum())
    else:
        r["cơ sở"] = r["dòng"]

bang = pd.DataFrame(rows)
tong_lop = int(bang["dòng"].sum())
n_cuoi = pq.ParquetFile(EDA / CHUOI[-1][2]).metadata.num_rows

print(bang.to_string(index=False))
print()
print(f"tổng 9 lớp        : {tong_lop:,}")
print(f"phần thừa cuối    : {n_cuoi:,}")
print(f"cộng lại          : {tong_lop + n_cuoi:,}")
print(f"bộ gốc            : {n_goc:,}")

# (1) không thất thoát
if tong_lop + n_cuoi != n_goc:
    loi.append(
        f"tổng {tong_lop + n_cuoi:,} ≠ bộ gốc {n_goc:,} (lệch {tong_lop + n_cuoi - n_goc:+,})"
    )

print()
if loi:
    print("✗ ĐỐI CHIẾU HỎNG:")
    for e in loi:
        print("   ", e)
    sys.exit(1)

print("✓ không thất thoát: tổng 9 lớp + phần thừa = bộ gốc")
print("✓ không đếm đôi: 36 cặp lớp, giao = 0")
print("✓ dây chuyền liền mạch: mỗi bộ con_lai khớp bộ vào của lớp sau")
print(
    f"\nđộ phủ của chuỗi: {tong_lop / n_goc:.1%} bộ gốc được gán vào một lớp"
    f" ({tong_lop:,}/{n_goc:,})"
)
