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

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", side = "bottom", sideOffset = 6, ...props }, ref) => (
    <BasePopover.Portal>
      <BasePopover.Positioner side={side} sideOffset={sideOffset} align={align}>
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
