import type * as React from "react";

export interface MetricItem {
  label: string;
  value: string;
}

export function TopMetricsSlot({ items }: { items: MetricItem[] }) {
  if (items.length === 0) {
    return <p className="text-note text-ink-muted">Đang nạp tổng quan…</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-note text-ink-muted">{item.label}</dt>
          <dd className="truncate font-mono text-title font-semibold tabular-nums text-ink">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface LensItem {
  id: string;
  label: string;
  hint: string;
  disabled?: boolean;
}

export function LensSelectorSlot({
  items,
  active,
  onSelect,
}: {
  items: LensItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Chọn lens phân tích" className="grid grid-cols-2 gap-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={active === item.id}
          disabled={item.disabled}
          title={item.hint}
          onClick={() => onSelect(item.id)}
          className={`min-w-0 rounded-xs border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            active === item.id
              ? "border-ink bg-basemap text-ink"
              : "border-hairline text-ink-2 hover:bg-basemap/60"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <span className="block truncate text-note font-semibold">{item.label}</span>
          <span className="block truncate text-[10px] text-ink-muted">{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

function PassThrough({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const SearchSlot = PassThrough;
export const PresetsSlot = PassThrough;
export const LegendSlot = PassThrough;
export const ContextualChartSlot = PassThrough;

export function OverlayControlsSlot({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

export function OverlayControl({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      className={`cursor-pointer rounded-xs border px-2 py-1 text-note transition-colors ${
        pressed
          ? "border-ink bg-basemap font-semibold text-ink"
          : "border-hairline text-ink-2 hover:bg-basemap/60"
      }`}
    >
      {label}
    </button>
  );
}
