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

export type EntitySelection = Readonly<
  | { datasetId: DatasetId; kind: "station"; id: StationId }
  | { datasetId: DatasetId; kind: "h3-cell"; id: H3R8 }
  | { datasetId: DatasetId; kind: "commune"; id: CommuneCode }
>;

export const DEFAULT_DATASET_ID = (PROVINCE ?? "01") as DatasetId;

export const STATION_ID_RE = /^[a-z0-9-]{1,64}$/;
export const H3_R8_RE = /^[0-9a-f]{15}$/;
export const COMMUNE_CODE_RE = /^\d{5}$/;

export const STATION_SEL_PREFIX = "station:";
export const COMMUNE_SEL_PREFIX = "commune:";

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
  return a.datasetId === b.datasetId && a.kind === b.kind && a.id === b.id;
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
    }
  }
  if (selection.startsWith("station:")) return "Trạm sạc";
  if (selection.startsWith("commune:")) return "Xã/phường";
  if (/^[0-9a-f]{15}$/.test(selection)) return "Ô H3";
  return "Đối tượng";
}
