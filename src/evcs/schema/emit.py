"""Sinh khai báo cột cho web từ schema Python.

    uv run python -m evcs.schema.emit          # ghi web/src/data/columns.generated.ts
    uv run python -m evcs.schema.emit --kiem   # chỉ kiểm file trên đĩa còn đúng không

Đây là nửa còn lại của vòng "đẩy dữ liệu vào là hiển thị được ngay". Nửa kia là
``GRID.validate`` ở ``n09_assemble``: nó bảo đảm bảng ghi ra ĐÚNG BẰNG bảng đã khai. File
này đưa chính bản khai ấy sang TypeScript, nên:

* ``fields.ts`` không thể trỏ tới một cột không tồn tại — kiểu ``GridColumn`` chặn lúc
  **compile**, thay vì để DuckDB ném lỗi lúc **chạy** rồi trắng màn hình;
* thêm một cột ở ``grid.py`` là test web nói ngay rằng danh mục trường còn thiếu mô tả cho
  nó — thay vì cột đó nằm im trong parquet và không ai biết. Đo được trước khi có file này:
  **4 cột** (``population_wp``, ``snow_frac``, ``mangrove_frac``, ``moss_frac``) đã có trong
  dữ liệu của cả 34 tỉnh mà không hiện lên giao diện.

File sinh ra KHÔNG chứa câu chữ tiếng Việt của ``fields.ts`` (nhãn, mô tả dài, caveat) —
đó là tầng biên tập và nó thuộc về người viết, không thuộc về máy sinh. Ở đây chỉ có sự
thật CƠ HỌC: tên, kiểu, đơn vị, cực tính, cách gộp, lớp sinh ra, nghĩa của null.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import COMMUNE, GRID, NATIONAL_R6
from .column import Table

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "web/src/data/columns.generated.ts"
OUT_MD = ROOT / "docs/COT.md"


def _ts(v) -> str:
    return "null" if v is None else json.dumps(v, ensure_ascii=False)


def render(t: Table) -> str:
    names = t.names()
    union = "\n  | ".join(json.dumps(n, ensure_ascii=False) for n in names)
    rows = []
    for c in t.columns:
        rows.append(
            f"  {json.dumps(c.name, ensure_ascii=False)}: {{ dtype: {_ts(c.dtype)},"
            f" role: {_ts(c.role)}, layer: {_ts(c.layer)}, agg: {_ts(c.agg)},"
            f" unit: {_ts(c.unit)}, polarity: {_ts(c.polarity)},"
            f" national: {'true' if c.national else 'false'},"
            f" nullMeans: {_ts(c.null_means)} }},"
        )
    by_layer = {ly: [c.name for c in t.of_layer(ly)] for ly in t.layers()}
    return f"""/**
 * SINH TỰ ĐỘNG từ `src/evcs/schema/grid.py` — đừng sửa tay.
 *
 *     uv run python -m evcs.schema.emit
 *
 * Sửa cột thì sửa ở khai báo Python rồi sinh lại. Test `columns.test.ts` kiểm file này còn
 * khớp bản khai, và kiểm danh mục trường phủ đủ mọi cột tô màu được.
 */

/** Tên cột của `{t.name}.parquet` — union kiểu, nên gõ sai là lỗi COMPILE. */
export type GridColumn =
  | {union};

export type ColumnRole = "key" | "identity" | "measure";
export type ColumnAgg = "sum" | "area_mean" | "none";

export interface ColumnMeta {{
  /** Kiểu logic, khớp kiểu thật trên parquet. */
  dtype: "str" | "f64" | "i64" | "bool";
  /** `identity` = cột ĐỊNH DANH & XUẤT XỨ, cố ý không tô màu được. */
  role: ColumnRole;
  /** Bước sinh ra cột — cơ sở của `manifest.missing_layers`. */
  layer: string;
  /** Cách gộp lên bậc thô hơn. `none` = KHÔNG gộp được bằng phép nào. */
  agg: ColumnAgg;
  unit: string | null;
  polarity: "high-bad" | "high-good" | null;
  /** Có lên màn hình CẢ NƯỚC không. Khác `agg`: cộng được ≠ được chở đi. */
  national: boolean;
  /** Null ở cột này CÓ NGHĨA gì. `null` = "không biết". */
  nullMeans: string | null;
}}

