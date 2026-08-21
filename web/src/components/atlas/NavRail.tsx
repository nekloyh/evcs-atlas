import {
  Map as MapIcon,
  BookOpen,
  Database,
  Globe,
  Layers,
  Compass,
  Box,
  Palette,
  PanelLeftOpen,
  Check,
  SlidersHorizontal,
  Crosshair,
} from "lucide-react";
import type { Manifest } from "../../data/manifest";
import type { AppNavMode } from "../../state/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useIsDesktop } from "./use-desktop";

export interface NavRailProps {
  manifest: Manifest | null;
  activeMode: AppNavMode;
  storyEnabled: boolean;
  onSelectMode: (mode: AppNavMode) => void;
  basemapStyle: "voyager" | "positron" | "dark";
  onSelectBasemap: (style: "voyager" | "positron" | "dark") => void;
  viewMode: "2d" | "3d";
  onToggle2D3D: () => void;
  onResetView: () => void;
  /** Chỉ dùng dưới 1024 px, nơi cột đọc là sheet — xem `readColumnOpen` trong store. */
  readColumnOpen: boolean;
  onToggleReadColumn: () => void;
  layerCount: number;
  overlayControls: React.ReactNode;
  placementMode?: boolean;
  candidateActive?: boolean;
  onTogglePlacement?: () => void;
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
  readColumnOpen,
  onToggleReadColumn,
  layerCount,
  overlayControls,
  placementMode,
  candidateActive,
  onTogglePlacement,
}: NavRailProps) {
  const isDesktop = useIsDesktop();
  const tooltipSide = isDesktop ? "right" : "top";
  const basemapOptions = [
    { id: "voyager", label: "Voyager", color: "bg-[#d8e9eb]" },
    { id: "positron", label: "Light", color: "bg-[#f4f3ef]" },
    { id: "dark", label: "Dark", color: "bg-[#30343b]" },
  ] as const;

  return (
    <TooltipProvider>
      <nav
        /* KHÔNG `z-10` — cùng lý do với cột đọc: flex item có `z-index` tự tạo ngữ cảnh xếp
           lớp, và chính thanh này từng che mất popover của chính nó. Xem `ui/popover.tsx`. */
        className="flex h-14 w-full shrink-0 flex-row border-t border-hairline bg-panel select-none lg:h-full lg:w-14 lg:flex-col lg:border-r lg:border-t-0"
        aria-label="Thanh điều hướng ứng dụng"
      >
        {/* Header Badge */}
        {/* Dấu hiệu nhận dạng phải là một CÁI TÊN.
            `province_code` là `"01"` — trên màn hình nó đọc thành số thứ tự của một danh
            sách, không thành "Hà Nội". Chữ đầu của tên tỉnh thì luôn là chữ, luôn khác nhau
            giữa 34 tỉnh, và khớp với thứ mà người xem gọi nơi này. */}
        <div
          className="hidden h-12 items-center justify-center border-b border-hairline text-heading font-semibold tracking-wide text-ink lg:flex"
          title={`EVCS Atlas · ${manifest?.province?.province_name ?? "Hà Nội"}`}
        >
          {provinceMark(manifest?.province?.province_name)}
        </div>

        {/* Top Group: Primary Navigation Modes */}
        <div className="flex min-w-0 flex-1 flex-row items-center justify-around gap-1 px-2 lg:flex-none lg:flex-col lg:justify-start lg:gap-1.5 lg:px-0 lg:py-3">
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
            <TooltipContent side={tooltipSide}>Bản đồ điều tra</TooltipContent>
          </Tooltip>

          {/* Story Mode */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Chế độ Câu chuyện"
              aria-current={activeMode === "story" ? "page" : undefined}
              aria-disabled={!storyEnabled}
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
            <TooltipContent side={tooltipSide}>
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
            <TooltipContent side={tooltipSide}>Bảng dữ liệu & KPI</TooltipContent>
          </Tooltip>

          {/* National Mode */}
          <Tooltip>
            <TooltipTrigger
              aria-label="Chế độ Toàn quốc"
              aria-current={activeMode === "national" ? "page" : undefined}
              onClick={() => onSelectMode("national")}
              className={`grid h-9 w-9 place-items-center rounded border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeMode === "national"
                  ? "border-ink bg-basemap text-ink font-semibold"
                  : "border-transparent text-ink-2 hover:border-hairline hover:text-ink"
              }`}
            >
              <Globe className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side={tooltipSide}>Toàn quốc (34 tỉnh thành)</TooltipContent>
          </Tooltip>

          <div className="mx-1 h-6 w-px bg-hairline lg:my-1 lg:h-px lg:w-6" />

          {/*
            BỐI CẢNH — danh mục overlay, trong một POPOVER của thanh này (§3h).

            Trước đợt 17/8/2026 nó là một tab của workspace nổi, tức một danh mục 8 lớp phải
            đi qua một tấm che bản đồ mới tới được. Nó thuộc về đây vì §3a đã nói nav rail là
            chỗ "bật/tắt lớp": lớp bối cảnh không trả lời câu hỏi nào, nó chỉ giúp ĐỌC câu
            trả lời — nên nó là công cụ của ứng dụng, không phải một tiết của dòng đọc.

            Popover chứ không phải panel: nó được mở, dùng, rồi đóng. Đúng luật loại bề mặt —
            thứ chỉ đúng sau một hành động thì nổi, và tự biến mất khi bấm ra ngoài.
          */}
          {activeMode === "map" && <Popover>
            <Tooltip>
              {/* `render` để hai trigger dùng CHUNG một `<button>` — lồng hai button vào nhau
                  là HTML không hợp lệ và hai điểm dừng tab cho một điều khiển. */}
              <TooltipTrigger
                render={<PopoverTrigger />}
                aria-label="Lớp bối cảnh"
                className="relative grid h-9 w-9 place-items-center rounded border border-transparent text-ink-2 transition-colors hover:border-hairline hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Layers className="h-4 w-4" />
                {/* Số lớp đang bật phải đọc được KHI POPOVER ĐÓNG: đó là trạng thái duy nhất
                    của công cụ này còn nhìn thấy từ ngoài. Không có nó, bật ba lớp rồi đóng
                    popover là mất dấu — cùng lý do rail thu gọn cũ mang một chấm. */}
                {layerCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-cold-2 px-0.5 font-mono text-[9px] leading-none text-white">
                    {layerCount}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>Lớp bối cảnh</TooltipContent>
            </Tooltip>
            <PopoverContent
              side={tooltipSide}
              align="start"
              /* Cao tối đa 78% khung nhìn rồi cuộn BÊN TRONG: danh mục 8 lớp có lớp mở ra
                 kèm cả đoạn cảnh báo nguồn, nên nó dài theo thứ đang bật chứ không cố định.
                 Không `sticky` gì bên trong — §11-13. */
              className="z-50 max-h-[78vh] w-[340px] overflow-y-auto p-0"
            >
              <div className="eyebrow border-b border-hairline px-2 py-1.5">BỐI CẢNH</div>
              {overlayControls}
            </PopoverContent>
          </Popover>}

          {/* Trạm giả định (Phase 6, §3.1) */}
          {activeMode === "map" && onTogglePlacement && (
            <Tooltip>
              <TooltipTrigger
                aria-label="Trạm giả định"
                aria-pressed={placementMode || candidateActive}
                onClick={onTogglePlacement}
                className={`relative grid h-9 w-9 place-items-center rounded border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  placementMode
                    ? "border-emerald-400 bg-emerald-950/60 text-emerald-300 font-semibold ring-2 ring-emerald-500/50"
                    : candidateActive
                    ? "border-emerald-500 bg-emerald-950/30 text-emerald-400"
                    : "border-transparent text-ink-2 hover:border-hairline hover:text-ink"
                }`}
              >
                <Crosshair className="h-4 w-4" />
                {candidateActive && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-2 w-2 rounded-full bg-emerald-400" />
                )}
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>
                {placementMode
                  ? "Bấm vào bản đồ để đặt trạm (Esc để huỷ)"
                  : candidateActive
                  ? "Đang xem trạm giả định (bấm để xoá)"
                  : "Đặt trạm giả định (Mô phỏng)"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Cột đọc — CHỈ trên màn hẹp, nơi nó là sheet phủ thay vì một cột trong luồng.
              Trên màn rộng cột không đóng được (§3h), nên một nút bật/tắt nó ở đây sẽ là một
              nút không có trạng thái nào để chuyển — đúng loại nói dối bằng giao diện mà §3a
              cấm ở chính thanh này. */}
          {(activeMode === "map" || activeMode === "story") && !isDesktop && (
            <Tooltip>
              <TooltipTrigger
                aria-label={activeMode === "story" ? "Mở cột cảnh" : "Mở cột đọc"}
                aria-expanded={readColumnOpen}
                onClick={onToggleReadColumn}
                className={`grid h-9 w-9 place-items-center rounded border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  readColumnOpen
                    ? "border-ink bg-basemap text-ink"
                    : "border-transparent text-ink-2 hover:border-hairline hover:text-ink"
                }`}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>
                {activeMode === "story" ? "Cột cảnh câu chuyện" : "Cột đọc bản đồ"}
              </TooltipContent>
            </Tooltip>
          )}

          {activeMode === "map" && !isDesktop && (
            <Popover>
              <Tooltip>
                <TooltipTrigger
                  render={<PopoverTrigger />}
                  aria-label="Công cụ bản đồ"
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded border border-transparent text-ink-2 hover:border-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="top">Công cụ bản đồ</TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="end" className="z-50 w-56 p-2">
                <div className="eyebrow mb-2">CÔNG CỤ BẢN ĐỒ</div>
                <div className="space-y-1">
                  {basemapOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectBasemap(opt.id)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded border px-2 py-1.5 text-left text-title ${basemapStyle === opt.id ? "border-ink bg-basemap text-ink" : "border-transparent text-ink-2 hover:bg-surface-hover"}`}
                    >
                      <span className={`h-3.5 w-5 rounded-xs border border-hairline ${opt.color}`} />
                      <span className="flex-1">Nền {opt.label}</span>
                      {basemapStyle === opt.id && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                  <button type="button" onClick={onResetView} className="flex w-full cursor-pointer items-center gap-2 rounded border border-transparent px-2 py-1.5 text-title text-ink-2 hover:bg-surface-hover">
                    <Compass className="h-3.5 w-3.5" /> Về trung tâm tỉnh
                  </button>
                  <button type="button" onClick={onToggle2D3D} className="flex w-full cursor-pointer items-center gap-2 rounded border border-transparent px-2 py-1.5 text-title text-ink-2 hover:bg-surface-hover">
                    <Box className="h-3.5 w-3.5" /> Chuyển sang {viewMode === "2d" ? "3D" : "2D"}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Bottom Group: GIS Controls & Tools */}
        {activeMode === "map" && <div className="mt-auto hidden flex-col items-center gap-1.5 border-t border-hairline py-3 lg:flex">
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
              <TooltipContent side={tooltipSide}>Nền bản đồ</TooltipContent>
            </Tooltip>
            <PopoverContent side={tooltipSide} align="end" className="w-48 p-2 z-50">
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
            <TooltipContent side={tooltipSide}>Về trung tâm tỉnh</TooltipContent>
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
            <TooltipContent side={tooltipSide}>Góc nhìn {viewMode.toUpperCase()}</TooltipContent>
          </Tooltip>
        </div>}
      </nav>
    </TooltipProvider>
  );
}
