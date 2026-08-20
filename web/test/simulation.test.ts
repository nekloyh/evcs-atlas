/**
 * Phase 6 — Local Spatial Heuristic Simulation Test Suite (simulation.test.ts)
 *
 * Verifies all normative requirements, pure calculations, admission checks,
 * estimator behavior, edge cases, screening rules, and URL hash integration.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §4, §5
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { latLngToCell, cellToLatLng, gridDisk } from "h3-js";

import {
  haversineDistance,
  generateCirclePath,
  zoneTruncatedAt,
} from "../src/simulation/geometry";
import { replayScreening } from "../src/simulation/screening";
import {
  calculateRingDetour,
  estimateCell,
  classifyCell,
  calculateWeightedMedian,
  calculateDistanceBands,
} from "../src/simulation/estimator";
import { checkAdmission, resolveCommuneKind } from "../src/simulation/admissions";
import { runSimulation, isEligibleStation } from "../src/simulation/engine";
import { validateCalibration } from "../src/simulation/loader";
import { parseHash, serializeHash } from "../src/state/hash";
import type { SimCalibration } from "../src/simulation/types";

// Load sample Hanoi calibration fixture
const HANOI_CALIBRATION: SimCalibration = {
  version: 1,
  province_code: "01",
  bands: {
    "200-500": { n: 356, med: 1.716, p90: 3.413 },
    "500-1000": { n: 882, med: 1.572, p90: 2.655 },
    "1000-2000": { n: 1637, med: 1.47, p90: 2.177 },
    "2000-3000": { n: 900, med: 1.408, p90: 1.967 },
    "3000-5000": { n: 504, med: 1.369, p90: 1.899 },
    "5000-inf": { n: 31, med: 1.594, p90: 2.053 },
  },
  near: { n: 87, net_p50: 264, net_p90: 728 },
  validation: { n: 4310, within_20pct: 0.659, upper_miss: 0.097 },
  valid: true,
};

// ── 1. Geometry & Haversine Distance (T19, T23, T24) ─────────────────────────

test("Geometry: Haversine distance matches standard spherical distance within 1m", () => {
  const p1 = { lat: 21.0285, lng: 105.8542 };
  const p2 = { lat: 21.0285, lng: 105.8642 };
  const d = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
  assert.ok(
    d >= 1037 && d <= 1040,
    `Expected ~1038-1039m, got ${d}`,
  );
  assert.equal(haversineDistance(p1.lat, p1.lng, p1.lat, p1.lng), 0);
});

test("Geometry: generateCirclePath produces closed polygon with exact radius", () => {
  const center = { lat: 21.0285, lng: 105.8542 };
  const circle = generateCirclePath(center.lat, center.lng, 5000, 32);
  assert.equal(circle.length, 33); // 32 points + closed 1st point

  // Check radius of each generated coordinate back to center
  for (const pt of circle) {
    const d = haversineDistance(center.lat, center.lng, pt[1], pt[0]);
    assert.ok(
      Math.abs(d - 5000) < 1.0,
      `Circle point distance ${d} deviates from 5000m`,
    );
  }
});

// ── 2. Admission Checks (T1–T5, F1–F3) ────────────────────────────────────────

test("Admissions: candidate outside supported geography is rejected (F1)", () => {
  const boundaryGeoJson = {
    type: "Polygon",
    coordinates: [
      [
        [105.0, 20.0],
        [106.0, 20.0],
        [106.0, 22.0],
        [105.0, 22.0],
        [105.0, 20.0],
      ],
    ],
  };

  const gridMap = new Map<string, { h3: string }>();
  gridMap.set("8865b59637fffff", { h3: "8865b59637fffff" });

  // Point outside boundary polygon
  const outsideCandidate = { lat: 10.0, lng: 106.0 };
  const adm1 = checkAdmission(
    outsideCandidate,
    boundaryGeoJson,
    gridMap,
    HANOI_CALIBRATION,
  );
  assert.equal(adm1.ok, false);
  assert.equal(adm1.code, "F1_OUTSIDE_BOUNDARY");
  assert.match(adm1.message, /Ngoài phạm vi/);
});

test("Admissions: invalid calibration file is rejected (F2)", () => {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  const cell = latLngToCell(candidate.lat, candidate.lng, 8);
  const gridMap = new Map<string, { h3: string }>();
  gridMap.set(cell, { h3: cell });

  const invalidCal: SimCalibration = {
    ...HANOI_CALIBRATION,
    valid: false,
  };

  const adm = checkAdmission(candidate, null, gridMap, invalidCal);
  assert.equal(adm.ok, false);
  assert.equal(adm.code, "F2_CALIBRATION_INVALID");
  assert.match(adm.message, /Chưa đủ dữ liệu hiệu chuẩn/);
});

test("Admissions: unreachable cell with NO ROAD ACCESS is rejected (F3)", () => {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  const cell = latLngToCell(candidate.lat, candidate.lng, 8);
  const gridMap = new Map<string, { h3: string; evidenceGrade: string }>();
  gridMap.set(cell, {
    h3: cell,
    evidenceGrade: "UNREACHABLE_NO_ROAD_ACCESS",
  });

  const adm = checkAdmission(candidate, null, gridMap, HANOI_CALIBRATION);
  assert.equal(adm.ok, false);
  assert.equal(adm.code, "F3_UNREACHABLE_NO_ROAD");
  assert.match(adm.message, /Không có đường/);
});

test("Admissions: valid candidate inside boundary passes admission check", () => {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  const cell = latLngToCell(candidate.lat, candidate.lng, 8);
  const gridMap = new Map<string, { h3: string; evidenceGrade: string }>();
  gridMap.set(cell, { h3: cell, evidenceGrade: "GOOD" });

  const adm = checkAdmission(candidate, null, gridMap, HANOI_CALIBRATION);
  assert.equal(adm.ok, true);
  if (adm.ok) {
    assert.equal(adm.candidateCell, cell);
  }
});

// ── 3. Estimator Pure Calculations (T8–T14, F12) ──────────────────────────────

test("Estimator: zero-distance case (e = 0) applies near band net_p50/net_p90", () => {
  const est = estimateCell(0, HANOI_CALIBRATION, null);
  assert.equal(est.dHat, 264);
  assert.equal(est.dHatUpper, 728);

  const cls = classifyCell(0, 1500, est.dHat, est.dHatUpper, "GOOD");
  assert.equal(cls.cls, "IMPROVES");
  assert.equal(cls.display, "near-band");
  assert.equal(cls.dAfter, 264);
});

test("Estimator: near band (e = 150m < 200m) uses fixed near distribution", () => {
  const est = estimateCell(150, HANOI_CALIBRATION, 2.5);
  assert.equal(est.dHat, 264);
  assert.equal(est.dHatUpper, 728);

  const cls = classifyCell(150, 600, est.dHat, est.dHatUpper, "GOOD");
  // dHat (264) < dOld (600) <= dHatUpper (728) => UNCERTAIN
  assert.equal(cls.cls, "UNCERTAIN");
  assert.equal(cls.display, "near-band");
});

test("Estimator: mid band (200m <= e < 1000m) scales by band and local ring detour", () => {
  // e = 400m in band "200-500" (med: 1.716, p90: 3.413). Local L = 2.0
  const est = estimateCell(400, HANOI_CALIBRATION, 2.0);
  // factor = max(1.716, 2.0) = 2.0 => dHat = 800m
  // upperFactor = max(3.413, 2.0) = 3.413 => dHatUpper = 1365.2m
  assert.equal(est.dHat, 800);
  assert.equal(est.dHatUpper, 400 * 3.413);

  const cls = classifyCell(400, 2000, est.dHat, est.dHatUpper, "GOOD");
  assert.equal(cls.cls, "IMPROVES");
  assert.equal(cls.display, "interval");
});

test("Estimator: far band (e >= 1000m) uses point display format", () => {
  const est = estimateCell(1500, HANOI_CALIBRATION, 1.4);
  // e = 1500m in band "1000-2000" (med: 1.47, p90: 2.177). Local L = 1.4
  // factor = max(1.47, 1.4) = 1.47 => dHat = 2205
  // upperFactor = max(2.177, 1.4) = 2.177 => dHatUpper = 3265.5
  assert.equal(est.dHat, 1500 * 1.47);
  assert.equal(est.dHatUpper, 1500 * 2.177);

  const cls = classifyCell(1500, 3500, est.dHat, est.dHatUpper, "GOOD");
  assert.equal(cls.cls, "IMPROVES");
  assert.equal(cls.display, "point");
});

test("Estimator: extreme detour ratio (L = 15.0) dominates band med and p90", () => {
  const est = estimateCell(1000, HANOI_CALIBRATION, 15.0);
  // max(1.47, 15.0) = 15.0 => dHat = 15000
  // max(2.177, 15.0) = 15.0 => dHatUpper = 15000
  assert.equal(est.dHat, 15000);
  assert.equal(est.dHatUpper, 15000);
});

test("Estimator: null detour ratio fallback when < 3 finite values in disk", () => {
  const cell = "8865b59637fffff";
  const detourMap = new Map<string, number | null>();
  // Only 2 finite values in ring
  detourMap.set(cell, 1.5);
  detourMap.set("8865b59635fffff", 1.8);

  const ringL = calculateRingDetour(cell, detourMap);
  assert.equal(ringL, null);

  // estimateCell falls back to band med and p90
  const est = estimateCell(1000, HANOI_CALIBRATION, ringL);
  assert.equal(est.dHat, 1000 * 1.47);
  assert.equal(est.dHatUpper, 1000 * 2.177);
});

test("Estimator: ring detour ratio < 1.0 is clamped to 1.0", () => {
  const cell = "8865b59637fffff";
  const detourMap = new Map<string, number | null>();
  // 3 values all 0.8
  detourMap.set(cell, 0.8);
  detourMap.set("8865b59635fffff", 0.9);
  detourMap.set("8865b59631fffff", 0.85);

  const ringL = calculateRingDetour(cell, detourMap);
  assert.equal(ringL, 1.0);
});

test("Estimator: numeric invariant guard (F12) ensures dHat >= e", () => {
  // Mock calibration with sub-1 med/p90
  const faultyCal: SimCalibration = {
    ...HANOI_CALIBRATION,
    bands: {
      "500-1000": { n: 10, med: 0.5, p90: 0.8 },
    },
  };

  const est = estimateCell(600, faultyCal, 0.2);
  assert.ok(est.dHat! >= 600, "dHat must be >= e");
  assert.ok(est.dHatUpper! >= 600, "dHatUpper must be >= e");
});

// ── 4. Cell Classification & Unreachable Cells (T15–T18, F6) ───────────────────

test("Classification: unreachable cell UNREACHABLE_NO_PATH is classified as NO_BASELINE", () => {
  const cls = classifyCell(500, null, 700, 1200, "UNREACHABLE_NO_PATH");
  assert.equal(cls.cls, "NO_BASELINE");
  assert.equal(cls.display, "none");
  assert.equal(cls.dAfter, null);
});

test("Classification: unreachable cell UNREACHABLE_NO_ROAD_ACCESS is EXCLUDED", () => {
  const cls = classifyCell(500, null, 700, 1200, "UNREACHABLE_NO_ROAD_ACCESS");
  assert.equal(cls.cls, "EXCLUDED");
  assert.equal(cls.display, "none");
  assert.equal(cls.dAfter, null);
});

test("Classification: cell beyond 5000m is EXCLUDED", () => {
  const cls = classifyCell(5001, 2000, 6000, 8000, "GOOD");
  assert.equal(cls.cls, "EXCLUDED");
  assert.equal(cls.display, "none");
  assert.equal(cls.dAfter, null);
});

test("Classification: IMPROVES vs UNCERTAIN vs UNCHANGED logic", () => {
  // Case 1: dHatUpper (800) < dOld (1000) => IMPROVES
  const c1 = classifyCell(400, 1000, 600, 800, "GOOD");
  assert.equal(c1.cls, "IMPROVES");
  assert.equal(c1.dAfter, 600);

  // Case 2: dHat (600) < dOld (750) <= dHatUpper (800) => UNCERTAIN
  const c2 = classifyCell(400, 750, 600, 800, "GOOD");
  assert.equal(c2.cls, "UNCERTAIN");
  assert.equal(c2.dAfter, 600);

  // Case 3: dHat (600) >= dOld (500) => UNCHANGED
  const c3 = classifyCell(400, 500, 600, 800, "GOOD");
  assert.equal(c3.cls, "UNCHANGED");
  assert.equal(c3.dAfter, 500);
});

// ── 5. Aggregates & Population Weighting (T7, T19, §1.8) ──────────────────────

test("Aggregates: headline after only substitutes dAfter in IMPROVES cells", () => {
  // Cell A: IMPROVES (old 2000, after 800, pop 100)
  // Cell B: UNCERTAIN (old 1200, after 900, pop 100) -> Keeps 1200 in headline!
  // Cell C: UNCHANGED (old 500, after 500, pop 100) -> Keeps 500 in headline!

  const items = [
    { value: 800, weight: 100 }, // A (substituted)
    { value: 1200, weight: 100 }, // B (kept old)
    { value: 500, weight: 100 }, // C (kept old)
  ];

  const med = calculateWeightedMedian(items);
  // Sorted: 500 (100), 800 (100), 1200 (100). Total weight 300, half 150 => 800
  assert.equal(med, 800);
});

test("Aggregates: no nearby population does not crash weighted median (F5)", () => {
  const items = [
    { value: 1000, weight: 0 },
    { value: 2000, weight: 0 },
    { value: 3000, weight: 0 },
  ];
  const med = calculateWeightedMedian(items);
  // Falls back to unweighted median of values: 2000
  assert.equal(med, 2000);
});

test("Aggregates: calculateDistanceBands buckets correctly", () => {
  const items = [
    { distance: 800, population: 50 }, // le1km
    { distance: 1500, population: 30 }, // b1_2km
    { distance: 3000, population: 20 }, // b2_5km
    { distance: 6000, population: 10 }, // gt5km
  ];
  const bands = calculateDistanceBands(items);
  assert.equal(bands.le1km, 50);
  assert.equal(bands.b1_2km, 30);
  assert.equal(bands.b2_5km, 20);
  assert.equal(bands.gt5km, 10);
});

// ── 6. Screening Rule Replay (T20–T22, §1.9) ──────────────────────────────────

test("Screening: PHUONG (500m threshold)", () => {
  // T12: PHUONG, d_rule = 400m => TU_CHOI, margin = -100m
  const s1 = replayScreening(400, "PHUONG", false);
  assert.equal(s1.decision, "TU_CHOI");
  assert.equal(s1.marginM, -100);

  const s2 = replayScreening(600, "PHUONG", false);
  assert.equal(s2.decision, "DE_XUAT");
  assert.equal(s2.marginM, +100);
});

test("Screening: XA (2000m threshold) with high load exception", () => {
  // T13: XA, d_rule = 1500m, high load true => DE_XUAT_NEU_CO_DC
  const s1 = replayScreening(1500, "XA", true);
  assert.equal(s1.decision, "DE_XUAT_NEU_CO_DC");
  assert.equal(s1.marginM, -500);

  // T14: XA, d_rule = 1500m, high load false => TU_CHOI
  const s2 = replayScreening(1500, "XA", false);
  assert.equal(s2.decision, "TU_CHOI");
  assert.equal(s2.marginM, -500);

  // T15: XA, d_rule = 480m <= 500m floor, high load true => TU_CHOI (floor breach)
  const s3 = replayScreening(480, "XA", true);
  assert.equal(s3.decision, "TU_CHOI");
  assert.equal(s3.marginM, -1520);

  // T16: XA, d_rule = 2500m => DE_XUAT
  const s4 = replayScreening(2500, "XA", false);
  assert.equal(s4.decision, "DE_XUAT");
  assert.equal(s4.marginM, +500);
});

test("Screening: DAC_KHU (500m threshold)", () => {
  // T17: DAC_KHU, d_rule = 600m => DE_XUAT, margin = +100m
  const s1 = replayScreening(600, "DAC_KHU", false);
  assert.equal(s1.decision, "DE_XUAT");
  assert.equal(s1.marginM, +100);
});

// ── 7. URL Hash Integration (T25, §3.1) ───────────────────────────────────────

test("Hash: sim=<lat>,<lng> parses to candidate with 5 decimal precision", () => {
  const hash = "#sim=21.02851,105.85422&m=2d";
  const parsed = parseHash(hash);
  assert.ok(parsed.candidate);
  assert.equal(parsed.candidate?.lat, 21.02851);
  assert.equal(parsed.candidate?.lng, 105.85422);
});

test("Hash: serializeHash preserves candidate in sim parameter", () => {
  const state = {
    field: "population",
    scaleMode: "binned" as const,
    mode: "2d" as const,
    view: { lng: 105.85, lat: 21.02, zoom: 12, pitch: 0, bearing: 0 },
    layers: [],
    cell: null,
    scene: null,
    dataMode: false,
    nationalMode: false,
    paintOn: true,
    t: 0,
    filter: null,
    candidate: { lat: 21.02851, lng: 105.85422 },
  };

  const hash = serializeHash(state);
  assert.match(hash, /sim=21\.02851,105\.85422/);
});

// ── 8. End-to-End Simulation Engine Integration (T26, F4) ────────────────────

test("Engine: runSimulation calculates deterministic output for candidate placement", () => {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  const cell = latLngToCell(candidate.lat, candidate.lng, 8);

  const gridCells = [
    {
      h3_r8: cell,
      lat: candidate.lat,
      lng: candidate.lng,
      population: 500,
      dist_station_network_m: 2500,
      detour_ratio: 1.5,
      evidence_grade_distance: "GOOD",
    },
    {
      h3_r8: "8865b59635fffff",
      lat: candidate.lat + 0.01,
      lng: candidate.lng + 0.01,
      population: 300,
      dist_station_network_m: 3000,
      detour_ratio: 1.6,
      evidence_grade_distance: "GOOD",
    },
  ];

  const stations = [
    {
      station_code: "HN_001",
      name: "Trạm Hoàn Kiếm",
      lat: candidate.lat + 0.02,
      lng: candidate.lng + 0.02,
      op_status: "OPERATIONAL",
      access: "PUBLIC",
      n_ports: 8,
      power_kw_site: 240,
    },
  ];

  const occMap = new Map();
  occMap.set("HN_001", {
    util: 0.45,
    grade: "GOOD",
    util_reportable: true,
  });

  const result = runSimulation({
    candidate,
    candidateCell: cell,
    communeKind: "PHUONG",
    gridCells,
    stations,
    occupancyMap: occMap,
    calibration: HANOI_CALIBRATION,
  });

  assert.equal(result.candidate.cell, cell);
  assert.ok(result.cells.length > 0);
  assert.ok(result.before.popWeightedMedianM > 0);
  assert.ok(result.after.popWeightedMedianM > 0);
  assert.ok(result.after.popWeightedMedianM <= result.before.popWeightedMedianM);
  assert.equal(result.context.stationsWithin5km.length, 1);
  assert.equal(result.context.stationsWithin5km[0]!.code, "HN_001");
});

test("Engine: candidate placed at existing station registers context distance < 20m", () => {
  const stationLoc = { lat: 21.0285, lng: 105.8542 };
  const cell = latLngToCell(stationLoc.lat, stationLoc.lng, 8);

  const stations = [
    {
      station_code: "HN_EXISTING",
      name: "Trạm Đang Có",
      lat: stationLoc.lat,
      lng: stationLoc.lng,
      op_status: "OPERATIONAL",
      access: "PUBLIC",
      n_ports: 4,
      power_kw_site: 120,
    },
  ];

  const gridCells = [
    {
      h3_r8: cell,
      lat: stationLoc.lat,
      lng: stationLoc.lng,
      population: 200,
      dist_station_network_m: 264, // Already at station
      detour_ratio: 1.4,
      evidence_grade_distance: "GOOD",
    },
  ];

  const result = runSimulation({
    candidate: stationLoc,
    candidateCell: cell,
    communeKind: "PHUONG",
    gridCells,
    stations,
    occupancyMap: new Map(),
    calibration: HANOI_CALIBRATION,
  });

  assert.equal(result.context.stationsWithin5km[0]!.euclidM, 0);
  assert.equal(result.screening.decision, "TU_CHOI");
});

// ── 9. Bổ sung theo QA Phase 6 — T11, T18(client), T20, T22, F6, F7, §1.2, §1.9 ────────

/** LCG tất định — Math.random bị cấm trong test tất định (T20). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Bộ ô tổng hợp quanh một tâm thật — toạ độ từ chính lưới H3 để gridDisk nhất quán. */
function syntheticInputs(seed: number) {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  const rand = lcg(seed);
  const centerCell = latLngToCell(candidate.lat, candidate.lng, 8);
  const cells: Array<{
    h3_r8: string;
    lat: number;
    lng: number;
    population: number;
    dist_station_network_m: number | null;
    detour_ratio: number | null;
    evidence_grade_distance: string;
  }> = [];
  const seen = new Set<string>();
  for (const h of gridDisk(centerCell, 7)) {
    if (seen.has(h)) continue;
    seen.add(h);
    const [lat, lng] = cellToLatLng(h);
    const reachable = rand() > 0.05;
    cells.push({
      h3_r8: h,
      lat,
      lng,
      population: Math.round(rand() * 2000),
      dist_station_network_m: reachable ? 500 + rand() * 8000 : null,
      detour_ratio: rand() > 0.2 ? 1.0 + rand() * 2.5 : null,
      evidence_grade_distance: reachable ? "GOOD" : "UNREACHABLE_NO_PATH",
    });
  }
  return { candidate, centerCell, cells };
}

