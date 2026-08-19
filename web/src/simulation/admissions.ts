/**
 * Phase 6 — Admission Checks (admissions.ts)
 *
 * Checks candidate placement validity in order (1 to 4) before simulation proceeds.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.1, §5
 */

import { latLngToCell } from "h3-js";
import { isPointInGeoJson } from "./geometry";
import type {
  AdmissionCheckResult,
  CandidatePoint,
  CommuneKind,
  SimCalibration,
} from "./types";

export interface GridCellLookup {
  h3: string;
  evidenceGrade?: string | null;
  communeCode?: string | null;
}

export interface CommuneFeature {
  properties: {
    commune_code?: unknown;
    commune_kind?: unknown;
  };
  geometry: unknown;
}

const F1_MESSAGE = "Ngoài phạm vi gói dữ liệu tỉnh — không có ô lưới để mô phỏng.";

function asKind(k: unknown): CommuneKind | null {
  return k === "PHUONG" || k === "XA" || k === "DAC_KHU" ? k : null;
}

/**
 * §1.9 — loại xã của P: point-in-polygon trên `commune.geojson`; TRƯỢT thì fallback về
 * `commune_code` của ô chứa P (mỗi ô lưới đều mang mã xã), KHÔNG mặc định lặng về XA —
 * một mặc định lặng đổi ngưỡng 500 m thành 2 000 m mà không ai thấy.
 */
export function resolveCommuneKind(
  candidate: CandidatePoint,
  cell: GridCellLookup | undefined,
  communesGeoJson?: { features?: CommuneFeature[] } | null,
): CommuneKind | null {
  if (communesGeoJson?.features) {
    for (const f of communesGeoJson.features) {
      if (isPointInGeoJson(candidate.lng, candidate.lat, f)) {
        const k = asKind(f.properties?.commune_kind);
        if (k) return k;
      }
    }
    const code = cell?.communeCode;
    if (code) {
      for (const f of communesGeoJson.features) {
        if (f.properties?.commune_code === code) {
          const k = asKind(f.properties?.commune_kind);
          if (k) return k;
        }
      }
    }
  }
  return null;
}

export function checkAdmission(
  candidate: CandidatePoint,
  boundaryGeoJson: unknown,
  gridCellMap: Map<string, GridCellLookup>,
  calibration: SimCalibration | null,
  communesGeoJson?: { features?: CommuneFeature[] } | null,
): AdmissionCheckResult {
  // 1. Boundary polygon check (F1)
  if (boundaryGeoJson) {
    const insideBoundary = isPointInGeoJson(
      candidate.lng,
      candidate.lat,
      boundaryGeoJson,
    );
    if (!insideBoundary) {
      return { ok: false, code: "F1_OUTSIDE_BOUNDARY", message: F1_MESSAGE };
    }
  }

  // 2. Cell in grid check (F1)
  let cellH3: string;
  try {
    cellH3 = latLngToCell(candidate.lat, candidate.lng, 8);
  } catch {
    return { ok: false, code: "F1_OUTSIDE_BOUNDARY", message: F1_MESSAGE };
  }

  const cell = gridCellMap.get(cellH3);
  if (!cell) {
    return { ok: false, code: "F1_OUTSIDE_BOUNDARY", message: F1_MESSAGE };
  }

  // 3. Road accessibility check (F3)
  if (cell.evidenceGrade === "UNREACHABLE_NO_ROAD_ACCESS") {
    return {
      ok: false,
      code: "F3_UNREACHABLE_NO_ROAD",
      message:
        "Không có đường trong phạm vi 2 km quanh ô này — trạm không thể tiếp cận bằng ô tô.",
    };
  }

  // 4. Calibration file present and valid (F2)
  if (!calibration || calibration.valid !== true) {
    return {
      ok: false,
      code: "F2_CALIBRATION_INVALID",
      message: "Chưa đủ dữ liệu hiệu chuẩn để mô phỏng ở tỉnh này.",
    };
  }

  return {
    ok: true,
    candidateCell: cellH3,
    communeKind: resolveCommuneKind(candidate, cell, communesGeoJson),
  };
}