export const GRID_COLUMNS: Record<GridColumn, ColumnMeta> = {{
{chr(10).join(rows)}
}};

export const GRID_COLUMN_NAMES = Object.keys(GRID_COLUMNS) as GridColumn[];

/** Cột tô màu lên bản đồ được — mỗi cột ở đây PHẢI có một mục trong danh mục trường. */
export const MAPPABLE_COLUMNS = GRID_COLUMN_NAMES.filter(
  (c) => GRID_COLUMNS[c].role === "measure",
);

/** Cột theo bước sinh ra nó. Tỉnh thiếu một lớp thì thiếu đúng những cột ở đây. */
export const COLUMNS_BY_LAYER: Record<string, GridColumn[]> = {json.dumps(by_layer, ensure_ascii=False, indent=2)} as Record<string, GridColumn[]>;
"""


# ── tài liệu cột, cũng SINH RA ────────────────────────────────────────────────
# `README` nói 56, `DATA_DICTIONARY` nói 56, `fields.ts` nói 53, trên đĩa 61 — bốn nơi kể
# lại một sự thật là bốn cơ hội để nó trôi. Tài liệu nào kể lại schema thì phải được SINH,
# không được gõ.
_AGG = {"sum": "cộng", "area_mean": "TB theo diện tích", "none": "—"}
_ROLE = {"key": "khoá", "identity": "định danh", "measure": "số đo"}


def _md_table(t: Table) -> str:
    dong = [
        f"### `{t.name}` — {len(t.columns)} cột",
        "",
        t.desc,
        "",
        "| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |",
        "|--:|---|---|---|---|---|---|:-:|---|",
    ]
    for i, c in enumerate(t.columns, 1):
        nghia = c.desc.replace("|", "\\|").replace("\n", " ")
        if c.null_means:
            nghia += f" **· null =** {c.null_means}"
        cuc = {"high-bad": " ↓xấu", "high-good": " ↑tốt", None: ""}[c.polarity]
        dong.append(
            f"| {i} | `{c.name}` | {c.dtype} | {_ROLE[c.role]} | {c.layer} | "
            f"{c.unit or '—'}{cuc} | {_AGG[c.agg]} | {'✓' if c.national else ''} | {nghia} |"
        )
    return "\n".join(dong)


def render_md() -> str:
    return f"""# Từ điển cột — SINH TỰ ĐỘNG

Đừng sửa file này. Sửa `src/evcs/schema/*.py` rồi chạy:

```bash
make schema
```

`make kiem` DỪNG nếu file này trôi khỏi bản khai.

Vì sao nó được sinh chứ không được viết: cùng một sự thật từng được kể lại ở bốn nơi và
kể ra **bốn con số khác nhau** — `README` 56 · `DATA_DICTIONARY` 56 · `web/src/fields.ts`
53 · trên đĩa 61. Một tài liệu kể lại schema là một cơ hội nữa để schema trôi.

Cột `vai = định danh` cố ý KHÔNG tô màu lên bản đồ được. Cột `gộp = —` KHÔNG gộp lên bậc
thô hơn bằng bất kỳ phép nào — khoảng cách tới trạm gần nhất của một vùng không phải trung
bình khoảng cách của các ô trong nó.

{_md_table(GRID)}

{_md_table(COMMUNE)}

{_md_table(NATIONAL_R6)}
"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evcs.schema.emit")
    ap.add_argument("--kiem", action="store_true", help="chỉ kiểm, không ghi")
    a = ap.parse_args(argv)

    can = [(OUT, render(GRID)), (OUT_MD, render_md())]
    if a.kiem:
        troi = [
            f.name for f, w in can if (f.read_text(encoding="utf-8") if f.exists() else "") != w
        ]
        if not troi:
            print(f"✓ {' · '.join(f.name for f, _ in can)} khớp khai báo")
            return 0
        print(f"✗ {troi} đã trôi khỏi schema — chạy `make schema`", file=sys.stderr)
        return 1

    for f, w in can:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(w, encoding="utf-8")
    n = len(GRID.columns) + len(COMMUNE.columns) + len(NATIONAL_R6.columns)
    print(f"✓ {OUT.name} · {OUT_MD.name} — 3 bảng, {n} cột")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
