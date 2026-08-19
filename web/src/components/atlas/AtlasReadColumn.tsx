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
  unitNoun,
  type FieldMeta,
  type LensId,
  type RuntimeCoverage,
} from "../../fields";
import { selectionWireOf, useStore } from "../../state/store";
import { scaleUnit, unitPhrase } from "../../units";
import { Badge } from "../../ui/Badge";
import { DemandModes } from "../../ui/DemandModes";
import { LensChartController } from "./LensChartController";
import type { FilterCounts } from "../../ui/FilterSummary";
import { Legend } from "../../ui/Legend";
import { SearchBar } from "../../ui/SearchBar";
import { SourceBlock } from "../../ui/Source";
import type { BivariateAxes } from "../../viz/demand";
import type { Scale } from "../../viz/palette";
import { selectionKindLabel } from "./EvidenceSection";
import { ReadColumn } from "./ReadColumn";
import {
  ContextualChartSlot,
  LegendSlot,
  LensSelectorSlot,
  OverlayControl,
  OverlayControlsSlot,
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
  utilizationScale?: Scale | null;
  utilizationUnavailableReason?: string;
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
  utilizationScale = null,
  utilizationUnavailableReason,
}: AtlasReadColumnProps) {
  const paintOn = useStore((s) => s.paintOn);
  const setPaintOn = useStore((s) => s.setPaintOn);
  const cell = useStore(selectionWireOf);
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const switchLens = useStore((s) => s.switchLens);
  const open = useStore((s) => s.readColumnOpen);
  const setOpen = useStore((s) => s.setReadColumnOpen);

  const noun = unitNoun(field.readAs);
  const phrase = unitPhrase(field.unit, scaleUnit(field.unit, 0));
  const badges = manifest ? badgesFor(field, manifest, runtime) : [];
  const nNull = scale?.nNull ?? 0;
  const nTotal = (scale?.n ?? 0) + nNull;
  const nullLine =
    scale === null
      ? null
      : nNull === 0
        ? `${nTotal.toLocaleString("vi-VN")}/${nTotal.toLocaleString("vi-VN")} ${noun} có giá trị — không ${noun} nào khuyết.`
        : `${nNull.toLocaleString("vi-VN")}/${nTotal.toLocaleString("vi-VN")} ${noun} không có giá trị: chúng vẽ vân chéo xám, không tô bậc nhạt. Vắng số ≠ bằng 0.`;
  const selectedKind = selectionKindLabel(cell);
  const activeLens = lensOfField(field.id);

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
            className="grid h-5 w-5 cursor-pointer place-items-center rounded-xs border border-transparent text-ink-2 hover:border-hairline hover:text-ink"
          >
            {paintOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        ),
        question: (
          <>
            <div className="flex items-baseline gap-1.5">
              <h3 className="min-w-0 flex-1 truncate text-heading font-semibold text-ink">{field.label}</h3>
              <span className="shrink-0 border border-hairline px-1 font-mono text-note text-ink-2">
                {unitTag(field.readAs)}
              </span>
            </div>
            {phrase && <p className="mt-0.5 text-note text-ink-muted">{phrase}</p>}
            {paintOn && hasDemandRepresentations(field) && <div className="mt-3"><DemandModes /></div>}
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
              variant="floating"
            />
          </LegendSlot>
        ),
        contextualChart: (
          <ContextualChartSlot>
            <LensChartController
              field={field}
              scale={scale}
              filterCounts={filterCounts}
              cells={cells}
              stations={stations}
              occupancy={occupancy}
              utilizationScale={utilizationScale}
              utilizationUnavailableReason={utilizationUnavailableReason}
            />
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
