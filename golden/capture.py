"""Chụp vân tay toàn bộ sản phẩm đang có trên đĩa, hoặc so nó với bản đã chụp.

    uv run python -m golden.capture          # so với golden/baseline.json, khác thì DỪNG
    uv run python -m golden.capture --ghi    # ghi đè baseline (chỉ khi thay đổi là CÓ CHỦ Ý)

Vì sao có file này: đợt refactor gộp ``hanoi/`` vào ``vn/`` phải chứng minh được rằng nó
KHÔNG đổi một con số nào. ``AUDIT_TOAN_QUOC.md §F`` đã làm phép đối chứng ấy một lần, bằng
tay, trên 12 chỉ số. File này làm nó trên **mọi cột của mọi bảng của 34 tỉnh**, tự động, và
hỏng thì báo đúng cột nào đổi.

Bảng KHÔNG chụp: ``road_graph.parquet`` (30 MB × 34, thuộc tier cache, dựng lại xác định
từ ``roads`` + PBF) và mọi thứ trong ``data/raw``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .fingerprint import compare, table_fingerprint, write_json

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).resolve().parent / "baseline.json"

# Bảng sản phẩm, kèm cột khoá để băm riêng tập khoá.
# Thiếu file thì bỏ qua trong im lặng CÓ GHI NHẬN — không phải mọi tỉnh có mọi lớp.
TABLES: dict[str, str | None] = {
    "grid_h3_r8.parquet": "h3_r8",
    "commune.parquet": "commune_code",
    "stations.parquet": "station_id",
    "connectors.parquet": None,
    "station_occupancy.parquet": "station_code",
    "station_occupancy_profile_168h.parquet": None,
    "grid_cell.parquet": "h3_r8",
    "grid_cell_commune.parquet": None,
    "population_cell.parquet": "h3_r8",
    "population_commune.parquet": "commune_code",
    "landcover_cell.parquet": "h3_r8",
    "traveltime_cell.parquet": "h3_r8",
    "screening_cell.parquet": "h3_r8",
    "poi_demand.parquet": None,
    "poi_visual.parquet": None,
    "poi_commune.parquet": None,
    "roads.parquet": None,
}

ADMIN_TABLES: dict[str, str | None] = {
    "communes.parquet": "commune_code",
    "provinces.parquet": "province_code",
    "crosswalk_province_legacy.parquet": None,
}

# Bộ Hà Nội cũ — cây thư mục phẳng, tên bảng khác một phần.
HANOI_TABLES: dict[str, str | None] = {
    "grid_h3_r8.parquet": "h3_r8",
    "commune.parquet": "commune_code",
    "stations.parquet": "station_id",
    "connectors.parquet": None,
    "station_occupancy.parquet": "station_code",
    "station_occupancy_profile_168h.parquet": None,
}


def _scan(
    root: Path, tables: dict[str, str | None], label: str, doc: dict, missing: list[str]
) -> None:
    for name, key in tables.items():
        p = root / name
        if not p.exists():
            missing.append(f"{label}/{name}")
            continue
        doc[f"{label}/{name}"] = table_fingerprint(p, key)


def capture() -> tuple[dict, list[str]]:
    doc: dict = {}
    missing: list[str] = []

    hanoi = ROOT / "data" / "processed"
    if hanoi.exists():
        _scan(hanoi, HANOI_TABLES, "hanoi", doc, missing)

    admin = ROOT / "store" / "admin"
    if admin.exists():
        _scan(admin, ADMIN_TABLES, "admin", doc, missing)

    qa_prov = ROOT / "store" / "qa" / "provinces.parquet"
    if qa_prov.exists():
        doc["qa/provinces.parquet"] = table_fingerprint(qa_prov, "province_code")

    prov_root = ROOT / "store" / "p"
    if prov_root.exists():
        for pdir in sorted(prov_root.iterdir()):
            if pdir.is_dir():
                _scan(pdir, TABLES, f"p/{pdir.name}", doc, missing)

    return doc, missing


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m golden.capture")
    ap.add_argument("--ghi", action="store_true", help="ghi đè baseline thay vì so sánh")
    ap.add_argument("--chi", default="", help="chỉ so các khoá chứa chuỗi này")
    a = ap.parse_args(argv)

    t0 = time.time()
    doc, missing = capture()
    print(
        f"⇒ {len(doc)} bảng · {time.time() - t0:.1f}s"
        + (f" · {len(missing)} vắng" if missing else "")
    )

    if a.ghi:
        write_json({"tables": doc, "absent": sorted(missing)}, BASELINE)
        print(f"✓ ghi {BASELINE.relative_to(ROOT)} ({BASELINE.stat().st_size / 1024:.0f} KB)")
        return 0

    if not BASELINE.exists():
        print(
            f"✗ chưa có {BASELINE.relative_to(ROOT)} — chạy với --ghi một lần trước",
            file=sys.stderr,
        )
        return 2

    base = json.loads(BASELINE.read_text(encoding="utf-8"))["tables"]
    keys = sorted(set(base) | set(doc))
    if a.chi:
        keys = [k for k in keys if a.chi in k]

    diffs: list[str] = []
    for k in keys:
        if k not in doc:
            diffs.append(f"{k}: bảng BIẾN MẤT")
        elif k not in base:
            diffs.append(f"{k}: bảng MỚI (không có trong baseline)")
        else:
            diffs.extend(compare(base[k], doc[k], k))

    if not diffs:
        print(f"✓ {len(keys)} bảng khớp baseline — không một con số nào đổi")
        return 0

    print(f"\n✗ {len(diffs)} chênh lệch so với baseline:\n", file=sys.stderr)
    for d in diffs[:200]:
        print(f"   {d}", file=sys.stderr)
    if len(diffs) > 200:
        print(f"   … và {len(diffs) - 200} dòng nữa", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
