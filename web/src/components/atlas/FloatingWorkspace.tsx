import * as React from "react";
import { X, SlidersHorizontal } from "lucide-react";
import type { Manifest } from "../../data/manifest";
import type { CommuneCollection } from "../../data/queries";
import type { RuntimeCoverage } from "../../fields";
import { useStore } from "../../state/store";
import { FieldsTab } from "../../ui/FieldsTab";
import { LayersTab } from "../../ui/LayersTab";
import { SourceBlock } from "../../ui/Source";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { AtlasSurface, AtlasSurfaceBody, AtlasSurfaceFooter, AtlasSurfaceHeader } from "./AtlasSurface";

export interface FloatingWorkspaceProps {
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  communes: CommuneCollection | null;
  scrubberVisible: boolean;
}

export function FloatingWorkspace({
  manifest,
  runtime,
  communes,
  scrubberVisible,
}: FloatingWorkspaceProps) {
  const { field, setField, layers, cell, workspaceOpen, setWorkspaceOpen } = useStore();
  const dockOpen = useStore((s) => s.dockOpen);
  const scene = useStore((s) => s.scene);
  const [activeTab, setActiveTab] = React.useState<"question" | "context">("question");
  const [search, setSearch] = React.useState("");

  // Check viewport for responsive mechanics (Desktop floating vs Mobile Sheet)
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 1024);
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Surface Coordinator Rule: Workspace collapses when selection is active OR Compare Dock is open
  const isSelectionActive = Boolean(cell);
  const isCollapsed = !workspaceOpen || isSelectionActive || (dockOpen && !scene);
  // The map attribution occupies the map's lower-right corner; clear it as well as
  // the timeline rather than merely placing the workspace immediately above the timeline.
  const bottomSlot = scrubberVisible ? "bottom-[6.5rem]" : "bottom-3";
  const maxHeight = scrubberVisible
    ? "h-[min(38rem,calc(100vh-8.5rem))]"
    : "h-[min(38rem,calc(100vh-5rem))]";

  if (isCollapsed) {
    return (
      <button
        onClick={() => setWorkspaceOpen(true)}
        aria-label="Mở Workspace điều tra"
        className={`fixed ${bottomSlot} right-3 z-20 flex items-center gap-2 rounded-full border border-hairline bg-panel/95 backdrop-blur-md px-3.5 py-2 text-title font-semibold text-ink shadow-float hover:bg-surface-hover transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <SlidersHorizontal className="h-4 w-4 text-ink-2" />
        <span>Workspace</span>
        {layers.size > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-basemap px-1 font-mono text-note text-cold-2 border border-hairline">
            {layers.size}
          </span>
        )}
      </button>
    );
  }

  // Content shared between Desktop Floating Panel & Mobile Sheet
  const workspaceContent = (
    <div className="flex h-full flex-col text-ink text-title select-text">
      {/* Header Tabs */}
      <AtlasSurfaceHeader className="justify-between p-0 select-none">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "question" | "context")}
          className="w-full"
        >
          <TabsList className="h-9 border-b-0 bg-transparent">
            <TabsTrigger value="question" className="py-2 text-body tracking-wider uppercase">
              CÂU HỎI
            </TabsTrigger>
            <TabsTrigger value="context" className="py-2 text-body tracking-wider uppercase flex items-center justify-center gap-1.5">
              <span>BỐI CẢNH</span>
              {layers.size > 0 && (
                <span className="font-mono text-note text-cold-2 font-bold">
                  ({layers.size})
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <button
          onClick={() => setWorkspaceOpen(false)}
          className="mr-2 grid h-7 w-7 place-items-center rounded border border-transparent text-ink-2 hover:border-hairline hover:text-ink cursor-pointer shrink-0"
          title="Thu gọn"
          aria-label="Thu gọn Workspace"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </AtlasSurfaceHeader>

      {/* Main Tab Content */}
      <AtlasSurfaceBody className="custom-scrollbar p-2">
        {activeTab === "question" ? (
          <FieldsTab
            field={field}
            setField={setField}
            search={search}
            setSearch={setSearch}
            manifest={manifest}
            runtime={runtime}
            communes={communes}
          />
        ) : (
          <LayersTab manifest={manifest} />
        )}
      </AtlasSurfaceBody>

      {/* Footer Source Block */}
      <AtlasSurfaceFooter className="p-2 text-body">
        <SourceBlock manifest={manifest} cell={null} occ={null} />
      </AtlasSurfaceFooter>
    </div>
  );

  // Tablet/Mobile Bottom Sheet
  if (isMobile) {
    return (
      <Sheet open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
        <SheetContent side="bottom" showClose={false} className="h-[70vh] p-0 overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Không gian điều tra</SheetTitle>
          </SheetHeader>
          {workspaceContent}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop Floating Panel (320px at bottom-right)
  return (
    <AtlasSurface
      className={`fixed ${bottomSlot} right-3 z-20 ${maxHeight} w-[320px] transition-all`}
      aria-label="Không gian điều tra"
    >
      {workspaceContent}
    </AtlasSurface>
  );
}
