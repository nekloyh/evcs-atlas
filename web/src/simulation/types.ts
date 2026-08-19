/**
 * Phase 6 — Local Station Simulation Data Contract (types.ts)
 *
 * Types for the heuristic, geometry-only Before/After picture under an added candidate station.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §2.4
 */

export type SimTag = "CALCULATED" | "ESTIMATED" | "RULE";

export type ScreeningDecision = "DE_XUAT" | "DE_XUAT_NEU_CO_DC" | "TU_CHOI" | null;
export type CommuneKind = "PHUONG" | "XA" | "DAC_KHU";

export interface SimCalibrationBand {
  n: number;
  med: number;
  p90: number;
  /** Dải quá mỏng (n dưới ngưỡng §2.3) — giá trị lấy từ cửa sổ mở rộng, ĐƯỢC GHI LẠI. */
  merged?: boolean;
}

export interface SimCalibrationNear {
  n: number;
  net_p50: number;
  net_p90: number;
}

export interface SimCalibrationValidation {
  n: number;
  within_20pct: number;
  upper_miss: number;
}

export interface SimCalibration {
  version: number;
  province_code: string;
  bands: Record<string, SimCalibrationBand>;
  near: SimCalibrationNear | null;
  validation: SimCalibrationValidation;
  valid: boolean;
}

export interface CandidatePoint {
  lat: number;
  lng: number;
}

export interface SimCellResult {
  h3: string;
  e: number;
  dOld: number | null;
  dHat: number | null;
  dHatUpper: number | null;
  dAfter: number | null;
  display: "point" | "interval" | "near-band" | "none";
  cls: "IMPROVES" | "UNCERTAIN" | "UNCHANGED" | "NO_BASELINE" | "EXCLUDED";
}

export interface ContextStation {
  code: string;
  name: string;
  euclidM: number;
  nPorts: number;
  powerKw: number;
  util: number | null;
  grade: string | null;
  window: [string, string] | null;
}

export interface SimulationResult {
  candidate: { lat: number; lng: number; cell: string };
  screening: {
    decision: ScreeningDecision;
    marginM: number | null;
    basis: "euclid";
    /** `null` = không xác định được loại xã (PIP trượt VÀ ô không tra được commune) — §1.9. */
    kind: CommuneKind | null;
    highLoadEvaluable: boolean;
  };
  before: {
    popWeightedMedianM: number;
    popByBand: Record<"le1km" | "b1_2km" | "b2_5km" | "gt5km", number>;
    noBaseline: { cells: number; population: number };
    excluded: { cells: number; population: number };
  };
  after: {
    popWeightedMedianM: number;
    popByBand: Record<"le1km" | "b1_2km" | "b2_5km" | "gt5km", number>;
    improved: { cells: number; population: number };
    uncertain: { cells: number; population: number };
  };
  cells: SimCellResult[];
  context: {
    stationsWithin5km: ContextStation[];
  };
  meta: {
    calibrationVersion: number;
    manifestExported: string;
    rMaxM: 5000;
    /** Số kiểm chứng của tỉnh (từ calibration) — popover §3.4 nội suy từ đây. */
    validation: { n: number; within20pct: number; upperMiss: number };
    /** F7 — vùng 5 km cắt qua ranh giới gói (đo bằng hình học, không đoán từ số ô). */
    zoneTruncated: boolean;
    /** Số ô trong vùng dùng `pop_source` không phải neo VNSDI — đưa vào popover (§1.8). */
    flaggedPopSourceCells: number;
  };
}

export interface AdmissionCheckSuccess {
  ok: true;
  candidateCell: string;
  communeKind: CommuneKind | null;
}

export interface AdmissionCheckFailure {
  ok: false;
  code: "F1_OUTSIDE_BOUNDARY" | "F2_CALIBRATION_INVALID" | "F3_UNREACHABLE_NO_ROAD";
  message: string;
}

export type AdmissionCheckResult = AdmissionCheckSuccess | AdmissionCheckFailure;
