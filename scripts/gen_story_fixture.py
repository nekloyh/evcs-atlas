"""Sinh golden fixture cho `web/test/story-claims.test.ts` — PHASE7_STORY_MODE.md §8.

Luật của fixture, và nó là toàn bộ lý do file này tồn tại:

  **Fixture ghi ĐẦU VÀO của phép suy, không ghi con số gõ tay.** Test nạp đầu vào ấy, chạy
  chính các builder dùng chung của web, rồi so với `expected` mà script này tính ĐỘC LẬP
  bằng pandas/numpy. Hai phía đi hai đường tới cùng một chỗ, nên một phía sai thì test đỏ.

  Và fixture ghi `exported_utc` của gói. Test đối chiếu nó với `web/public/data/manifest.json`
  đang có trên đĩa, nên **gói đổi mà quên sinh lại fixture là một test đỏ**, không phải một
  câu chữ cũ sống sót trên màn hình. Đó chính là chỗ mà bản trước đã hỏng.

Chạy:  uv run python scripts/gen_story_fixture.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import h3
except ImportError as exc:  # pragma: no cover
    raise SystemExit("cần `h3`: uv add h3") from exc

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = ROOT / "web" / "test" / "fixtures" / "p01-story.json"

BEYOND_2KM_M = 2000
DETOUR_THRESHOLD = 2
EUCLID_COVERAGE_RADIUS_M = 3000
MAJOR_BRIDGE_MIN_M = 1000
DENSITY_QUANTILES = [0.90, 0.95, 0.975, 0.99]
OBSERVED_H_MIN = 1.0
HOURS_IN_WEEK = 168

# Cùng hằng số với `story/bridges.ts:pathLengthM` — xấp xỉ phẳng ở vĩ độ 21°.
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 103_940.0


def _round(x, n=6):
    if x is None:
        return None
    v = float(x)
    return None if not np.isfinite(v) else round(v, n)


def path_len_m(coords) -> float:
    a = np.asarray(coords, dtype=float)
    if a.size < 4:
        return 0.0
    x = a[0::2] * M_PER_DEG_LON
    y = a[1::2] * M_PER_DEG_LAT
    return float(np.hypot(np.diff(x), np.diff(y)).sum())


def spatial_structure(h3s, values, pops):
    """Bản độc lập của `buildSpatialStructureModel` — thành phần liên thông + Moran's I."""
    keep = np.isfinite(values)
    ids = [h for h, k in zip(h3s, keep) if k]
    v = values[keep]
    p = np.nan_to_num(pops[keep], nan=0.0)
    pos = {h: i for i, h in enumerate(ids)}

    edges: set[tuple[int, int]] = set()
    for h in ids:
        a = pos[h]
        for nb in h3.grid_disk(h, 1):
            b = pos.get(nb)
            if b is not None and b > a:
                edges.add((a, b))
    adj: list[list[int]] = [[] for _ in ids]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)

    mean = v.mean()
    z = v - mean
    num = sum(2 * z[a] * z[b] for a, b in edges)
    den = float((z**2).sum())
    W = 2 * len(edges)
    moran = (len(v) / W) * (num / den) if W > 0 and den > 0 else None

    steps = []
    for q in DENSITY_QUANTILES:
        thr = float(np.quantile(v, q))
        members = np.flatnonzero(v >= thr)
        in_cut = set(members.tolist())
        seen: set[int] = set()
        comps = []
        for start in members.tolist():
            if start in seen:
                continue
            seen.add(start)
            stack, size, popsum = [start], 0, 0.0
            while stack:
                u = stack.pop()
                size += 1
                popsum += float(p[u])
                for w in adj[u]:
                    if w in in_cut and w not in seen:
                        seen.add(w)
                        stack.append(w)
            comps.append((size, popsum))
        comps.sort(key=lambda c: c[0], reverse=True)
        steps.append(
            {
                "q": q,
                "threshold": _round(thr),
                "nCells": len(members),
                "nComponents": len(comps),
                "nComponentsGe3": sum(1 for c in comps if c[0] >= 3),
                "largestComponentCells": comps[0][0] if comps else 0,
                "largestComponentPop": _round(comps[0][1]) if comps else 0,
            }
        )
    return {
        "moranI": _round(moran),
        "nAnalysable": len(v),
        "nEdges": len(edges),
        "steps": steps,
    }


def lorenz(area, pop):
    """Bản độc lập của `viz/lorenz.ts:lorenz()` — sắp theo MẬT ĐỘ giảm dần."""
    m = np.isfinite(area) & (area > 0) & np.isfinite(pop)
    a, p = area[m], pop[m]
    if a.sum() <= 0 or p.sum() <= 0:
        return None
    order = np.argsort(-(p / a), kind="stable")
    ca = np.concatenate([[0.0], np.cumsum(a[order]) / a.sum()])
    cp = np.concatenate([[0.0], np.cumsum(p[order]) / p.sum()])
    gini = 2 * float(np.trapezoid(cp, ca)) - 1
    return {"a": ca, "p": cp, "gini": gini, "n": int(m.sum())}


