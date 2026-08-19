/**
 * Phase 4 — Primary Lens Chart Router (PHASE4_VISUALIZATION.md §0.2, §5.1).
 *
 * Exhaustive switcher rendering exactly one primary chart for each Lens.
 */

import type { PrimaryChartId } from "../../viz/chart-contracts";
import type { ChartIntentSink } from "../../state/analysis-events";
import type { Scale } from "../../viz/palette";
import type {
  DemandHistogramModel,
  SupplyPowerTierModel,
  AccessCurveModel,
  UtilizationHeatmapModel,
  OpportunityCommuneRankModel,
} from "../../viz/chart-models";

import { PopulationHistogram } from "../../ui/PopulationHistogram";
import { PowerTierBreakdown } from "../../ui/PowerTierBreakdown";
import { AccessCurve } from "../../ui/AccessCurve";
import { Heatmap168 } from "../../ui/Heatmap168";
import { HourProfile } from "../../ui/HourProfile";
import { OpportunityCommuneRankBars } from "../../ui/OpportunityCommuneRankBars";

export function PrimaryLensChart({
  chartId,
  demandModel,
  supplyModel,
  accessModel,
  utilizationModel,
  opportunityModel,
  t = 0,
  scale = null,
  sink,
}: {
  chartId: PrimaryChartId;
  demandModel?: DemandHistogramModel;
  supplyModel?: SupplyPowerTierModel;
  accessModel?: AccessCurveModel;
  utilizationModel?: UtilizationHeatmapModel;
  opportunityModel?: OpportunityCommuneRankModel;
  t?: number;
  scale?: Scale | null;
  sink: ChartIntentSink;
}) {
  switch (chartId) {
    case "demand-population-histogram":
      return demandModel ? (
        <PopulationHistogram model={demandModel} onFilterIntent={sink.onFilterIntent} />
      ) : null;

    case "supply-power-tier-breakdown":
      return supplyModel ? (
        <PowerTierBreakdown model={supplyModel} onFilterIntent={sink.onFilterIntent} />
      ) : null;

    case "access-population-curve":
      return accessModel ? (
        <AccessCurve model={accessModel} />
      ) : null;

    case "utilization-week-heatmap":
      return utilizationModel ? (
        <div className="space-y-2">
          <Heatmap168
            cells={utilizationModel.cells}
            scale={scale}
            t={t}
            onTimeIntent={sink.onTimeIntent}
            disabledReason={utilizationModel.disabledReason}
          />
          {!utilizationModel.disabledReason && (
            <HourProfile
              cells={utilizationModel.cells}
              t={t}
              onT={sink.onTimeIntent ?? (() => {})}
            />
          )}
        </div>
      ) : null;

    case "opportunity-commune-rank":
      return opportunityModel ? (
        <OpportunityCommuneRankBars
          model={opportunityModel}
          onEntityIntent={sink.onEntityIntent}
        />
      ) : null;

  }

  // Không có nhánh `default`. Thêm một `PrimaryChartId` thứ sáu mà quên định tuyến sẽ làm
  // HỎNG BIÊN DỊCH ở đúng dòng này (§6.1 mục 2) — một `default: return null` sẽ nuốt lỗi
  // đó và cho ra một khe biểu đồ trống không ai giải thích được.
  const exhaustive: never = chartId;
  return exhaustive;
}
