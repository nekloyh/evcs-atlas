/**
 * Phase 4 — Primary Chart Registry & Invariants (PHASE4_VISUALIZATION.md §1, §5.1).
 *
 * Exactly one primary chart per Lens.
 */

import type { LensId } from "../fields";

export const PRIMARY_CHART_IDS = [
  "demand-population-histogram",
  "supply-power-tier-breakdown",
  "access-population-curve",
  "utilization-week-heatmap",
  "opportunity-commune-rank",
] as const;

export type PrimaryChartId = (typeof PRIMARY_CHART_IDS)[number];

export const LENS_PRIMARY_CHARTS: Record<LensId, PrimaryChartId> = {
  demand: "demand-population-histogram",
  supply: "supply-power-tier-breakdown",
  access: "access-population-curve",
  utilization: "utilization-week-heatmap",
  opportunity: "opportunity-commune-rank",
} as const;

export interface PrimaryChartMeta {
  id: PrimaryChartId;
  lens: LensId;
  title: string;
  unitNoun: string;
  emitsFilter: boolean;
  emitsTime: boolean;
  emitsEntity: boolean;
}

export const PRIMARY_CHART_REGISTRY: Record<PrimaryChartId, PrimaryChartMeta> = {
  "demand-population-histogram": {
    id: "demand-population-histogram",
    lens: "demand",
    title: "Phân bố dân số ô H3",
    unitNoun: "ô",
    emitsFilter: true,
    emitsTime: false,
    emitsEntity: false,
  },
  "supply-power-tier-breakdown": {
    id: "supply-power-tier-breakdown",
    lens: "supply",
    title: "Cơ cấu công suất trạm công cộng",
    unitNoun: "trạm",
    emitsFilter: true,
    emitsTime: false,
    emitsEntity: false,
  },
  "access-population-curve": {
    id: "access-population-curve",
    lens: "access",
    title: "Đường cong tiếp cận tích luỹ theo cự ly",
    unitNoun: "người",
    emitsFilter: false,
    emitsTime: false,
    emitsEntity: false,
  },
  "utilization-week-heatmap": {
    id: "utilization-week-heatmap",
    lens: "utilization",
    title: "Nhịp tải 168 giờ trong tuần",
    unitNoun: "khung giờ",
    emitsFilter: false,
    emitsTime: true,
    emitsEntity: false,
  },
  "opportunity-commune-rank": {
    id: "opportunity-commune-rank",
    lens: "opportunity",
    title: "Xếp hạng dân số ngoài 2 km theo xã",
    unitNoun: "xã/phường",
    emitsFilter: false,
    emitsTime: false,
    emitsEntity: true,
  },
};