test("T11 property: d_after <= d_old mọi ô, After <= Before ở mọi số tổng hợp", () => {
  const { candidate, centerCell, cells } = syntheticInputs(42);
  const result = runSimulation({
    candidate,
    candidateCell: centerCell,
    communeKind: "XA",
    gridCells: cells,
    stations: [],
    occupancyMap: new Map(),
    calibration: HANOI_CALIBRATION,
  });

  assert.ok(result.cells.length > 50, `zone quá nhỏ: ${result.cells.length}`);
  for (const c of result.cells) {
    if (c.dOld !== null && c.dAfter !== null) {
      assert.ok(c.dAfter <= c.dOld, `d_after (${c.dAfter}) > d_old (${c.dOld}) ở ${c.h3}`);
    }
    if (c.cls === "NO_BASELINE") {
      assert.equal(c.dAfter, null);
    }
  }
  assert.ok(result.after.popWeightedMedianM <= result.before.popWeightedMedianM);
  // After chỉ dịch dân về gần: dải <= 1 km không bao giờ giảm, dải > 5 km không bao giờ tăng
  assert.ok(result.after.popByBand.le1km >= result.before.popByBand.le1km);
  assert.ok(result.after.popByBand.gt5km <= result.before.popByBand.gt5km);
});

test("T20 determinism: chạy hai lần trên cùng input cho SimulationResult deep-equal", () => {
  const { candidate, centerCell, cells } = syntheticInputs(7);
  const inputs = () => ({
    candidate,
    candidateCell: centerCell,
    communeKind: "PHUONG" as const,
    gridCells: cells,
    stations: [
      {
        station_code: "S1",
        name: "S1",
        lat: candidate.lat + 0.01,
        lng: candidate.lng,
        op_status: "OPERATIONAL",
        access: null,
        n_ports: 4,
        power_kw_site: 120,
      },
    ],
    occupancyMap: new Map(),
    calibration: HANOI_CALIBRATION,
    manifestExported: "2026-08-11T19:09:19+00:00",
  });
  assert.deepStrictEqual(runSimulation(inputs()), runSimulation(inputs()));
});

