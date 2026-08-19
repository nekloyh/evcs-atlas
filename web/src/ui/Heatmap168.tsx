/**
 * Phase 4 — Utilization: Week Heatmap 7x24 (PHASE4_VISUALIZATION.md §1.5).
 *
 * Chart ID: utilization-week-heatmap
 * 168-hour matrix, port-weighted Σocc/Σn_ports over IN stations only.
 * Emits TimeCursorSet(t) on cell click.
 */

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";

import { DOW_LABELS, dowOf, hourOf, tOf } from "../state/types";
import { BASEMAP_HEX, HATCH_HEX, INK_HEX, INK_MUTED_HEX, classOf, rampFor, type RGB, type Scale } from "../viz/palette";
import type { UtilizationHourCell } from "../viz/chart-models";
import { OBSERVED_H_MIN } from "../viz/occ";
import { Readout } from "./Readout";
import { CHART_W } from "./chart-size";



export const HEAT_W = CHART_W;
export const HEAT_M = { left: 26, right: 8 };

const W = HEAT_W;
const H = 152;
const M = { left: HEAT_M.left, right: HEAT_M.right, top: 14, bottom: 18 };

const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const HATCH_ID = "heat-thin-hatch";
const rgbCss = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;

const cellX = (hour: number) => M.left + (hour / 24) * PLOT_W;
const cellY = (dow: number) => M.top + (dow / 7) * PLOT_H;
const CELL_W = PLOT_W / 24;
const CELL_H = PLOT_H / 7;

