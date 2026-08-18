import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "../../lib/utils";

export const TooltipProvider = BaseTooltip.Provider;
export const Tooltip = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;

export interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> {
  sideOffset?: number;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, side = "top", align = "center", sideOffset = 6, ...props }, ref) => (
    <BaseTooltip.Portal>
      {/* `z-index` ở POSITIONER, không ở Popup — xem lý do đầy đủ ở `popover.tsx`.
          Tooltip cao hơn popover một bậc vì nó chú thích được cả nút bên trong popover. */}
      <BaseTooltip.Positioner className="z-60" side={side} align={align} sideOffset={sideOffset}>
        <BaseTooltip.Popup
          ref={ref}
          className={cn(
            // `bg-ink text-panel`, KHÔNG `bg-foreground text-background`: hai token sau
            // không tồn tại trong `@theme` (`index.css`), nên Tailwind không phát ra luật
            // nào và tooltip rơi về **nền trong suốt + mực thừa kế** — chữ đen đè thẳng lên
            // bản đồ. Cùng họ lỗi với `text-ink-1`/`border-cold` đã gỡ khỏi `LayersTab`:
            // một class sai chính tả không báo lỗi ở đâu cả, nó chỉ lặng lẽ không làm gì.
            // Đo: `#0b0b0b` trên `#f9f9f7` = 18,67:1.
            "z-60 max-w-xs overflow-hidden rounded-xs bg-ink px-2.5 py-1 text-body font-medium text-panel shadow-float animate-in fade-in-0 zoom-in-95 pointer-events-none",
            className
          )}
          {...props}
        />
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
);
TooltipContent.displayName = "TooltipContent";
