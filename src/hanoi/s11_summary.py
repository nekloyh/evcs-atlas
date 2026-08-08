"""B11 — Bảng tổng hợp theo xã/phường + gom toàn bộ báo cáo QA thành một file đọc được.

Sinh:
  data/processed/commune.parquet
  data/qa/QA_SUMMARY.md
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from . import paths

QA_ORDER = [
    "s01_admin.json",
    "s02_grid.json",
    "s03_osm_extract.json",
    "s04_population.json",
    "s05_stations.json",
    "s06_occupancy.json",
    "s07_landcover.json",
    "s08_traveltime.json",
    "s09_grid_features.json",
    "s10_assemble.json",
]


def main() -> None:
    adm = pq.read_table(paths.LAYERS / "admin_commune.parquet").to_pandas()
    # `population` của bảng cuối là số THỰC DÙNG trong bộ dữ liệu, không phải số công bố thô:
    # ở 2 xã có `danso` hỏng, số dùng là WorldPop và `pop_source` nói rõ điều đó.
    cpop = pq.read_table(paths.LAYERS / "population_commune.parquet").to_pandas()
    adm = adm.drop(columns=["population", "pop_density_ppkm2"]).merge(
        cpop, on="commune_code", how="left", validate="1:1"
    )
    adm["pop_density_ppkm2"] = adm.population / adm.area_km2
    st = pq.read_table(paths.PROCESSED / "stations.parquet").to_pandas()
    oc = pq.read_table(paths.PROCESSED / "station_occupancy.parquet").to_pandas()
    gr = pq.read_table(paths.PROCESSED / "grid_h3_r8.parquet").to_pandas()

    sh = st[st.scope == "HANOI"]
    g = sh.groupby("commune_code").agg(
        n_stations=("station_id", "count"),
        n_ports=("n_ports", "sum"),
        power_kw_site=("power_kw_site", "sum"),
    )
    j = sh[["station_code", "commune_code", "n_ports"]].merge(
        oc[["station_code", "util", "util_reportable"]], on="station_code", how="inner"
    )
    j = j[j.util_reportable & j.util.notna()]
    util = j.groupby("commune_code").apply(
        lambda x: float(np.average(x.util, weights=x.n_ports.fillna(1).clip(lower=1))),
        include_groups=False,
    )

    # đại lượng theo ô cuộn lên xã, chia tỉ lệ theo phần diện tích ô nằm trong xã
    cc = pq.read_table(paths.LAYERS / "grid_cell_commune.parquet").to_pandas()
    m = cc.merge(gr[["h3_r8", "dist_station_network_m", "population"]], on="h3_r8", how="left")
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

    out = adm.copy()
    out["n_stations"] = out.commune_code.map(g.n_stations).fillna(0).astype("int64")
    out["n_ports"] = out.commune_code.map(g.n_ports).fillna(0).astype("int64")
    out["power_kw_site"] = out.commune_code.map(g.power_kw_site).fillna(0.0)
    out["ports_per_10k_pop"] = 1e4 * out.n_ports / out.population
    out["util_mean_port_weighted"] = out.commune_code.map(util)
    out["dist_station_m_pop_weighted"] = out.commune_code.map(dt)
    # geometry_wkb đứng cuối để bảng dễ đọc khi in ra
    cols = [c for c in out.columns if c != "geometry_wkb"] + ["geometry_wkb"]
    out = out[cols].sort_values("commune_code").reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), paths.PROCESSED / "commune.parquet"
    )

    # --- gom QA -------------------------------------------------------------
    lines = ["# Báo cáo QA — bộ dữ liệu Hà Nội", ""]
    n_pass = n_fail = 0
    for f in QA_ORDER:
        p = paths.QA / f
        if not p.exists():
            continue
        r = json.loads(p.read_text(encoding="utf-8"))
        lines += [f"## `{f}` — {r.get('layer', '')}", ""]
        for k, v in (r.get("stats") or {}).items():
            if k == "columns":
                continue
            lines.append(f"- **{k}**: `{json.dumps(v, ensure_ascii=False)}`")
        cks = r.get("checks") or []
        if cks:
            lines += ["", "| check | kết quả | chi tiết |", "|---|---|---|"]
            for c in cks:
                n_pass += c["status"] == "PASS"
                n_fail += c["status"] != "PASS"
                lines.append(f"| `{c['name']}` | {c['status']} | {c.get('detail', '')} |")
        lines.append("")
    lines.insert(1, f"\n**{n_pass} PASS · {n_fail} FAIL** trên toàn bộ {len(QA_ORDER)} bước.\n")
    (paths.QA / "QA_SUMMARY.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"commune_summary: {len(out)} xã/phường")
    print(f"QA: {n_pass} PASS · {n_fail} FAIL")
    print(
        out.nlargest(5, "n_ports")[
            [
                "commune_name",
                "population",
                "n_stations",
                "n_ports",
                "ports_per_10k_pop",
                "util_mean_port_weighted",
            ]
        ].to_string(index=False)
    )
    print("\nxã không có trạm nào:", int((out.n_stations == 0).sum()))


if __name__ == "__main__":
    main()