test("T22: hash sim= hỏng bị BỎ, không sinh ứng viên (F9)", () => {
  assert.equal(parseHash("#sim=abc").candidate, undefined);
  assert.equal(parseHash("#sim=21.02").candidate, undefined);
  assert.equal(parseHash("#sim=91,105.8").candidate, undefined); // lat ngoài [-85, 85]
  assert.equal(parseHash("#sim=21.02,181").candidate, undefined); // lng ngoài [-180, 180]
  assert.equal(parseHash("#sim=,").candidate, undefined);
  // round-trip: serialize rồi parse trả đúng toạ độ 5 chữ số
  const st = {
    field: "population",
    scaleMode: "binned" as const,
    mode: "2d" as const,
    view: { lng: 105.85, lat: 21.02, zoom: 12, pitch: 0, bearing: 0 },
    layers: [],
    cell: null,
    selection: null,
    scene: null,
    dataMode: false,
    nationalMode: false,
    paintOn: true,
    t: 0,
    filter: null,
    candidate: { lat: 21.028512345, lng: 105.854226789 },
  };
  const rt = parseHash(`#${serializeHash(st)}`);
  assert.deepEqual(rt.candidate, { lat: 21.02851, lng: 105.85423 });
});

test("F2/§2.3: validateCalibration chặn file sai hình dạng — client KHÔNG có hằng dự phòng", () => {
  assert.ok(validateCalibration(HANOI_CALIBRATION));
  assert.equal(validateCalibration(null), null);
  assert.equal(validateCalibration({ ...HANOI_CALIBRATION, valid: false }), null);
  // thiếu một dải => từ chối cả file, thay vì rơi về hằng bịa trong client
  const missingBand = {
    ...HANOI_CALIBRATION,
    bands: { ...HANOI_CALIBRATION.bands } as Record<string, { n: number; med: number; p90: number }>,
  };
  delete missingBand.bands["3000-5000"];
  assert.equal(validateCalibration(missingBand), null);
  // near sai kiểu => từ chối; near null hợp lệ (tỉnh không đủ ô cận)
  assert.equal(
    validateCalibration({ ...HANOI_CALIBRATION, near: { n: 87 } }),
    null,
  );
  assert.ok(validateCalibration({ ...HANOI_CALIBRATION, near: null }));
});

