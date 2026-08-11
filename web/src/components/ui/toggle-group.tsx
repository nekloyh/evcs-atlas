import * as React from "react";
import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "../../lib/utils";

export const Toggle = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseToggle>
>(({ className, ...props }, ref) => (
  <BaseToggle
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center text-[11px] font-medium transition-colors border border-transparent text-ink-2 hover:border-hairline hover:text-ink data-[pressed]:border-ink data-[pressed]:bg-basemap data-[pressed]:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer px-2 py-1",
      className
    )}
    {...props}
  />
));
Toggle.displayName = "Toggle";

export const ToggleGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseToggleGroup>
>(({ className, ...props }, ref) => (
  <BaseToggleGroup
    ref={ref}
    className={cn("flex items-center gap-1", className)}
    {...props}
  />
));
ToggleGroup.displayName = "ToggleGroup";
