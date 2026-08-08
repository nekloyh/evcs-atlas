"""B4 — Dân số theo ô: MỘT trường ``population``.

Phương pháp (dasymetric có neo chính thức):

1. Bề mặt trọng số = WorldPop 2025 R2024B 100 m — chọn vì trên Hà Nội nó phủ 99,3% ô có
   dân, so với 85,4% của bản 2020 constrained; chỉ 0,3% ô có đường mà không dân, so với
   12,3%. (Số đo trên lưới repo cũ, xem DECISIONS.md §4.)
2. Tổng kiểm soát = ``danso`` từng xã/phường của VNSDI (hiệu lực 16/6/2025) — số CHÍNH THỨC.
3. Mỗi pixel được gán vào đúng một xã (điểm-trong-đa-giác trên tâm pixel) và đúng một ô H3.
   Dân số ô = Σ giá trị pixel × hệ số neo của xã chứa pixel đó.

Kết quả: Σ population từng xã ĐÚNG BẰNG số công bố, phân bố trong xã theo bề mặt WorldPop.
Không trường ``pop_2020``/``pop_adj``/``pop_2025``/``pop_k1`` nào được mang sang.

NGOẠI LỆ CÓ KHAI BÁO: bản công bố VNSDI có lỗi nhập liệu ở 2/126 xã (``danso`` = 21 và 54
người trên địa bàn hàng chục km² đô thị). Neo vào đó sẽ làm rỗng cả một phường có thật, nên
hai xã này KHÔNG được neo — dùng thẳng WorldPop và đánh dấu ở ``pop_source``. Danh sách đầy
đủ nằm trong ``data/qa/s04_population.json``; không có thay thế nào diễn ra âm thầm.

Sinh:
  data/raw/worldpop2025_hanoi_window.tif   — cửa sổ raster phạm vi Hà Nội (đứng độc lập)
  data/processed/layers/population_cell.parquet
  data/processed/layers/population_commune.parquet
  data/qa/s04_population.json
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import rasterio
import rasterio.windows
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.strtree import STRtree

from . import aoi, grid, paths

# --- cổng phát hiện số công bố hỏng --------------------------------------
# Bản công bố VNSDI có lỗi nhập liệu ở một số xã (mất chữ số hàng nghìn). Neo mù quáng vào
# một con số như vậy sẽ làm RỖNG cả một phường có thật. Ngưỡng đặt rất chặt để chỉ bắt lỗi
# hiển nhiên chứ không bắt xã thưa dân thật: xã thưa nhất Hà Nội vẫn có ~328 người/km².
# Khi kích hoạt, xã đó KHÔNG được neo — dùng thẳng WorldPop và ĐÁNH DẤU ở ``pop_source``.
# Đây là thay thế CÓ KHAI BÁO, không phải impute âm thầm.
IMPLAUSIBLE_DANSO_MAX = 1_000
IMPLAUSIBLE_WP_RATIO = 10.0

SRC_ANCHORED = "WORLDPOP2025_ANCHORED_VNSDI"
SRC_UNANCHORED = "WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE"
SRC_AREAL = "VNSDI_AREAL_FALLBACK"
SRC_ZERO = "ZERO_NO_WEIGHT"


def main() -> None:
    paths.assert_sources()
    hn, geoms = aoi.communes()
    codes = hn.maxa.tolist()
    danso = dict(zip(hn.maxa, hn.danso.astype(float)))

    minx, miny, maxx, maxy = aoi.bbox(False)
    pad = 0.01
    with rasterio.open(paths.SRC_WORLDPOP_2025) as ds:
        win = (
            rasterio.windows.from_bounds(
                minx - pad, miny - pad, maxx + pad, maxy + pad, ds.transform
            )
            .round_offsets()
            .round_lengths()
        )
        arr = ds.read(1, window=win)
        tr = ds.window_transform(win)
        nodata = ds.nodata
        prof = ds.profile | {
            "height": arr.shape[0],
            "width": arr.shape[1],
            "transform": tr,
            "compress": "deflate",
        }
    with rasterio.open(paths.RAW / "worldpop2025_hanoi_window.tif", "w", **prof) as out:
        out.write(arr, 1)

    v = arr.astype("float64")
    if nodata is not None:
        v = np.where(v == nodata, 0.0, v)
    v = np.where(np.isfinite(v) & (v > 0), v, 0.0)

    rr, cc = np.nonzero(v)
    vals = v[rr, cc]
    xs = tr.c + (cc + 0.5) * tr.a
    ys = tr.f + (rr + 0.5) * tr.e
    print(f"pixel có dân trong bbox: {len(vals):,} · tổng thô {vals.sum():,.0f}")

    # --- gán pixel -> xã ---------------------------------------------------
    tree = STRtree(geoms)
    preps = [prep(g) for g in geoms]
    pts = [Point(x, y) for x, y in zip(xs, ys)]
    nearest_idx = tree.query(pts, predicate="within")  # (2, n): [query_i, geom_i]
    com_of_px = np.full(len(pts), -1, dtype=np.int32)
    com_of_px[nearest_idx[0]] = nearest_idx[1]
    inside = com_of_px >= 0
    print(f"pixel trong ranh giới Hà Nội: {inside.sum():,} · tổng thô {vals[inside].sum():,.0f}")

    # --- gán pixel -> ô H3 --------------------------------------------------
    import h3

    cells_px = np.array(
        [h3.latlng_to_cell(y, x, grid.RES) for x, y in zip(xs[inside], ys[inside])], dtype=object
    )
    px = pd.DataFrame(
        {
            "h3_r8": cells_px,
            "commune_code": [codes[i] for i in com_of_px[inside]],
            "w": vals[inside],
        }
    )

    # --- neo theo tổng chính thức từng xã ----------------------------------
    wsum = px.groupby("commune_code").w.sum()
    names = dict(zip(hn.maxa, hn.tenxa))
    scale, src, no_weight, implausible = {}, {}, [], []
    for c in codes:
        s = float(wsum.get(c, 0.0))
        if s <= 0:
            scale[c], src[c] = np.nan, SRC_AREAL
            no_weight.append(c)
        elif danso[c] < IMPLAUSIBLE_DANSO_MAX and s > IMPLAUSIBLE_WP_RATIO * danso[c]:
            scale[c], src[c] = 1.0, SRC_UNANCHORED
            implausible.append(
                {
                    "commune_code": c,
                    "commune_name": names[c],
                    "danso_published": int(danso[c]),
                    "worldpop2025_in_commune": round(s, 1),
                }
            )
        else:
            scale[c], src[c] = danso[c] / s, SRC_ANCHORED
    px["population"] = px.w * px.commune_code.map(scale)
    px["src"] = px.commune_code.map(src)

    # Xã không có pixel trọng số nào: rải đều theo diện tích ô trong xã, có cờ.
    fallback_rows = []
    if no_weight:
        cc_pairs = pq.read_table(paths.LAYERS / "grid_cell_commune.parquet").to_pandas()
        for c in no_weight:
            sub = cc_pairs[cc_pairs.commune_code == c]
            if len(sub) == 0 or sub.area_frac.sum() <= 0:
                continue
            share = sub.area_frac / sub.area_frac.sum()
            for h, s in zip(sub.h3_r8, share):
                fallback_rows.append({"h3_r8": h, "commune_code": c, "population": danso[c] * s})

    cell_pop = px.groupby("h3_r8").population.sum()
    if fallback_rows:
        fb = pd.DataFrame(fallback_rows).groupby("h3_r8").population.sum()
        cell_pop = cell_pop.add(fb, fill_value=0.0)

    cells = grid.hanoi_cells()
    out = pd.DataFrame({"h3_r8": pd.Series(cells, dtype="string")})
    out["population"] = out.h3_r8.map(cell_pop).fillna(0.0).astype("float64")
    area = {c: grid.cell_area_km2(c) for c in cells}
    out["pop_density_ppkm2"] = out.population / out.h3_r8.map(area)
    # nguồn của ô = nguồn của xã đóng góp phần dân số lớn nhất trong ô
    dom = px.groupby(["h3_r8", "src"]).population.sum().reset_index()
    dom = (
        dom.sort_values("population", ascending=False)
        .drop_duplicates("h3_r8")
        .set_index("h3_r8")
        .src
    )
    out["pop_source"] = out.h3_r8.map(dom)
    out["pop_source"] = out.pop_source.fillna(
        pd.Series(np.where(out.population > 0, SRC_AREAL, SRC_ZERO), index=out.index)
    ).astype("string")
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), paths.LAYERS / "population_cell.parquet"
    )

    # dân số THỰC DÙNG theo xã (= danso công bố ở xã được neo; = WorldPop ở xã bị thay thế)
    cp = px.groupby("commune_code").agg(
        population=("population", "sum"), pop_source=("src", "first")
    )
    cp = cp.reindex(codes)
    cp["population"] = cp.population.fillna(
        pd.Series({c: float(danso[c]) for c in no_weight})
    ).fillna(0.0)
    cp["pop_source"] = cp.pop_source.fillna(SRC_AREAL)
    cp = cp.reset_index().rename(columns={"index": "commune_code"})
    cp["commune_code"] = cp.commune_code.astype("string")
    cp["pop_source"] = cp.pop_source.astype("string")
    pq.write_table(
        pa.Table.from_pandas(cp, preserve_index=False), paths.LAYERS / "population_commune.parquet"
    )

    # --- QA ----------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    official = float(hn.danso.sum())
    total = float(out.population.sum())
    # Tổng phải khớp số công bố CỘNG phần thay thế đã khai báo cho các xã có số công bố hỏng.
    substituted = float(sum(r["worldpop2025_in_commune"] for r in implausible))
    replaced = float(sum(r["danso_published"] for r in implausible))
    expected = official - replaced + substituted
    # Lưới báo cáo đã loại các ô vụn (grid.MIN_AREA_FRAC). Phần dân rơi vào chúng KHÔNG
    # được im lặng biến mất: đo, khai báo, và cộng lại khi kiểm tổng.
    lost = float(cell_pop.reindex(grid.sliver_cells()).fillna(0.0).sum())
    chk(
        "total_matches_official_plus_declared_substitutions",
        abs((total + lost) - expected) / expected < 1e-6,
        f"{total:,.0f} + {lost:,.1f} (ô vụn) vs kỳ vọng {expected:,.0f} "
        f"(công bố {official:,.0f} − {replaced:,.0f} + {substituted:,.0f})",
    )
    chk("no_negative", bool((out.population >= 0).all()), "")
    chk(
        "no_communes_without_weight",
        not no_weight,
        f"{len(no_weight)} xã dùng rải-đều: {no_weight}",
    )
    chk(
        "implausible_official_declared_not_silent",
        all(r["danso_published"] < IMPLAUSIBLE_DANSO_MAX for r in implausible),
        f"{len(implausible)} xã có danso công bố hỏng → thay bằng WorldPop, gắn cờ pop_source",
    )
    frac_lost = 1 - vals[inside].sum() / vals.sum() if vals.sum() else 0
    chk("cells_covered", True, f"{int((out.population > 0).sum()):,}/{len(out):,} ô có dân")

    report = {
        "layer": "population",
        "method": "dasymetric: WorldPop 2025 R2024B (trọng số) neo theo VNSDI danso (tổng kiểm soát)",
        "weight_raster": str(paths.SRC_WORLDPOP_2025),
        "control_total_source": "VNSDI danso, hiệu lực 16/6/2025",
        "stats": {
            "population_total": round(total, 1),
            "population_published_vnsdi": official,
            "population_expected_after_substitution": round(expected, 1),
            "population_in_excluded_sliver_cells": round(lost, 1),
            "n_excluded_sliver_cells": len(grid.sliver_cells()),
            "n_cells": int(len(out)),
            "n_cells_with_pop": int((out.population > 0).sum()),
            "worldpop_raw_total_in_boundary": round(float(vals[inside].sum()), 1),
            "worldpop_bias_vs_official_pct": round(
                100 * (vals[inside].sum() - official) / official, 2
            ),
            "pixels_in_boundary": int(inside.sum()),
            "pixels_in_bbox_outside_boundary_share": round(float(frac_lost), 4),
            "communes_without_weight": no_weight,
            "communes_with_implausible_official": implausible,
            "pop_source_counts": {str(k): int(v) for k, v in out.pop_source.value_counts().items()},
            "max_cell_population": round(float(out.population.max()), 1),
        },
        "checks": checks,
    }
    (paths.QA / "s04_population.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
