import type { Badge as BadgeData } from "../fields";

/**
 * Badge ⚠ — DESIGN.md §4e: trạng thái cảnh báo LUÔN kèm icon + chữ, không bao giờ chỉ
 * màu. §7: badge phải nói rõ đang nói nghĩa nào — phủ **ô** hay khuyết ở **nguồn**.
 */
export function Badge({ badge }: { badge: BadgeData }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 border border-warn/60 px-1 text-note leading-4 text-ink-2 tabular-nums"
      title={badge.explain}
    >
      <span aria-hidden className="text-warn">
        ⚠
      </span>
      {/* Nghĩa của badge nằm ngay trong chữ: "30% ô · 65% dân" (phủ ô) so với
          "nguồn 41%" (khuyết ở nguồn). Không có badge trần chỉ mang một con số. */}
      {badge.text}
    </span>
  );
}
