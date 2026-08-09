"""Cổng PARITY — so artefact ETL với chuẩn vàng `data/qa/eda/_gold/`.

    uv run python -m evcs.eda.parity [lop ...]

LỆCH PHẢI BẰNG 0. Không có ngưỡng dung sai, không có "chênh lệch nhỏ".

Hai phép so BẮT BUỘC, mỗi artefact:
  1. `set(uid)` khớp TUYỆT ĐỐI, kiểm HAI CHIỀU (thiếu ở ETL + thừa ở ETL)
  2. phân phối `drop_reason` khớp từng reason, từng con số (chỉ file `_b3_bi_xoa`)

Một phép so PHỤ (chẩn đoán, không phải cổng): giá trị từng cột chung, so theo `uid`. Nó
không nằm trong hợp đồng nhưng bắt được lỗi port mà cổng uid không thấy — ví dụ một cờ
tính sai trên đúng tập dòng. Kết quả in riêng dưới nhãn "PHỤ".
"""

from __future__ import annotations

import sys
from pathlib import Path

import pyarrow.parquet as pq

from evcs.eda.common import EDA_DIR

GOLD_DIR = EDA_DIR / "_gold"
ETL_DIR = EDA_DIR / "_etl"

# Artefact của mỗi lớp — 5 ô parity. `chungcu` mang tên di sản (b1 không hậu tố).
ARTEFACT = {
    "chungcu": [
        "poi_chungcu_{s}.parquet",
        "poi_chungcu_{s}_b3.parquet",
        "poi_chungcu_{s}_b3_bi_xoa.parquet",
        "poi_chungcu_{s}_final.parquet",
        "poi_extended_{s}_con_lai.parquet",
    ],
    "luutru": [
        "poi_luutru_{s}_b1.parquet",
        "poi_luutru_{s}_b3.parquet",
        "poi_luutru_{s}_b3_bi_xoa.parquet",
        "poi_luutru_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_luutru.parquet",
    ],
    "thuongmai": [
        "poi_thuongmai_{s}_b1.parquet",
        "poi_thuongmai_{s}_b3.parquet",
        "poi_thuongmai_{s}_b3_bi_xoa.parquet",
        "poi_thuongmai_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_thuongmai.parquet",
    ],
    "giaitri": [
        "poi_giaitri_{s}_b1.parquet",
        "poi_giaitri_{s}_b3.parquet",
        "poi_giaitri_{s}_b3_bi_xoa.parquet",
        "poi_giaitri_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_giaitri.parquet",
    ],
    "thamquan": [
        "poi_thamquan_{s}_b1.parquet",
        "poi_thamquan_{s}_b3.parquet",
        "poi_thamquan_{s}_b3_bi_xoa.parquet",
        "poi_thamquan_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_thamquan.parquet",
    ],
    "truonghoc": [
        "poi_truonghoc_{s}_b1.parquet",
        "poi_truonghoc_{s}_b3.parquet",
        "poi_truonghoc_{s}_b3_bi_xoa.parquet",
        "poi_truonghoc_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_truonghoc.parquet",
    ],
    "benhvien": [
        "poi_benhvien_{s}_b1.parquet",
        "poi_benhvien_{s}_b3.parquet",
        "poi_benhvien_{s}_b3_bi_xoa.parquet",
        "poi_benhvien_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_benhvien.parquet",
    ],
    "hanhchinh": [
        "poi_hanhchinh_{s}_b1.parquet",
        "poi_hanhchinh_{s}_b3.parquet",
        "poi_hanhchinh_{s}_b3_bi_xoa.parquet",
        "poi_hanhchinh_{s}_final.parquet",
        "poi_extended_{s}_con_lai_sau_hanhchinh.parquet",
    ],
    "vanphong": [
        "poi_vanphong_{s}_b1.parquet",
        "poi_vanphong_{s}_b3.parquet",
        "poi_vanphong_{s}_b3_bi_xoa.parquet",
        "poi_vanphong_{s}_final.parquet",
        "poi_extended_{s}_con_lai_cuoi.parquet",
    ],
}

# Artefact phụ, ngoài 45 ô hợp đồng nhưng vẫn phải khớp (món nợ bàn giao giữa các lớp).
ARTEFACT_PHU = {
    "chungcu": ["poi_morph_review_{s}.parquet"],
    "benhvien": ["poi_benhvien_{s}_thieu_bang_chung.parquet"],
}


def _uid(p: Path) -> set:
    return set(pq.read_table(p, columns=["uid"]).to_pandas()["uid"])


def _drop_reason(p: Path) -> dict[str, int]:
    cols = pq.ParquetFile(p).schema_arrow.names
    if "drop_reason" not in cols:
        return {}
    s = pq.read_table(p, columns=["drop_reason"]).to_pandas()["drop_reason"]
    return {str(k): int(v) for k, v in s.value_counts(dropna=False).items()}