test("§1.9: loại xã fallback về commune_code của ô khi PIP trượt, cả hai trượt => null", () => {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  // PIP trượt (polygon ở nơi khác), ô mang commune_code khớp một xã PHUONG
  const communes = {
    features: [
      {
        properties: { commune_code: "00070", commune_kind: "PHUONG" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [100.0, 10.0],
              [100.1, 10.0],
              [100.1, 10.1],
              [100.0, 10.1],
              [100.0, 10.0],
            ],
          ],
        },
      },
    ],
  };
  const cell = { h3: "x", communeCode: "00070" };
  assert.equal(resolveCommuneKind(candidate, cell, communes), "PHUONG");
  assert.equal(resolveCommuneKind(candidate, { h3: "x", communeCode: "99999" }, communes), null);
  assert.equal(resolveCommuneKind(candidate, undefined, communes), null);
  // kind null => quyết định null, KHÔNG bao giờ TU_CHOI
  assert.deepEqual(replayScreening(1500, null, false), { decision: null, marginM: null });
});

test("§1.2: bộ lọc trạm đủ điều kiện — access vắng VẪN đủ điều kiện (parity pandas), RESTRICTED bị loại", () => {
  const base = { station_code: "s", lat: 0, lng: 0 };
  assert.ok(isEligibleStation({ ...base, op_status: "OPERATIONAL", access: null }));
  assert.ok(isEligibleStation({ ...base, op_status: "MAINTENANCE", access: "PUBLIC" }));
  assert.ok(!isEligibleStation({ ...base, op_status: "OPERATIONAL", access: "RESTRICTED" }));
  assert.ok(!isEligibleStation({ ...base, op_status: "OUT_OF_SERVICE", access: null }));
  assert.ok(!isEligibleStation({ ...base, op_status: "UNKNOWN", access: "PUBLIC" }));
});

