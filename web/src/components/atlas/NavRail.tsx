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

/**
 * Chữ tắt của một tỉnh: chữ cái đầu của hai từ cuối trong tên.
 *
 * Bỏ tiền tố hành chính vì nó không phân biệt được gì — "Thành phố Hà Nội" và "Thành phố
 * Hải Phòng" cùng bắt đầu bằng "TP". Hai từ CUỐI mới là tên riêng: `HN`, `HP`, `ĐN`.
 */
function provinceMark(name: string | undefined): string {
  const words = (name ?? "Hà Nội").trim().split(/\s+/).slice(-2);
  return words.map((w) => w.charAt(0).toLocaleUpperCase("vi")).join("");
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
        {/* Dấu hiệu nhận dạng phải là một CÁI TÊN.
            `province_code` là `"01"` — trên màn hình nó đọc thành số thứ tự của một danh
            sách, không thành "Hà Nội". Chữ đầu của tên tỉnh thì luôn là chữ, luôn khác nhau
            giữa 34 tỉnh, và khớp với thứ mà người xem gọi nơi này. */}
        <div
          className="flex h-12 items-center justify-center border-b border-hairline text-heading font-semibold tracking-wide text-ink"
          title={`EVCS Atlas · ${manifest?.province?.province_name ?? "Hà Nội"}`}
        >
          {provinceMark(manifest?.province?.province_name)}
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
              {/* `TooltipTrigger` và `PopoverTrigger` đều tự dựng một `<button>`; lồng thêm
                  một `<button>` con vào trong tạo `<button><button>` — HTML không hợp lệ,
                  React báo lỗi mỗi lần render, và bàn phím thấy hai điểm dừng tab cho một
                  điều khiển. `render` đã là cơ chế để hai trigger dùng CHUNG một phần tử,
                  nên nút thật chính là phần tử đó. */}
              <TooltipTrigger
                render={<PopoverTrigger />}
                aria-label="Chọn nền bản đồ"
                className="grid h-9 w-9 place-items-center rounded border border-transparent text-ink-2 hover:border-hairline hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Palette className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="right">Nền bản đồ</TooltipContent>
            </Tooltip>
            <PopoverContent side="right" align="end" className="w-48 p-2 z-50">
              <div className="text-body font-semibold tracking-wider text-ink uppercase mb-2">
                Nền bản đồ
              </div>
              <div className="flex flex-col gap-1">
                {basemapOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onSelectBasemap(opt.id)}
                    className={`flex items-center gap-2.5 px-2 py-1.5 text-title rounded border text-left cursor-pointer transition-colors ${
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
              className="grid h-9 w-9 place-items-center rounded border border-transparent font-bold text-note text-ink-2 hover:border-hairline hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
