import {
  Map as MapIcon,
  BookOpen,
  Database,
  Layers,
  Compass,
  Box,
  Palette,
  Check,
} from "lucide-react";
import type { Manifest } from "../../data/manifest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface NavRailProps {
  manifest: Manifest | null;
  activeMode: "map" | "story" | "data";
  storyEnabled: boolean;
  onSelectMode: (mode: "map" | "story" | "data") => void;
  basemapStyle: "voyager" | "positron" | "dark";
  onSelectBasemap: (style: "voyager" | "positron" | "dark") => void;
  viewMode: "2d" | "3d";
  onToggle2D3D: () => void;
  onResetView: () => void;
  workspaceOpen: boolean;
  onToggleWorkspace: () => void;
}

export function NavRail({
  manifest,
  activeMode,
  storyEnabled,
  onSelectMode,
  basemapStyle,
  onSelectBasemap,
  viewMode,
  onToggle2D3D,
  onResetView,
  workspaceOpen,
  onToggleWorkspace,
}: NavRailProps) {
  const basemapOptions = [
    { id: "voyager", label: "Voyager", color: "bg-[#d8e9eb]" },
    { id: "positron", label: "Light", color: "bg-[#f4f3ef]" },
    { id: "dark", label: "Dark", color: "bg-[#30343b]" },
  ] as const;

  return (
    <TooltipProvider>
      <aside
        className="z-10 flex w-14 shrink-0 flex-col border-r border-hairline bg-panel select-none h-full"
        aria-label="Thanh điều hướng ứng dụng"
      >
        {/* Header Badge */}
        <div
          className="flex h-12 items-center justify-center border-b border-hairline font-bold text-[11px] tracking-wider text-ink"
          title={`EVCS ${manifest?.province?.province_name ?? "Hà Nội"}`}
        >
          {manifest?.province?.province_code?.toUpperCase() ?? "HN"}
        </div>

        {/* Top Group: Primary Navigation Modes */}
        <div className="flex flex-col items-center gap-1.5 py-3">
          {/* Map Mode */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Chế độ Bản đồ"
              aria-current={activeMode === "map" ? "page" : undefined}
              onClick={() => onSelectMode("map")}
              className={`grid h-9 w-9 place-items-center rounded border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeMode === "map"
                  ? "border-ink bg-basemap text-ink font-semibold"
                  : "border-transparent text-ink-2 hover:border-hairline hover:text-ink"
              }`}
            >
              <MapIcon className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Bản đồ điều tra</TooltipContent>
          </Tooltip>

          {/* Story Mode */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Chế độ Câu chuyện"
              aria-current={activeMode === "story" ? "page" : undefined}
              aria-disabled={!storyEnabled}
              disabled={!storyEnabled}
              onClick={() => storyEnabled && onSelectMode("story")}
              className={`grid h-9 w-9 place-items-center rounded border transition-colors ${
                !storyEnabled
                  ? "cursor-not-allowed border-transparent text-ink-muted/40"
                  : activeMode === "story"
                  ? "border-ink bg-basemap text-ink font-semibold cursor-pointer"
                  : "border-transparent text-ink-2 hover:border-hairline hover:text-ink cursor-pointer"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
              <BookOpen className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">
              {storyEnabled
                ? "Câu chuyện không gian"
                : "Cảnh được viết cho Hà Nội và cần lớp detour_ratio"}
            </TooltipContent>
          </Tooltip>

          {/* Data Mode */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Chế độ Dữ liệu"
              aria-current={activeMode === "data" ? "page" : undefined}
              onClick={() => onSelectMode("data")}
              className={`grid h-9 w-9 place-items-center rounded border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeMode === "data"
                  ? "border-ink bg-basemap text-ink font-semibold"
                  : "border-transparent text-ink-2 hover:border-hairline hover:text-ink"
              }`}
            >
              <Database className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Bảng dữ liệu & KPI</TooltipContent>
          </Tooltip>

          <div className="my-1 h-[1px] w-6 bg-hairline" />

          {/* Toggle Workspace */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Mở Workspace điều tra"
              aria-expanded={workspaceOpen}
              onClick={onToggleWorkspace}
              className={`grid h-9 w-9 place-items-center rounded border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                workspaceOpen
                  ? "border-ink bg-basemap text-ink"
                  : "border-transparent text-ink-2 hover:border-hairline hover:text-ink"
              }`}
            >
              <Layers className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Bảng câu hỏi & Lớp dữ liệu</TooltipContent>
          </Tooltip>
        </div>

        {/* Bottom Group: GIS Controls & Tools */}
        <div className="mt-auto flex flex-col items-center gap-1.5 border-t border-hairline py-3">
          {/* Basemap Switcher Popover */}
          <Popover>
            <Tooltip>
              <TooltipTrigger render={<PopoverTrigger />}>
                <button
                  aria-label="Chọn nền bản đồ"
                  className="grid h-9 w-9 place-items-center rounded border border-transparent text-ink-2 hover:border-hairline hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Palette className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Nền bản đồ</TooltipContent>
            </Tooltip>
            <PopoverContent side="right" align="end" className="w-48 p-2 z-50">
              <div className="text-[11px] font-semibold tracking-wider text-ink uppercase mb-2">
                Nền bản đồ
              </div>
              <div className="flex flex-col gap-1">
                {basemapOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onSelectBasemap(opt.id)}
                    className={`flex items-center gap-2.5 px-2 py-1.5 text-xs rounded border text-left cursor-pointer transition-colors ${
                      basemapStyle === opt.id
                        ? "border-ink bg-basemap text-ink font-medium"
                        : "border-transparent hover:bg-surface-hover text-ink-2"
                    }`}
                  >
                    <span className={`h-3.5 w-5 rounded-xs border border-hairline ${opt.color}`} />
                    <span className="flex-1">{opt.label}</span>
                    {basemapStyle === opt.id && <Check className="h-3.5 w-3.5 text-ink" />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Reset Viewpoint */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Đưa góc nhìn về trung tâm"
              onClick={onResetView}
              className="grid h-9 w-9 place-items-center rounded border border-transparent text-ink-2 hover:border-hairline hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Compass className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Về trung tâm tỉnh</TooltipContent>
          </Tooltip>

          {/* 2D / 3D Toggle */}
          <Tooltip>
            <TooltipTrigger
              aria-label={viewMode === "2d" ? "Chuyển sang chế độ 3D" : "Chuyển sang chế độ 2D"}
              onClick={onToggle2D3D}
              className="grid h-9 w-9 place-items-center rounded border border-transparent font-bold text-[10px] text-ink-2 hover:border-hairline hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Box className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Góc nhìn {viewMode.toUpperCase()}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