test("F6: highLoadEvaluable=false ép ngoại lệ cao tải tắt dù trạm gần nhất đo được cao tải", () => {
  const candidate = { lat: 21.0285, lng: 105.8542 };
  const cell = latLngToCell(candidate.lat, candidate.lng, 8);
  const mk = (evaluable: boolean) =>
    runSimulation({
      candidate,
      candidateCell: cell,
      communeKind: "XA",
      gridCells: [],
      stations: [
        {
          station_code: "HN_HOT",
          lat: candidate.lat + 0.008, // ~890 m: trên sàn 500, dưới ngưỡng XA 2000
          lng: candidate.lng,
          op_status: "OPERATIONAL",
          access: null,
        },
      ],
      occupancyMap: new Map([
        ["HN_HOT", { util: 0.55, grade: "GOOD", util_reportable: true }],
      ]),
      calibration: HANOI_CALIBRATION,
      isHighLoadEvaluable: evaluable,
    });
  assert.equal(mk(true).screening.decision, "DE_XUAT_NEU_CO_DC");
  const off = mk(false);
  assert.equal(off.screening.decision, "TU_CHOI");
  assert.equal(off.screening.highLoadEvaluable, false);
});

test("F7: zoneTruncatedAt đo bằng hình học — tâm sâu trong ranh giới thì false, sát mép thì true", () => {
  // "Tỉnh" vuông ~55 km cạnh quanh (21, 105.85)
  const boundary = {
    type: "Polygon",
    coordinates: [
      [
        [105.6, 20.75],
        [106.1, 20.75],
        [106.1, 21.25],
        [105.6, 21.25],
        [105.6, 20.75],
      ],
    ],
  };
  assert.equal(zoneTruncatedAt(21.0, 105.85, 5000, boundary), false);
  assert.equal(zoneTruncatedAt(21.24, 105.85, 5000, boundary), true); // cách mép bắc ~1 km
  assert.equal(zoneTruncatedAt(21.0, 105.85, 5000, null), false);
});

test("§1.8: meta mang số kiểm chứng của tỉnh để popover nội suy nguyên văn", () => {
  const { candidate, centerCell, cells } = syntheticInputs(3);
  const r = runSimulation({
    candidate,
    candidateCell: centerCell,
    communeKind: "XA",
    gridCells: cells,
    stations: [],
    occupancyMap: new Map(),
    calibration: HANOI_CALIBRATION,
  });
  assert.deepEqual(r.meta.validation, { n: 4310, within20pct: 0.659, upperMiss: 0.097 });
  assert.equal(r.meta.zoneTruncated, false);
});
