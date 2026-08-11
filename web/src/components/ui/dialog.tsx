import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>
>(({ className, children, ...props }, ref) => (
  <BaseDialog.Portal>
    <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs animate-in fade-in-0" />
    <BaseDialog.Popup
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-hairline bg-panel p-6 shadow-float animate-in fade-in-0 zoom-in-95 outline-none rounded-sm",
        className
      )}
      {...props}
    >
      {children}
      <BaseDialog.Close className="absolute right-4 top-4 grid h-7 w-7 place-items-center border border-transparent text-ink-2 hover:border-hairline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
        <X className="h-4 w-4" />
        <span className="sr-only">Đóng</span>
      </BaseDialog.Close>
    </BaseDialog.Popup>
  </BaseDialog.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("text-sm font-semibold tracking-wide text-ink", className)} {...props} />
);
DialogTitle.displayName = "DialogTitle";
