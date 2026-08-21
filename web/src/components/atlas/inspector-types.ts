/**
 * Phase 3 — Inspector View Models & Route Types
 *
 * Provides typed data contracts for Station, H3 Cell, and Commune presenters.
 */

import type {
  DatasetId,
  StationId,
  H3R8,
  H3Cell,
  CommuneCode,
  UtilRegionResolution,
} from "../../state/selection";
import type { UtilRegionReadout } from "../../viz/util-regions";
import type { OccTimezoneState } from "../../viz/occ-time";
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
  /** Trục giờ được phép gọi là gì (§16) — panel trạm in nhãn giờ ở ba chỗ. */
  timezone: OccTimezoneState;
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

/**
 * VÙNG TẢI — Inspector của một cell H3 ở lens Sử dụng (spec §14.2).
 *
 * Khác ba model kia ở một điểm quyết định: **nó không có trạng thái nạp.** Ba kind kia
 * truy vấn DuckDB (`fetchCell`, `fetchStation`) nên chúng cần `loading`/`error`/
 * `not-found`. Vùng tải đọc từ chỉ mục đã precompute trong RAM, nên nó chỉ có hai câu trả
 * lời: cell có trong chỉ mục, hoặc không. Đó cũng là điều kiện để "scrub sang giờ khác
 * giữ nguyên selection và tính lại số trong RAM" là một tính chất chứ không phải một
 * tối ưu hoá — không có truy vấn nào để mà tránh phát.
 */
export interface UtilRegionViewModel {
  kind: "util-region";
  id: H3Cell;
  resolution: UtilRegionResolution;
  datasetId: DatasetId;
  datasetName: string;
  status: InspectorStatus;
  /** `null` khi cell không có trong chỉ mục (mã lạ từ hash, hoặc gói đã đổi). */
  readout: UtilRegionReadout | null;
  /** Trạm CÓ góp vào tử số tại `t`, xếp theo số cổng bận giảm dần. */
  contributing: { id: string; code: string; occ: number; ports: number; rate: number }[];
  /** Trạm trong vùng nhưng KHÔNG đủ quan sát ở `t` — nhóm riêng, không biến mất. */
  silent: { id: string; code: string; ports: number | null }[];
  t: number;
  timezone: OccTimezoneState;
  occScale: Scale | null;
  activeField: FieldMeta;
  activeLens: LensId | null;
  manifest: Manifest | null;
}

export type InspectorRoute =
  | { selection: { datasetId: DatasetId; kind: "station"; id: StationId }; model: StationViewModel }
  | { selection: { datasetId: DatasetId; kind: "h3-cell"; id: H3R8 }; model: H3CellViewModel }
  | { selection: { datasetId: DatasetId; kind: "commune"; id: CommuneCode }; model: CommuneViewModel }
  | {
      selection: {
        datasetId: DatasetId;
        kind: "util-region";
        id: H3Cell;
        resolution: UtilRegionResolution;
      };
      model: UtilRegionViewModel;
    };
