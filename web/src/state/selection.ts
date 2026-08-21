/**
 * Phase 3 — EntitySelection Contract
 *
 * One dataset-scoped discriminated union for the three Phase 3 entities:
 * Station, H3 Cell, and Commune.
 *
 * Contract rules (§3 PHASE3_INSPECTOR.md):
 * - `datasetId` identifies the loaded dataset session (default "01" / province).
 * - All branches use `id`; consumers discriminate only on `kind`.
 * - Validated before constructing branded types:
 *   - Station: ^[a-z0-9-]{1,64}$
 *   - H3 r8: ^[0-9a-f]{15}$
 *   - Commune: ^\d{5}$
 * - Wire representations round-trip cleanly:
 *   - "station:<id>" <-> { datasetId, kind: "station", id: "<id>" }
 *   - "<h3_r8>" <-> { datasetId, kind: "h3-cell", id: "<h3_r8>" }
 *   - "commune:<code>" <-> { datasetId, kind: "commune", id: "<code>" }
 */

import { PROVINCE } from "../data/province";

export type DatasetId = string & { readonly __brand: "DatasetId" };
export type StationId = string & { readonly __brand: "StationId" };
export type H3R8 = string & { readonly __brand: "H3R8" };
export type CommuneCode = string & { readonly __brand: "CommuneCode" };

/**
 * Vùng tải — một cell H3 ở r6/r7/r8 của lens Sử dụng.
 *
 * **KIND RIÊNG, không tái dùng `h3-cell`.** Hai lý do độc lập, và cả hai đã được spec chốt
 * (`UX_UTILIZATION_VISUALIZATION_SPEC` §14.2, §23.6):
 *
 *   1. `h3-cell` là **ô lưới phân tích r8** với một hàng trong `grid_h3_r8.parquet` —
 *      Inspector của nó truy vấn hàng ấy. Một vùng tải r6 không có hàng nào để truy, nên
 *      tái dùng kind sẽ phát một truy vấn luôn trả rỗng và một panel luôn nói "không tìm
 *      thấy".
 *   2. Vùng tải mang thêm `resolution`. `h3-cell` chỉ có `id`, và mã H3 **không tự nói ra
 *      mức phân giải của nó ở dạng đọc được bằng regex 15-hex** — hai cell r6 và r8 khác
 *      nhau ở bit, không ở độ dài chuỗi. Nhét resolution vào `id` là dựng một wire format
 *      thứ hai bên trong một wire format đã có.
 */
export type UtilRegionResolution = 6 | 7 | 8;

export type EntitySelection = Readonly<
  | { datasetId: DatasetId; kind: "station"; id: StationId }
  | { datasetId: DatasetId; kind: "h3-cell"; id: H3R8 }
  | { datasetId: DatasetId; kind: "commune"; id: CommuneCode }
  | { datasetId: DatasetId; kind: "util-region"; id: H3Cell; resolution: UtilRegionResolution }
>;

export const DEFAULT_DATASET_ID = (PROVINCE ?? "01") as DatasetId;

export const STATION_ID_RE = /^[a-z0-9-]{1,64}$/;
export const H3_R8_RE = /^[0-9a-f]{15}$/;
export const COMMUNE_CODE_RE = /^\d{5}$/;

/** Mã H3 ở BẤT KỲ mức nào — cùng hình dạng 15 hex; mức nằm trong bit, không trong độ dài. */
export type H3Cell = string & { readonly __brand: "H3Cell" };
export const H3_CELL_RE = H3_R8_RE;

export const STATION_SEL_PREFIX = "station:";
export const COMMUNE_SEL_PREFIX = "commune:";

/**
 * Tiền tố VERSIONED của vùng tải: `ur1:<mức>:<mã h3>`.
 *
 * Chữ `1` không phải trang trí. Hash cũ đang lưu hành không có khoá này, và hash tương lai
 * có thể cần mang thêm (ví dụ mức phân giải thứ tư, hoặc một tập trạm đã lọc). Một tiền tố
 * không phiên bản buộc mọi thay đổi về sau phải hoặc phá link cũ, hoặc đoán ý nghĩa từ số
 * lượng dấu `:` — cả hai đều là cách một wire format chết dần.
 */
export const UTIL_REGION_SEL_PREFIX = "ur1:";
export const UTIL_REGION_RESOLUTIONS: readonly UtilRegionResolution[] = [6, 7, 8];

export function asDatasetId(raw: string = DEFAULT_DATASET_ID): DatasetId {
  return raw as DatasetId;
}

export function isValidStationId(id: string): id is StationId {
  return STATION_ID_RE.test(id);
}

export function isValidH3R8(id: string): id is H3R8 {
  return H3_R8_RE.test(id);
}

export function isValidCommuneCode(code: string): code is CommuneCode {
  return COMMUNE_CODE_RE.test(code);
}

export function isValidH3Cell(id: string): id is H3Cell {
  return H3_CELL_RE.test(id);
}

export function isUtilRegionResolution(v: number): v is UtilRegionResolution {
  return v === 6 || v === 7 || v === 8;
}

