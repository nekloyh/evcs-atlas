/**
 * Phase 4 — Lens Chart Controller (PHASE4_VISUALIZATION.md §0.2, §5.1).
 *
 * Khe biểu đồ theo ngữ cảnh của cột ĐỌC: CHỌN model đang hoạt động, nối đúng callback mà
 * mỗi biểu đồ được phép phát, và dựng PrimaryLensChart + FilterSummary.
 *
 * KHÔNG sở hữu SQL và không sở hữu cache: Q-P4-4 cùng vòng đời phiên của nó nằm ở
 * `data/chart-session.ts` (§5.2). Ở đây chỉ còn trạng thái nạp/hỏng/thử lại của UI.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { StationOccupancy } from "../../data/occupancy";
import type { Manifest } from "../../data/manifest";
import type { GridCell, StationPoint } from "../../data/queries";
import { loadOpportunityCommunes } from "../../data/chart-session";
import { FIELD_BY_ID, LENSES, gridColumnAvailable, lensOfField, type FieldMeta } from "../../fields";
import { useStore } from "../../state/store";
import type { ChartIntentSink } from "../../state/analysis-events";
import { themeOfLens } from "../../viz/theme";
import {
  EVIDENCE_CHART_REGISTRY,
  LENS_PRIMARY_CHARTS,
  PRIMARY_CHART_REGISTRY,
  evidenceChartsOfLens,
} from "../../viz/chart-contracts";
import {
  buildDemandAccessScatter,
  buildDemandPopulationHistogram,
  buildSupplyPowerTierBreakdown,
  buildAccessPopulationCurve,
  buildUtilizationWeekModel,
  buildOpportunityCommuneRank,
  memoizeByReference,
  type OpportunityCommuneRow,
} from "../../viz/chart-models";
import { occTimezoneOf } from "../../viz/occ-time";
import { FilterClearedNotice, FilterSummary, type FilterCounts } from "../../ui/FilterSummary";
import { Scatter } from "../../ui/Scatter";
import { SCATTER_STATE_COPY } from "../../ui/scatter-copy";
import { PrimaryLensChart } from "./PrimaryLensChart";

/** Cột mà bằng chứng Cầu × Tiếp cận đọc trục Y từ. Một chỗ khai, hai chỗ hỏi. */
const SCATTER_DIST_FIELD = "dist_station_network_m";

