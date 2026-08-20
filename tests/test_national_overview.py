import json
import re
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import pytest

from vn.n10_quality import BEYOND_2KM_M, _ratio

ROOT = Path(__file__).parents[1]


def _published():
    return json.loads((ROOT / "web/public/data/vn/provinces.json").read_text("utf-8"))


def test_national_export_schema_has_no_merge_suffix_and_all_kpis():
    rows = _published()
    assert len(rows) == 34
    required = {
        "population",
        "n_communes",
        "area_km2_geom",
        "n_dac_khu",
        "ports_per_10k_pop",
        "urban_km2",
        "power_kw_per_urban_km2",
        "population_within_2km",
        "population_access_within_2km",
    }
    for row in rows.values():
        assert required <= row.keys()
        assert not any(key.endswith(("_x", "_y")) for key in row)


def test_normalized_kpis_null_propagate_for_incomplete_denominators():
    for denominator in (0, None, np.nan):
        assert _ratio(100, denominator, 10_000) is None


def test_urban_area_uses_effective_border_cell_area():
    rows = _published()
    assert sum(row["urban_km2"] for row in rows.values()) == pytest.approx(10_565.4, abs=0.1)
    for code in ("01", "22", "79", "96"):
        grid = pq.read_table(
            ROOT / f"store/p/{code}/grid_h3_r8.parquet",
            columns=["built_frac", "area_km2", "area_frac"],
        ).to_pandas()
        expected = float((grid.built_frac * grid.area_km2 * grid.area_frac).sum())
        assert rows[code]["urban_km2"] == pytest.approx(expected, abs=1e-4)


def test_access_ledger_keeps_unreachable_population_out_of_numerator():
    rows = _published()
    for code in ("01", "04", "79", "96"):
        grid = pq.read_table(
            ROOT / f"store/p/{code}/grid_h3_r8.parquet",
            columns=["population", "network_reachable", "dist_station_network_m"],
        ).to_pandas()
        total = float(grid.population.sum())
        within = float(
            grid.loc[
                grid.network_reachable & (grid.dist_station_network_m <= BEYOND_2KM_M),
                "population",
            ].sum()
        )
        assert rows[code]["population_access_within_2km"] == pytest.approx(within / total, abs=5e-5)
    assert 1 - rows["96"]["population_access_within_2km"] == pytest.approx(
        rows["96"]["share_pop_beyond_2km"], abs=1e-4
    )


def test_distance_reachability_invariant_holds_for_every_province():
    for path in sorted((ROOT / "store/p").glob("*/grid_h3_r8.parquet")):
        grid = pq.read_table(
            path,
            columns=["network_reachable", "dist_station_network_m"],
        ).to_pandas()
        assert (grid.network_reachable == grid.dist_station_network_m.notna()).all(), path


def test_province_kpi_paths_have_no_silent_denominator_guard():
    source = (ROOT / "src/vn/n10_quality.py").read_text("utf-8")
    assert not re.search(r"/\s*max\s*\(", source)
    assert not re.search(r"_ratio\([^\n]+\)\s+or\s+0(?:\.0)?", source)


def test_access_threshold_matches_web_domain_registry():
    source = (ROOT / "web/src/domain-thresholds.ts").read_text("utf-8")
    match = re.search(r"export const BEYOND_2KM_M\s*=\s*([\d_]+)", source)
    assert match
    assert float(match.group(1).replace("_", "")) == BEYOND_2KM_M