export function Heatmap168({
  cells,
  scale,
  t,
  onTimeIntent,
  disabledReason,
}: {
  cells: UtilizationHourCell[];
  scale: Scale | null;
  t: number;
  onTimeIntent?: (t: number) => void;
  disabledReason?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hoverCell, setHoverCell] = useState<UtilizationHourCell | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !scale || cells.length === 0) return;
    const { colors } = rampFor(scale, "high-bad");

    const chart = Plot.plot({
      width: W,
      height: H,
      marginLeft: M.left,
      marginRight: M.right,
      marginTop: M.top,
      marginBottom: M.bottom,
      style: { background: "transparent", fontSize: "9px", color: INK_MUTED_HEX },
      color: { type: "identity" },
      x: {
        domain: Array.from({ length: 24 }, (_, i) => i),
        ticks: [0, 6, 12, 18],
        tickFormat: (d: number) => `${d}h`,
        label: null,
      },
      y: {
        domain: Array.from({ length: 7 }, (_, i) => i),
        tickFormat: (d: number) => DOW_LABELS[d] ?? "",
        label: null,
      },
      marks: [
        Plot.cell(cells, {
          x: "hour",
          y: "dow",
          fill: (d: UtilizationHourCell) => {
            if (d.value === null) return `url(#${HATCH_ID})`;
            const k = classOf(d.value, scale);
            if (k === null) return `url(#${HATCH_ID})`;
            return rgbCss(colors[k] ?? colors[0]!);
          },
          inset: 0.5,
        }),
      ],
    });

    const svg = chart.querySelector("svg") ?? chart;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <pattern id="${HATCH_ID}" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="${BASEMAP_HEX}" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="${HATCH_HEX}" stroke-width="1.25" />
      </pattern>
    `;
    svg.prepend(defs);

    el.append(chart);
    return () => chart.remove();
  }, [cells, scale]);

  if (disabledReason) {
    return (
      <div className="py-6 text-center text-body text-ink-muted">
        <p className="font-semibold text-ink-2">Dữ liệu vận hành chưa khả dụng</p>
        <p className="mt-1 text-note">{disabledReason}</p>
      </div>
    );
  }

  const curDow = dowOf(t);
  const curHour = hourOf(t);

  const moveKeyboardCursor = (cell: UtilizationHourCell, event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextDow = cell.dow;
    let nextHour = cell.hour;
    if (event.key === "ArrowLeft") nextHour = Math.max(0, cell.hour - 1);
    else if (event.key === "ArrowRight") nextHour = Math.min(23, cell.hour + 1);
    else if (event.key === "ArrowUp") nextDow = Math.max(0, cell.dow - 1);
    else if (event.key === "ArrowDown") nextDow = Math.min(6, cell.dow + 1);
    else return;
    event.preventDefault();
    const nextT = tOf(nextDow, nextHour);
    onTimeIntent?.(nextT);
    cellRefs.current[nextT]?.focus();
  };

  return (
    <div className="select-none min-w-0">
      {/* ĐƠN VỊ in ngay trên biểu đồ, không chỉ trong tooltip: §6.6 mục 44 nói tooltip
          không được là nơi DUY NHẤT nói ra đơn vị — người quét mắt qua tấm nhiệt đồ mà
          không rê chuột vẫn phải biết màu đang đo cái gì. */}
      <div className="flex items-baseline justify-between pb-1 text-note text-ink-muted">
        <span>giờ trong tuần</span>
        <span>% cổng IN bị chiếm, trọng số theo cổng</span>
      </div>
      <div
        className="relative cursor-pointer touch-none"
        style={{ width: W, height: H }}
        onPointerLeave={() => setHoverCell(null)}
        role="region"
        aria-label="Heatmap 168 giờ trong tuần. Dùng phím mũi tên hoặc bấm một ô để chọn khung giờ."
      >
        <div ref={host} />

        {/* Native controls provide an exact pointer target and a roving keyboard cursor. */}
        {cells.map((cell) => (
          <button
            key={cell.t}
            ref={(node) => { cellRefs.current[cell.t] = node; }}
            type="button"
            tabIndex={cell.t === t ? 0 : -1}
            aria-pressed={cell.t === t}
            aria-label={`${DOW_LABELS[cell.dow]} ${cell.hour}h; ${
              cell.value === null
                ? "không đủ dữ liệu"
                : `${(cell.value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% tải`
            }; ${cell.contributingStations} trạm, ${cell.contributingPorts}/${cell.allInPorts} cổng; ${cell.portWeightedObsHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ quan sát có trọng số`}
            onClick={() => onTimeIntent?.(cell.t)}
            onFocus={() => setHoverCell(cell)}
            onBlur={() => setHoverCell(null)}
            onPointerEnter={() => setHoverCell(cell)}
            onKeyDown={(event) => moveKeyboardCursor(cell, event)}
            className="absolute z-[1] border-0 bg-transparent p-0 outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            style={{
              left: cellX(cell.hour),
              top: cellY(cell.dow),
              width: CELL_W,
              height: CELL_H,
            }}
          />
        ))}

        {/* High contrast outline for current time t */}
        <div
          className="pointer-events-none absolute border-2"
          style={{
            left: cellX(curHour) + 0.5,
            top: cellY(curDow) + 0.5,
            width: Math.max(1, CELL_W - 1),
            height: Math.max(1, CELL_H - 1),
            borderColor: INK_HEX,
            borderRadius: "1px",
          }}
        />
      </div>

      {/* Gợi ý phải mô tả thứ BẤM ĐƯỢC. Không có `onTimeIntent` — trong một cảnh, giờ do
          cảnh sở hữu (§2.6) — thì ô giờ không nhận cú bấm nào, và một dòng "bấm vào…" ở đó
          là một lời hứa giao diện không giữ. */}
      <Readout hint={onTimeIntent ? "bấm vào một ô giờ để chuyển vị trí scrubber" : undefined}>
        {hoverCell && (
          <>
            <span className="font-semibold text-ink">
              {DOW_LABELS[hoverCell.dow]} {hoverCell.hour}h
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink">
              {hoverCell.value !== null
                ? `${(hoverCell.value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% tải`
                : hoverCell.portWeightedObsHours < OBSERVED_H_MIN
                ? "thiếu quan sát"
                : "chưa có dữ liệu"}
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {hoverCell.contributingStations} trạm · {hoverCell.contributingPorts}/{hoverCell.allInPorts} cổng
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {hoverCell.portWeightedObsHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ quan sát có trọng số
            </span>
          </>
        )}
      </Readout>
    </div>
  );
}
