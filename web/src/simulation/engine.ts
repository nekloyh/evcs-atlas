/**
 * Phase 6 — Spatial Simulation Engine (engine.ts)
 *
 * Deterministic pure calculation engine that runs the local station simulation.
 * Pure function: (candidate, gridCells, stations, occupancy, calibration) -> SimulationResult
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1, §2
 */

import { haversineDistance } from "./geometry";
import { HIGH_LOAD_UTIL_THRESHOLD, replayScreening } from "./screening";
import {
  R_MAX_M,
  calculateDistanceBands,
  calculateRingDetour,
  calculateWeightedMedian,
  classifyCell,
  estimateCell,
} from "./estimator";
import type {
  CandidatePoint,
  CommuneKind,
  ContextStation,
  SimCalibration,
  SimCellResult,
  SimulationResult,
} from "./types";

export interface GridCellSimInput {
  h3_r8: string;
  lat: number;
  lng: number;
  population?: number | null;
  pop_source?: string | null;
  dist_station_network_m?: number | null;
  detour_ratio?: number | null;
  evidence_grade_distance?: string | null;
  commune_code?: string | null;
}

export interface StationSimInput {
  station_code: string;
  name?: string | null;
  lat: number;
  lng: number;
  op_status: string;
  access?: string | null;
  scope?: string | null;
  n_ports?: number | null;
  power_kw_site?: number | null;
}

export interface OccupancySimInput {
  util?: number | null;
  grade?: string | null;
  util_reportable?: boolean | null;
  window_start_utc?: string | null;
  window_end_utc?: string | null;
}

export interface SimulationEngineInputs {
  candidate: CandidatePoint;
  candidateCell: string;
  communeKind: CommuneKind | null;
  gridCells: GridCellSimInput[];
  stations: StationSimInput[];
  occupancyMap: Map<string, OccupancySimInput>;
  calibration: SimCalibration;
  manifestExported?: string;
  isHighLoadEvaluable?: boolean;
  /** F7 — vòng 5 km cắt ranh giới gói; caller đo bằng hình học (engine giữ thuần). */
  isZoneTruncated?: boolean;
}

/** Giá trị neo dân số duy nhất KHÔNG bị cắm cờ trong popover (§0.2, §1.8). */
const POP_SOURCE_ANCHORED = "WORLDPOP2025_ANCHORED_VNSDI";

/**
 * §1.2 — byte-identical với `n07_distance.py:66`:
 * `op_status.isin([OPERATIONAL, MAINTENANCE]) & (access != 'RESTRICTED')`, cả hai scope.
 * pandas: `NaN != 'RESTRICTED'` là True, nên access vắng vẫn ĐỦ điều kiện — giữ nguyên.
 */
export function isEligibleStation(s: StationSimInput): boolean {
  const op = s.op_status;
  return (
    (op === "OPERATIONAL" || op === "MAINTENANCE") && s.access !== "RESTRICTED"
  );
}

