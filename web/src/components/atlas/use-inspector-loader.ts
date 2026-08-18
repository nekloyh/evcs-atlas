/**
 * Phase 3 — Inspector Loader & View Model Builder
 *
 * Owns asynchronous data loading, cancellation, caching, and constructing
 * typed view models for Station, H3 Cell, and Commune selections.
 */

import * as React from "react";
import { DEFAULT_DATASET_ID, type EntitySelection } from "../../state/selection";
import {
  fetchCell,
  fetchCellOccStatus,
  fetchStation,
  type CellOccStatus,
  type CellRow,
  type CommuneCollection,
  type StationDetail,
  type GridCell,
} from "../../data/queries";
import type { Manifest } from "../../data/manifest";
import type { StationOccupancy } from "../../data/occupancy";
import { stationSeries } from "../../viz/occ";
import type { Scale } from "../../viz/palette";
import { lensOfField, type FieldMeta } from "../../fields";
import type {
  InspectorRoute,
  StationViewModel,
  H3CellViewModel,
  CommuneViewModel,
  InspectorStatus,
} from "./inspector-types";

export interface InspectorLoaderProps {
  selection: EntitySelection | null;
  field: FieldMeta;
  t: number;
  manifest: Manifest | null;
  communes: CommuneCollection | null;
  occupancy: StationOccupancy | null;
  occScale: Scale | null;
  cells: GridCell[];
  scale: Scale | null;
}

