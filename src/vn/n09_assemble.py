"""N9 — Ghép mọi lớp thành MỘT bảng ô cho mỗi tỉnh + cuộn occupancy về ô và về xã.

Sinh (mỗi tỉnh):
  store/p/<code>/grid_h3_r8.parquet   bảng người dùng cuối đọc — một dòng một ô
  store/p/<code>/commune.parquet      bảng theo xã, đã có cung + dân + mức sử dụng
  store/qa/<code>/n09_assemble.json

Các bảng lớp riêng vẫn giữ để truy vết, nhưng không cần đọc để dùng bộ dữ liệu.

**Cổng chặn TRƯỚC khi ghép** giữ nguyên của ``hanoi.s10``: mọi lớp phải phủ ĐÚNG tập ô của
tỉnh. Không có bước này thì một lớp dựng từ tập ô cũ sẽ lặng lẽ thành NaN sau
``merge(how="left")``, và lỗi chỉ lộ ra ở một chỗ ngẫu nhiên phía dưới (bool → float).

``util_cell`` cuộn về ô bằng trung bình có trọng số SỐ CỔNG, chỉ trên trạm ``util_reportable``.
Ô không có trạm đo được là ``null``, **KHÔNG phải 0** — đó là khác biệt giữa "không đo được"
và "đo được và bằng không", và ràng buộc 1 của web sống hay chết ở chỗ này.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from . import admin, paths, qa
from .runner import Step

VERSION = "1"

LAYERS = [
    "grid_cell.parquet",
    "population_cell.parquet",
    "landcover_cell.parquet",
    "traveltime_cell.parquet",
    "screening_cell.parquet",
]
DROP = {"n_px_10m"}

FRONT = [
    "h3_r8",
    "province_code",
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

# Cột đã bị bỏ CÓ CHỦ Ý ở bộ Hà Nội — chúng không được quay lại qua đường ghép.
REJECTED = {
    "pop_2020",
    "pop_2025",
    "pop_adj",
    "nameplate_power_kw",
    "occ_twa",
    "util_hb",
    "drive_time_station_min",
    "buildable",
    "not_buildable_reason",
    "dist_substation_m",
}


def run(province_code: str) -> None:
    r = qa.Report(
        "n09_assemble", province_code, province_name=admin.province_names()[province_code]
    )
    pdir = paths.PROV / province_code
    want = set(pq.read_table(pdir / "grid_cell.parquet", columns=["h3_r8"]).to_pandas().h3_r8)

    df = None
    for f in LAYERS:
        t = pq.read_table(pdir / f).to_pandas()
        t["h3_r8"] = t.h3_r8.astype("string")
        got = set(t.h3_r8)
        if got != want:
            raise SystemExit(
                f"{province_code}/{f}: tập ô không khớp lưới của tỉnh "
                f"(thiếu {len(want - got)}, thừa {len(got - want)}). "
                "Lớp này dựng từ tập ô cũ — chạy lại n04_grid rồi các bước sau."
            )
        if df is None:
            df = t
        else:
            t = t.drop(columns=[c for c in t.columns if c in df.columns and c != "h3_r8"])
            df = df.merge(t, on="h3_r8", how="left", validate="1:1")

    # --- cuộn occupancy về ô -------------------------------------------------
    st = pq.read_table(
        pdir / "stations.parquet",
        columns=["station_code", "commune_code", "lat", "lng", "n_ports", "scope"],
    ).to_pandas()
    st = st[st.scope == "IN"].copy()
    import h3

    from evcs.core.grid import RES

    st["h3_r8"] = [h3.latlng_to_cell(la, ln, RES) for la, ln in zip(st.lat, st.lng)]
    oc = pq.read_table(
        pdir / "station_occupancy.parquet",
        columns=["station_code", "util", "util_reportable"],
    ).to_pandas()
    j = st.merge(oc, on="station_code", how="inner")
    j = j[j.util_reportable & j.util.notna()].copy()
    j["w"] = j.n_ports.fillna(1).clip(lower=1)

    if len(j):
        agg = j.groupby("h3_r8").apply(
            lambda x: pd.Series(
                {
                    "util_cell": float(np.average(x.util, weights=x.w)),
                    "n_stations_measured": int(len(x)),
                }
            ),
            include_groups=False,
        )
        df["util_cell"] = df.h3_r8.map(agg.util_cell)
        df["n_stations_measured"] = df.h3_r8.map(agg.n_stations_measured).fillna(0).astype("int64")
    else:
        df["util_cell"] = pd.Series([pd.NA] * len(df), dtype="Float64")
        df["n_stations_measured"] = 0

    df = df.drop(columns=[c for c in DROP if c in df.columns])
    front = [c for c in FRONT if c in df.columns]
    df = df[front + [c for c in df.columns if c not in front]]
    df = df.sort_values("h3_r8").reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False),
        pdir / "grid_h3_r8.parquet",
        compression="zstd",
    )

    # --- bảng theo xã --------------------------------------------------------
    adm = pq.read_table(paths.ADMIN / "communes.parquet").to_pandas()
    adm = adm[adm.province_code == province_code].copy()
    cpop = pq.read_table(
        pdir / "population_commune.parquet",
        columns=["commune_code", "population", "population_wp", "anchor_ratio", "pop_source"],
    ).to_pandas()
    adm = adm.drop(columns=["population", "pop_density_ppkm2"]).merge(
        cpop, on="commune_code", how="left", validate="1:1"
    )
    # Mật độ chia cho diện tích ĐO TỪ ĐA GIÁC, không phải diện tích công bố — xem n05.
    adm["pop_density_ppkm2"] = adm.population / adm.area_km2_geom

    sup = st.groupby("commune_code").agg(n_stations=("station_code", "count"))
    ports = pq.read_table(
        pdir / "stations.parquet", columns=["commune_code", "n_ports", "power_kw_site", "scope"]
    ).to_pandas()
    ports = (
        ports[ports.scope == "IN"]
        .groupby("commune_code")
        .agg(n_ports=("n_ports", "sum"), power_kw_site=("power_kw_site", "sum"))
    )
    adm["n_stations"] = adm.commune_code.map(sup.n_stations).fillna(0).astype("int64")
    adm["n_ports"] = adm.commune_code.map(ports.n_ports).fillna(0).astype("int64")
    adm["power_kw_site"] = adm.commune_code.map(ports.power_kw_site).fillna(0.0)
    adm["ports_per_10k_pop"] = 1e4 * adm.n_ports / adm.population.replace(0, np.nan)

    if len(j):
        cu = j.groupby("commune_code").apply(
            lambda x: float(np.average(x.util, weights=x.w)), include_groups=False
        )
        adm["util_mean_port_weighted"] = adm.commune_code.map(cu)
    else:
        adm["util_mean_port_weighted"] = pd.NA

    # Khoảng cách theo xã: trọng số DÂN SỐ, cuộn từ ô qua ma trận ô×xã.
    cc = pq.read_table(pdir / "grid_cell_commune.parquet").to_pandas()
    m = cc.merge(df[["h3_r8", "dist_station_network_m", "population"]], on="h3_r8", how="left")
    m["w"] = m.area_frac * m.population.fillna(0)
    dt = (
        m.dropna(subset=["dist_station_network_m"])
        .groupby("commune_code")
        .apply(
            lambda x: (
                float(np.average(x.dist_station_network_m, weights=x.w))
                if x.w.sum() > 0
                else np.nan
            ),
            include_groups=False,
        )
    )
    adm["dist_station_m_pop_weighted"] = adm.commune_code.map(dt)
    cols = [c for c in adm.columns if c != "geometry_wkb"] + ["geometry_wkb"]
    adm = adm[cols].sort_values("commune_code").reset_index(drop=True)
    pq.write_table(pa.Table.from_pandas(adm, preserve_index=False), pdir / "commune.parquet")

    # --- QA ------------------------------------------------------------------
    r.stat(
        n_cells=int(len(df)),
        n_columns=int(len(df.columns)),
        columns=list(df.columns),
        n_communes=int(len(adm)),
        population_total=round(float(df.population.sum()), 1),
        cells_with_supply=int((df.n_stations > 0).sum()),
        cells_with_measured_util=int((df.n_stations_measured > 0).sum()),
        dist_station_network_median_m=round(float(df.dist_station_network_m.median()), 1),
        pop_beyond_2km_network=int(df.loc[df.dist_station_network_m > 2000, "population"].sum()),
        pop_unreachable=int(df.loc[~df.network_reachable, "population"].sum()),
    )
    r.check("h3_unique", bool(df.h3_r8.is_unique), f"{len(df)} ô")
    r.check(
        "no_missing_after_join",
        not df[["population", "built_frac", "dist_station_euclid_m"]].isna().any().any(),
        "",
    )
    r.check(
        "util_cell_null_not_zero",
        bool((df.util_cell.isna() == (df.n_stations_measured == 0)).all()),
        "ô không đo được là null, không phải 0",
    )
    r.check(
        "no_rejected_variant_columns",
        not (REJECTED & set(df.columns)),
        "không cột biến thể / cột đã bỏ nào lọt vào bảng cuối",
    )
    r.write(quiet=True)
    print(
        f"   {len(df):,} ô × {len(df.columns)} cột · {len(adm)} xã · "
        f"dân {df.population.sum():,.0f} · trung vị tới trạm "
        f"{df.dist_station_network_m.median():,.0f} m · "
        f"{int((df.n_stations_measured > 0).sum()):,} ô đo được mức dùng"
    )


def outputs(province_code: str) -> list:
    d = paths.PROV / province_code
    return [d / "grid_h3_r8.parquet", d / "commune.parquet"]


def upstream(province_code: str) -> list:
    return [paths.PROV / province_code / f for f in LAYERS] + [
        paths.PROV / province_code / "station_occupancy.parquet"
    ]


STEP = Step(
    name="n09_assemble",
    scope="province",
    version=VERSION,
    run=run,
    outputs=outputs,
    province_sources=upstream,
    desc="ghép mọi lớp thành một bảng ô + bảng xã cho mỗi tỉnh",
)
