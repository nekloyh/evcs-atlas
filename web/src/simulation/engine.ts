/**
 * Phase 6 — Spatial Simulation Engine (engine.ts)
 *
 * Deterministic pure calculation engine that runs the local station simulation.
 * Pure function: (candidate, gridCells, stations, occupancy, calibration) -> SimulationResult
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1, §2
 */

import { haversineDistance } from "./geometry";
import {
  HIGH_LOAD_UTIL_THRESHOLD,
  SCREENING_EXCEPTION_FLOOR_M,
  SCREENING_THRESHOLDS,
  replayScreening,
} from "./screening";
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
  ScreeningEvidence,
  SimCalibration,
  SimCellResult,
  SimulationAreaSummary,
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
  commune_name?: string | null;
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
  /** UX §7.4 — danh tính xã/phường của P, do `checkAdmission` phân giải. */
  communeCode?: string | null;
  communeName?: string | null;
  provinceName?: string | null;
  gridCells: GridCellSimInput[];
  stations: StationSimInput[];
  occupancyMap: Map<string, OccupancySimInput>;
  calibration: SimCalibration;
  manifestExported?: string;
  isHighLoadEvaluable?: boolean;
  /** F7 — vòng 5 km cắt ranh giới gói; caller đo bằng hình học (engine giữ thuần). */
  isZoneTruncated?: boolean;
  /**
   * UX §7.5 điều kiện 3 — bảng `commune_code → commune_name` của `commune.geojson`. Ô nào
   * mang tên MÂU THUẪN với feature cùng mã thì tên đó không đáng tin và nhóm bị đẩy sang
   * `missingName`. Vắng bảng ⇒ không có gì để mâu thuẫn ⇒ chỉ còn hai điều kiện đầu.
   */
  communeNamesByCode?: Map<string, string> | null;
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

/**
 * UX §7.5 — ba điều kiện của một địa danh ĐÁNG TIN, theo đúng thứ tự:
 *  1. tên không null/rỗng;
 *  2. đi cùng một `commune_code` có giá trị;
 *  3. không mâu thuẫn với feature commune cùng mã.
 *
 * Trả `null` chứ không phải một nhãn thay thế: câu trả lời đúng cho "không biết tên" là
 * không dựng hàng đó, không phải "Vùng 1".
 */
function trustedCommuneName(
  code: string | null,
  name: string | null,
  byCode: Map<string, string> | null,
): string | null {
  if (!code) return null;
  const trimmed = name === null ? null : name.trim();
  if (!trimmed) return null;
  const authoritative = byCode?.get(code);
  if (authoritative !== undefined && authoritative !== trimmed) return null;
  return trimmed;
}

