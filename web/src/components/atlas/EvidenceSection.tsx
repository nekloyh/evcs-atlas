/**
 * Phase 3 — EvidenceSection Router
 *
 * Exhaustive shallow dispatch from `selection.kind` to the corresponding presenter:
 * StationPanel, CellPanel, CommunePanel, or UtilRegionPanel.
 *
 * Ràng buộc (§4, Acceptance Gate 7):
 * `EvidenceSection` must not call `fetchCell`, `fetchStation`, `stationSeries`,
 * `lensOfField`, `FIELD_BY_ID`, or `useStore`. It has NO queries, effects, store reads,
 * formatting, calculations, or Candidate dependencies.
 */

import type { InspectorRoute } from "./inspector-types";
import { selectionKindLabel, type EntitySelection } from "../../state/selection";
import { StationPanel } from "../../ui/StationPanel";
import { CellPanel } from "../../ui/CellPanel";
import { CommunePanel } from "../../ui/CommunePanel";
import { UtilRegionPanel } from "../../ui/UtilRegionPanel";

export { selectionKindLabel };

export interface EvidenceSectionProps {
  route: InspectorRoute;
  onSelectEntity?: (selection: EntitySelection | null) => void;
  onFlyTo?: (v: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }) => void;
  onT?: (t: number) => void;
  /** §14.2 — "Xem trạm": zoom tới drill-down và ghim chế độ chấm trạm. */
  onDrillToStations?: (v: { lng: number; lat: number }) => void;
}

export function EvidenceSection({
  route,
  onSelectEntity,
  onFlyTo,
  onT,
  onDrillToStations,
}: EvidenceSectionProps) {
  switch (route.model.kind) {
    case "station":
      return <StationPanel model={route.model} onSelectEntity={onSelectEntity} onT={onT} />;
    case "h3-cell":
      return <CellPanel model={route.model} onSelectEntity={onSelectEntity} onFlyTo={onFlyTo} />;
    case "commune":
      return <CommunePanel model={route.model} onSelectEntity={onSelectEntity} onFlyTo={onFlyTo} />;
    case "util-region":
      return (
        <UtilRegionPanel
          model={route.model}
          onSelectEntity={onSelectEntity}
          onDrillToStations={onDrillToStations}
        />
      );
  }
}
