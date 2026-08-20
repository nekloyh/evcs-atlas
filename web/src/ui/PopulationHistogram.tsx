/**
 * Phase 4 — Demand: Population Histogram (PHASE4_VISUALIZATION.md §1.2).
 *
 * Chart ID: demand-population-histogram
 * Exact zero bucket + 23 positive log1p bins.
 * Emits inclusive `between` SUBSET filter on Cell `population`.
 */

import * as React from "react";
import { useState, useRef } from "react";
import type { AnalysisFilter } from "../state/filter";
import { DEFAULT_DATASET_ID } from "../state/selection";
import { HAIRLINE_HEX, INK_MUTED_HEX, mutedCss, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import { CHART_W } from "./chart-size";
import type { DemandHistogramModel, PopulationBin } from "../viz/chart-models";
import { Readout } from "./Readout";

const MUTED_CSS = mutedCss();

const W = CHART_W;
const H = 108;
const M = { left: 32, right: 8, top: 12, bottom: 22 };

function formatPop(v: number): string {
  if (v === 0) return "0";
  if (v >= 1000000) return `${(v / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (v >= 1000) return `${(v / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}k`;
  return Math.round(v).toLocaleString("vi-VN");
}

export function PopulationHistogram({
  model,
  theme,
  onFilterIntent,
}: {
  model: DemandHistogramModel;
  /** Mực chuỗi = anchor `series` của theme lens đang mở (CR 4.1 §C2). */
  theme: AnalysisTheme;
  onFilterIntent?: (filter: AnalysisFilter | null) => void;
}) {
  const SERIES = seriesColorForTheme(theme);
  const [hoverBin, setHoverBin] = useState<PopulationBin | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragCurrentIdx, setDragCurrentIdx] = useState<number | null>(null);
  const [keyboardStartIdx, setKeyboardStartIdx] = useState(0);
  const [keyboardEndIdx, setKeyboardEndIdx] = useState(Math.max(0, model.bins.length - 1));
  const containerRef = useRef<HTMLDivElement>(null);

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const slotW = plotW / model.bins.length;

  const handlePointerDown = (binIdx: number, e: React.PointerEvent<SVGGElement>) => {
    if (!onFilterIntent) return;
    // Bắt con trỏ ngay từ đầu: mọi `pointermove`/`pointerup` sau đó về đúng phần tử này kể
    // cả khi ngón tay/chuột đi ra ngoài khung 296 px. Không có nó thì (a) chuột nhả bên
    // ngoài không bao giờ tới được `onPointerUp`, và (b) trên cảm ứng trình duyệt đã bắt
    // ngầm nên `pointerenter` của các cột bên cạnh KHÔNG bao giờ chạy — mọi cú kéo bằng
    // ngón tay co lại thành đúng một cột.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragStartIdx(binIdx);
    setDragCurrentIdx(binIdx);
  };

  /** Cột dưới con trỏ trong lúc kéo — suy từ toạ độ, vì `pointerenter` im khi đã bắt con trỏ. */
  const binIndexAt = (clientX: number): number | null => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || model.bins.length === 0) return null;
    const rel = clientX - box.left - M.left;
    const slot = (W - M.left - M.right) / model.bins.length;
    if (slot <= 0) return null;
    return Math.max(0, Math.min(model.bins.length - 1, Math.floor(rel / slot)));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartIdx === null) return;
    const idx = binIndexAt(e.clientX);
    if (idx !== null) setDragCurrentIdx(idx);
  };

  /** Bỏ cử chỉ đang kéo mà KHÔNG phát gì — dùng cho `pointercancel` và phím Esc. */
  const cancelDrag = () => {
    setDragStartIdx(null);
    setDragCurrentIdx(null);
  };

  const handlePointerEnter = (bin: PopulationBin) => {
    setHoverBin(bin);
    if (dragStartIdx !== null) {
      setDragCurrentIdx(bin.index);
    }
  };

  const commitRange = (firstIdx: number, lastIdx: number) => {
    if (!onFilterIntent) return;
    const minIdx = Math.min(firstIdx, lastIdx);
    const maxIdx = Math.max(firstIdx, lastIdx);
    const startBin = model.bins[minIdx];
    const endBin = model.bins[maxIdx];
    if (!startBin || !endBin) return;
    const lo = minIdx === 0 ? 0 : startBin.x1;
    const hi = endBin.x2;

    // Phát ĐÚNG cái người dùng vừa chọn, kể cả khi nó trùng bộ lọc đang bật. Bản cũ đổi
    // cử chỉ trùng thành lệnh XOÁ, nên bấm hai lần vào ô `=0` lại tắt mất bộ lọc — trong
    // khi §1.2 nói cử chỉ đó phát `[0, 0]`. Việc "lặp lại thì không đổi gì" là của reducer
    // (`applyFilterIntent` giữ nguyên tham chiếu, §2.4 luật 4), không phải của biểu đồ.
    onFilterIntent({
      version: 1,
      mode: "subset",
      datasetId: DEFAULT_DATASET_ID,
      entity: "h3-cell",
      field: "population",
      op: "between",
      lo: Math.round(lo * 10_000) / 10_000,
      hi: Math.round(hi * 10_000) / 10_000,
      missing: "exclude",
      source: "demand-population-histogram",
    });
  };

  const handlePointerUp = () => {
    if (dragStartIdx !== null && dragCurrentIdx !== null) {
      commitRange(dragStartIdx, dragCurrentIdx);
    }
    setDragStartIdx(null);
    setDragCurrentIdx(null);
  };

  const isDragActive = dragStartIdx !== null && dragCurrentIdx !== null;
  const dragMin = isDragActive ? Math.min(dragStartIdx, dragCurrentIdx) : -1;
  const dragMax = isDragActive ? Math.max(dragStartIdx, dragCurrentIdx) : -1;

  /**
   * Vạch thập phân của trục dương — 1, 10, 100, 1k… nằm trong miền quan sát được.
   *
   * Vẽ đúng bằng phép đặt chỗ mà `chart-models` dùng cho các cột (`log1p` chuẩn hoá trên
   * `[minPositive, max]`), nên vạch và cột không thể trôi khỏi nhau. Vạch cuối bị bỏ khi
   * nó chạm nhãn `maxPop` ở mép phải để hai chữ số không chồng lên nhau.
   */
  const decadeTicks = (() => {
    if (model.positiveBins.length === 0) return [];
    const minLog = Math.log1p(model.minPositivePop);
    const maxLog = Math.log1p(model.maxPop);
    if (!(maxLog > minLog)) return [];
    const out: { value: number; x: number }[] = [];
    for (let exp = 0; exp <= 7; exp++) {
      const value = 10 ** exp;
      if (value < model.minPositivePop || value > model.maxPop) continue;
      const frac = (Math.log1p(value) - minLog) / (maxLog - minLog);
      const x = M.left + slotW + frac * (plotW - slotW);
      if (x > W - M.right - 18) continue;
      out.push({ value, x });
    }
    return out;
  })();

  // Median X coordinate
  let medianPlotX: number | null = null;
  if (model.medianPop !== null) {
    if (model.medianPop === 0) {
      medianPlotX = M.left + slotW / 2;
    } else {
      const minLog = Math.log1p(model.minPositivePop);
      const maxLog = Math.log1p(model.maxPop);
      const mLog = Math.log1p(model.medianPop);
      const frac = maxLog > minLog ? Math.max(0, Math.min(1, (mLog - minLog) / (maxLog - minLog))) : 0;
      medianPlotX = M.left + slotW + frac * (plotW - slotW);
    }
  }

  return (
    <div
      className="select-none min-w-0"
      // Rời khung chỉ tắt TOOLTIP. Nó KHÔNG chốt bộ lọc: kéo quá mép phải rồi nhả trong
      // khung từng phát một `FilterReplace` mà người dùng không hề chốt, và cú nhả thật
      // sau đó rơi vào hư không vì state kéo đã bị xoá.
      onPointerLeave={() => setHoverBin(null)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelDrag}
    >
      <div className="flex items-center justify-between pb-1 text-note text-ink-muted">
        <span>số ô</span>
        <span>Dân số trên ô H3 · người</span>
      </div>

      <div
        ref={containerRef}
        className="relative cursor-crosshair touch-none"
        style={{ width: W, height: H }}
        role="region"
        aria-label="Biểu đồ phân bố dân số ô H3. Kéo ngang để chọn khoảng lọc."
      >
        <svg width={W} height={H} className="overflow-visible">
          {/* Y grid lines */}
          <line
            x1={M.left}
            x2={W - M.right}
            y1={M.top}
            y2={M.top}
            stroke={HAIRLINE_HEX}
            strokeDasharray="2,2"
          />
          <line
            x1={M.left}
            x2={W - M.right}
            y1={M.top + plotH / 2}
            y2={M.top + plotH / 2}
            stroke={HAIRLINE_HEX}
            strokeDasharray="2,2"
          />
          <line
            x1={M.left}
            x2={W - M.right}
            y1={M.top + plotH}
            y2={M.top + plotH}
            stroke={HAIRLINE_HEX}
          />

          {/* Separator between zero bucket and positive axis */}
          {model.positiveBins.length > 0 && (
            <line
              x1={M.left + slotW}
              x2={M.left + slotW}
              y1={M.top}
              y2={M.top + plotH + 4}
              stroke={INK_MUTED_HEX}
              strokeWidth={1}
            />
          )}

          {/* Histogram Bars */}
          {model.bins.map((bin) => {
            const barH = model.maxBinCount > 0 ? (bin.nCells / model.maxBinCount) * plotH : 0;
            const x = M.left + bin.index * slotW;
            const y = M.top + plotH - barH;
            const inDrag = isDragActive && bin.index >= dragMin && bin.index <= dragMax;
            const isFilled = inDrag || (!isDragActive && bin.isInFilter);
            const fill = isFilled ? SERIES : MUTED_CSS;

            return (
              <g
                key={bin.index}
                className="cursor-pointer"
                onPointerDown={(e) => handlePointerDown(bin.index, e)}
                onPointerEnter={() => handlePointerEnter(bin)}
              >
                <rect
                  x={x + 0.5}
                  y={y}
                  width={Math.max(1, slotW - 1)}
                  height={Math.max(0, barH)}
                  fill={fill}
                  rx={0.5}
                />
                {/* Hit area */}
                <rect
                  x={x}
                  y={M.top}
                  width={slotW}
                  height={plotH}
                  fill="transparent"
                />
              </g>
            );
          })}

          {/* Median Reference line */}
          {medianPlotX !== null && (
            <g pointerEvents="none">
              <line
                x1={medianPlotX}
                x2={medianPlotX}
                y1={M.top - 4}
                y2={M.top + plotH}
                stroke={INK_MUTED_HEX}
                strokeWidth={1}
                strokeDasharray="3,2"
              />
              <text
                x={medianPlotX + 2}
                y={M.top - 2}
                fontSize={9}
                fill={INK_MUTED_HEX}
                textAnchor="start"
              >
                trung vị
              </text>
            </g>
          )}

          {/* X Axis Labels */}
          <text
            x={M.left + slotW / 2}
            y={H - 4}
            fontSize={9}
            fill={INK_MUTED_HEX}
            textAnchor="middle"
          >
            =0
          </text>
          {model.positiveBins.length > 0 && (
            <>
              {/* Nhãn trục dương là giá trị THẬT đã nghịch biến đổi (1 · 10 · 100 · 1k …),
                  không phải logarit: phép log chỉ để ĐẶT CHỖ, nó không đổi đơn vị (§1.2). */}
              {decadeTicks.map((tick) => (
                <g key={tick.value}>
                  <line
                    x1={tick.x}
                    x2={tick.x}
                    y1={M.top + plotH}
                    y2={M.top + plotH + 3}
                    stroke={INK_MUTED_HEX}
                  />
                  <text
                    x={tick.x}
                    y={H - 4}
                    fontSize={9}
                    fill={INK_MUTED_HEX}
                    textAnchor="middle"
                  >
                    {formatPop(tick.value)}
                  </text>
                </g>
              ))}
              <text
                x={W - M.right}
                y={H - 4}
                fontSize={9}
                fill={INK_MUTED_HEX}
                textAnchor="end"
              >
                {formatPop(model.maxPop)}
              </text>
            </>
          )}

          {/* Y Axis Ticks */}
          <text
            x={M.left - 4}
            y={M.top + 7}
            fontSize={9}
            fill={INK_MUTED_HEX}
            textAnchor="end"
          >
            {formatPop(model.maxBinCount)}
          </text>
          <text
            x={M.left - 4}
            y={M.top + plotH}
            fontSize={9}
            fill={INK_MUTED_HEX}
            textAnchor="end"
          >
            0
          </text>
        </svg>
      </div>

      {onFilterIntent && (
        <div className="flex items-center gap-1 pt-1 text-note" role="group" aria-label="Chọn khoảng dân số bằng bàn phím">
          <select
            aria-label="Cận dưới khoảng dân số"
            value={keyboardStartIdx}
            onChange={(event) => setKeyboardStartIdx(Number(event.target.value))}
            className="min-w-0 flex-1 rounded-xs border border-hairline bg-panel px-1 py-0.5 text-ink"
          >
            {model.bins.map((bin) => (
              <option key={bin.index} value={bin.index}>
                {bin.isZeroSlot ? "0" : formatPop(bin.x1)}
              </option>
            ))}
          </select>
          <span aria-hidden className="text-ink-muted">–</span>
          <select
            aria-label="Cận trên khoảng dân số"
            value={keyboardEndIdx}
            onChange={(event) => setKeyboardEndIdx(Number(event.target.value))}
            className="min-w-0 flex-1 rounded-xs border border-hairline bg-panel px-1 py-0.5 text-ink"
          >
            {model.bins.map((bin) => (
              <option key={bin.index} value={bin.index}>
                {bin.isZeroSlot ? "0" : formatPop(bin.x2)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => commitRange(keyboardStartIdx, keyboardEndIdx)}
            className="rounded-xs border border-hairline px-1.5 py-0.5 font-semibold text-ink hover:bg-basemap"
          >
            Lọc
          </button>
        </div>
      )}

      <Readout hint="kéo ngang để lọc khoảng dân số · bấm ô 0 để chỉ xem ô không dân">
        {hoverBin && (
          <>
            <span className="tabular-nums font-semibold text-ink">
              {hoverBin.isZeroSlot
                ? "đúng 0 người"
                : `${formatPop(hoverBin.x1)} – ${formatPop(hoverBin.x2)} người`}
            </span>
            {!hoverBin.isZeroSlot && (
              <span className="font-mono text-note text-ink-muted">
                {/* Cột trong ruột nửa mở `[lo, hi)`; cột CUỐI đóng cả hai đầu để giá trị
                    lớn nhất của bộ dữ liệu có chỗ đứng — §1.2 "không bao giờ cắt cụt max". */}
                {hoverBin.index === model.bins.length - 1 ? "[đóng–đóng]" : "[gồm–hở]"}
              </span>
            )}
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink">
              {hoverBin.nCells.toLocaleString("vi-VN")} ô (
              {(hoverBin.cellShare * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)
            </span>
            {hoverBin.populationSum > 0 && (
              <>
                <span className="text-ink-muted">·</span>
                <span className="tabular-nums text-ink-2">
                  tổng {hoverBin.populationSum.toLocaleString("vi-VN")} dân
                </span>
              </>
            )}
            <span className="text-ink-muted">·</span>
            <span className={hoverBin.isInFilter ? "text-ink" : "text-ink-muted"}>
              {hoverBin.isInFilter ? "trong tập lọc" : "ngoài tập lọc"}
            </span>
          </>
        )}
      </Readout>

      {model.nMissingCells > 0 && (
        <p className="pt-0.5 text-note leading-snug text-ink-muted">
          {model.nMissingCells.toLocaleString("vi-VN")} ô khuyết dân số — không nằm trên trục
          và không tính vào ô 0.
        </p>
      )}
    </div>
  );
}