export function useInspectorLoader({
  selection,
  field,
  t,
  manifest,
  communes,
  occupancy,
  occScale,
  cells,
  scale,
}: InspectorLoaderProps): InspectorRoute | null {
  const loadedDatasetId = manifest?.province?.province_code ?? DEFAULT_DATASET_ID;
  const datasetName = manifest?.province?.province_name ?? "Hà Nội";

  const [stationState, setStationState] = React.useState<{
    datasetId: string | null;
    id: string | null;
    detail: StationDetail | null;
    status: InspectorStatus;
    error: string | null;
  }>({ datasetId: null, id: null, detail: null, status: "loading", error: null });

  const [cellState, setCellState] = React.useState<{
    datasetId: string | null;
    id: string | null;
    row: CellRow | null;
    occ: CellOccStatus | null;
    status: InspectorStatus;
    error: string | null;
    occError: string | null;
  }>({ datasetId: null, id: null, row: null, occ: null, status: "loading", error: null, occError: null });

  // Load Station detail
  React.useEffect(() => {
    if (!selection || selection.kind !== "station" || selection.datasetId !== loadedDatasetId) {
      setStationState({ datasetId: null, id: null, detail: null, status: "loading", error: null });
      return;
    }
    const stationId = selection.id;
    let cancelled = false;
    const datasetId = selection.datasetId;
    setStationState((prev) =>
      prev.id === stationId && prev.datasetId === datasetId
        ? prev
        : { datasetId, id: stationId, detail: null, status: "loading", error: null },
    );

    void fetchStation(stationId).then(
      (detail) => {
        if (cancelled) return;
        setStationState({
          datasetId,
          id: stationId,
          detail,
          status: detail ? "ready" : "not-found",
          error: null,
        });
      },
      (e: unknown) => {
        if (cancelled) return;
        setStationState({
          datasetId,
          id: stationId,
          detail: null,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [selection?.kind, selection?.id, selection?.datasetId, loadedDatasetId]);

  // Load H3 Cell detail
  React.useEffect(() => {
    if (!selection || selection.kind !== "h3-cell" || selection.datasetId !== loadedDatasetId) {
      setCellState({ datasetId: null, id: null, row: null, occ: null, status: "loading", error: null, occError: null });
      return;
    }
    const h3Id = selection.id;
    const datasetId = selection.datasetId;
    let cancelled = false;
    setCellState((prev) =>
      prev.id === h3Id && prev.datasetId === datasetId
        ? prev
        : { datasetId, id: h3Id, row: null, occ: null, status: "loading", error: null, occError: null },
    );

    void fetchCell(h3Id).then(
      (row) => {
        if (cancelled) return;
        setCellState((prev) =>
          prev.id === h3Id && prev.datasetId === datasetId
            ? { ...prev, row, status: row ? "ready" : "not-found", error: null }
            : prev,
        );
      },
      (e: unknown) => {
        if (cancelled) return;
        setCellState((prev) =>
          prev.id === h3Id && prev.datasetId === datasetId
            ? { ...prev, row: null, status: "error", error: e instanceof Error ? e.message : String(e) }
            : prev,
        );
      },
    );

    void fetchCellOccStatus(h3Id).then(
      (occ) => {
        if (cancelled) return;
        setCellState((prev) =>
          prev.id === h3Id && prev.datasetId === datasetId ? { ...prev, occ, occError: null } : prev,
        );
      },
      (e: unknown) => {
        if (cancelled) return;
        setCellState((prev) =>
          prev.id === h3Id && prev.datasetId === datasetId
            ? { ...prev, occ: null, occError: e instanceof Error ? e.message : String(e) }
            : prev,
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [selection?.kind, selection?.id, selection?.datasetId, loadedDatasetId]);

  if (!selection) return null;

  const activeLens = lensOfField(field.id);

  if (selection.kind === "station") {
    const isDatasetMatch = selection.datasetId === loadedDatasetId;
    const isMatching = isDatasetMatch && stationState.id === selection.id && stationState.datasetId === selection.datasetId;
    const currentStatus = isDatasetMatch ? (isMatching ? stationState.status : "loading") : "not-found";
    const detail = isMatching ? stationState.detail : null;
    const error = isMatching ? stationState.error : null;

    const seriesIndex =
      detail && occupancy ? occupancy.stations.findIndex((s) => s.id === selection.id) : -1;
    const series =
      occupancy && seriesIndex >= 0 ? stationSeries(occupancy.profiles, seriesIndex) : null;

    const model: StationViewModel = {
      kind: "station",
      id: selection.id,
      datasetId: selection.datasetId,
      datasetName,
      status: currentStatus,
      error,
      detail,
      series,
      occScale,
      t,
      activeField: field,
      activeLens,
      manifest,
    };

    return {
      selection,
      model,
    };
  }

  if (selection.kind === "h3-cell") {
    const isDatasetMatch = selection.datasetId === loadedDatasetId;
    const isMatching = isDatasetMatch && cellState.id === selection.id && cellState.datasetId === selection.datasetId;
    const currentStatus = isDatasetMatch ? (isMatching ? cellState.status : "loading") : "not-found";
    const row = isMatching ? cellState.row : null;
    const occ = isMatching ? cellState.occ : null;
    const error = isMatching ? cellState.error : null;
    const occError = isMatching ? cellState.occError : null;
    const communeCode = typeof row?.["commune_code"] === "string" ? row["commune_code"] : null;
    const communeKind = communeCode && communes
      ? String(communes.features.find((feature) => feature.properties["commune_code"] === communeCode)?.properties["commune_kind"] ?? "") || null
      : null;

    const model: H3CellViewModel = {
      kind: "h3-cell",
      id: selection.id,
      datasetId: selection.datasetId,
      datasetName,
      status: currentStatus,
      error,
      row,
      occ,
      occError,
      communeKind,
      activeField: field,
      activeLens,
      manifest,
      cells,
      scale,
    };

    return {
      selection,
      model,
    };
  }

  if (selection.kind === "commune") {
    const allCommunes = communes ? communes.features : [];
    let status: InspectorStatus = "loading";
    let feature = null;

    if (selection.datasetId !== loadedDatasetId) {
      status = "not-found";
    } else if (communes) {
      feature = communes.features.find((f) => f.properties["commune_code"] === selection.id) ?? null;
      status = feature ? "ready" : "not-found";
    }

    const model: CommuneViewModel = {
      kind: "commune",
      code: selection.id,
      datasetId: selection.datasetId,
      datasetName,
      status,
      feature,
      allCommunes,
      activeField: field,
      activeLens,
      manifest,
    };

    return {
      selection,
      model,
    };
  }

  return null;
}
