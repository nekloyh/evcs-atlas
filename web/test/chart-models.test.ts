import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDemandPopulationHistogram,
  buildSupplyPowerTierBreakdown,
  buildAccessPopulationCurve,
  buildUtilizationWeekHeatmap,
  buildOpportunityCommuneRank,
  type OpportunityCommuneRow,
} from "../src/viz/chart-models";
import type { GridCell, StationPoint } from "../src/data/queries";
import type { AccessCurve } from "../src/viz/access";
import type { OccProfiles } from "../src/viz/occ";
import { DEFAULT_DATASET_ID } from "../src/state/selection";
import type { AnalysisFilter } from "../src/state/filter";

test("buildDemandPopulationHistogram creates exact 24 bins and computes filter matches", () => {
  const mockCells: GridCell[] = [
    { h3: "881", value: 0, pop: 0, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 500, reachable: true },
    { h3: "882", value: 0, pop: 0, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 500, reachable: true },
    { h3: "883", value: 10, pop: 10, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 500, reachable: true },
    { h3: "884", value: 100, pop: 100, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 500, reachable: true },
    { h3: "885", value: 1000, pop: 1000, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 500, reachable: true },
    { h3: "886", value: null, pop: NaN, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: null, reachable: false },
  ];

  const modelWithoutFilter = buildDemandPopulationHistogram(mockCells, null);
  assert.equal(modelWithoutFilter.bins.length, 24);
  assert.equal(modelWithoutFilter.bins[0]!.isZeroSlot, true);
  assert.equal(modelWithoutFilter.bins[0]!.nCells, 2);
  assert.equal(modelWithoutFilter.nMissingCells, 1);
  assert.equal(modelWithoutFilter.totalCells, 6);
  assert.equal(modelWithoutFilter.bins.every((b) => b.isInFilter), true);

  // Apply a between filter [10, 500]
  const filter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 10,
    hi: 500,
    missing: "exclude",
    source: "demand-population-histogram",
  };
  const modelWithFilter = buildDemandPopulationHistogram(mockCells, filter);
  assert.equal(modelWithFilter.bins[0]!.isInFilter, false); // Zero slot outside [10, 500]
  const matchedBins = modelWithFilter.bins.filter((b) => b.isInFilter);
  assert.ok(matchedBins.length > 0);
  assert.ok(matchedBins.length < 24);
});

test("Demand histogram always uses population, preserves missing data, and collapses an all-zero domain", () => {
  const cells: GridCell[] = [
    { h3: "a", value: 1500, pop: 15, ports: 0, lat: 0, lng: 0, beyond2km: null, dist: null, reachable: null },
    { h3: "b", value: 2, pop: 5, ports: 0, lat: 0, lng: 0, beyond2km: null, dist: null, reachable: null },
    { h3: "c", value: 99, pop: null, ports: 0, lat: 0, lng: 0, beyond2km: null, dist: null, reachable: null },
  ];
  const model = buildDemandPopulationHistogram(cells);
  assert.equal(model.medianPop, 10);
  assert.equal(model.nMissingCells, 1);
  assert.equal(model.nTotalCells, 2);

  const zeros = buildDemandPopulationHistogram([
    { h3: "z1", value: 99, pop: 0, ports: 0, lat: 0, lng: 0, beyond2km: null, dist: null, reachable: null },
    { h3: "z2", value: 42, pop: 0, ports: 0, lat: 0, lng: 0, beyond2km: null, dist: null, reachable: null },
  ]);
  assert.equal(zeros.bins.length, 1);
  assert.equal(zeros.zeroBin.nCells, 2);
});

test("buildSupplyPowerTierBreakdown aggregates 6 tiers for IN stations only", () => {
  const mockStations: StationPoint[] = [
    {
      id: "st1",
      stationCode: "ST01",
      lat: 21,
      lng: 105,
      inScope: true,
      opStatus: "OPERATIONAL",
      nPorts: 4,
      powerKwMaxPort: 11,
      powerKwSite: 44,
      powerTier: "le-22",
    },
    {
      id: "st2",
      stationCode: "ST02",
      lat: 21,
      lng: 105,
      inScope: true,
      opStatus: "OPERATIONAL",
      nPorts: 2,
      powerKwMaxPort: 60,
      powerKwSite: 120,
      powerTier: "23-60",
    },
    {
      id: "st3",
      stationCode: "ST03",
      lat: 21,
      lng: 105,
      inScope: false, // BUFFER station — must be excluded from aggregates!
      opStatus: "OPERATIONAL",
      nPorts: 8,
      powerKwMaxPort: 250,
      powerKwSite: 500,
      powerTier: "gt-180",
    },
    {
      id: "st4",
      stationCode: "ST04",
      lat: 21,
      lng: 105,
      inScope: true,
      opStatus: "OPERATIONAL",
      nPorts: null,
      powerKwMaxPort: null,
      powerKwSite: null,
      powerTier: "unknown",
    },
  ];

  const model = buildSupplyPowerTierBreakdown(mockStations, null);
  assert.equal(model.totalInStations, 3);
  assert.equal(model.tiers.length, 6);

  const le22 = model.tiers.find((t) => t.tierId === "le-22")!;
  assert.equal(le22.nStations, 1);
  assert.equal(le22.portsSum, 4);
  assert.equal(le22.powerSiteKwSum, 44);

  const gt180 = model.tiers.find((t) => t.tierId === "gt-180")!;
  assert.equal(gt180.nStations, 0); // st3 was BUFFER so gt-180 is 0

  const unknown = model.tiers.find((t) => t.tierId === "unknown")!;
  assert.equal(unknown.nStations, 1);
  assert.equal(unknown.portsMissingCount, 1);
  assert.equal(unknown.powerSiteMissingCount, 1);
});

