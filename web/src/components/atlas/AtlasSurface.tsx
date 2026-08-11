import * as React from "react";

import { cn } from "../../lib/utils";

/** Visual shell shared by every map-anchored UI surface. */
export function AtlasSurface({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden rounded-sm border border-hairline bg-panel/95 text-ink shadow-float backdrop-blur-md",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function AtlasSurfaceHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 items-center border-b border-hairline bg-basemap/60 px-3 py-2", className)} {...props} />;
}

export function AtlasSurfaceBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", className)} {...props} />;
}

export function AtlasSurfaceFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shrink-0 border-t border-hairline bg-basemap/40 p-3", className)} {...props} />;
}
