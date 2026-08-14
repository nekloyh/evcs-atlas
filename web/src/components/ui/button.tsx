import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "secondary" | "subtle";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap text-title font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
          {
            "bg-foreground text-background hover:bg-foreground/90":
              variant === "default",
            "border border-hairline bg-panel hover:bg-basemap text-ink":
              variant === "outline",
            "text-ink-2 hover:bg-surface-hover hover:text-ink":
              variant === "ghost",
            "bg-basemap text-ink hover:bg-surface-hover border border-transparent":
              variant === "secondary",
            "text-ink-muted hover:text-ink hover:bg-basemap/60":
              variant === "subtle",
          },
          {
            "h-8 px-3 py-1.5": size === "default",
            "h-7 px-2.5 text-body": size === "sm",
            "h-9 px-4 text-heading": size === "lg",
            "h-8 w-8 p-0 grid place-items-center": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
