"""B10 — Ghép mọi lớp thành một bảng ô duy nhất + xuất GeoJSON.

``grid_h3_r8.parquet`` là bảng người dùng cuối đọc: một dòng một ô, mỗi khái niệm một cột.
Các bảng lớp riêng vẫn giữ lại để truy vết, nhưng không cần đọc để dùng bộ dữ liệu.

Lớp occupancy được cuộn về ô ở đây — đúng thứ repo cũ thiếu (``evidence_grade.occ_layer =
MISSING`` trên 100% hồ sơ, Panel C rỗng). Trung bình có trọng số theo số cổng, chỉ trên trạm
``util_reportable``; ô không có trạm đo được thì là ``null``, KHÔNG phải 0.

Sinh:
  data/processed/grid_h3_r8.parquet
  data/processed/grid_h3_r8.geojson
  data/qa/s10_assemble.json
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from . import grid, paths

LAYERS = [
    "grid_cell.parquet",
    "population_cell.parquet",
    "landcover_cell.parquet",
    "road_cell.parquet",
    "poi_cell.parquet",
    "supply_cell.parquet",
    "traveltime_cell.parquet",
    "screening_cell.parquet",
]
DROP = {"n_px_10m", "commune_coverage"}


def main() -> None:
    # Cổng chặn TRƯỚC khi ghép: mọi lớp phải phủ ĐÚNG tập ô báo cáo. Không có bước này thì
    # một lớp dựng từ tập ô cũ sẽ lặng lẽ biến thành NaN sau `merge(how="left")`, và lỗi
    # chỉ lộ ra ở một chỗ ngẫu nhiên phía dưới (bool → float).
    want = set(grid.hanoi_cells())
    df = None
    for f in LAYERS:
        t = pq.read_table(paths.LAYERS / f).to_pandas()
        t["h3_r8"] = t.h3_r8.astype("string")
        got = set(t.h3_r8)
        if got != want:
            raise SystemExit(
                f"{f}: tập ô không khớp lưới báo cáo "
                f"(thiếu {len(want - got)}, thừa {len(got - want)}). "
                "Chạy lại `make layers` — lớp này dựng từ tập ô cũ."
            )
        df = t if df is None else df.merge(t, on="h3_r8", how="left", validate="1:1")

    # --- cuộn occupancy về ô -------------------------------------------------
    st = pq.read_table(paths.PROCESSED / "stations.parquet").to_pandas()
    oc = pq.read_table(paths.PROCESSED / "station_occupancy.parquet").to_pandas()
    j = st[st.scope == "HANOI"][["station_code", "h3_r8", "n_ports"]].merge(
        oc[["station_code", "util", "util_reportable", "grade"]], on="station_code", how="inner"
    )
    j = j[j.util_reportable & j.util.notna()].copy()
    j["w"] = j.n_ports.fillna(1).clip(lower=1)
    agg = j.groupby("h3_r8").apply(
        lambda g: pd.Series(
            {
                "util_cell": float(np.average(g.util, weights=g.w)),
                "n_stations_measured": int(len(g)),
            }
        ),
        include_groups=False,
    )
    df["util_cell"] = df.h3_r8.map(agg.util_cell if len(agg) else {})
    df["n_stations_measured"] = (
        df.h3_r8.map(agg.n_stations_measured if len(agg) else {}).fillna(0).astype("int64")
    )

    df = df.drop(columns=[c for c in DROP if c in df.columns])
    front = [
        "h3_r8",
        "lat",
        "lng",
        "area_km2",
        "area_frac",
        "cell_state",
        "commune_code",
        "commune_name",
        "commune_area_frac",
        "population",
        "pop_density_ppkm2",
        "pop_source",
    ]
    df = df[front + [c for c in df.columns if c not in front]]
    df = df.sort_values("h3_r8").reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False), paths.PROCESSED / "grid_h3_r8.parquet"
    )

    # --- GeoJSON (để mở thẳng bằng công cụ GIS) ------------------------------
    def prop(v):
        if v is None or (isinstance(v, float) and not np.isfinite(v)):
            return None
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            return round(float(v), 4)
        if isinstance(v, (np.bool_,)):
            return bool(v)
        return v if isinstance(v, (str, int, float, bool)) else str(v)

    cols = [c for c in df.columns if c != "h3_r8"]
    feats = []
    for rec in df.to_dict("records"):
        poly = grid.cell_polygon(rec["h3_r8"])
        feats.append(
            {
                "type": "Feature",
                "id": rec["h3_r8"],
                "properties": {"h3_r8": rec["h3_r8"], **{c: prop(rec[c]) for c in cols}},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[list(p) for p in poly.exterior.coords]],
                },
            }
        )
    (paths.PROCESSED / "grid_h3_r8.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8"
    )

    # --- QA ------------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    chk("h3_unique", df.h3_r8.is_unique, f"{len(df)} ô")
    chk(
        "no_missing_after_join",
        not df[["population", "built_frac", "road_len_m"]].isna().any().any(),
        "",
    )
    s04 = json.loads((paths.QA / "s04_population.json").read_text(encoding="utf-8"))["stats"]
    expected = s04["population_expected_after_substitution"]
    # Lưới báo cáo đã loại các ô vụn (grid.MIN_AREA_FRAC), nên tổng ở đây nhỏ hơn tổng
    # neo theo xã đúng bằng phần dân rơi vào các ô đó — con số này được KHAI BÁO ở s04,
    # không được im lặng nuốt mất.
    lost = s04.get("population_in_excluded_sliver_cells", 0.0)
    chk(
        "population_total_preserved_minus_declared_slivers",
        abs(df.population.sum() - (expected - lost)) < 1,
        f"{df.population.sum():,.0f} vs {expected:,.0f} − {lost:,.1f} (ô vụn đã loại)",
    )
    chk(
        "util_cell_null_not_zero",
        bool((df.util_cell.isna() == (df.n_stations_measured == 0)).all()),
        "ô không đo được là null, không phải 0",
    )
    chk(
        "no_rejected_variant_columns",
        not (
            {
                "pop_2020",
                "pop_2025",
                "pop_adj",
                "nameplate_power_kw",
                "occ_twa",
                "util_hb",
                # ba trường đã bị bỏ có chủ đích — chúng KHÔNG được quay lại
                "drive_time_station_min",
                "buildable",
                "not_buildable_reason",
                "dist_substation_m",
            }
            & set(df.columns)
        ),
        "không cột biến thể / cột đã bỏ nào lọt vào bảng cuối",
    )
    chk(
        "border_convention_declared",
        "road_len_in_hanoi_m" in df.columns,
        "ô biên đo được chênh lệch giữa hai quy ước cắt biên",
    )

    report = {
        "layer": "grid_h3_r8",
        "stats": {
            "n_cells": int(len(df)),
            "n_columns": int(len(df.columns)),
            "columns": list(df.columns),
            "population_total": round(float(df.population.sum()), 1),
            "cells_with_supply": int((df.n_stations > 0).sum()),
            "cells_with_measured_util": int((df.n_stations_measured > 0).sum()),
            "util_cell_median": round(float(df.util_cell.median()), 4),
            "dist_station_network_median_m": round(float(df.dist_station_network_m.median()), 1),
            "dist_station_network_p90_m": round(float(df.dist_station_network_m.quantile(0.9)), 1),
            "pop_beyond_2km_network": int(
                df.loc[df.dist_station_network_m > 2000, "population"].sum()
            ),
            "pop_beyond_5km_network": int(
                df.loc[df.dist_station_network_m > 5000, "population"].sum()
            ),
            "pop_unreachable": int(df.loc[~df.network_reachable, "population"].sum()),
        },
        "checks": checks,
    }
    (paths.QA / "s10_assemble.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {k: v for k, v in report["stats"].items() if k != "columns"},
            ensure_ascii=False,
            indent=2,
        )
    )
    print("\ncolumns:", ", ".join(df.columns))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
