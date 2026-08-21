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
  communeName?: string | null;
}

export interface CommuneFeature {
  properties: {
    commune_code?: unknown;
    commune_kind?: unknown;
    commune_name?: unknown;
  };
  geometry: unknown;
}

/** UX §7.4 — danh tính xã/phường của P, cả ba trường cùng một lượt phân giải. */
export interface ResolvedCommune {
  kind: CommuneKind | null;
  code: string | null;
  name: string | null;
}

const F1_MESSAGE = "Ngoài phạm vi gói dữ liệu tỉnh — không có ô lưới để mô phỏng.";

function asKind(k: unknown): CommuneKind | null {
  return k === "PHUONG" || k === "XA" || k === "DAC_KHU" ? k : null;
}

function asName(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function asCode(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * §1.9 + UX §7.4 — xã/phường của P: point-in-polygon trên `commune.geojson`; TRƯỢT thì
 * fallback về `commune_code` của ô chứa P (mỗi ô lưới đều mang mã xã), KHÔNG mặc định lặng
 * về XA — một mặc định lặng đổi ngưỡng 500 m thành 2 000 m mà không ai thấy.
 *
 * Tên đi cùng LOẠI trong đúng một lượt: nếu tách làm hai lượt thì có thể lấy tên của xã A
 * và ngưỡng của xã B ở một điểm sát ranh, và không ai nhìn thấy sự lệch ấy trên màn hình.
 * Khi PIP trượt mà mã ô không tra được feature nào, tên vẫn được lấy từ CHÍNH hàng lưới —
 * đó là cùng một nguồn `commune_name` của `docs/COT.md`, chỉ khác cửa đọc.
 */
export function resolveCommune(
  candidate: CandidatePoint,
  cell: GridCellLookup | undefined,
  communesGeoJson?: { features?: CommuneFeature[] } | null,
): ResolvedCommune {
  if (communesGeoJson?.features) {
    for (const f of communesGeoJson.features) {
      if (isPointInGeoJson(candidate.lng, candidate.lat, f)) {
        const k = asKind(f.properties?.commune_kind);
        if (k) {
          return {
            kind: k,
            code: asCode(f.properties?.commune_code),
            name: asName(f.properties?.commune_name),
          };
        }
      }
    }
    const code = cell?.communeCode;
    if (code) {
      for (const f of communesGeoJson.features) {
        if (f.properties?.commune_code === code) {
          const k = asKind(f.properties?.commune_kind);
          if (k) {
            return {
              kind: k,
              code,
              name: asName(f.properties?.commune_name) ?? asName(cell?.communeName),
            };
          }
        }
      }
    }
  }
  // Không có loại ⇒ không có ngưỡng ⇒ rule "không tính được". Tên/mã vẫn trả về nếu ô có,
  // vì gọi tên vị trí không phụ thuộc vào việc có ngưỡng hay không.
  return {
    kind: null,
    code: asCode(cell?.communeCode),
    name: asName(cell?.communeName),
  };
}

/** Giữ nguyên chữ ký cũ cho phần chỉ cần NGƯỠNG (§1.9). */
export function resolveCommuneKind(
  candidate: CandidatePoint,
  cell: GridCellLookup | undefined,
  communesGeoJson?: { features?: CommuneFeature[] } | null,
): CommuneKind | null {
  return resolveCommune(candidate, cell, communesGeoJson).kind;
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

  const commune = resolveCommune(candidate, cell, communesGeoJson);
  return {
    ok: true,
    candidateCell: cellH3,
    communeKind: commune.kind,
    communeCode: commune.code,
    communeName: commune.name,
  };
}