export function runSimulation(inputs: SimulationEngineInputs): SimulationResult {
  const {
    candidate,
    candidateCell,
    communeKind,
    communeCode = null,
    communeName = null,
    provinceName = null,
    gridCells,
    stations,
    occupancyMap,
    calibration,
    manifestExported = "",
    isHighLoadEvaluable = true,
    isZoneTruncated = false,
    communeNamesByCode = null,
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

  const nearestOcc = nearestStation
    ? occupancyMap.get(nearestStation.station_code)
    : undefined;
  const nearestReportable =
    nearestOcc?.util_reportable === true && nearestOcc.grade === "GOOD";

  let nearestHighLoad = false;
  if (isHighLoadEvaluable && nearestStation) {
    if (
      nearestOcc &&
      nearestReportable &&
      nearestOcc.util !== null &&
      nearestOcc.util !== undefined &&
      nearestOcc.util >= HIGH_LOAD_UTIL_THRESHOLD
    ) {
      nearestHighLoad = true;
    }
  }

  const screeningOutput = replayScreening(dRule, communeKind, nearestHighLoad);

  // UX §12.2 — bốn con số của thẻ sàng lọc, lấy từ đúng lượt replay ở trên. `thresholdM`
  // là hằng chính sách của `kind`, nên nó `null` cùng lúc với quyết định: không ngưỡng thì
  // không có gì để so, và một ngưỡng mặc định ở đây sẽ là một chính sách bịa.
  const screeningEvidence: ScreeningEvidence = {
    distanceM: dRule,
    thresholdM: communeKind === null ? null : SCREENING_THRESHOLDS[communeKind],
    marginM: screeningOutput.marginM,
    kind: communeKind,
    nearestStationCode: nearestStation?.station_code ?? null,
    nearestStationName: nearestStation
      ? nearestStation.name || nearestStation.station_code
      : null,
    // Không đo được thì `null`, KHÔNG phải 0 % — "0 %" đọc thành "đã đo, và trạm đang rỗng".
    nearestUtil: nearestReportable ? (nearestOcc?.util ?? null) : null,
    nearestUtilReportable: nearestReportable,
    nearestGrade: nearestOcc?.grade ?? null,
    nearestHighLoad,
    highLoadEvaluable: isHighLoadEvaluable,
    exceptionFloorM: SCREENING_EXCEPTION_FLOOR_M as 500,
    highLoadThreshold: HIGH_LOAD_UTIL_THRESHOLD as 0.4,
  };

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

  // UX §7.4/§16.1 — nhóm địa danh dựng TRONG chính vòng lặp O(Z) này, không thêm một pass
  // hay một truy vấn nào. Khoá là `commune_code`; tên chỉ là nhãn của khoá ấy.
  const areaByCode = new Map<string, SimulationAreaSummary>();
  let missingNameCells = 0;
  let missingNamePop = 0;

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

      if (classified.cls === "IMPROVES" || classified.cls === "UNCERTAIN") {
        const code = c.commune_code ?? null;
        const name = trustedCommuneName(code, c.commune_name ?? null, communeNamesByCode);
        if (code === null || name === null) {
          // §7.5 — ô vẫn ở MỌI tổng toàn vùng ở trên; nó chỉ không được liệt kê thành một
          // hàng địa danh. Đây là chỗ duy nhất sự thiếu tên được đếm.
          missingNameCells++;
          missingNamePop += pop;
        } else {
          let area = areaByCode.get(code);
          if (!area) {
            area = {
              communeCode: code,
              communeName: name,
              improved: { cells: 0, population: 0 },
              uncertain: { cells: 0, population: 0 },
              h3s: [],
            };
            areaByCode.set(code, area);
          }
          const bucket = classified.cls === "IMPROVES" ? area.improved : area.uncertain;
          bucket.cells++;
          bucket.population += pop;
          area.h3s.push(c.h3_r8);
        }
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
        // Nguồn không khai thì GIỮ null — đổ về 0 là in "0 cổng · 0 kW" như một sự thật.
        nPorts: st.n_ports ?? null,
        powerKw: st.power_kw_site ?? null,
        // Cùng cổng reportability với bằng chứng của rule: một giá trị số còn sót trong
        // record BAD/unreportable KHÔNG phải là phép đo được phép trình bày. Hiển thị nó
        // dưới nhãn "ĐO TRONG 30 NGÀY" sẽ biến dữ liệu bị loại thành bằng chứng hợp lệ.
        util:
          occ?.util_reportable === true &&
          occ.grade === "GOOD" &&
          occ.util !== null &&
          occ.util !== undefined &&
          Number.isFinite(occ.util)
            ? occ.util
            : null,
        grade: occ?.grade ?? null,
        window:
          occ?.window_start_utc && occ?.window_end_utc
            ? [occ.window_start_utc, occ.window_end_utc]
            : null,
      });
    }
  }
  contextStations.sort((a, b) => a.euclidM - b.euclidM);

  // Thứ tự HÀNG địa danh là một phần của hợp đồng tất định (T20): dân cải thiện rõ rệt
  // giảm dần, rồi dân còn trong sai số, rồi tên theo đối chiếu tiếng Việt, rồi mã. Không
  // có `Math.random`, không phụ thuộc thứ tự đọc parquet.
  const namedAreas = [...areaByCode.values()]
    .map((a) => ({
      ...a,
      improved: { cells: a.improved.cells, population: Math.round(a.improved.population) },
      uncertain: { cells: a.uncertain.cells, population: Math.round(a.uncertain.population) },
      h3s: [...a.h3s].sort(),
    }))
    .sort(
      (a, b) =>
        b.improved.population - a.improved.population ||
        b.uncertain.population - a.uncertain.population ||
        a.communeName.localeCompare(b.communeName, "vi") ||
        a.communeCode.localeCompare(b.communeCode),
    );

  return {
    candidate: {
      lat: candidate.lat,
      lng: candidate.lng,
      cell: candidateCell,
    },
    screening: {
      tag: "RULE",
      decision: screeningOutput.decision,
      marginM: screeningOutput.marginM,
      basis: "euclid",
      kind: communeKind,
      highLoadEvaluable: isHighLoadEvaluable,
      evidence: screeningEvidence,
    },
    before: {
      tag: "CALCULATED",
      // `null` = không có trọng số dân dương — trung vị theo dân KHÔNG tồn tại, và
      // panel phải nói ra điều đó thay vì in một con số thay thế.
      popWeightedMedianM: beforeWeightedMed === null ? null : Math.round(beforeWeightedMed),
      popByBand: beforePopBands,
      noBaseline: { cells: noBaselineCount, population: Math.round(noBaselinePop) },
      excluded: { cells: excludedCount, population: Math.round(excludedPop) },
    },
    after: {
      tag: "ESTIMATED",
      popWeightedMedianM: afterWeightedMed === null ? null : Math.round(afterWeightedMed),
      popByBand: afterPopBands,
      improved: { cells: improvedCount, population: Math.round(improvedPop) },
      uncertain: { cells: uncertainCount, population: Math.round(uncertainPop) },
    },
    cells: cellResults,
    candidateContext: {
      communeCode,
      communeName,
      communeKind,
      provinceName,
    },
    areas: {
      named: namedAreas,
      missingName: {
        cells: missingNameCells,
        population: Math.round(missingNamePop),
      },
    },
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
