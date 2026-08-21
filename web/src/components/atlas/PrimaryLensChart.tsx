/**
 * Phase 4 — Primary Lens Chart Router (PHASE4_VISUALIZATION.md §0.2, §5.1).
 *
 * Exhaustive switcher rendering exactly one primary chart for each Lens.
 *
 * **Router này không còn nhận `Scale`.** Người nhận duy nhất trước đây là `Heatmap168`, và
 * biểu đồ chính của lens Sử dụng nay mã hoá giá trị bằng VỊ TRÍ chứ không bằng màu
 * (`UX_UTILIZATION_VISUALIZATION_SPEC` §12.1). Bỏ prop đi thay vì để nó `null`: một prop
 * không ai đọc là một lời mời cho biểu đồ thứ sáu lén dựng một thang màu thứ hai.
 */

import type { PrimaryChartId } from "../../viz/chart-contracts";
import type { ChartIntentSink } from "../../state/analysis-events";
import type { AnalysisTheme } from "../../viz/theme";
import type { OccTimezoneState } from "../../viz/occ-time";
import { OCC_TZ_UNKNOWN } from "../../viz/occ-time";
import type {
  DemandHistogramModel,
  SupplyPowerTierModel,
  AccessCurveModel,
  UtilizationWeekModel,
  OpportunityCommuneRankModel,
} from "../../viz/chart-models";

import { PopulationHistogram } from "../../ui/PopulationHistogram";
import { PowerTierBreakdown } from "../../ui/PowerTierBreakdown";
import { AccessCurve } from "../../ui/AccessCurve";
import { UtilizationDayProfiles } from "../../ui/UtilizationDayProfiles";
import { OpportunityCommuneRankBars } from "../../ui/OpportunityCommuneRankBars";

export function PrimaryLensChart({
  chartId,
  demandModel,
  supplyModel,
  accessModel,
  utilizationModel,
  opportunityModel,
  t = 0,
  timezone = OCC_TZ_UNKNOWN,
  theme,
  sink,
}: {
  chartId: PrimaryChartId;
  demandModel?: DemandHistogramModel;
  supplyModel?: SupplyPowerTierModel;
  accessModel?: AccessCurveModel;
  utilizationModel?: UtilizationWeekModel;
  opportunityModel?: OpportunityCommuneRankModel;
  t?: number;
  /**
   * Trục giờ được phép gọi là gì (§16). Mặc định `unknown` chứ không phải một múi giờ:
   * mặc định phải là trạng thái KHÔNG khẳng định gì, nếu không một chỗ gọi quên truyền
   * prop sẽ âm thầm in nhãn đồng hồ mà manifest chưa hề công bố.
   */
  timezone?: OccTimezoneState;
  /** Mực của lens — đến từ registry qua `LensChartController`, không module nào tự gõ. */
  theme: AnalysisTheme;
  sink: ChartIntentSink;
}) {
  switch (chartId) {
    case "demand-population-histogram":
      return demandModel ? (
        <PopulationHistogram model={demandModel} theme={theme} onFilterIntent={sink.onFilterIntent} />
      ) : null;

    case "supply-power-tier-breakdown":
      return supplyModel ? (
        <PowerTierBreakdown model={supplyModel} theme={theme} onFilterIntent={sink.onFilterIntent} />
      ) : null;

    case "access-population-curve":
      return accessModel ? (
        <AccessCurve model={accessModel} theme={theme} />
      ) : null;

    // MỘT biểu đồ, không phải hai. Cặp `Heatmap168 + HourProfile` cũ tồn tại vì tấm nhiệt
    // đồ không đọc được nhịp ngày, nên hồ sơ 24 giờ được thêm vào để nói phần ấy bằng ĐỘ
    // CAO. Bảy hồ sơ ngày nói cả hai điều bằng cùng một kênh, nên cái thứ hai không còn
    // việc gì — và §23.4 cấm để hai biểu đồ chính cùng tồn tại sau rollout.
    case "utilization-day-profiles":
      return utilizationModel ? (
        <UtilizationDayProfiles
          model={utilizationModel}
          theme={theme}
          t={t}
          timezone={timezone}
          onTimeIntent={sink.onTimeIntent}
        />
      ) : null;

    case "opportunity-commune-rank":
      return opportunityModel ? (
        <OpportunityCommuneRankBars
          model={opportunityModel}
          theme={theme}
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
