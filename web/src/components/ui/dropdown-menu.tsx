import * as React from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "../../lib/utils";

export const DropdownMenu = BaseMenu.Root;
export const DropdownMenuTrigger = BaseMenu.Trigger;

export const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Popup> & { sideOffset?: number }
>(({ className, sideOffset = 4, ...props }, ref) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner sideOffset={sideOffset}>
      <BaseMenu.Popup
        ref={ref}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-sm border border-hairline bg-panel p-1 text-ink shadow-float animate-in fade-in-0 zoom-in-95 outline-none",
          className
        )}
        {...props}
      />
    </BaseMenu.Positioner>
  </BaseMenu.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Item>
>(({ className, ...props }, ref) => (
  <BaseMenu.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center px-2 py-1.5 text-[11px] font-medium outline-none hover:bg-surface-hover hover:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";
