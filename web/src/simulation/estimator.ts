/**
 * Phase 6 — Heuristic Distance Field Estimator (estimator.ts)
 *
 * Deterministic pure calculation functions for ring detours, cell estimates, classifications, and aggregates.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.5, §1.6, §1.7, §1.8
 */

import { gridDisk } from "h3-js";
import type { SimCalibration, SimCellResult } from "./types";

export const R_MAX_M = 5000.0;

export function getBandName(e: number): string {
  if (e < 500) return "200-500";
  if (e < 1000) return "500-1000";
  if (e < 2000) return "1000-2000";
  if (e < 3000) return "2000-3000";
  if (e < 5000) return "3000-5000";
  return "5000-inf";
}

export function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * L(c) = median{ detour_ratio(x) : x in gridDisk(c, 1) ∪ {c}, finite } (>= 3 values, else null)
 * Clamped to L(c) = max(L(c), 1.0). (h3-js `gridDisk` includes the origin cell.)
 */
export function calculateRingDetour(
  cellH3: string,
  detourMap: Map<string, number | null>,
): number | null {
  let diskCells: string[];
  try {
    diskCells = gridDisk(cellH3, 1);
  } catch {
    diskCells = [cellH3];
  }

  const finiteRatios: number[] = [];
  for (const c of diskCells) {
    const val = detourMap.get(c);
    if (val !== undefined && val !== null && Number.isFinite(val)) {
      finiteRatios.push(val);
    }
  }

  if (finiteRatios.length < 3) {
    return null;
  }

  const med = calculateMedian(finiteRatios);
  if (med === null) return null;
  return Math.max(med, 1.0);
}

/**
 * F12 — d̂ < e chỉ xảy ra khi file hiệu chuẩn hỏng dưới 1,0. Kẹp về e và LOG một lần:
 * kẹp im lặng sẽ giấu đúng cái file hỏng mà F12 sinh ra để tố.
 */
let f12Warned = false;
function guardF12(dHat: number, e: number, band: string): number {
  if (dHat >= e) return dHat;
  if (!f12Warned && typeof console !== "undefined") {
    f12Warned = true;
    console.warn(
      `[sim F12] d̂ (${dHat.toFixed(0)}) < e (${e.toFixed(0)}) ở dải ${band} — ` +
        "file hiệu chuẩn có hệ số dưới 1,0; đã kẹp về e.",
    );
  }
  return e;
}

/**
 * §1.5 — d̂/d̂⁺ của một ô. KHÔNG có hằng dự phòng nào ở đây: thiếu dải trong file hiệu
 * chuẩn nghĩa là file sai hợp đồng §2.3 (loader đã chặn), và câu trả lời đúng cho dữ
 * liệu vắng là "không ước lượng được" chứ không phải một hệ số bịa.
 */
export function estimateCell(
  e: number,
  calibration: SimCalibration,
  localRingL: number | null,
): { dHat: number | null; dHatUpper: number | null } {
  if (e < 200) {
    if (calibration.near) {
      return {
        dHat: calibration.near.net_p50,
        dHatUpper: calibration.near.net_p90,
      };
    }
    // near = null (§2.3: near.n < 30) — vùng cận không có ước lượng.
    return { dHat: null, dHatUpper: null };
  }

  const b = getBandName(e);
  const band = calibration.bands[b];
  if (!band) {
    return { dHat: null, dHatUpper: null };
  }
  const L = localRingL ?? 0;

  const dHat = guardF12(e * Math.max(band.med, L), e, b);
  const dHatUpper = guardF12(e * Math.max(band.p90, L), e, b);

  return { dHat, dHatUpper };
}

export function classifyCell(
  e: number,
  dOld: number | null,
  dHat: number | null,
  dHatUpper: number | null,
  evidenceGrade: string | null,
): {
  cls: SimCellResult["cls"];
  display: SimCellResult["display"];
  dAfter: number | null;
} {
  if (e > R_MAX_M) {
    return { cls: "EXCLUDED", display: "none", dAfter: null };
  }

  if (dOld === null || !Number.isFinite(dOld)) {
    if (evidenceGrade === "UNREACHABLE_NO_ROAD_ACCESS") {
      return { cls: "EXCLUDED", display: "none", dAfter: null };
    }
    return { cls: "NO_BASELINE", display: "none", dAfter: null };
  }

  if (dHat === null || dHatUpper === null) {
    // Không có ước lượng (near = null hoặc file thiếu dải): ô giữ d_old trong mọi số tổng
    // hợp và KHÔNG bao giờ được tuyên bố cải thiện — phân loại bảo thủ nhất là UNCHANGED.
    return { cls: "UNCHANGED", display: "none", dAfter: dOld };
  }

  const dAfter = Math.min(dOld, dHat);

  let cls: "IMPROVES" | "UNCERTAIN" | "UNCHANGED";
  if (dHatUpper < dOld) {
    cls = "IMPROVES";
  } else if (dHat < dOld && dOld <= dHatUpper) {
    cls = "UNCERTAIN";
  } else {
    cls = "UNCHANGED";
  }

  let display: "point" | "interval" | "near-band" | "none";
  if (e < 200) {
    display = "near-band";
  } else if (e < 1000) {
    display = "interval";
  } else {
    display = "point";
  }

  return { cls, display, dAfter };
}

export function calculateWeightedMedian(
  items: Array<{ value: number; weight: number }>,
): number {
  if (items.length === 0) return 0;
  const valid = items.filter((it) => Number.isFinite(it.value));
  if (valid.length === 0) return 0;

  const positiveWeights = valid.filter((it) => it.weight > 0);
  if (positiveWeights.length === 0) {
    const sorted = valid.map((it) => it.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  positiveWeights.sort((a, b) => a.value - b.value);
  const totalWeight = positiveWeights.reduce((sum, it) => sum + it.weight, 0);
  const halfWeight = totalWeight / 2;

  let cumWeight = 0;
  for (let i = 0; i < positiveWeights.length; i++) {
    cumWeight += positiveWeights[i]!.weight;
    if (cumWeight >= halfWeight) {
      return positiveWeights[i]!.value;
    }
  }
  return positiveWeights[positiveWeights.length - 1]!.value;
}

export function calculateDistanceBands(
  items: Array<{ distance: number; population: number }>,
): Record<"le1km" | "b1_2km" | "b2_5km" | "gt5km", number> {
  const result = {
    le1km: 0,
    b1_2km: 0,
    b2_5km: 0,
    gt5km: 0,
  };

  for (const it of items) {
    const p = it.population > 0 ? it.population : 0;
    if (it.distance <= 1000) {
      result.le1km += p;
    } else if (it.distance <= 2000) {
      result.b1_2km += p;
    } else if (it.distance <= 5000) {
      result.b2_5km += p;
    } else {
      result.gt5km += p;
    }
  }

  return result;
}