def so_mot_artefact(ten: str) -> dict:
    """So một artefact ETL với bản vàng. Trả về ô parity."""
    g, e = GOLD_DIR / ten, ETL_DIR / ten
    o = {"artefact": ten, "gold_co": g.exists(), "etl_co": e.exists()}
    if not (g.exists() and e.exists()):
        o["ket"] = "THIẾU FILE"
        return o

    ug, ue = _uid(g), _uid(e)
    thieu, thua = ug - ue, ue - ug
    o["n_gold"] = len(ug)
    o["n_etl"] = len(ue)
    o["thieu"] = len(thieu)
    o["thua"] = len(thua)
    o["vi_du_thieu"] = sorted(thieu)[:5]
    o["vi_du_thua"] = sorted(thua)[:5]

    dg, de = _drop_reason(g), _drop_reason(e)
    lech_reason = {
        k: (dg.get(k, 0), de.get(k, 0)) for k in set(dg) | set(de) if dg.get(k, 0) != de.get(k, 0)
    }
    o["drop_reason_gold"] = dg
    o["lech_drop_reason"] = lech_reason

    o["ket"] = "KHỚP" if not thieu and not thua and not lech_reason else "LỆCH"
    return o


def so_cot(ten: str, bo_qua: tuple[str, ...] = ()) -> dict:
    """PHỤ (chẩn đoán): so giá trị từng cột chung, căn theo `uid`. Không phải cổng."""
    g, e = GOLD_DIR / ten, ETL_DIR / ten
    if not (g.exists() and e.exists()):
        return {}
    dg = pq.read_table(g).to_pandas()
    de = pq.read_table(e).to_pandas()
    if set(dg["uid"]) != set(de["uid"]):
        return {"_": "bỏ qua — tập uid đã lệch"}
    cot_gold, cot_etl = list(dg.columns), list(de.columns)
    chung = [x for x in cot_gold if x in cot_etl and x not in bo_qua and x != "uid"]
    dg = dg.drop_duplicates("uid").set_index("uid")
    de = de.drop_duplicates("uid").set_index("uid").reindex(dg.index)
    lech = {}
    for col in chung:
        a, b = dg[col], de[col]
        try:
            khac = ~((a == b) | (a.isna() & b.isna()))
            n = int(khac.sum())
        except (TypeError, ValueError):
            continue
        if n:
            lech[col] = n
    thieu_cot = sorted(set(cot_gold) - set(cot_etl))
    thua_cot = sorted(set(cot_etl) - set(cot_gold))
    return {"lech_gia_tri": lech, "cot_thieu": thieu_cot, "cot_thua": thua_cot}


def chay(cac_lop: list[str], scope: str = "7tinh", *, so_ca_cot: bool = True) -> int:
    tat_ca, n_lech = [], 0
    for lop in cac_lop:
        ten_files = [t.format(s=scope) for t in ARTEFACT[lop]]
        ten_files += [t.format(s=scope) for t in ARTEFACT_PHU.get(lop, [])]
        print(f"\n╔══ {lop} ══")
        for ten in ten_files:
            o = so_mot_artefact(ten)
            o["lop"] = lop
            tat_ca.append(o)
            if o["ket"] != "KHỚP":
                n_lech += 1
            dau = "✓" if o["ket"] == "KHỚP" else "✗"
            n = f"{o.get('n_gold', '?'):>7}" if "n_gold" in o else "      ?"
            chi_tiet = ""
            if o["ket"] == "LỆCH":
                chi_tiet = f"  thiếu {o['thieu']:,} · thừa {o['thua']:,}"
                if o["lech_drop_reason"]:
                    chi_tiet += f" · drop_reason lệch {len(o['lech_drop_reason'])} loại"
            print(f"║ {dau} {n} {ten:52s}{chi_tiet}")
            if o["ket"] == "LỆCH":
                if o["vi_du_thieu"]:
                    print(f"║      thiếu ví dụ: {o['vi_du_thieu']}")
                if o["vi_du_thua"]:
                    print(f"║      thừa  ví dụ: {o['vi_du_thua']}")
                for k, (a, b) in sorted(o["lech_drop_reason"].items()):
                    print(f"║      drop_reason {k}: gold {a:,} vs etl {b:,}")

        if so_ca_cot:
            for ten in ten_files:
                d = so_cot(ten)
                if d.get("lech_gia_tri") or d.get("cot_thieu") or d.get("cot_thua"):
                    print(f"║ ⊙ PHỤ {ten}:")
                    if d.get("cot_thieu"):
                        print(f"║      cột THIẾU ở etl: {d['cot_thieu']}")
                    if d.get("cot_thua"):
                        print(f"║      cột THỪA ở etl : {d['cot_thua']}")
                    for k, v in sorted(d.get("lech_gia_tri", {}).items()):
                        print(f"║      cột {k}: {v:,} dòng khác giá trị")

    print(f"\n{'═' * 70}")
    n_o = len(tat_ca)
    print(f"BẢNG PARITY: {n_o - n_lech}/{n_o} ô KHỚP, {n_lech} ô LỆCH")
    if n_lech:
        print("✗ CỔNG PARITY ĐỎ — lệch phải bằng 0, không nới cổng.")
    else:
        print("✓ CỔNG PARITY XANH — set(uid) hai chiều = 0 lệch, drop_reason khớp từng con số.")
    return 1 if n_lech else 0


def main(argv: list[str]) -> int:
    scope = "7tinh"
    lops = [a for a in argv if a in ARTEFACT]
    for a in argv:
        if a not in ARTEFACT:
            scope = a
    return chay(lops or list(ARTEFACT), scope)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
