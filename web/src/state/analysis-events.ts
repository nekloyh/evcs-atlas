/**
 * Phase 4 — Event and Intent Types (PHASE4_VISUALIZATION.md §3).
 *
 * Distinct event types for analytical filtering, entity selection, time cursor,
 * lens navigation, and camera controls to prevent cross-coupling and loops.
 */

import type { AnalysisFilter } from "./filter";
import type { DatasetId, EntitySelection } from "./selection";
import type { LensId } from "../fields";
import type { View } from "./types";

export type AnalysisIntent =
  | { type: "FilterReplace"; filter: AnalysisFilter | null }
  | { type: "FilterClear"; reason?: string }
  | { type: "TimeCursorSet"; t: number }
  | { type: "EntitySelectionSet"; selection: EntitySelection }
  | { type: "EntitySelectionClear"; reason?: string }
  | { type: "LensSelect"; lensId: LensId }
  | { type: "FieldSet"; fieldId: string }
  | { type: "ViewSet"; view: View }
  | { type: "DatasetResolved"; datasetId: DatasetId };

/**
 * Interface for chart components to emit allowed user intents.
 * Each primary chart only receives the intent handler(s) it is authorized to emit.
 */
export interface ChartIntentSink {
  onFilterIntent(intent: AnalysisFilter | null): void;
  onTimeIntent(t: number): void;
  onEntityIntent(selection: EntitySelection): void;
}
