/**
 * Phase 4 — Lens Chart Controller (PHASE4_VISUALIZATION.md §0.2, §5.1).
 *
 * Khe biểu đồ theo ngữ cảnh của cột ĐỌC: CHỌN model đang hoạt động, nối đúng callback mà
 * mỗi biểu đồ được phép phát, và dựng PrimaryLensChart + FilterSummary.
 *
 * KHÔNG sở hữu SQL và không sở hữu cache: Q-P4-4 cùng vòng đời phiên của nó nằm ở
 * `data/chart-session.ts` (§5.2). Ở đây chỉ còn trạng thái nạp/hỏng/thử lại của UI.
 */

import { useEffect, useMemo, useState } from "react";

import type { StationOccupancy } from "../../data/occupancy";
import type { GridCell, StationPoint } from "../../data/queries";
import { loadOpportunityCommunes } from "../../data/chart-session";
import { LENSES, lensOfField, type FieldMeta } from "../../fields";
import { useStore } from "../../state/store";
import type { ChartIntentSink } from "../../state/analysis-events";
import { LENS_PRIMARY_CHARTS, PRIMARY_CHART_REGISTRY } from "../../viz/chart-contracts";
import {
  buildDemandPopulationHistogram,
  buildSupplyPowerTierBreakdown,
  buildAccessPopulationCurve,
  buildUtilizationWeekHeatmap,
  buildOpportunityCommuneRank,
  type OpportunityCommuneRow,
} from "../../viz/chart-models";
import type { Scale } from "../../viz/palette";
import { FilterClearedNotice, FilterSummary, type FilterCounts } from "../../ui/FilterSummary";
import { PrimaryLensChart } from "./PrimaryLensChart";

