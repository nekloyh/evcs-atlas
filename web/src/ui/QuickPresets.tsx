import { useMemo } from "react";

import { useStore } from "../state/store";
import {
  availablePresets,
  isPresetActive,
  presetBoundLabel,
  type PresetStats,
} from "../state/presets";

export interface QuickPresetsProps {
  stats: PresetStats;
}

/**
 * Phase 5 §2 — dải Quick Preset.
 *
 * Component này cố tình KHÔNG BIẾT GÌ về nội dung của một preset. Nó không chứa ngưỡng nào,
 * không chứa bậc công suất nào, và không xếp thứ tự lời gọi store nào:
 *
 * - Preset nào hiện được là do `availablePresets` quyết (preset giải ra `null` thì **ẩn**,
 *   không phải hiện mà bấm không được — một nút trơ là một lời khẳng định rằng phép phân
 *   tích ấy tồn tại).
 * - Trạng thái "đang bật" được SUY RA từ `filterEquals` + `field`, không lưu. Lưu nó lại sẽ
 *   là nguồn sự thật thứ hai, và nó lệch ngay khoảnh khắc người dùng kéo histogram trúng
 *   đúng khoảng của preset — lúc ấy nút phải sáng, và nó sáng.
 * - Áp preset là MỘT `applyPreset`, không phải `setField` rồi `setFilter`. Thứ tự hai lời
 *   gọi ấy quyết định kết quả (§2.6), và mã hoá thứ tự vào một component là đúng thứ side
 *   effect ẩn mà phase này cấm.
 * - Bấm lại preset đang bật gọi `clearFilter("user")`: khôi phục tập đầy đủ nhưng GIỮ NGUYÊN
 *   trường. Trả trường về nữa sẽ làm bản đồ dịch chuyển vì một thao tác lọc (§0.4-1).
 */
export function QuickPresets({ stats }: QuickPresetsProps) {
  const field = useStore((s) => s.field);
  const activeFilter = useStore((s) => s.filter.active);
  const applyPreset = useStore((s) => s.applyPreset);
  const clearFilter = useStore((s) => s.clearFilter);

  const entries = useMemo(() => availablePresets(stats), [stats]);

  // Viết `!entries.length` chứ không `entries.length === 0`: §7.6-42 cấm MỌI literal số ở vị
  // trí mã trong tệp này, và một phép kiểm chặt tuyệt đối bắt được ngưỡng lọt vào, còn một
  // phép kiểm có ngoại lệ thì bắt được đúng những gì người viết ngoại lệ nghĩ tới.
  if (!entries.length) {
    return (
      <p className="text-note text-ink-muted">
        Gói dữ liệu này chưa có cột nào để dựng câu hỏi nhanh.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(({ preset, filter }) => {
        const active = isPresetActive(preset, filter, activeFilter, field);
        const bound = presetBoundLabel(filter);
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active}
            title={preset.question}
            onClick={() => (active ? clearFilter("user") : applyPreset(preset, filter))}
            className={`min-w-0 cursor-pointer rounded-xs border px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "border-ink bg-basemap text-ink"
                : "border-hairline text-ink-2 hover:bg-basemap/60"
            }`}
          >
            <span className="block truncate text-note font-semibold">{preset.label}</span>
            {/* Biên đã giải in kèm: một phân vị mà giá trị của nó bị giấu là một con số
                người đọc không kiểm được (§2.4). */}
            {bound && (
              <span className="block truncate font-mono text-[10px] tabular-nums text-ink-muted">
                {bound}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
