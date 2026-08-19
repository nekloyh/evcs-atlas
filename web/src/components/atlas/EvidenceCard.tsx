/**
 * Phase 3 — EvidenceCard (Floating Inspector Shell)
 *
 * Shell container for the Inspector (§4, §8 PHASE3_INSPECTOR.md).
 *
 * Responsibilities:
 * - Floating surface (`AtlasSurface`) on desktop, bottom sheet (`Sheet`) on mobile.
 * - Close affordances: `X` button, Esc key listener, mobile sheet dismissal.
 * - Single source of truth for open state: `selection !== null`.
 * - Stable shell during data loading (does not unmount on status changes).
 * - Focus management: resets scroll and announces/focuses header on new selection;
 *   restores focus on close.
 * - No metrics, threshold formulas, or queries (delegated to loader & presenters).
 */

import * as React from "react";
import { X } from "lucide-react";

import type { Manifest } from "../../data/manifest";
import type { CommuneCollection, GridCell, RoadSeg } from "../../data/queries";
import type { PoiCollection } from "../../data/poi";
import type { StationOccupancy } from "../../data/occupancy";
import type { Scale } from "../../viz/palette";
import { FIELD_BY_ID, DEFAULT_FIELD } from "../../fields";
import { useStore } from "../../state/store";
import { AtlasSurface, AtlasSurfaceHeader } from "./AtlasSurface";
import { EvidenceSection, selectionKindLabel } from "./EvidenceSection";
import { useInspectorLoader } from "./use-inspector-loader";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { useIsDesktop } from "./use-desktop";
import { inspectorFocusAction, shouldHandleInspectorEscape } from "./inspector-interaction";

export interface EvidenceCardProps {
  manifest: Manifest | null;
  communes: CommuneCollection | null;
  poi?: PoiCollection | null;
  occupancy: StationOccupancy | null;
  occScale: Scale | null;
  roads?: RoadSeg[];
  roadsLoading?: boolean;
  cells?: GridCell[];
  scale?: Scale | null;
  /**
   * Đối tượng đang chọn nằm NGOÀI tập lọc đang bật hay không — §5.4.
   *
   * Nhận từ controller, KHÔNG tự suy: đối tượng được chọn vẫn giữ nguyên lựa chọn kể cả
   * khi bộ lọc loại nó (§2.1), nên "có mark được vẽ hay không" không phải bằng chứng đọc
   * được từ trong này. App tính cờ này bằng đúng predicate mà bản đồ dùng.
   */
  outsideActiveSubset?: boolean;
}

