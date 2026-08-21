import { Eye, EyeOff } from "lucide-react";

import type { Manifest } from "../../data/manifest";
import type { StationOccupancy } from "../../data/occupancy";
import type { CommuneCollection, GridCell, StationPoint } from "../../data/queries";
import {
  LENSES,
  badgesFor,
  hasDemandRepresentations,
  lensOfField,
  mapFieldsOfLens,
  scaleControlFor,
  STATION_OCC_FIELD,
  unitNoun,
  type FieldMeta,
  type LensId,
  type RuntimeCoverage,
} from "../../fields";
import type { PresetStats } from "../../state/presets";
import { OCC_TZ_UNKNOWN, type OccTimezoneState } from "../../viz/occ-time";
import { selectionWireOf, useStore } from "../../state/store";
import { scaleUnit, unitPhrase } from "../../units";
import { Badge } from "../../ui/Badge";
import { DemandModes } from "../../ui/DemandModes";
import { UtilModes } from "../../ui/UtilModes";
import { UtilizationLegendNote } from "../../ui/UtilizationLegendNote";
import { LensChartController } from "./LensChartController";
import type { FilterCounts } from "../../ui/FilterSummary";
import { Legend } from "../../ui/Legend";
import { QuickPresets } from "../../ui/QuickPresets";
import { SearchBar } from "../../ui/SearchBar";
import { SourceBlock } from "../../ui/Source";
import type { BivariateAxes } from "../../viz/demand";
import { gradientAvailability, type Scale } from "../../viz/palette";
import { themeFor } from "../../viz/theme";
import { selectionKindLabel } from "./EvidenceSection";
import { ReadColumn } from "./ReadColumn";
import {
  ContextualChartSlot,
  LegendSlot,
  LensSelectorSlot,
  OverlayControl,
  OverlayControlsSlot,
  PresetsSlot,
  SearchSlot,
  TopMetricsSlot,
  type MetricItem,
} from "./ReadColumnSlots";

export interface AtlasReadColumnProps {
  field: FieldMeta;
  scale: Scale | null;
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  surfaceBreaks: number[];
  bivariate: BivariateAxes | null;
  selectedValue: number | null;
  filterCounts?: FilterCounts | null;
  communes?: CommuneCollection | null;
  stations?: StationPoint[];
  cells?: GridCell[];
  occupancy?: StationOccupancy | null;
  utilizationUnavailableReason?: string;
  /** Trục giờ được phép gọi là gì (§16). */
  occTimezone?: OccTimezoneState;
  /**
   * Số mark ĐANG VẼ ở giờ đang xem — chỉ trường theo giờ (`station:occ`) mới có. Tách khỏi
   * `Scale` vì thang đếm TRẠM-GIỜ của cả tuần còn cặp này đếm TRẠM ở một giờ (CR 4.1 §C1).
   */
  drawnCount?: { present: number; missing: number } | null;
  /** Thống kê một phiên cho Quick Preset — Phase 5 §2.3. Suy từ dữ liệu đã cư trú. */
  presetStats: PresetStats;
}

function unitTag(readAs: FieldMeta["readAs"]): string {
  if (readAs === "commune") return "XÃ";
  if (readAs === "station") return "TRẠM";
  if (readAs === "road") return "ĐƯỜNG";
  return "H3";
}

function topMetrics(manifest: Manifest | null): MetricItem[] {
  if (!manifest) return [];
  const totals = manifest.totals?.in_scope;
  const integer = (value: number) => value.toLocaleString("vi-VN");
  return [
    { label: "Ô H3", value: integer(manifest.n_cells) },
    ...(totals
      ? [
          { label: "Trạm", value: integer(totals.n_stations) },
          { label: "Cổng", value: integer(totals.n_ports) },
          {
            label: "Công suất",
            value: `${totals.power_mw.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MW`,
          },
        ]
      : []),
  ];
}