export function runSimulation(inputs: SimulationEngineInputs): SimulationResult {
  const {
    candidate,
    candidateCell,
    communeKind,
    gridCells,
    stations,
    occupancyMap,
    calibration,
    manifestExported = "",
    isHighLoadEvaluable = true,
    isZoneTruncated = false,
  } = inputs;

  // 1. Filter eligible stations S (§1.2)
  const eligibleStations = stations.filter(isEligibleStation);

  // 2. Rule Replay
  let minRuleDistanceM = Number.POSITIVE_INFINITY;
  let nearestStation: StationSimInput | null = null;

  for (const st of eligibleStations) {
    const d = haversineDistance(candidate.lat, candidate.lng, st.lat, st.lng);
    if (d < minRuleDistanceM) {
      minRuleDistanceM = d;
      nearestStation = st;
    }
  }

  const dRule = Number.isFinite(minRuleDistanceM) ? minRuleDistanceM : null;

  let nearestHighLoad = false;
  if (isHighLoadEvaluable && nearestStation) {
    const occ = occupancyMap.get(nearestStation.station_code);
    if (
      occ &&
      occ.util_reportable === true &&
      occ.grade === "GOOD" &&
      occ.util !== null &&
      occ.util !== undefined &&
      occ.util >= HIGH_LOAD_UTIL_THRESHOLD
    ) {
      nearestHighLoad = true;
    }
  }

  const screeningOutput = replayScreening(dRule, communeKind, nearestHighLoad);

  // 3. Build detour map for all cells (siêu tập bbox — gồm cả láng giềng ngoài Z)
  const detourMap = new Map<string, number | null>();
  for (const c of gridCells) {
    detourMap.set(c.h3_r8, c.detour_ratio ?? null);
  }

  // 4. Compute Affected Zone Z (e(c) <= 5000 m)
  const cellResults: SimCellResult[] = [];
  let flaggedPopSourceCount = 0;

  const baselineBeforeCells: Array<{
    dist: number;
    pop: number;
    res: SimCellResult;
  }> = [];

  let noBaselineCount = 0;
  let noBaselinePop = 0;
  let excludedCount = 0;
  let excludedPop = 0;

  let improvedCount = 0;
  let improvedPop = 0;
  let uncertainCount = 0;
  let uncertainPop = 0;

  for (const c of gridCells) {
    const e = haversineDistance(c.lat, c.lng, candidate.lat, candidate.lng);
    if (e > R_MAX_M) continue;

    if (c.pop_source && c.pop_source !== POP_SOURCE_ANCHORED) {
      flaggedPopSourceCount++;
    }

    const pop = c.population && c.population > 0 ? c.population : 0;
    const dOld =
      c.dist_station_network_m !== undefined && c.dist_station_network_m !== null
        ? c.dist_station_network_m
        : null;

    const ringL = calculateRingDetour(c.h3_r8, detourMap);
    const estimate = estimateCell(e, calibration, ringL);
    const classified = classifyCell(
      e,
      dOld,
      estimate.dHat,
      estimate.dHatUpper,
      c.evidence_grade_distance ?? null,
    );

    const cellRes: SimCellResult = {
      h3: c.h3_r8,
      e,
      dOld,
      dHat: estimate.dHat,
      dHatUpper: estimate.dHatUpper,
      dAfter: classified.dAfter,
      display: classified.display,
      cls: classified.cls,
    };
    cellResults.push(cellRes);

    if (classified.cls === "NO_BASELINE") {
      noBaselineCount++;
      noBaselinePop += pop;
    } else if (classified.cls === "EXCLUDED") {
      excludedCount++;
      excludedPop += pop;
    } else {
      if (dOld !== null) {
        baselineBeforeCells.push({ dist: dOld, pop, res: cellRes });
      }
      if (classified.cls === "IMPROVES") {
        improvedCount++;
        improvedPop += pop;
      } else if (classified.cls === "UNCERTAIN") {
        uncertainCount++;
        uncertainPop += pop;
      }
    }
  }

  // 5. Compute Before aggregates (CALCULATED — chỉ từ cột công bố)
  const beforeWeightedMed = calculateWeightedMedian(
    baselineBeforeCells.map((it) => ({ value: it.dist, weight: it.pop })),
  );
  const beforePopBands = calculateDistanceBands(
    baselineBeforeCells.map((it) => ({ distance: it.dist, population: it.pop })),
  );

  // 6. Compute After aggregates — thay dAfter CHỈ ở ô IMPROVES (§1.8): headline là cận
  // DƯỚI của câu chuyện, không bao giờ là cận trên.
  const afterItems = baselineBeforeCells.map((it) => {
    const headlineDist =
      it.res.cls === "IMPROVES" && it.res.dAfter !== null ? it.res.dAfter : it.dist;
    return {
      value: headlineDist,
      distance: headlineDist,
      weight: it.pop,
      population: it.pop,
    };
  });

  const afterWeightedMed = calculateWeightedMedian(afterItems);
  const afterPopBands = calculateDistanceBands(afterItems);

  // 7. Context Stations within 5km (CALCULATED, descriptive)
  const contextStations: ContextStation[] = [];
  for (const st of eligibleStations) {
    const distM = haversineDistance(candidate.lat, candidate.lng, st.lat, st.lng);
    if (distM <= R_MAX_M) {
      const occ = occupancyMap.get(st.station_code);
      contextStations.push({
        code: st.station_code,
        name: st.name || st.station_code,
        euclidM: Math.round(distM),
        nPorts: st.n_ports ?? 0,
        powerKw: st.power_kw_site ?? 0,
        util: occ?.util !== undefined ? occ.util : null,
        grade: occ?.grade ?? null,
        window:
          occ?.window_start_utc && occ?.window_end_utc
            ? [occ.window_start_utc, occ.window_end_utc]
            : null,
      });
    }
  }
  contextStations.sort((a, b) => a.euclidM - b.euclidM);

  return {
    candidate: {
      lat: candidate.lat,
      lng: candidate.lng,
      cell: candidateCell,
    },
    screening: {
      decision: screeningOutput.decision,
      marginM: screeningOutput.marginM,
      basis: "euclid",
      kind: communeKind,
      highLoadEvaluable: isHighLoadEvaluable,
    },
    before: {
      popWeightedMedianM: Math.round(beforeWeightedMed),
      popByBand: beforePopBands,
      noBaseline: { cells: noBaselineCount, population: Math.round(noBaselinePop) },
      excluded: { cells: excludedCount, population: Math.round(excludedPop) },
    },
    after: {
      popWeightedMedianM: Math.round(afterWeightedMed),
      popByBand: afterPopBands,
      improved: { cells: improvedCount, population: Math.round(improvedPop) },
      uncertain: { cells: uncertainCount, population: Math.round(uncertainPop) },
    },
    cells: cellResults,
    context: {
      stationsWithin5km: contextStations,
    },
    meta: {
      calibrationVersion: calibration.version,
      manifestExported,
      rMaxM: 5000,
      validation: {
        n: calibration.validation.n,
        within20pct: calibration.validation.within_20pct,
        upperMiss: calibration.validation.upper_miss,
      },
      zoneTruncated: isZoneTruncated,
      flaggedPopSourceCells: flaggedPopSourceCount,
    },
  };
}