export function EvidenceCard({
  manifest,
  communes,
  occupancy,
  occScale,
  cells = [],
  scale = null,
  outsideActiveSubset = false,
}: EvidenceCardProps) {
  const selection = useStore((s) => s.selection);
  const fieldId = useStore((s) => s.field);
  const t = useStore((s) => s.t);
  const clearSelection = useStore((s) => s.clearSelection);
  const selectEntity = useStore((s) => s.selectEntity);
  const flyTo = useStore((s) => s.flyTo);
  const setT = useStore((s) => s.setT);
  const isDesktop = useIsDesktop();

  const field = FIELD_BY_ID.get(fieldId) ?? FIELD_BY_ID.get(DEFAULT_FIELD)!;

  const route = useInspectorLoader({
    selection,
    field,
    t,
    manifest,
    communes,
    occupancy,
    occScale,
    cells,
    scale,
  });

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const prevSelectionKey = React.useRef<string | null>(null);
  const focusOriginRef = React.useRef<HTMLElement | null>(null);
  const skipInitialUrlFocus = React.useRef(selection !== null);

  // Every shell dismissal converges here so focus restoration cannot diverge by input mode.
  const handleClose = React.useCallback(
    (reason: string = "button") => {
      const focusOrigin = focusOriginRef.current;
      clearSelection(reason);
      window.requestAnimationFrame(() => {
        if (focusOrigin && document.body.contains(focusOrigin)) {
          focusOrigin.focus();
        } else {
          const mapContainer = document.querySelector('[role="region"][aria-label*="Bản đồ"]') as HTMLElement | null;
          mapContainer?.focus();
        }
      });
    },
    [clearSelection],
  );

  // Esc key listener owned by the shell (§8)
  React.useEffect(() => {
    // Base Dialog owns mobile Escape and converges through onOpenChange below. Installing
    // this listener there as well would allow one key to clear twice.
    if (!selection || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleInspectorEscape(e)) return;
      e.preventDefault();
      handleClose("escape");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, isDesktop, handleClose]);

  // Focus & Scroll management (§8)
  React.useEffect(() => {
    if (!selection) {
      prevSelectionKey.current = null;
      return;
    }

    const currentKey = `${selection.datasetId}:${selection.kind}:${selection.id}`;
    const focusAction = inspectorFocusAction(
      prevSelectionKey.current,
      currentKey,
      skipInitialUrlFocus.current,
    );
    if (focusAction !== "none") {
      prevSelectionKey.current = currentKey;

      // Reset scroll to top
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }

      if (focusAction === "skip-initial") {
        // A deep link present at boot remains discoverable but must not steal page focus.
        skipInitialUrlFocus.current = false;
        return;
      }

      // Only opening captures the origin. Replacing A with B inside the Inspector must not
      // overwrite the original map/search control with an element that is about to unmount.
      if (focusAction === "capture-and-focus") {
        focusOriginRef.current = document.activeElement as HTMLElement | null;
      }
      headingRef.current?.focus();
    }
  }, [selection]);

  if (!selection || !route) return null;

  const kindName = selectionKindLabel(selection) ?? "Đối tượng";
  const entityLabel = inspectorEntityLabel(route) ?? selection.id;
  const accessibleTitle = `Bằng chứng — ${kindName} — ${entityLabel}`;

  const content = (
    <>
      <AtlasSurfaceHeader className="justify-between gap-2 px-3 py-2 pr-12 lg:pr-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 eyebrow">
            <span>BẰNG CHỨNG</span>
            {outsideActiveSubset && (
              <span className="rounded-xs border border-hairline bg-basemap/80 px-1 text-[9px] font-mono text-ink-muted">
                Ngoài tập lọc hiện tại
              </span>
            )}
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            aria-label={accessibleTitle}
            className="truncate text-title font-semibold text-ink outline-none"
          >
            {kindName}
          </h1>
        </div>
        {isDesktop && (
          <button
            onClick={() => handleClose("button")}
            title="Bỏ chọn (Esc)"
            aria-label="Bỏ chọn"
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-xs border border-transparent text-ink-2 hover:border-hairline hover:text-ink transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </AtlasSurfaceHeader>

      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <EvidenceSection
          route={route}
          onSelectEntity={selectEntity}
          onFlyTo={flyTo}
          onT={setT}
        />
      </div>
    </>
  );

  if (!isDesktop) {
    return (
      <Sheet open onOpenChange={(open) => !open && handleClose("sheet")}>
        <SheetContent side="bottom" className="bg-panel p-0 text-ink">
          <SheetHeader className="sr-only">
            <SheetTitle>{accessibleTitle}</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <AtlasSurface
      className="pointer-events-auto absolute right-3 top-3 z-20 flex w-[320px] max-h-[60%] flex-col min-[1440px]:w-[340px]"
      aria-label={accessibleTitle}
    >
      {content}
    </AtlasSurface>
  );
}

function inspectorEntityLabel(route: NonNullable<ReturnType<typeof useInspectorLoader>>): string | null {
  switch (route.model.kind) {
    case "station": {
      const name = route.model.detail?.station["name"];
      return typeof name === "string" && name.length > 0 ? name : null;
    }
    case "h3-cell":
      return route.model.id;
    case "commune": {
      const name = route.model.feature?.properties["commune_name"];
      return typeof name === "string" && name.length > 0 ? name : null;
    }
  }
}
