/**
 * Phase 3 — Inspector View Models & Route Types
 *
 * Provides typed data contracts for Station, H3 Cell, and Commune presenters.
 */

import type { DatasetId, StationId, H3R8, CommuneCode } from "../../state/selection";
import type { StationDetail, CellRow, CellOccStatus, CommuneFeature, GridCell } from "../../data/queries";
import type { Scale } from "../../viz/palette";
import type { FieldMeta, LensId } from "../../fields";
import type { Manifest } from "../../data/manifest";

export type InspectorStatus = "loading" | "ready" | "not-found" | "error";

export interface StationViewModel {
  kind: "station";
  id: StationId;
  datasetId: DatasetId;
  datasetName: string;
  status: InspectorStatus;
  error?: string | null;
  detail: StationDetail | null;
  series: (number | null)[] | null;
  occScale: Scale | null;
  t: number;
  activeField: FieldMeta;
  activeLens: LensId | null;
  manifest: Manifest | null;
}

export interface H3CellViewModel {
  kind: "h3-cell";
  id: H3R8;
  datasetId: DatasetId;
  datasetName: string;
  status: InspectorStatus;
  error?: string | null;
  row: CellRow | null;
  occ: CellOccStatus | null;
  occError?: string | null;
  communeKind: string | null;
  activeField: FieldMeta;
  activeLens: LensId | null;
  manifest: Manifest | null;
  cells: GridCell[];
  scale: Scale | null;
}

export interface CommuneViewModel {
  kind: "commune";
  code: CommuneCode;
  datasetId: DatasetId;
  datasetName: string;
  status: InspectorStatus;
  error?: string | null;
  feature: CommuneFeature | null;
  allCommunes: CommuneFeature[];
  activeField: FieldMeta;
  activeLens: LensId | null;
  manifest: Manifest | null;
}

export type InspectorRoute =
  | { selection: { datasetId: DatasetId; kind: "station"; id: StationId }; model: StationViewModel }
  | { selection: { datasetId: DatasetId; kind: "h3-cell"; id: H3R8 }; model: H3CellViewModel }
  | { selection: { datasetId: DatasetId; kind: "commune"; id: CommuneCode }; model: CommuneViewModel };