export function LensChartController({
  field,
  scale,
  filterCounts = null,
  cells = [],
  stations = [],
  occupancy = null,
  utilizationScale = null,
  utilizationUnavailableReason,
}: {
  field: FieldMeta;
  scale: Scale | null;
  /** kept/eligible/total — tính ở App, không tính lại trong render này (§5.2). */
  filterCounts?: FilterCounts | null;
  cells?: GridCell[];
  stations?: StationPoint[];
  occupancy?: StationOccupancy | null;
  utilizationScale?: Scale | null;
  utilizationUnavailableReason?: string;
}) {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const clearFilter = useStore((s) => s.clearFilter);
  const selection = useStore((s) => s.selection);
  const selectEntity = useStore((s) => s.selectEntity);
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);

  const lensId = lensOfField(field.id) ?? "demand";
  const lensMeta = LENSES.find((l) => l.id === lensId);
  // Bảng biểu đồ chính SỐNG ở registry Lens (`LensMeta.primaryChart`, §5.1). `chart-contracts`
  // giữ bản ánh xạ thứ hai để tra cứu thuần, và `lens-chart-contracts.test.ts` khoá hai bên
  // bằng nhau; đọc từ `lensMeta` trước để registry là bên NÓI, không phải bên bị đối chiếu.
  const primaryChartId = lensMeta?.primaryChart ?? LENS_PRIMARY_CHARTS[lensId];
  const chartMeta = PRIMARY_CHART_REGISTRY[primaryChartId];

  // Lazy load opportunity communes with explicit loading/error/retry states.
  const [opportunityLoad, setOpportunityLoad] = useState<
    | { status: "idle" | "loading" }
    | { status: "ready"; rows: readonly OpportunityCommuneRow[] }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [opportunityRetry, setOpportunityRetry] = useState(0);
  useEffect(() => {
    if (lensId !== "opportunity") return;
    let cancelled = false;
    setOpportunityLoad({ status: "loading" });
    void loadOpportunityCommunes().then(
      (rows) => {
        if (!cancelled) setOpportunityLoad({ status: "ready", rows });
      },
      (error: unknown) => {
        if (!cancelled) {
          setOpportunityLoad({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lensId, opportunityRetry]);

  // Model memoization (Pure functions, 0 queries on filter change)
  const demandModel = useMemo(() => {
    if (primaryChartId !== "demand-population-histogram" || cells.length === 0) return undefined;
    return buildDemandPopulationHistogram(cells, filter.active);
  }, [primaryChartId, cells, filter.active]);

  const supplyModel = useMemo(() => {
    if (primaryChartId !== "supply-power-tier-breakdown" || stations.length === 0) return undefined;
    return buildSupplyPowerTierBreakdown(stations, filter.active);
  }, [primaryChartId, stations, filter.active]);

  const accessModel = useMemo(() => {
    if (primaryChartId !== "access-population-curve" || cells.length === 0) return undefined;
    return buildAccessPopulationCurve(cells);
  }, [primaryChartId, cells]);

  const utilizationModel = useMemo(() => {
    if (primaryChartId !== "utilization-week-heatmap") return undefined;
    if (utilizationUnavailableReason) {
      return buildUtilizationWeekHeatmap(null, utilizationUnavailableReason);
    }
    if (!occupancy) return undefined;
    // 168 số gộp không phụ thuộc con trỏ giờ; chỉ viền và dòng readout đọc `t`.
    return buildUtilizationWeekHeatmap(occupancy);
  }, [primaryChartId, occupancy, utilizationUnavailableReason]);

  const opportunityModel = useMemo(() => {
    if (primaryChartId !== "opportunity-commune-rank" || opportunityLoad.status !== "ready") return undefined;
    const selCommune = selection && selection.kind === "commune" ? selection.id : undefined;
    return buildOpportunityCommuneRank(opportunityLoad.rows, selCommune);
  }, [primaryChartId, opportunityLoad, selection]);

  /**
   * Vì sao biểu đồ chính chưa dựng được, nếu chưa dựng được.
   *
   * Ba biểu đồ đọc snapshot trong RAM (Nhu cầu, Cung ứng, Tiếp cận) trước đây render
   * `null` khi snapshot rỗng — không biểu đồ, không lời giải thích.
   */
  const unavailableReason = useMemo<string | null>(() => {
    if (primaryChartId === "demand-population-histogram" && !demandModel) {
      return "Chưa nạp xong lưới ô H3 cho biểu đồ dân số.";
    }
    if (primaryChartId === "supply-power-tier-breakdown" && !supplyModel) {
      return "Chưa nạp xong danh sách trạm để dựng cơ cấu công suất.";
    }
    if (primaryChartId === "access-population-curve" && !accessModel) {
      return "Chưa nạp xong cự ly mạng đường để dựng đường cong tiếp cận.";
    }
    return null;
  }, [primaryChartId, demandModel, supplyModel, accessModel]);

  const sink = useMemo<ChartIntentSink>(
    () => ({
      onFilterIntent: (f) => setFilter(f),
      onTimeIntent: (newT) => setT(newT),
      onEntityIntent: (sel) => selectEntity(sel),
    }),
    [setFilter, setT, selectEntity],
  );


  return (
    <div className="space-y-2 min-w-0" data-lens-chart={primaryChartId}>
      {/* Chart Slot Header */}
      <div className="flex items-baseline justify-between gap-2 border-b border-hairline pb-1">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="eyebrow shrink-0 text-ink-muted">{lensMeta?.label.toUpperCase()}</span>
          <span className="truncate text-note font-semibold text-ink">{chartMeta.title}</span>
        </div>
      </div>

      {/* Tóm tắt bộ lọc đang bật, hoặc lý do nó vừa bị xoá — §2.1, §2.3. */}
      {filter.active ? (
        <FilterSummary
          filter={filter.active}
          keptCount={filterCounts?.kept}
          eligibleCount={filterCounts?.eligible}
          totalCount={filterCounts?.total}
          excludedNullCount={filterCounts?.excludedNull ?? 0}
          onClear={() => clearFilter("user")}
        />
      ) : (
        <FilterClearedNotice reason={filter.clearedReason} revision={filter.revision} />
      )}

      {/* Primary Chart for Active Lens */}
      {primaryChartId === "opportunity-commune-rank" && opportunityLoad.status === "error" ? (
        <div className="rounded-xs border border-hairline p-2 text-note text-ink-2" role="alert">
          <p>Không đọc được bảng xếp hạng xã: {opportunityLoad.message}</p>
          <button
            type="button"
            className="mt-1 rounded-xs border border-hairline px-1.5 py-0.5 font-semibold text-ink hover:bg-basemap"
            onClick={() => setOpportunityRetry((revision) => revision + 1)}
          >
            Thử lại
          </button>
        </div>
      ) : primaryChartId === "opportunity-commune-rank" && opportunityLoad.status !== "ready" ? (
        <p className="py-4 text-center text-note text-ink-muted" role="status">Đang tính xếp hạng xã…</p>
      ) : primaryChartId === "utilization-week-heatmap" && !utilizationModel ? (
        <p className="py-4 text-center text-note text-ink-muted" role="status">Đang đọc hồ sơ vận hành…</p>
      ) : unavailableReason ? (
        // §6.1 mục 4: phụ thuộc thiếu phải nói ra LÝ DO. Trả `null` sẽ để lại một khe trống
        // dưới tiêu đề biểu đồ — trông y như một biểu đồ rỗng, tức "đo rồi, không có gì".
        <p className="py-4 text-center text-note text-ink-muted" role="status">
          {unavailableReason}
        </p>
      ) : (
        <PrimaryLensChart
          chartId={primaryChartId}
          demandModel={demandModel}
          supplyModel={supplyModel}
          accessModel={accessModel}
          utilizationModel={utilizationModel}
          opportunityModel={opportunityModel}
          t={t}
          scale={primaryChartId === "utilization-week-heatmap" ? utilizationScale : scale}
          sink={sink}
        />
      )}
    </div>
  );
}
