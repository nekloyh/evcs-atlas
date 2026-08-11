import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export const Sheet = BaseDialog.Root;
export const SheetTrigger = BaseDialog.Trigger;
export const SheetClose = BaseDialog.Close;

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> {
  side?: "top" | "bottom" | "left" | "right";
  showClose?: boolean;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "right", className, children, showClose = true, ...props }, ref) => (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/20 backdrop-blur-xs transition-opacity animate-in fade-in-0" />
      <BaseDialog.Popup
        ref={ref}
        className={cn(
          "fixed z-50 bg-panel border-hairline shadow-sheet transition ease-out duration-200 outline-none flex flex-col",
          {
            "top-0 bottom-0 right-0 w-full sm:w-[360px] border-l": side === "right",
            "top-0 bottom-0 left-0 w-full sm:w-[360px] border-r": side === "left",
            "bottom-0 left-0 right-0 max-h-[85vh] border-t rounded-t-lg": side === "bottom",
            "top-0 left-0 right-0 max-h-[85vh] border-b rounded-b-lg": side === "top",
          },
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <BaseDialog.Close className="absolute right-3 top-3 grid h-7 w-7 place-items-center border border-transparent text-ink-2 hover:border-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
            <X className="h-4 w-4" />
            <span className="sr-only">Đóng</span>
          </BaseDialog.Close>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
);
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1 p-4 border-b border-hairline bg-basemap/50", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

export const SheetTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("text-xs font-semibold tracking-wider text-ink uppercase", className)} {...props} />
);
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-[11px] text-ink-2", className)} {...props} />
);
SheetDescription.displayName = "SheetDescription";