test("buildAccessPopulationCurve computes curve points and 2 km reference metrics", () => {
  const mockCurve: AccessCurve = {
    curve: [
      { d: 0, share: 0 },
      { d: 1000, share: 3000 / 9000 },
      { d: 2000, share: 6000 / 9000 },
      { d: 5000, share: 1 },
    ],
    maxD: 5000,
    popMeasured: 9000,
    popUnmeasured: 1000,
  };

  const model = buildAccessPopulationCurve(mockCurve);
  assert.equal(model.populationTotal, 10000);
  assert.equal(model.populationMeasured, 9000);
  assert.equal(model.populationUnmeasured, 1000);
  assert.equal(model.shareWithin2km, 0.6); // 6000 / 10000
  assert.equal(model.points.length, 4);
  assert.equal(model.points[2]!.distanceM, 2000);
  assert.equal(model.points[2]!.shareOfAllPop, 0.6);
});

test("buildUtilizationWeekHeatmap computes 168 cells with inScope masking", () => {
  // 2 stations, 1 inScope and 1 buffer
  const n = 2;
  const occ = new Float32Array(n * 168).fill(2); // 2 occupied ports
  const observed = new Float32Array(n * 168).fill(30); // 30 observed hours
  const nPorts = new Float32Array([4, 10]);
  const inScope = [true, false]; // Station 0 is in-scope (4 ports), Station 1 is buffer (10 ports)

  const profiles: OccProfiles = {
    occ,
    observed,
    nPorts,
    inScope,
    n,
  };

  const model = buildUtilizationWeekHeatmap(profiles);
  assert.equal(model.cells.length, 168);
  assert.equal(model.allInInstalledPorts, 4);

  // Station 0 occ=2, nPorts=4 -> utilization rate = 2/4 = 0.5 (50%)
  assert.equal(model.cells[0]!.value, 0.5);
  assert.equal(model.cells[0]!.contributingStations, 1);
  assert.equal(model.cells[0]!.contributingPorts, 4);
});

test("buildOpportunityCommuneRank ranks by lower bound and handles competition ties", () => {
  const mockCommunes: OpportunityCommuneRow[] = [
    {
      commune_code: "C01",
      commune_name: "Xã Một",
      n_cells: 10,
      n_population_missing: 0,
      n_distance_unknown: 0,
      population_total: 10000,
      population_measured: 10000,
      population_within_2km: 2000,
      population_beyond_2km: 8000,
      population_distance_unknown: 0,
    },
    {
      commune_code: "C02",
      commune_name: "Xã Hai",
      n_cells: 10,
      n_population_missing: 0,
      n_distance_unknown: 0,
      population_total: 10000,
      population_measured: 10000,
      population_within_2km: 4000,
      population_beyond_2km: 6000, // tied with C03
      population_distance_unknown: 0,
    },
    {
      commune_code: "C03",
      commune_name: "Xã Ba",
      n_cells: 10,
      n_population_missing: 0,
      n_distance_unknown: 0,
      population_total: 10000,
      population_measured: 10000,
      population_within_2km: 4000,
      population_beyond_2km: 6000, // tied with C02
      population_distance_unknown: 0,
    },
    {
      commune_code: "C04",
      commune_name: "Xã Bốn",
      n_cells: 10,
      n_population_missing: 0,
      n_distance_unknown: 0,
      population_total: 10000,
      population_measured: 10000,
      population_within_2km: 7000,
      population_beyond_2km: 3000,
      population_distance_unknown: 0,
    },
  ];

  const model = buildOpportunityCommuneRank(mockCommunes, "C04");
  assert.equal(model.topRanks.length, 4);

  // Check competition ranking (1, 2, 2, 4)
  assert.equal(model.topRanks[0]!.communeCode, "C01");
  assert.equal(model.topRanks[0]!.rank, 1);

  assert.equal(model.topRanks[1]!.communeCode, "C02");
  assert.equal(model.topRanks[1]!.rank, 2);

  assert.equal(model.topRanks[2]!.communeCode, "C03");
  assert.equal(model.topRanks[2]!.rank, 2);

  assert.equal(model.topRanks[3]!.communeCode, "C04");
  assert.equal(model.topRanks[3]!.rank, 4); // competition rank after tie is 4!
  assert.equal(model.topRanks[3]!.isSelected, true);
  assert.equal(model.pinnedItem, null); // C04 is in top 10 so not pinned
});