export function LensChartController({
  field,
  filterCounts = null,
  cells = [],
  stations = [],
  occupancy = null,
  manifest = null,
  utilizationUnavailableReason,
}: {
  field: FieldMeta;
  /** kept/eligible/total — tính ở App, không tính lại trong render này (§5.2). */
  filterCounts?: FilterCounts | null;
  cells?: GridCell[];
  stations?: StationPoint[];
  occupancy?: StationOccupancy | null;
  /** Chỉ để đọc `snapshots.occupancy_hour_tz` — biểu đồ không đọc gì khác từ manifest. */
  manifest?: Manifest | null;
  utilizationUnavailableReason?: string;
}) {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const clearFilter = useStore((s) => s.clearFilter);
  const selection = useStore((s) => s.selection);
  const selectEntity = useStore((s) => s.selectEntity);
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const demandRepresentation = useStore((s) => s.demandRepresentation);

  const lensId = lensOfField(field.id) ?? "demand";
  const lensMeta = LENSES.find((l) => l.id === lensId);
  // Bảng biểu đồ chính SỐNG ở registry Lens (`LensMeta.primaryChart`, §5.1). `chart-contracts`
  // giữ bản ánh xạ thứ hai để tra cứu thuần, và `lens-chart-contracts.test.ts` khoá hai bên
  // bằng nhau; đọc từ `lensMeta` trước để registry là bên NÓI, không phải bên bị đối chiếu.
  const primaryChartId = lensMeta?.primaryChart ?? LENS_PRIMARY_CHARTS[lensId];
  const chartMeta = PRIMARY_CHART_REGISTRY[primaryChartId];
  // Theme đi từ registry, và đi kèm representation ĐANG BẬT: `ThemeReadout` ngay trên cùng
  // cột đọc dùng representation sống, nên ghim `"hex"` ở đây sẽ cho cột ấy tự mâu thuẫn ở
  // lens Cầu mỗi khi người xem đổi sang đồng mức/nhiệt/bivariate (CR 4.1 §C2).
  const theme = themeOfLens(lensId, demandRepresentation);

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
    if (primaryChartId !== "utilization-day-profiles") return undefined;
    if (utilizationUnavailableReason) {
      return buildUtilizationWeekModel(null, utilizationUnavailableReason);
    }
    if (!occupancy) return undefined;
    // 168 số gộp không phụ thuộc con trỏ giờ; chỉ đường dẫn dọc và dòng đọc số đọc `t`.
    // Memo KHÔNG có `t` trong deps, và đó là điều kiện để scrub 4 Hz không dựng lại model.
    return buildUtilizationWeekModel(occupancy);
  }, [primaryChartId, occupancy, utilizationUnavailableReason]);

  // Trục giờ được phép gọi là gì — đọc MỘT lần từ manifest, không suy từ cửa sổ UTC (§16).
  const occTimezone = useMemo(() => occTimezoneOf(manifest?.snapshots), [manifest?.snapshots]);

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

  /**
   * Khe BẰNG CHỨNG — CR 4.2 §A. Khe đầu tiên thuộc loại này.
   *
   * Trạng thái đóng/mở là `useState` NGAY Ở ĐÂY: không store, không hash, không preset,
   * không cảnh. Hệ quả cố ý — nó không chia sẻ được, không khôi phục được, không xuất hiện
   * trong câu chuyện được. Đó chính là ý nghĩa của "biểu đồ này không phát gì".
   */
  const evidenceCharts = evidenceChartsOfLens(lensId);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const scatterMeta = EVIDENCE_CHART_REGISTRY["opportunity-demand-access-scatter"];
  const showScatter = evidenceCharts.some((m) => m.id === scatterMeta.id);
  // Bám vào CỘT, không bám vào "không có hàng nào vẽ được": cột vắng thì `fetchField` phát
  // `NULL AS dist` cho mọi hàng, và biểu đồ sẽ in "không ô nào có đủ hai giá trị" — một câu
  // khẳng định về phép đo chưa từng chạy. `không áp dụng` khác `không biết`.
  const scatterColumnAvailable = gridColumnAvailable(SCATTER_DIST_FIELD);
  // Đơn vị trục Y đến từ registry trường, KHÔNG gõ ở presenter (CR 4.2 §B).
  const scatterDistUnit = FIELD_BY_ID.get(SCATTER_DIST_FIELD)?.unit ?? null;
  // Nhớ theo THAM CHIẾU `cells`: không dựng khi còn đóng, dựng MỘT lần ở lần mở đầu tiên,
  // và đóng rồi mở lại với cùng snapshot thì không dựng lại gì (§A "Loading discipline").
  const buildScatter = useRef(memoizeByReference(buildDemandAccessScatter)).current;
  const scatterModel =
    showScatter && evidenceOpen && scatterColumnAvailable && cells.length > 0
      ? buildScatter(cells)
      : null;

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
      ) : primaryChartId === "utilization-day-profiles" && !utilizationModel ? (
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
          timezone={occTimezone}
          theme={theme}
          sink={sink}
        />
      )}

      {/*
        Khe BẰNG CHỨNG, ngay DƯỚI biểu đồ chính và trong cùng cây con này. Cùng cấu tạo với
        footer NGUỒN của `AtlasReadColumn`: `<details>` mặc định ĐÓNG (§1.7 — biểu đồ phụ
        không chia khe chính và không được nạp sẵn).

        `PrimaryLensChart` KHÔNG định tuyến khối này: `switch` vét cạn của nó vẫn năm nhánh,
        và `EVIDENCE_CHART_IDS` rời hẳn `PRIMARY_CHART_IDS`.
      */}
      {showScatter && scatterDistUnit && (
        <details
          className="group border-t border-hairline"
          open={evidenceOpen}
          onToggle={(e) => setEvidenceOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary
            className={`flex list-none items-baseline gap-2 py-1.5 ${scatterColumnAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            // Cột vắng ⇒ khối vẫn RENDER nhưng vô hiệu, và lý do nhìn thấy được. Một khối
            // biến mất im lặng không phân biệt được với một khối chưa bao giờ được dựng.
            onClick={(e) => { if (!scatterColumnAvailable) e.preventDefault(); }}
          >
            <span className="eyebrow shrink-0 text-ink-muted">{scatterMeta.eyebrow}</span>
            <span className="min-w-0 flex-1 truncate text-note text-ink-2">{scatterMeta.title}</span>
            <span aria-hidden className="shrink-0 text-note text-ink-muted">
              <span className="group-open:hidden">▸</span>
              <span className="hidden group-open:inline">▾</span>
            </span>
          </summary>
          {scatterColumnAvailable ? (
            <div className="pt-1">
              <Scatter model={scatterModel} theme={theme} distUnit={scatterDistUnit} />
            </div>
          ) : (
            <p className="pt-1 text-note leading-snug text-ink-muted" role="status">
              {SCATTER_STATE_COPY.unavailable}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
