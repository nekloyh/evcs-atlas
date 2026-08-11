import * as React from "react";
import { X, BarChart3 } from "lucide-react";
import type { FieldMeta } from "../../fields";
import type { DockData } from "../../ui/Dock";
import { Dock } from "../../ui/Dock";
import { brushCount } from "../../state/brush";
import { useStore } from "../../state/store";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { AtlasSurface, AtlasSurfaceBody, AtlasSurfaceHeader } from "./AtlasSurface";

export interface CompareDockProps {
  field: FieldMeta;
  dockData: DockData;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return isDesktop;
}

export function CompareDock({ field, dockData }: CompareDockProps) {
  const dockOpen = useStore((s) => s.dockOpen);
  const compareView = useStore((s) => s.compareView);
  const setDockOpen = useStore((s) => s.setDockOpen);
  const cell = useStore((s) => s.cell);
  const brush = useStore((s) => s.brush);
  const setBrush = useStore((s) => s.setBrush);
  const isDesktop = useIsDesktop();
  const activeBrushes = brushCount(brush);

  // Handle Escape key to close Compare Dock
  React.useEffect(() => {
    if (!dockOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDockOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dockOpen, setDockOpen]);

  // Dock is only shown when open and there is NO active cell selection (Surface Coordinator Rule)
  const isVisible = dockOpen && !cell;
  if (!isVisible) return null;

  const dockInnerContent = (
    <>
      {/* Exactly one header and close button */}
      <AtlasSurfaceHeader className="justify-between gap-2 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cold-2" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink">
            SO SÁNH PHÂN TÍCH
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activeBrushes > 0 && (
            <Button
              variant="ghost"
              className="h-7 px-2 text-[10px] text-ink-2"
              onClick={() => setBrush({})}
            >
              Bỏ {activeBrushes} lọc
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDockOpen(false)}
            aria-label="Đóng Compare Dock"
          >
            <X className="h-4 w-4 text-ink-2 hover:text-ink" />
          </Button>
        </div>
      </AtlasSurfaceHeader>

      {/* Dock Content */}
      <AtlasSurfaceBody className="custom-scrollbar p-2">
        <Dock field={field} data={dockData} view={compareView} />
      </AtlasSurfaceBody>
    </>
  );

  // Desktop (≥1024px): Non-modal right-side panel
  if (isDesktop) {
    return (
      <AtlasSurface
        className="fixed top-3 right-3 bottom-3 z-30 w-[360px] transition-all duration-200"
        aria-label="Đốc so sánh phân tích"
      >
        {dockInnerContent}
      </AtlasSurface>
    );
  }

  // Tablet/Mobile (<1024px): Bottom Sheet Drawer
  return (
    <Sheet open={isVisible} onOpenChange={(open) => !open && setDockOpen(false)}>
      <SheetContent
        side="bottom"
        showClose={false}
        className="h-[75vh] p-0 flex flex-col bg-panel text-ink border-t border-hairline shadow-sheet z-50 rounded-t-md"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>So sánh phân tích</SheetTitle>
        </SheetHeader>
        {dockInnerContent}
      </SheetContent>
    </Sheet>
  );
}