export function utilRegionSelection(
  id: string,
  resolution: number,
  datasetId: string = DEFAULT_DATASET_ID,
): EntitySelection | null {
  if (!isValidH3Cell(id) || !isUtilRegionResolution(resolution)) return null;
  return { datasetId: asDatasetId(datasetId), kind: "util-region", id, resolution };
}

export function stationSelection(id: string, datasetId: string = DEFAULT_DATASET_ID): EntitySelection | null {
  if (!isValidStationId(id)) return null;
  return {
    datasetId: asDatasetId(datasetId),
    kind: "station",
    id,
  };
}

export function cellSelection(id: string, datasetId: string = DEFAULT_DATASET_ID): EntitySelection | null {
  if (!isValidH3R8(id)) return null;
  return {
    datasetId: asDatasetId(datasetId),
    kind: "h3-cell",
    id,
  };
}

export function communeSelection(code: string, datasetId: string = DEFAULT_DATASET_ID): EntitySelection | null {
  if (!isValidCommuneCode(code)) return null;
  return {
    datasetId: asDatasetId(datasetId),
    kind: "commune",
    id: code,
  };
}

/**
 * Parse a raw wire string (from URL hash `c` or legacy callers) into an EntitySelection.
 * Returns null if malformed or not one of the 3 supported entity kinds.
 */
export function parseEntitySelection(
  raw: string | null | undefined,
  datasetId: string = DEFAULT_DATASET_ID,
): EntitySelection | null {
  if (!raw || typeof raw !== "string") return null;
  const ds = asDatasetId(datasetId);

  if (raw.startsWith(STATION_SEL_PREFIX)) {
    const id = raw.slice(STATION_SEL_PREFIX.length);
    if (isValidStationId(id)) {
      return { datasetId: ds, kind: "station", id };
    }
    return null;
  }

  if (raw.startsWith(COMMUNE_SEL_PREFIX)) {
    const code = raw.slice(COMMUNE_SEL_PREFIX.length);
    if (isValidCommuneCode(code)) {
      return { datasetId: ds, kind: "commune", id: code };
    }
    return null;
  }

  if (raw.startsWith(UTIL_REGION_SEL_PREFIX)) {
    // `ur1:<mức>:<mã>` — đúng hai dấu `:` sau tiền tố. Một chuỗi lạ bị BỎ, không bị đoán:
    // đoán ở đây nghĩa là mở một vùng khác vùng người gửi link đang xem.
    const [res, id, ...rest] = raw.slice(UTIL_REGION_SEL_PREFIX.length).split(":");
    if (rest.length > 0 || res === undefined || id === undefined) return null;
    const resolution = Number(res);
    if (!Number.isInteger(resolution) || !isUtilRegionResolution(resolution)) return null;
    return isValidH3Cell(id) ? { datasetId: ds, kind: "util-region", id, resolution } : null;
  }

  if (isValidH3R8(raw)) {
    return { datasetId: ds, kind: "h3-cell", id: raw };
  }

  return null;
}

/**
 * Serializes EntitySelection to exact wire format for URL hash `c`.
 */
export function serializeEntitySelection(selection: EntitySelection): string {
  switch (selection.kind) {
    case "station":
      return `${STATION_SEL_PREFIX}${selection.id}`;
    case "commune":
      return `${COMMUNE_SEL_PREFIX}${selection.id}`;
    case "util-region":
      return `${UTIL_REGION_SEL_PREFIX}${selection.resolution}:${selection.id}`;
    case "h3-cell":
      return selection.id;
  }
}

/**
 * Compares two selections for exact entity identity equality.
 */
export function isSameSelection(
  a: EntitySelection | null | undefined,
  b: EntitySelection | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.datasetId !== b.datasetId || a.kind !== b.kind || a.id !== b.id) return false;
  // Cùng mã H3 ở hai mức phân giải là HAI vùng khác nhau — mã r8 của một trạm và mã r8 mà
  // `cellToParent` trả về không bao giờ trùng, nhưng so sánh phải đúng theo định nghĩa chứ
  // không đúng nhờ một tính chất của H3.
  if (a.kind === "util-region" && b.kind === "util-region") return a.resolution === b.resolution;
  return true;
}

/**
 * Human-readable Vietnamese label for entity kinds.
 */
export function selectionKindLabel(
  selection: EntitySelection | string | null | undefined,
): string | null {
  if (!selection) return null;
  if (typeof selection === "object") {
    switch (selection.kind) {
      case "station":
        return "Trạm sạc";
      case "h3-cell":
        return "Ô H3";
      case "commune":
        return "Xã/phường";
      case "util-region":
        return `Vùng tải H3 r${selection.resolution}`;
    }
  }
  if (selection.startsWith("station:")) return "Trạm sạc";
  if (selection.startsWith("commune:")) return "Xã/phường";
  if (selection.startsWith(UTIL_REGION_SEL_PREFIX)) return "Vùng tải";
  if (/^[0-9a-f]{15}$/.test(selection)) return "Ô H3";
  return "Đối tượng";
}