/** Connected container: chuyển state/data thành props controlled cho ReadColumn và các slot. */
export function AtlasReadColumn({
  field,
  scale,
  manifest,
  runtime,
  surfaceBreaks,
  bivariate,
  selectedValue,
  filterCounts,
  communes,
  stations = [],
  cells = [],
  occupancy = null,
  utilizationUnavailableReason,
  occTimezone = OCC_TZ_UNKNOWN,
  drawnCount = null,
  presetStats,
}: AtlasReadColumnProps) {
  const paintOn = useStore((s) => s.paintOn);
  const setPaintOn = useStore((s) => s.setPaintOn);
  const cell = useStore(selectionWireOf);
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const switchLens = useStore((s) => s.switchLens);
  const scaleMode = useStore((s) => s.scaleMode);
  const setScaleMode = useStore((s) => s.setScaleMode);
  const demandRepresentation = useStore((s) => s.demandRepresentation);
  const open = useStore((s) => s.readColumnOpen);
  const setOpen = useStore((s) => s.setReadColumnOpen);

  const noun = unitNoun(field.readAs);
  const phrase = unitPhrase(field.unit, scaleUnit(field.unit, 0));
  const badges = manifest ? badgesFor(field, manifest, runtime) : [];
  // Câu KHUYẾT nói về tập ĐANG VẼ, cùng một tập với swatch ô trống của legend — nếu không,
  // hai dòng cách nhau ba centimet sẽ nói ngược nhau: legend "35 trạm chưa đo ở giờ này"
  // ngay trên một câu "không trạm nào khuyết". Với trường theo giờ, `scale.n` là số
  // TRẠM-GIỜ của cả tuần và `scale.nNull` bằng 0 theo dựng (`allOccValues` lọc null trước).
  const nNull = drawnCount ? drawnCount.missing : scale?.nNull ?? 0;
  const nTotal = drawnCount ? drawnCount.present + drawnCount.missing : (scale?.n ?? 0) + nNull;
  const nullLine =
    scale === null
      ? null
      : nNull === 0
        ? `${nTotal.toLocaleString("vi-VN")}/${nTotal.toLocaleString("vi-VN")} ${noun} có giá trị — không ${noun} nào khuyết.`
        : `${nNull.toLocaleString("vi-VN")}/${nTotal.toLocaleString("vi-VN")} ${noun} không có giá trị: chúng vẽ vân chéo xám, không tô bậc nhạt. Vắng số ≠ bằng 0.`;
  const selectedKind = selectionKindLabel(cell);
  const activeLens = lensOfField(field.id);
  const scaleControl = scaleControlFor(
    field,
    gradientAvailability(themeFor(field, demandRepresentation), Boolean(field.diverge)),
  );
  const effectiveScaleMode = scaleControl.gradientDisabled ? "binned" : scaleMode;

  return (
    <ReadColumn
      open={open}
      onOpenChange={setOpen}
      slots={{
        search: (onResultSelect) => (
          <SearchSlot>
            <SearchBar
              communes={communes ?? null}
              stations={stations}
              cells={cells}
              onResultSelect={onResultSelect}
            />
          </SearchSlot>
        ),
        presets: (
          <PresetsSlot>
            <QuickPresets stats={presetStats} />
          </PresetsSlot>
        ),
        topMetrics: <TopMetricsSlot items={topMetrics(manifest)} />,
        lensSelector: (
          <LensSelectorSlot
            active={activeLens ?? ""}
            items={LENSES.map((lens) => ({
              id: lens.id,
              label: lens.label,
              hint: lens.hint,
              disabled: mapFieldsOfLens(lens.id).length === 0,
            }))}
            onSelect={(id) => {
              switchLens(id as LensId);
            }}
          />
        ),
        questionAction: (
          <button
            type="button"
            onClick={() => setPaintOn(!paintOn)}
            title={paintOn ? "Tắt mặt tô, chỉ còn nền và overlay" : "Bật lại mặt tô"}
            aria-label={paintOn ? "Tắt mặt tô" : "Bật mặt tô"}
            aria-pressed={paintOn}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-xs border border-transparent text-ink-2 hover:border-hairline hover:text-ink"
          >
            {paintOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        ),
        question: (
          <>
            {/* Với Sử dụng, đây là visualization CHÍNH trả lời chính câu hỏi "bận lúc
                nào". Nó đứng trước chrome cấu hình để metric và extrema còn trong fold
                1280×800; title trực tiếp bên trong chart gọi rõ metric và trục. */}
            {field.id === STATION_OCC_FIELD && (
              <div className="mb-3">
                <LensChartController
                  field={field}
                  filterCounts={filterCounts}
                  cells={cells}
                  stations={stations}
                  occupancy={occupancy}
                  manifest={manifest}
                  utilizationUnavailableReason={utilizationUnavailableReason}
                />
              </div>
            )}
            <div className="flex items-baseline gap-1.5">
              <h3 className="min-w-0 flex-1 truncate text-heading font-semibold text-ink">{field.label}</h3>
              <span className="shrink-0 border border-hairline px-1 font-mono text-note text-ink-2">
                {unitTag(field.readAs)}
              </span>
            </div>
            {phrase && <p className="mt-0.5 text-note text-ink-muted">{phrase}</p>}
            <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Kiểu thang màu">
              <button
                type="button"
                role="radio"
                aria-checked={effectiveScaleMode === "binned"}
                onClick={() => setScaleMode("binned")}
                className={`rounded-xs border px-1.5 py-0.5 text-note ${effectiveScaleMode === "binned" ? "border-ink bg-basemap font-semibold text-ink" : "border-hairline text-ink-2"}`}
              >
                Bậc
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={effectiveScaleMode === "gradient"}
                disabled={scaleControl.gradientDisabled}
                title={scaleControl.reason ?? "Dải màu liên tục từ cùng bảng màu"}
                onClick={() => setScaleMode("gradient")}
                className={`rounded-xs border px-1.5 py-0.5 text-note ${effectiveScaleMode === "gradient" ? "border-ink bg-basemap font-semibold text-ink" : "border-hairline text-ink-2"} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                Gradient
              </button>
              {scaleControl.reason && <span className="truncate text-note text-ink-muted" title={scaleControl.reason}>· {scaleControl.reason}</span>}
            </div>
            {paintOn && hasDemandRepresentations(field) && <div className="mt-3"><DemandModes /></div>}
            {/*
              Cùng khe, cùng idiom với `DemandModes` — xem chú thích đầu `UtilModes`.

              Cổng `!utilizationUnavailableReason` KHÔNG thừa: ở một gói bị tắt lớp
              occupancy (Điện Biên: 0% trạm đo được), khe biểu đồ ngay trên đã in "Dữ liệu
              vận hành chưa khả dụng", và một bộ chọn `Vùng tải | Trạm` đứng cạnh câu ấy là
              một điều khiển không điều khiển được gì — đúng cái §3a cấm, và đúng lý do
              scrubber tự ẩn trong cùng hoàn cảnh. Ảnh chụp trình duyệt bắt được nó.
            */}
            {paintOn && field.id === STATION_OCC_FIELD && !utilizationUnavailableReason && (
              <div className="mt-3"><UtilModes /></div>
            )}
          </>
        ),
        legend: (
          <LegendSlot>
            <Legend
              field={field}
              scale={scale}
              manifest={manifest}
              runtime={runtime}
              surfaceBreaks={surfaceBreaks}
              bivariate={bivariate}
              selectedValue={selectedValue}
              drawnCount={drawnCount}
              variant="floating"
            />
            {/* Hợp đồng ngữ nghĩa của lens Sử dụng — §12.3. Ngay dưới dải màu vì nó nói về
                cùng một thứ mà dải màu đang mã hoá, nhưng nó nói về PHÉP ĐO chứ không về
                thang, nên nó không thuộc về bên trong `Legend`. */}
            {field.id === STATION_OCC_FIELD && !utilizationUnavailableReason && (
              <UtilizationLegendNote profiles={occupancy?.profiles ?? null} timezone={occTimezone} />
            )}
          </LegendSlot>
        ),
        contextualChart: (
          <ContextualChartSlot>
            {field.id === STATION_OCC_FIELD ? null : (
              <LensChartController
                field={field}
                filterCounts={filterCounts}
                cells={cells}
                stations={stations}
                occupancy={occupancy}
                manifest={manifest}
                utilizationUnavailableReason={utilizationUnavailableReason}
              />
            )}
          </ContextualChartSlot>
        ),
        limits: (
          <div className="space-y-2 text-body leading-snug text-ink-2">
            <p>{field.desc}</p>
            {nullLine && <p className="tabular-nums text-ink-muted">{nullLine}</p>}
            {badges.length > 0 && <div className="flex flex-wrap gap-1.5">{badges.map((badge) => <Badge key={badge.kind + badge.text} badge={badge} />)}</div>}
          </div>
        ),
        nextSteps: (
          <p className="text-body leading-snug text-ink-2">
            {selectedKind ? <>Đang đọc <span className="font-semibold text-ink">{selectedKind}</span> — bằng chứng đang mở. <kbd className="font-mono">Esc</kbd> để bỏ chọn.</> : <>Bấm một ô H3 hoặc một xã trên bản đồ để mở bằng chứng.</>}
          </p>
        ),
        overlayControls: (
          <OverlayControlsSlot>
            <OverlayControl label="Ranh giới xã" pressed={layers.has("communes")} onToggle={() => toggleLayer("communes")} />
            <OverlayControl label="Trạm sạc" pressed={layers.has("stations")} onToggle={() => toggleLayer("stations")} />
          </OverlayControlsSlot>
        ),
        footer: (
          <details className="group shrink-0 border-t border-hairline bg-basemap/40">
            <summary className="flex cursor-pointer list-none items-baseline gap-2 px-2 py-1.5">
              <span className="eyebrow shrink-0">NGUỒN</span>
              <span className="min-w-0 flex-1 truncate text-note text-ink-muted">{manifest ? `xuất ${manifest.exported_utc.slice(0, 10)}` : "đang nạp…"}</span>
              <span aria-hidden className="shrink-0 text-note text-ink-muted"><span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></span>
            </summary>
            <SourceBlock manifest={manifest} cell={null} occ={null} bare />
          </details>
        ),
      }}
    />
  );
}
