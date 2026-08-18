import * as React from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "../../lib/utils";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof BasePopover.Popup> {
  sideOffset?: number;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

/**
 * `z-index` phải nằm ở **POSITIONER**, không ở Popup — sửa 17/8/2026.
 *
 * Popup nằm trong Positioner, Positioner nằm trong một portal `<div>` gắn thẳng vào `body`.
 * Cả hai vỏ ấy mặc định `z-index: auto`, nên `z-50` viết trên Popup chỉ xếp hạng nó **bên
 * trong** ngữ cảnh xếp lớp của Positioner — ra tới gốc trang thì cả cụm vẫn là **z = 0**.
 *
 * Đủ để hỏng vì một lý do dễ bỏ sót: **một flex item có `z-index` tự tạo ngữ cảnh xếp lớp
 * kể cả khi `position: static`.** Nav rail và cột đọc đều là flex item mang `z-10`, nên
 * chrome của app đứng ở z = 10 còn mọi popover đứng ở z = 0 — popover dựng đúng chỗ, đúng
 * kích thước, `opacity: 1`, `visibility: visible`, và **không nhìn thấy được**. Trước đợt
 * 17/8/2026 lỗi này ngủ yên chỉ vì popover của rail mở ra trên vùng `<main>` (không có
 * `z-index`); dựng cột đọc ngay cạnh rail là nó lộ ra ngay.
 *
 * Đặt ở Positioner thì mọi bề mặt portal đứng trên toàn bộ chrome, bất kể chrome tự cho mình
 * z bao nhiêu. `elementFromPoint` là cổng bắt được nó: `getBoundingClientRect` báo popover
 * hoàn toàn bình thường.
 */
export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", side = "bottom", sideOffset = 6, ...props }, ref) => (
    <BasePopover.Portal>
      <BasePopover.Positioner className="z-50" side={side} sideOffset={sideOffset} align={align}>
        <BasePopover.Popup
          ref={ref}
          className={cn(
            "z-40 w-80 rounded-sm border border-hairline bg-panel p-3 text-ink shadow-float outline-none animate-in fade-in-0 zoom-in-95",
            className
          )}
          {...props}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  )
);
PopoverContent.displayName = "PopoverContent";
