import test from "node:test";
import assert from "node:assert/strict";

import {
  powerTierOf,
  POWER_TIER_ORDER,
  canonicalFilter,
  filterEquals,
  applyFilterIntent,
  isFilterCompatible,
  serializeFilter,
  parseFilter,
  INITIAL_FILTER_STATE,
  type AnalysisFilter,
} from "../src/state/filter";
import { DEFAULT_DATASET_ID } from "../src/state/selection";

test("powerTierOf maps port kW thresholds accurately", () => {
  assert.equal(powerTierOf(null), "unknown");
  assert.equal(powerTierOf(undefined), "unknown");
  assert.equal(powerTierOf(NaN), "unknown");
  assert.equal(powerTierOf(-5), "unknown");

  assert.equal(powerTierOf(0), "le-22");
  assert.equal(powerTierOf(11), "le-22");
  assert.equal(powerTierOf(22), "le-22");

  assert.equal(powerTierOf(22.1), "23-60");
  assert.equal(powerTierOf(30), "23-60");
  assert.equal(powerTierOf(60), "23-60");

  assert.equal(powerTierOf(60.5), "61-120");
  assert.equal(powerTierOf(120), "61-120");

  assert.equal(powerTierOf(120.1), "121-180");
  assert.equal(powerTierOf(180), "121-180");

  assert.equal(powerTierOf(180.1), "gt-180");
  assert.equal(powerTierOf(250), "gt-180");
  assert.equal(powerTierOf(360), "gt-180");
});

test("canonicalFilter standardizes ranges and categorical sets", () => {
  assert.equal(canonicalFilter(null), null);

  // Inverted range gets corrected
  const inverted: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 500,
    hi: 100,
    missing: "exclude",
    source: "demand-population-histogram",
  };
  const canonicalInverted = canonicalFilter(inverted);
  assert.ok(canonicalInverted && canonicalInverted.entity === "h3-cell" && canonicalInverted.op === "between");
  assert.equal(canonicalInverted.lo, 100);
  assert.equal(canonicalInverted.hi, 500);

  // Power tier deduplication and ordering
  const messyTiers: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: ["gt-180", "le-22", "gt-180", "23-60"],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  const canonicalTiers = canonicalFilter(messyTiers);
  assert.ok(canonicalTiers && canonicalTiers.entity === "station" && canonicalTiers.op === "in");
  assert.deepEqual(canonicalTiers.values, ["le-22", "23-60", "gt-180"]);

  // Selecting all tiers means no filter (canonical null)
  const allTiers: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: [...POWER_TIER_ORDER],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  assert.equal(canonicalFilter(allTiers), null);

  // Selecting 0 tiers means no filter (canonical null)
  const emptyTiers: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: [],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  assert.equal(canonicalFilter(emptyTiers), null);
});

test("serializeFilter and parseFilter round-trip canonical filters", () => {
  const demandFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 0,
    hi: 1250,
    missing: "exclude",
    source: "demand-population-histogram",
  };
  const serializedDemand = serializeFilter(demandFilter);
  assert.equal(serializedDemand, "f1~h3-cell~population~between~0..1250");
  const parsedDemand = parseFilter(serializedDemand);
  assert.deepEqual(parsedDemand, canonicalFilter(demandFilter));

  const supplyFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: ["61-120", "gt-180"],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  const serializedSupply = serializeFilter(supplyFilter);
  assert.equal(serializedSupply, "f1~station~power-tier~in~61-120.gt-180");
  const parsedSupply = parseFilter(serializedSupply);
  assert.deepEqual(parsedSupply, canonicalFilter(supplyFilter));

  // Corrupted string returns null
  assert.equal(parseFilter("gibberish"), null);
  assert.equal(parseFilter("f1~invalid~format"), null);
  assert.equal(parseFilter("f1~invalid~format"), null);
});

test("applyFilterIntent manages revisions and reference equality", () => {
  const state0 = INITIAL_FILTER_STATE;
  assert.equal(state0.active, null);
  assert.equal(state0.revision, 0);

  const filter1: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 0,
    hi: 500,
    missing: "exclude",
    source: "demand-population-histogram",
  };

  const state1 = applyFilterIntent(state0, filter1);
  assert.equal(state1.revision, 1);
  assert.deepEqual(state1.active, canonicalFilter(filter1));

  // Applying equivalent filter should not increment revision
  const filter1Copy = { ...filter1 };
  assert.equal(filterEquals(filter1, filter1Copy), true);
  assert.equal(filterEquals(filter1, null), false);
  const state1Same = applyFilterIntent(state1, filter1Copy);
  assert.equal(state1Same.revision, 1);
  assert.equal(state1Same, state1);

  // Clearing filter increments revision
  const state2 = applyFilterIntent(state1, null);
  assert.equal(state2.revision, 2);
  assert.equal(state2.active, null);
});

test("isFilterCompatible checks lens and geometry compatibility", () => {
  const cellFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 0,
    hi: 500,
    missing: "exclude",
    source: "demand-population-histogram",
  };

  const stationFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: ["le-22"],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };

  assert.equal(isFilterCompatible(cellFilter, "demand", "cell"), true);
  assert.equal(isFilterCompatible(cellFilter, "demand", "commune"), false);
  assert.equal(isFilterCompatible(cellFilter, "supply"), false);
  assert.equal(isFilterCompatible(cellFilter, "access"), false);

  assert.equal(isFilterCompatible(stationFilter, "supply", "station"), true);
  assert.equal(isFilterCompatible(stationFilter, "supply", "cell"), false);
  assert.equal(isFilterCompatible(stationFilter, "demand"), false);
  assert.equal(isFilterCompatible(stationFilter, "opportunity"), false);

  assert.equal(isFilterCompatible(null, "demand"), true);
  assert.equal(isFilterCompatible(null, "supply"), true);
});
