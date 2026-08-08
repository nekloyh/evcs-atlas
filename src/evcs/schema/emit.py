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

from . import GRID
from .column import Table

OUT = Path(__file__).resolve().parents[3] / "web/src/data/columns.generated.ts"


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


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evcs.schema.emit")
    ap.add_argument("--kiem", action="store_true", help="chỉ kiểm, không ghi")
    a = ap.parse_args(argv)

    want = render(GRID)
    if a.kiem:
        got = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if got == want:
            print(f"✓ {OUT.name} khớp khai báo")
            return 0
        print(
            f"✗ {OUT.name} đã trôi khỏi schema — chạy `python -m evcs.schema.emit`", file=sys.stderr
        )
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(want, encoding="utf-8")
    print(f"✓ {OUT} · {len(GRID.columns)} cột")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
