/**
 * Phase 4 — Filter Summary (PHASE4_VISUALIZATION.md §2.1).
 *
 * Dòng tóm tắt BẮT BUỘC của một bộ lọc đang bật: predicate, kept/eligible/total, số
 * hàng khuyết bị loại, và một hành động xoá. Thiếu nó thì mark bị ẩn đọc thành dữ
 * liệu không có.
 */

import { useEffect, useState } from "react";

import type { AnalysisFilter, FilterClearReason } from "../state/filter";
import { FILTER_CLEAR_MESSAGES, POWER_TIER_LABELS, describeFilter } from "../state/filter";

/** kept/eligible/total của bộ lọc đang bật — tính MỘT LẦN ở App, §5.2. */
export interface FilterCounts {
  kept: number;
  eligible: number;
  total: number;
  excludedNull: number;
}

export function FilterSummary({
  filter,
  keptCount,
  eligibleCount,
  totalCount,
  excludedNullCount = 0,
  onClear,
}: {
  filter: AnalysisFilter | null;
  keptCount?: number;
  eligibleCount?: number;
  totalCount?: number;
  excludedNullCount?: number;
  onClear: () => void;
}) {
  if (!filter) return null;

  let desc = "";
  if (filter.entity === "h3-cell" && filter.field === "population" && filter.op === "between") {
    if (filter.lo === 0 && filter.hi === 0) {
      desc = "Dân số = 0 người";
    } else {
      desc = `Dân số ${filter.lo.toLocaleString("vi-VN")} – ${filter.hi.toLocaleString("vi-VN")} người`;
    }
  } else if (filter.entity === "station" && filter.field === "power-tier" && filter.op === "in") {
    const labels = filter.values.map((v) => POWER_TIER_LABELS[v]?.label ?? v).join(", ");
    desc = `Cấp công suất: ${labels}`;
  } else {
    desc = "Bộ lọc phân tích";
  }

  const shareText =
    keptCount !== undefined && eligibleCount !== undefined && totalCount !== undefined && eligibleCount > 0
      ? ` · ${keptCount.toLocaleString("vi-VN")}/${eligibleCount.toLocaleString("vi-VN")} đủ điều kiện · ${totalCount.toLocaleString("vi-VN")} tổng (${((keptCount / eligibleCount) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)`
      : "";

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-xs border border-ink/20 bg-basemap/60 px-2 py-1 text-note text-ink"
      role="status"
      aria-label={`Bộ lọc đang áp dụng: ${desc}`}
    >
      <div className="flex items-center gap-1.5 min-w-0 truncate">
        <span className="font-semibold text-ink-2 shrink-0">Tập lọc:</span>
        <span className="truncate text-ink font-mono">{desc}</span>
        {shareText && <span className="shrink-0 text-ink-muted">{shareText}</span>}
        {excludedNullCount > 0 && (
          <span className="shrink-0 text-ink-muted">
            · loại {excludedNullCount.toLocaleString("vi-VN")} khuyết
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="shrink-0 cursor-pointer rounded-xs px-1.5 py-0.5 text-note font-semibold text-ink hover:bg-basemap hover:text-black border border-hairline transition-colors"
        title="Xoá bộ lọc phân tích"
      >
        Xoá lọc ✕
      </button>
    </div>
  );
}

/**
 * Chip tóm tắt bộ lọc, neo trên BẢN ĐỒ.
 *
 * `FilterSummary` sống trong khe biểu đồ của cột ĐỌC, mà cột ấy đóng được (sheet dưới
 * 1024 px) và cuộn được. Khi nó khuất, bộ lọc vẫn đang giấu mark trên bản đồ nhưng không
 * còn dòng nào nói ra điều đó — đúng tình huống §2.1 cấm. Chip này là bảo đảm tối thiểu:
 * luôn thấy, luôn xoá được, ngay cạnh thứ đang bị lọc.
 */
export function FilterChip({
  filter,
  counts,
  onClear,
}: {
  filter: AnalysisFilter | null;
  counts?: FilterCounts | null;
  onClear: () => void;
}) {
  if (!filter) return null;
  const desc = describeFilter(filter);
  return (
    <div
      className="pointer-events-auto flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-1.5 rounded-xs border border-ink/25 bg-panel/95 px-2 py-1 text-note shadow-xs backdrop-blur-sm"
      role="status"
      aria-label={`Bộ lọc đang áp dụng: ${desc}`}
    >
      <span className="shrink-0 font-semibold text-ink-2">Tập lọc</span>
      <span className="min-w-0 truncate font-mono text-ink">{desc}</span>
      {counts && (
        <span className="shrink-0 tabular-nums text-ink-muted">
          {counts.kept.toLocaleString("vi-VN")}/{counts.eligible.toLocaleString("vi-VN")}
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 cursor-pointer rounded-xs border border-hairline px-1 py-0.5 font-semibold text-ink hover:bg-basemap"
        title="Xoá bộ lọc phân tích"
      >
        Xoá ✕
      </button>
    </div>
  );
}

/**
 * Vùng thông báo một lần khi bộ lọc bị XOÁ vì đổi Lens/trường (§2.3).
 *
 * Tự tắt sau `HIDE_MS`: một câu giải thích cho một hành động đã xong không nên nằm lại
 * trên màn hình mãi. `key` theo `revision` để hai lần xoá liên tiếp đọc lại được câu mới.
 */
const HIDE_MS = 6000;

export function FilterClearedNotice({
  reason,
  revision,
}: {
  reason: FilterClearReason | null;
  revision: number;
}) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const id = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(id);
  }, [revision, reason]);

  // Chỉ nói khi lý do KHÔNG phải do người dùng tự bấm: họ vừa bấm "Xoá lọc" thì họ đã biết.
  if (!reason || reason === "user" || !shown) return null;
  return (
    <p className="rounded-xs border border-hairline bg-basemap/60 px-2 py-1 text-note text-ink-2" role="status">
      {FILTER_CLEAR_MESSAGES[reason]}
    </p>
  );
}
