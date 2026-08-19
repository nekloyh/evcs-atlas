import type * as React from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { useIsDesktop } from "./use-desktop";

export interface ReadColumnSlots {
  search: (onResultSelect?: () => void) => React.ReactNode;
  /**
   * Dải Quick Preset — Phase 5 §5, đặt NGAY CẠNH ô tìm kiếm.
   *
   * Cạnh nhau vì đó là hai lối vào của cùng một câu hỏi "bắt đầu từ đâu", nhưng chúng viết
   * vào hai chỗ khác hẳn: tìm kiếm viết camera + selection, preset viết field + filter.
   * Không cái nào kích hoạt cái kia (§3).
   */
  presets: React.ReactNode;
  topMetrics: React.ReactNode;
  lensSelector: React.ReactNode;
  question: React.ReactNode;
  questionAction?: React.ReactNode;
  legend: React.ReactNode;
  contextualChart: React.ReactNode;
  limits: React.ReactNode;
  nextSteps: React.ReactNode;
  overlayControls: React.ReactNode;
  footer: React.ReactNode;
}

export interface ReadColumnProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: ReadColumnSlots;
}

function Section({
  title,
  hint,
  action,
  last = false,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`px-3 py-3 ${last ? "" : "border-b border-hairline"}`}>
      <div className="flex items-baseline gap-2">
        <h2 className="eyebrow shrink-0">{title}</h2>
        {hint && <span className="min-w-0 flex-1 truncate text-note text-ink-muted">{hint}</span>}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ReadColumnContent({
  slots,
  onSearchResultSelect,
}: {
  slots: ReadColumnSlots;
  onSearchResultSelect?: () => void;
}) {
  return (
    <>
      <div className={`shrink-0 border-b border-hairline bg-panel px-3 py-2.5 ${onSearchResultSelect ? "pr-12" : ""}`}>
        {slots.search(onSearchResultSelect)}
        <div className="mt-2">{slots.presets}</div>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <Section title="TỔNG QUAN">{slots.topMetrics}</Section>
        <Section title="LENS" hint="góc nhìn phân tích">{slots.lensSelector}</Section>
        <Section title="CÂU HỎI" action={slots.questionAction}>{slots.question}</Section>
        <Section title="TÍN HIỆU" hint="màu trên bản đồ nghĩa là gì">
          <div className="space-y-3">
            {slots.legend}
            {slots.contextualChart}
          </div>
        </Section>
        <Section title="GIỚI HẠN" hint="đọc trước khi tin">{slots.limits}</Section>
        <Section title="ĐI TIẾP" hint="từ cả tập sang một đối tượng" last>
          <div className="space-y-2">
            {slots.nextSteps}
            {slots.overlayControls}
          </div>
        </Section>
      </div>
      {slots.footer}
    </>
  );
}

/** Pure composition layer: chỉ đặt slot và chọn inline column hay mobile sheet. */
export function ReadColumn({ open, onOpenChange, slots }: ReadColumnProps) {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return (
      <aside
        className="flex h-full w-[320px] shrink-0 flex-col border-r border-hairline bg-panel text-ink min-[1440px]:w-[340px]"
        aria-label="Cột đọc bản đồ"
      >
        <ReadColumnContent slots={slots} />
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex h-full w-full flex-col border-r border-hairline bg-panel p-0 text-ink sm:w-[344px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Cột đọc bản đồ</SheetTitle>
        </SheetHeader>
        <ReadColumnContent slots={slots} onSearchResultSelect={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
