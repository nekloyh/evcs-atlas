import * as React from "react";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cn } from "../../lib/utils";

export const Slider = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSlider.Root>
>(({ className, ...props }, ref) => (
  <BaseSlider.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <BaseSlider.Control className="relative flex w-full items-center">
      <BaseSlider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-active">
        <BaseSlider.Indicator className="absolute h-full bg-foreground" />
      </BaseSlider.Track>
      <BaseSlider.Thumb className="block h-4 w-4 rounded-full border border-hairline bg-panel shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-grab active:cursor-grabbing" />
    </BaseSlider.Control>
  </BaseSlider.Root>
));
Slider.displayName = "Slider";