def area_for_pop(l, share):
    i = np.searchsorted(l["p"], share, side="left")
    return float(l["a"][i]) if i < len(l["a"]) else None


def pop_for_area(l, share):
    i = np.searchsorted(l["a"], share, side="left")
    return float(l["p"][i]) if i < len(l["p"]) else None


def main() -> None:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    grid = pd.read_parquet(DATA / "grid_h3_r8.parquet")
    roads = pd.read_parquet(DATA / "roads.parquet")
    stations = pd.read_parquet(DATA / "stations.parquet")
    communes = json.loads((DATA / "commune.geojson").read_text(encoding="utf-8"))
    prof = pd.read_parquet(DATA / "station_occupancy_profile_168h.parquet")

    # ── ĐẦU VÀO ─────────────────────────────────────────────────────────────
    area = (grid["area_km2"] * grid["area_frac"]).to_numpy(float)
    pop = grid["population"].to_numpy(float)
    dens = grid["pop_density_ppkm2"].to_numpy(float)
    ports = np.nan_to_num(grid["n_ports"].to_numpy(float), nan=0.0)

    demand = [
        {
            "h3": h,
            "area": _round(a),
            "pop": _round(p),
            "density": _round(d),
            "ports": int(n),
        }
        for h, a, p, d, n in zip(grid["h3_r8"], area, pop, dens, ports)
    ]

    commune_rows = [
        {
            "commune_code": f["properties"]["commune_code"],
            "commune_name": f["properties"]["commune_name"],
            "population": _round(f["properties"].get("population")),
            "n_ports": f["properties"].get("n_ports"),
            "ports_per_10k_pop": _round(f["properties"].get("ports_per_10k_pop")),
        }
        for f in communes["features"]
    ]

    net = grid["dist_station_network_m"]
    g = grid.assign(_pop=grid["population"])
    opportunity = []
    for (code, name), sub in g.groupby(["commune_code", "commune_name"], dropna=True):
        d = sub["dist_station_network_m"]
        p_ = sub["_pop"]
        opportunity.append(
            {
                "commune_code": code,
                "commune_name": name,
                "n_cells": len(sub),
                "n_population_missing": int(p_.isna().sum()),
                "n_distance_unknown": int((p_.notna() & d.isna()).sum()),
                "population_total": _round(p_.sum()),
                "population_measured": _round(p_[d.notna()].sum()),
                "population_within_2km": _round(p_[d <= BEYOND_2KM_M].sum()),
                "population_beyond_2km": _round(p_[d > BEYOND_2KM_M].sum()),
                "population_distance_unknown": _round(p_[d.isna()].sum()),
            }
        )

    station_rows = [
        {
            "inScope": r.scope == "IN",
            "nPorts": None if pd.isna(r.n_ports) else int(r.n_ports),
            "powerKwMaxPort": _round(r.power_kw_max_port),
            "powerKwSite": _round(r.power_kw_site),
            "operator": None if pd.isna(r.operator) else str(r.operator),
        }
        for r in stations.itertuples()
    ]

    # ── MONG ĐỢI, tính độc lập ───────────────────────────────────────────────
    l_demand = lorenz(area, pop)
    structure = spatial_structure(list(grid["h3_r8"]), dens, pop)

    # Lorenz CUNG: `area` ← dân, `pop` ← cổng, và ô không dân rơi khỏi đường cong.
    has_pop = pop > 0
    l_supply = lorenz(np.nan_to_num(pop, nan=0.0)[has_pop], ports[has_pop])
    sorted_ports = np.sort(ports[has_pop])[::-1]
    cum = np.cumsum(sorted_ports)
    half = sorted_ports.sum() / 2
    cells_half_ports = int(np.searchsorted(cum, half, side="left") + 1)

    dr = grid["detour_ratio"]
    eu = grid["dist_station_euclid_m"]
    euclid_cov = int((eu <= EUCLID_COVERAGE_RADIUS_M).sum())
    network_cov = int((net <= EUCLID_COVERAGE_RADIUS_M).sum())

    bridge = roads[roads["bridge"] == True]
    bridge_len = bridge["coords"].map(path_len_m)

    within = sum(r["population_within_2km"] for r in opportunity)
    beyond = sum(r["population_beyond_2km"] for r in opportunity)
    unknown = sum(r["population_distance_unknown"] for r in opportunity)
    shares = [
        r["population_beyond_2km"] / r["population_total"]
        for r in opportunity
        if r["population_total"] and r["population_total"] > 0
    ]
    by_beyond = sorted(opportunity, key=lambda r: r["population_beyond_2km"], reverse=True)

    # Nhịp tuần: cùng ngữ nghĩa `buildUtilizationWeekHeatmap` — trạm IN, `n_ports > 0`,
    # ô giờ dưới sàn quan sát bị LOẠI (không quy về 0), tỉ lệ = Σocc ÷ Σcổng.
    in_codes = set(stations.loc[stations.scope == "IN", "station_code"])
    nports_by_code = dict(zip(stations.station_code, stations.n_ports))
    pr = prof[prof.station_code.isin(in_codes)].copy()
    # `dow`/`hour` là int8 trong parquet: `dow * 24` TRÀN ở dow ≥ 6 (144 > 127) và t = 167
    # ra −89. Ép sang int64 TRƯỚC khi nhân. Phía TS không có bẫy này (`Number()` là f64),
    # nên nếu quên thì chỉ fixture sai — và test sẽ đỏ, đó là điều đúng.
    pr["t"] = pr["dow"].astype("int64") * 24 + pr["hour"].astype("int64")
    pr["np"] = pr["station_code"].map(nports_by_code)
    pr = pr[pr["np"].notna() & (pr["np"] > 0)]
    usable = pr[pr["observed_h"] >= OBSERVED_H_MIN]
    agg = usable.groupby("t").apply(
        lambda d: pd.Series({"occ": d["occ"].sum(), "ports": d["np"].sum()}),
        include_groups=False,
    )
    rate = (agg["occ"] / agg["ports"]).dropna()
    peak_t, trough_t = int(rate.idxmax()), int(rate.idxmin())
    below_floor = int((pr["observed_h"] < OBSERVED_H_MIN).sum())
    with_profile = int(usable["station_code"].nunique())
    n_in_scope = len(in_codes)

    ops = stations.loc[stations.scope == "IN", "operator"].dropna().str.strip()
    ops = ops[ops != ""]
    top_op = ops.value_counts()

    low = stations[(stations.scope == "IN") & (stations.power_kw_max_port <= 22)]
    all_in = stations[stations.scope == "IN"]

    zero_poi = grid["n_poi_1km"].fillna(0) == 0

    expected = {
        "lorenzAreaPop": {
            "areaForHalfPop": _round(area_for_pop(l_demand, 0.5)),
            "popShareForTenthArea": _round(pop_for_area(l_demand, 0.10)),
            "gini": _round(l_demand["gini"]),
            "nCells": l_demand["n"],
        },
        "spatialStructure": structure,
        "supplyEquity": {
            "gini": _round(l_supply["gini"]),
            "portShareForTenthPop": _round(pop_for_area(l_supply, 0.10)),
            "cellsForHalfPorts": cells_half_ports,
            "shareCellsZeroPorts": _round(float((ports == 0).mean())),
            "portsNoPop": int(ports[~has_pop].sum()),
            "nCells": len(grid),
        },
        "communeSupply": {
            "n": len(commune_rows),
            "median": _round(
                float(
                    np.median(
                        [
                            r["ports_per_10k_pop"]
                            for r in commune_rows
                            if r["ports_per_10k_pop"] is not None
                        ]
                    )
                )
            ),
            "nZeroPorts": sum(1 for r in commune_rows if r["n_ports"] == 0),
            "popZeroPorts": _round(
                sum(r["population"] or 0 for r in commune_rows if r["n_ports"] == 0)
            ),
        },
        "subjects": {
            "mostPopulousZeroPorts": max(
                (r for r in commune_rows if r["n_ports"] == 0), key=lambda r: r["population"] or 0
            )["commune_code"],
            "mostPorts": max(commune_rows, key=lambda r: r["n_ports"] or 0)["commune_code"],
            "worstBeyond2kmAmongMajority": max(
                (
                    r
                    for r in opportunity
                    if r["population_total"]
                    and r["population_total"] > 0
                    and r["population_beyond_2km"] / r["population_total"] > 0.5
                ),
                key=lambda r: r["population_beyond_2km"],
            )["commune_code"],
        },
        "detour": {
            "nCells": int((dr > DETOUR_THRESHOLD).sum()),
            "pop": _round(pop[(dr > DETOUR_THRESHOLD).to_numpy()].sum()),
            "median": _round(float(dr.median())),
            "euclidCovered": euclid_cov,
            "networkCovered": network_cov,
            "falsePositive": euclid_cov - network_cov,
            "falsePositiveShare": _round((euclid_cov - network_cov) / euclid_cov),
        },
        "roads": {
            "waysDrawn": len(roads),
            "bridgeWays": len(bridge),
            "majorBridges": int((bridge_len > MAJOR_BRIDGE_MIN_M).sum()),
            "unreachable": int(roads["dist_station_m"].isna().sum()),
            "manifestBridgeWaysShipped": manifest["roads"]["bridge_ways_shipped"],
        },
        "access": {
            "within": _round(within),
            "beyond": _round(beyond),
            "unknown": _round(unknown),
            "unknownCells": sum(r["n_distance_unknown"] for r in opportunity),
            "shareBeyond": _round(beyond / (within + beyond + unknown)),
        },
        "opportunity": {
            "topShareOfGap": _round(by_beyond[0]["population_beyond_2km"] / beyond),
            "top10ShareOfGap": _round(
                sum(r["population_beyond_2km"] for r in by_beyond[:10]) / beyond
            ),
            "nMajorityBeyond": sum(1 for s in shares if s > 0.5),
            "nAtHundredPercent": sum(1 for s in shares if s >= 1),
            "worstShare": _round(max(shares)),
        },
        "utilization": {
            "peak": _round(float(rate.max())),
            "trough": _round(float(rate.min())),
            "peakT": peak_t,
            "troughT": trough_t,
            "ratio": _round(float(rate.max() / rate.min())),
            "weekMean": _round(float(rate.mean())),
            "nBelowFloor": below_floor,
            "nStationsWithProfile": with_profile,
            "shareStationsWithProfile": _round(with_profile / n_in_scope),
            "nInScope": n_in_scope,
        },
        "powerTier": {
            "nInScope": len(all_in),
            "nBuffer": int(len(stations) - len(all_in)),
            "lowTierStations": len(low),
            "lowTierShare": _round(len(low) / len(all_in)),
            "topOperatorStations": int(top_op.iloc[0]),
            "topOperatorShare": _round(top_op.iloc[0] / len(all_in)),
            "nOperators": len(top_op),
        },
        "poiCoverage": {
            "shareCells": _round(float(zero_poi.mean())),
            "sharePop": _round(float(pop[zero_poi.to_numpy()].sum() / np.nansum(pop))),
            "nCellsZero": int(zero_poi.sum()),
        },
    }

    # ── Hai fixture của Phase 5 sinh CÙNG chỗ này ───────────────────────────
    #
    # Chúng đọc đúng gói này và lỗi thời vì đúng lý do này, nhưng trước đây được sinh bằng
    # tay — nên `presets.test.ts` đỏ mỗi lần xuất lại gói mà không ai biết chạy lệnh gì để
    # sửa. Một cổng chống trôi không có nút sinh lại là một cổng người ta sẽ tắt.
    (OUT.parent / "p01-population.json").write_text(
        json.dumps(
            {
                "source": "p/01 grid_h3_r8.parquet · column population",
                "exported_utc": manifest["exported_utc"],
                "generator": "scripts/gen_story_fixture.py",
                "n": len(grid),
                "values": [None if not np.isfinite(v) else float(v) for v in pop],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    (OUT.parent / "p01-stations.json").write_text(
        json.dumps(
            {
                "source": "p/01 stations.parquet · columns scope, power_kw_max_port",
                "exported_utc": manifest["exported_utc"],
                "generator": "scripts/gen_story_fixture.py",
                "n": len(stations),
                "rows": [
                    {
                        "scope": r.scope,
                        "powerKwMaxPort": None if pd.isna(r.power_kw_max_port) else float(r.power_kw_max_port),
                    }
                    for r in stations.itertuples()
                ],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": "web/public/data (== p/01)",
                "exported_utc": manifest["exported_utc"],
                "generator": "scripts/gen_story_fixture.py",
                "input": {
                    "demand": demand,
                    "communes": commune_rows,
                    "opportunity": opportunity,
                    "stations": station_rows,
                    "detour": {
                        "nCells": expected["detour"]["nCells"],
                        "pop": expected["detour"]["pop"],
                        "median": expected["detour"]["median"],
                        "euclidCovered": euclid_cov,
                        "networkCovered": network_cov,
                    },
                    "manifest": {
                        "coverage": {"util_cell": manifest["coverage"]["util_cell"]},
                        "totals": {"private_ac_dropped": manifest["totals"]["private_ac_dropped"]},
                        "quality": manifest.get("quality", {}),
                        "source_metrics": manifest.get("source_metrics", {}),
                        "roads": manifest["roads"],
                        "snapshots": manifest["snapshots"],
                        "province": manifest["province"],
                    },
                },
                "expected": expected,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"{OUT.relative_to(ROOT)}  ·  {OUT.stat().st_size / 1024:.0f} KB")
    print(json.dumps(expected, ensure_ascii=False, indent=2)[:1500])


if __name__ == "__main__":
    main()
