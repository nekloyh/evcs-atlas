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
    "substations.parquet": None,
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


# Bảng ĐÃ XUẤT cho web — sản phẩm cuối, thứ người dùng thật sự nhìn thấy. Vân tay chúng
# riêng vì bước xuất có quyền bỏ cột, đổi kiểu và giảm độ chính xác: một thay đổi ở đây
# không nhất thiết lộ ra ở `store/`.
WEB_TABLES: dict[str, str | None] = {
    "grid_h3_r8.parquet": "h3_r8",
    "stations.parquet": "station_id",
    "connectors.parquet": None,
    "station_occupancy.parquet": "station_code",
    "station_occupancy_profile_168h.parquet": None,
    "roads.parquet": None,
}

WEB_NATIONAL_TABLES: dict[str, str | None] = {
    "grid_h3_r6.parquet": "h3_r6",
    "stations.parquet": "station_code",
    "poi.parquet": None,
}


def capture() -> tuple[dict, list[str]]:
    doc: dict = {}
    missing: list[str] = []

    web = ROOT / "web" / "public" / "data"
    if web.exists():
        _scan(web, WEB_TABLES, "web", doc, missing)
        _scan(web / "vn", WEB_NATIONAL_TABLES, "web/vn", doc, missing)
        wp = web / "p"
        if wp.exists():
            for pdir in sorted(wp.iterdir()):
                if pdir.is_dir():
                    _scan(pdir, WEB_TABLES, f"web/p/{pdir.name}", doc, missing)

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

    # Ba loại chênh lệch, và chúng KHÔNG cùng mức nghiêm trọng — gộp chúng vào một danh
    # sách là chỗ dễ mất cảnh giác nhất của một cổng chặn:
    #
    #   MỚI      thêm một bảng ⇒ hợp lệ khi đang thêm một lớp. `--ghi` là câu trả lời đúng.
    #   BIẾN MẤT bảng cũ không còn ⇒ có thể hợp lệ (bỏ một lớp) nhưng phải CỐ Ý.
    #   ĐỔI SỐ   cùng một bảng, khác giá trị ⇒ KHÔNG BAO GIỜ tự động hợp lệ.
    #
    # Nếu chỉ có MỚI thì lệnh vẫn DỪNG, nhưng nó nói rõ rằng `--ghi` là bước tiếp theo đúng.
    # Nếu có ĐỔI SỐ thì `--ghi` là bước tiếp theo SAI, và thông báo phải nói ra điều đó.
    moi: list[str] = []
    mat: list[str] = []
    doi: list[str] = []
    for k in keys:
        if k not in doc:
            mat.append(k)
        elif k not in base:
            moi.append(k)
        else:
            doi.extend(compare(base[k], doc[k], k))

    if not (moi or mat or doi):
        print(f"✓ {len(keys)} bảng khớp baseline — không một con số nào đổi")
        return 0

    if doi:
        print(f"\n✗ {len(doi)} GIÁ TRỊ ĐỔI trên bảng đã có — đây KHÔNG phải thay đổi tự động hợp lệ.", file=sys.stderr)
        print("  Refactor đúng thì golden không đổi. Nếu số PHẢI đổi thì đó là một quyết", file=sys.stderr)
        print("  định có người ký: sửa mã cho đúng, hoặc chạy --ghi kèm commit nói vì sao.\n", file=sys.stderr)
        for d in doi[:200]:
            print(f"   {d}", file=sys.stderr)
        if len(doi) > 200:
            print(f"   … và {len(doi) - 200} dòng nữa", file=sys.stderr)

    if mat:
        print(f"\n✗ {len(mat)} bảng BIẾN MẤT:", file=sys.stderr)
        for k in mat[:40]:
            print(f"   {k}", file=sys.stderr)

    if moi:
        muc = "✓" if not (doi or mat) else "·"
        print(f"\n{muc} {len(moi)} bảng MỚI (chưa có trong baseline):", file=sys.stderr)
        for k in moi[:40]:
            print(f"   {k}", file=sys.stderr)
        if not (doi or mat):
            print("\n  Chỉ có bảng mới, không giá trị nào đổi — thêm một lớp là hợp lệ.", file=sys.stderr)
            print("  Chạy `make golden-ghi` để nhận chúng vào baseline.", file=sys.stderr)
    return 1



if __name__ == "__main__":
    raise SystemExit(main())
