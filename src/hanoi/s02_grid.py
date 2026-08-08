"""B2 — Lưới phân tích H3 r8 phủ Hà Nội, gắn nhãn xã/phường.

Sinh:
  data/processed/layers/grid_cell.parquet   — khung lưới (khoá h3_r8), chưa có lớp thuộc tính nào
  data/qa/s02_grid.json

Nhãn xã/phường: mỗi ô mang MỘT mã xã — xã chiếm phần diện tích lớn nhất trong ô — kèm
``commune_area_frac`` để người dùng biết nhãn đó chắc đến đâu. Ma trận đầy đủ ô×xã nằm ở
bảng phụ ``grid_cell_commune.parquet`` cho các phép cộng dồn theo xã.
"""

from __future__ import annotations

import json

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely.strtree import STRtree

from . import aoi, grid, paths


def main() -> None:
    cells = grid.hanoi_cells()
    frac = grid.area_fractions(cells)
    hn, geoms = aoi.communes()

    tree = STRtree(geoms)
    codes = hn.maxa.tolist()
    names = hn.tenxa.tolist()

    rows, pairs = [], []
    for c in cells:
        poly = grid.cell_polygon(c)
        lat, lng = grid.centroid(c)
        best = (None, None, 0.0)
        hits = tree.query(poly)
        total = 0.0
        for i in hits:
            inter = poly.intersection(geoms[int(i)]).area
            if inter <= 0:
                continue
            f = inter / poly.area
            total += f
            pairs.append({"h3_r8": c, "commune_code": codes[int(i)], "area_frac": f})
            if f > best[2]:
                best = (codes[int(i)], names[int(i)], f)
        rows.append(
            {
                "h3_r8": c,
                "lat": lat,
                "lng": lng,
                "area_km2": grid.cell_area_km2(c),
                "area_frac": frac[c],
                "cell_state": "INSIDE" if frac[c] >= grid.INSIDE_THRESHOLD else "BORDER",
                "commune_code": best[0],
                "commune_name": best[1],
                "commune_area_frac": best[2],
                "commune_coverage": total,
            }
        )

    df = pd.DataFrame(rows).sort_values("h3_r8").reset_index(drop=True)
    df["commune_code"] = df.commune_code.astype("string")
    df["commune_name"] = df.commune_name.astype("string")
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False), paths.LAYERS / "grid_cell.parquet"
    )

    pdf = pd.DataFrame(pairs).sort_values(["h3_r8", "area_frac"], ascending=[True, False])
    pdf["h3_r8"] = pdf.h3_r8.astype("string")
    pdf["commune_code"] = pdf.commune_code.astype("string")
    pq.write_table(
        pa.Table.from_pandas(pdf, preserve_index=False),
        paths.LAYERS / "grid_cell_commune.parquet",
    )

    # --- QA ----------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    b = aoi.boundary()
    covered = sum(df.area_km2 * df.area_frac)
    import math

    lat0 = b.centroid.y
    b_km2 = b.area * 110_574.0 * (111_320.0 * math.cos(math.radians(lat0))) / 1e6

    sliver = grid.sliver_cells()
    sliver_frac = grid.area_fractions(sliver) if sliver else {}
    chk("h3_unique", df.h3_r8.is_unique, f"{len(df)} ô")
    chk(
        "no_sliver_cells_in_grid",
        bool((df.area_frac >= grid.MIN_AREA_FRAC).all()),
        f"{len(sliver)} ô vụn đã bị loại (area_frac < {grid.MIN_AREA_FRAC})",
    )
    chk(
        "every_cell_has_commune",
        df.commune_code.notna().all(),
        f"{int(df.commune_code.isna().sum())} thiếu",
    )
    chk("area_frac_in_0_1", bool(((df.area_frac >= 0) & (df.area_frac <= 1.0000001)).all()), "")
    chk(
        "grid_area_matches_boundary_lt_1pct",
        abs(covered - b_km2) / b_km2 < 0.01,
        f"lưới {covered:,.1f} km² vs đa giác {b_km2:,.1f} km² (lệch {abs(covered - b_km2) / b_km2:.2%})",
    )
    # ô biên: tổng area_frac theo xã phải ≈ area_frac theo tỉnh
    m = pdf.groupby("h3_r8").area_frac.sum().reindex(df.h3_r8).fillna(0).to_numpy()
    chk(
        "commune_frac_sums_to_province_frac",
        bool(((m - df.area_frac.to_numpy()) < 1e-6).all()),
        f"max lệch {float(abs(m - df.area_frac.to_numpy()).max()):.2e}",
    )

    report = {
        "layer": "grid",
        "resolution": grid.RES,
        "stats": {
            "n_cells": int(len(df)),
            "n_inside": int((df.cell_state == "INSIDE").sum()),
            "n_border": int((df.cell_state == "BORDER").sum()),
            "n_buffered_cells": len(grid.buffered_cells()),
            "grid_area_km2_weighted": round(float(covered), 2),
            "boundary_area_km2": round(float(b_km2), 2),
            "median_commune_area_frac": round(float(df.commune_area_frac.median()), 3),
            "cells_with_ambiguous_commune_lt_0_6": int((df.commune_area_frac < 0.6).sum()),
            # Ô vụn bị loại — khai báo, không im lặng. Xem grid.MIN_AREA_FRAC.
            "sliver_cells_excluded": {
                "min_area_frac": grid.MIN_AREA_FRAC,
                "n": len(sliver),
                "max_area_frac_among_excluded": (
                    round(max(sliver_frac.values()), 6) if sliver else None
                ),
                "cells": sliver,
            },
        },
        "checks": checks,
    }
    (paths.QA / "s02_grid.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
