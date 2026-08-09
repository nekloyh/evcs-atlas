"""Chạy chuỗi ETL bóc lớp POI — 9 lớp, đúng thứ tự, ghi `data/qa/eda/_etl/`.

    uv run python -m evcs.eda.run 7tinh [--lop chungcu,luutru]

Thứ tự KHÔNG đổi được: mỗi lớp đọc `con_lai` của lớp trước. Chạy sai thứ tự là hỏng toàn bộ.
Đầu ra ghi vào `_etl/` — TUYỆT ĐỐI không đụng `_gold/` hay các file gốc trong `data/qa/eda/`.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import subprocess
import sys
import time
from pathlib import Path

import pyarrow.parquet as pq

from evcs.eda import common as c

ETL_DIR = c.EDA_DIR / "_etl"

# Cột NHÃN CHÍNH của mỗi lớp — thứ downstream phải đọc thay cho `label` thô.
# Khớp bảng `NHAN` của `notebooks/eda_doi_chieu.py`; giữ đồng bộ khi đổi tên cột.
COT_NHAN = {
    "chungcu": ["label", "kdt_class", "evidence"],
    "luutru": ["hang_ten", "quy_mo", "verdict"],
    "thuongmai": ["hang_tm", "quy_mo_tm", "quy_mo_nguon"],
    "giaitri": ["hang_gt", "vai_tro", "quy_mo_gt"],
    "thamquan": ["hang_tq", "suc_hut", "loai_tho_tu"],
    "truonghoc": ["hang_th", "cap_hieu_luc", "cap_nguon"],
    "benhvien": ["loai_yt", "tuyen_yt", "quy_mo_yt"],
    "hanhchinh": ["cap_hc", "nganh_hc"],
    "vanphong": ["hang_vp"],
}

# (tên lớp, tên file `con_lai` mà lớp đó GHI RA cho lớp sau)
CHUOI = [
    ("chungcu", "poi_extended_{s}_con_lai.parquet"),
    ("luutru", "poi_extended_{s}_con_lai_sau_luutru.parquet"),
    ("thuongmai", "poi_extended_{s}_con_lai_sau_thuongmai.parquet"),
    ("giaitri", "poi_extended_{s}_con_lai_sau_giaitri.parquet"),
    ("thamquan", "poi_extended_{s}_con_lai_sau_thamquan.parquet"),
    ("truonghoc", "poi_extended_{s}_con_lai_sau_truonghoc.parquet"),
    ("benhvien", "poi_extended_{s}_con_lai_sau_benhvien.parquet"),
    ("hanhchinh", "poi_extended_{s}_con_lai_sau_hanhchinh.parquet"),
    ("vanphong", "poi_extended_{s}_con_lai_cuoi.parquet"),
]


def _git_sha() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=c.ROOT, capture_output=True, text=True, check=True
    ).stdout.strip()


def _git_dirty() -> bool:
    return bool(
        subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=c.ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )


def chay(scope: str = "7tinh", chi_lop: list[str] | None = None) -> dict:
    ETL_DIR.mkdir(parents=True, exist_ok=True)
    bo_goc = c.GOC_DIR / f"poi_extended_{scope}.parquet"

    da_ghi: dict[str, Path] = {}
    do_theo_lop: dict[str, dict] = {}
    params_theo_lop: dict[str, dict] = {}
    nguon = bo_goc

    for lop, ten_con_lai in CHUOI:
        con_lai_file = ten_con_lai.format(s=scope)
        if chi_lop and lop not in chi_lop:
            # Bỏ qua lớp này nhưng dây chuyền phải liền — lấy `con_lai` đã có ở `_etl/`,
            # nếu chưa có thì dừng hẳn thay vì âm thầm đọc bản vàng.
            ke_tiep = ETL_DIR / con_lai_file
            if not ke_tiep.exists():
                print(f"⏭  bỏ qua {lop} — nhưng {con_lai_file} chưa có ở _etl/, dừng.")
                break
            nguon = ke_tiep
            continue

        t0 = time.perf_counter()
        mod = importlib.import_module(f"evcs.eda.layers.{lop}")
        df_vao = c.doc_parquet(nguon)
        them = {}
        if lop == "vanphong":
            # Món nợ bàn giao từ lớp 1: 104 toà ≥8 tầng mà `eda_chungcu` không tách được là
            # chung cư hay văn phòng. Đọc từ `_etl/` chứ KHÔNG từ bản vàng — dây chuyền phải
            # tự khép, nếu không thì lỗi ở lớp 1 bị bản vàng che mất.
            p_morph = ETL_DIR / f"poi_morph_review_{scope}.parquet"
            them["morph_uids"] = c.doc_uid(p_morph) if p_morph.exists() else set()
        try:
            artefact = mod.chay(df_vao, scope=scope, **them)
        except c.CongDo as e:
            # DỪNG CÓ NGỮ CẢNH. Cổng đỏ ở quy mô toàn quốc mà chỉ ném traceback là mất cả
            # buổi truy lại: dòng phạm đã được ghi ra đĩa trước khi ném, in đường dẫn ra đây.
            print(f"\n{'━' * 78}\n✗ DỪNG Ở LỚP `{lop}` (scope {scope})\n{'━' * 78}")
            print(e)
            print(f"{'━' * 78}\nDây chuyền dừng tại đây — các lớp sau KHÔNG chạy vì bộ vào của")
            print("chúng là `con_lai` của lớp này. Sửa xong thì chạy lại từ lớp này trở đi:")
            print(f"    uv run python -m evcs.eda.run {scope} --lop {lop},...")
            raise SystemExit(2) from None
        do_theo_lop[lop] = artefact.pop("_do", {})
        params_theo_lop[lop] = artefact.pop("_params", {})
        for ten, df in artefact.items():
            da_ghi[ten] = c.ghi_parquet(df, ETL_DIR / ten)
        nguon = ETL_DIR / con_lai_file
        print(f"✓ {lop:10s} {time.perf_counter() - t0:6.1f}s  → {len(artefact)} artefact")

    return {
        "da_ghi": da_ghi,
        "do": do_theo_lop,
        "params": params_theo_lop,
        "bo_goc": bo_goc,
        "scope": scope,
    }


def sinh_manifest(scope: str, ket_qua: dict) -> Path:
    """Manifest CÙNG ĐỊNH DẠNG `gold_manifest.json` để diff được trực tiếp."""
    lops = [lop for lop, _ in CHUOI]
    artefacts = {}
    for ten in sorted(p.name for p in ETL_DIR.glob(f"*{scope}*.parquet")):
        p = ETL_DIR / ten
        tbl = pq.read_table(p)
        uid_set = set(tbl.column("uid").to_pylist())
        artefacts[ten] = {
            "n_dong": tbl.num_rows,
            "n_uid_unique": len(uid_set),
            "sha256_file": hashlib.sha256(p.read_bytes()).hexdigest(),
            "sha256_uid_set": hashlib.sha256(
                "\n".join(sorted(str(u) for u in uid_set)).encode()
            ).hexdigest(),
        }

    drop_reason = {}
    for lop in lops:
        p = ETL_DIR / f"poi_{lop}_{scope}_b3_bi_xoa.parquet"
        if not p.exists():
            continue
        s = pq.read_table(p, columns=["drop_reason"]).to_pandas()["drop_reason"]
        drop_reason[lop] = {
            (str(k) if k is not None else "(null)"): int(v)
            for k, v in s.value_counts(dropna=False).items()
        }

    # Phân phối cột NHÃN CHÍNH của từng lớp — thứ phải so bằng TỶ LỆ khi đổi scope.
    phan_phoi_nhan = {}
    for lop in lops:
        p = ETL_DIR / f"poi_{lop}_{scope}_final.parquet"
        if not p.exists():
            continue
        cols = pq.ParquetFile(p).schema_arrow.names
        nhan = [x for x in COT_NHAN.get(lop, []) if x in cols]
        d = pq.read_table(p, columns=nhan + (["container_uid"] if "container_uid" in cols else []))
        df = d.to_pandas()
        m = {}
        for x in nhan:
            m[x] = {str(k): int(v) for k, v in df[x].value_counts(dropna=False).items()}
        m["_n_dong"] = len(df)
        m["_n_co_so"] = int(df["container_uid"].isna().sum()) if "container_uid" in df else len(df)
        phan_phoi_nhan[lop] = m

    n_goc = pq.ParquetFile(ket_qua["bo_goc"]).metadata.num_rows
    ten_cuoi = CHUOI[-1][1].format(s=scope)
    co_du_9_lop = all(f"poi_{lop}_{scope}_final.parquet" in artefacts for lop in lops)
    tong_9 = (
        sum(artefacts[f"poi_{lop}_{scope}_final.parquet"]["n_dong"] for lop in lops)
        if co_du_9_lop
        else None
    )
    n_cuoi = artefacts.get(ten_cuoi, {}).get("n_dong")

    manifest = {
        "git_sha": _git_sha(),
        "git_dirty_khi_chay": _git_dirty(),
        "scope": scope,
        "bo_goc": {
            "file": str(ket_qua["bo_goc"].relative_to(c.ROOT)),
            "n_dong": n_goc,
        },
        "thu_tu_chuoi": lops,
        "artefacts": artefacts,
        "drop_reason_theo_lop": drop_reason,
        "phan_phoi_nhan": phan_phoi_nhan,
        "tong_doi_chieu": {
            "tong_9_lop_final": tong_9,
            "con_lai_cuoi": n_cuoi,
            "cong_lai": (tong_9 + n_cuoi) if (tong_9 is not None and n_cuoi is not None) else None,
            "bo_goc": n_goc,
            "khop": (tong_9 + n_cuoi) == n_goc
            if (tong_9 is not None and n_cuoi is not None)
            else False,
        },
        "do_theo_lop": ket_qua["do"],
    }
    out = ETL_DIR / f"run_manifest_{scope}.json"
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    # THAM SỐ tách khỏi manifest: cái này trả lời "thuật toán đã HỌC gì từ bộ dữ liệu",
    # còn manifest trả lời "nó SINH RA cái gì". Diff hai file params giữa hai scope là cách
    # thấy ngưỡng học-từ-dữ-liệu trôi bao nhiêu.
    p_params = ETL_DIR / f"params_{scope}.json"
    p_params.write_text(
        json.dumps(
            {"scope": scope, "git_sha": _git_sha(), "theo_lop": ket_qua["params"]},
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return out


def main(argv: list[str]) -> int:
    scope = "7tinh"
    chi_lop = None
    for i, a in enumerate(argv):
        if a == "--lop":
            chi_lop = argv[i + 1].split(",")
        elif not a.startswith("--") and (i == 0 or argv[i - 1] != "--lop"):
            scope = a
    ket_qua = chay(scope, chi_lop)
    out = sinh_manifest(scope, ket_qua)
    print(f"\n→ {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
