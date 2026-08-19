/**
 * Phase 6 — Screening Rule Replay (screening.ts)
 *
 * Deterministic pure calculation replaying the L6 screening engine (`evcs/core/screening.py`).
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.9
 */

import type { CommuneKind, ScreeningDecision } from "./types";

export const SCREENING_THRESHOLDS: Record<CommuneKind, number> = {
  PHUONG: 500.0,
  XA: 2000.0,
  DAC_KHU: 500.0,
};

export const SCREENING_EXCEPTION_FLOOR_M = 500.0;
export const HIGH_LOAD_UTIL_THRESHOLD = 0.40;

export interface ScreeningReplayResult {
  decision: ScreeningDecision;
  marginM: number | null;
}

/**
 * Replays screening rule decide() logic:
 *   - Thresholds: PHUONG (500m), DAC_KHU (500m), XA (2000m); "đủ xa" là `>` CHẶT.
 *   - Exception CHỈ cho XA: > 500m floor AND nearest measured station has util >= 0.40
 *   - Null / non-finite distance => null decision (never TU_CHOI)
 *   - `kind = null` (không xác định được loại xã) => null decision — không có ngưỡng thì
 *     không có phán quyết, và "không tính được" khác "TỪ CHỐI".
 */
export function replayScreening(
  dRuleM: number | null,
  kind: CommuneKind | null,
  nearestHighLoad: boolean,
): ScreeningReplayResult {
  if (dRuleM === null || !Number.isFinite(dRuleM)) {
    return { decision: null, marginM: null };
  }
  if (kind === null) {
    return { decision: null, marginM: null };
  }

  const threshold = SCREENING_THRESHOLDS[kind];
  const marginM = dRuleM - threshold;
  const isFarEnough = dRuleM > threshold;

  const isException =
    kind === "XA" &&
    !isFarEnough &&
    dRuleM > SCREENING_EXCEPTION_FLOOR_M &&
    nearestHighLoad;

  if (isFarEnough) {
    return { decision: "DE_XUAT", marginM };
  }
  if (isException) {
    return { decision: "DE_XUAT_NEU_CO_DC", marginM };
  }
  return { decision: "TU_CHOI", marginM };
}
