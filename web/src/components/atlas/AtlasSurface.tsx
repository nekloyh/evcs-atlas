import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Vỏ thị giác dùng chung cho MỌI mặt nổi neo trên bản đồ.
 *
 * `rounded-sm` (3 px) đổi sang bán kính token — xem `--radius-surface` trong `index.css`.
 * Viền cũng đổi vai: một hairline ĐỤC quanh một tấm đã có bóng là vẽ đường bao hai lần, và
 * ở bán kính lớn thì nét đục ấy lộ ra từng bậc răng cưa ở bốn góc. Viền trắng mờ phía trong
 * + bóng phía ngoài là cách các panel nổi của CARTO/Kepler tách khỏi nền: cạnh bắt sáng,
 * không phải cạnh kẻ chì.
 */
export function AtlasSurface({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden rounded-[var(--radius-surface)]",
        "border border-white/60 bg-panel/92 text-ink shadow-float backdrop-blur-xl",
        "ring-1 ring-black/[0.06]",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

/**
 * Đầu tấm — KHÔNG có nền riêng.
 *
 * `bg-basemap/60` cũ vẽ một dải xám ngang đỉnh mỗi panel; với ba panel cùng mở, ba dải ấy
 * là thứ đập vào mắt trước cả dữ liệu. Thứ bậc ở đây do CHỮ và KHOẢNG TRỐNG dựng, không do
 * một mảng nền: tiêu đề đậm hơn, thân nhạt hơn, và một hairline mảnh ngăn hai bên.
 */
export function AtlasSurfaceHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-hairline/70 px-3.5 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export function AtlasSurfaceBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-3.5 py-3", className)} {...props} />;
}

export function AtlasSurfaceFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 border-t border-hairline/70 bg-basemap/30 px-3.5 py-3", className)}
      {...props}
    />
  );
}
