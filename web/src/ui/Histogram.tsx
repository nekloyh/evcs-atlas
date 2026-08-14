/**
 * Histogram của trường choropleth đang chọn, brush theo khoảng giá trị — DESIGN.md §3d.
 *
 * Màu lấy đúng §4d-2 và không thêm hex nào: **một chuỗi ⇒ `c5`, không legend** (tiêu đề đã
 * gọi tên nó); cột bị brush loại dùng chính màu "bị loại" của bản đồ (`#898781` @ 0,25,
 * §4e — số cũ `#e1e0d9` @ 0,35 đã bị ảnh render bác bỏ ở M4) — biểu đồ và bản đồ phải nói
 * **cùng một câu bằng cùng một màu**, nếu không mentor phải học hai từ vựng cho một khái niệm.
 */

import { useEffect, useMemo, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { Range } from "../state/brush";
import { HAIRLINE_HEX, RAMP_HEX, formatBreak, mutedCss } from "../viz/palette";
import { toData, toPx, useDragRect, type Axis } from "./brush-overlay";
import { Readout } from "./Readout";

const SERIES = RAMP_HEX[4];
const INK_MUTED = "#898781";
/** Cột bị brush loại — CÙNG màu mà bản đồ dùng cho ô bị loại (§4e). */
const MUTED_CSS = mutedCss();

const W = 344;
const H = 108;
const M = { left: 34, right: 8, top: 6, bottom: 20 };
const N_BINS = 32;

interface Bin {
  x1: number;
  x2: number;
  n: number;
}

export interface HistModel {
  bins: Bin[];
  lo: number;
  hi: number;
  max: number;
  /** trung vị của chính tập đang vẽ — mốc tham chiếu, xem `Plot.ruleX` bên dưới */
  median: number | null;
}

/** Trung vị của một mảng CHƯA sắp. Sao chép mảng để không sửa dữ liệu của người gọi. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Chia đều trên [min, max] của giá trị KHÔNG null. Ô null không có chỗ trên trục giá trị. */
function bins(values: number[]): HistModel {
  if (values.length === 0) return { bins: [], lo: 0, hi: 1, max: 0, median: null };
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const median = medianOf(values);
  // Phân bố hằng số: một cột duy nhất, không chia 32 cột rỗng.
  if (hi === lo)
    return { bins: [{ x1: lo, x2: lo, n: values.length }], lo, hi, max: values.length, median };
  const w = (hi - lo) / N_BINS;
  const out: Bin[] = Array.from({ length: N_BINS }, (_, i) => ({
    x1: lo + i * w,
    x2: lo + (i + 1) * w,
    n: 0,
  }));
  for (const v of values) {
    const i = Math.min(N_BINS - 1, Math.floor((v - lo) / w));
    out[i]!.n++;
  }
  return { bins: out, lo, hi, max: Math.max(...out.map((b) => b.n)), median };
}

export function Histogram({
  values,
  range,
  onRange,
  nMissing,
  unitNoun,
}: {
  /** giá trị KHÔNG null của trường đang tô, trên hình học đang tô */
  values: number[];
  range: Range | undefined;
  onRange: (r: Range | null) => void;
  /** số mark KHÔNG có giá trị — chúng không có chỗ trên trục, và điều đó phải nói ra */
  nMissing: number;
  /** "ô" · "xã" · "đoạn" · "trạm" — danh từ của đơn vị đọc đang tô */
  unitNoun: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const model = useMemo(() => bins(values), [values]);

  const axis: Axis = { d0: model.lo, d1: model.hi, r0: M.left, r1: W - M.right, kind: "linear" };
  const inRange = (b: Bin) => !range || (b.x2 >= range.lo && b.x1 <= range.hi);

  const { ref, live, hover } = useDragRect((r) => {
    if (!r) return onRange(null);
    const lo = toData(axis, r.x0);
    const hi = toData(axis, r.x1);
    onRange(lo < hi ? { lo, hi } : null);
  });

  useEffect(() => {
    const el = host.current;
    if (!el || model.bins.length === 0) return;
    const chart = Plot.plot({
      width: W,
      height: H,
      marginLeft: M.left,
      marginRight: M.right,
      marginTop: M.top,
      marginBottom: M.bottom,
      style: { background: "transparent", fontSize: "9px", color: INK_MUTED },
      // CÙNG `domain` mà `axis` dùng — hai bên không thể lệch nhau, xem `brush-overlay.tsx`.
      x: { domain: [model.lo, model.hi], ticks: 4, tickFormat: formatBreak, label: null },
      y: { domain: [0, model.max], ticks: 2, label: null, tickFormat: (d: number) => formatBreak(d) },
      marks: [
        Plot.gridY({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.rectY(model.bins, {
          x1: "x1",
          x2: "x2",
          y: "n",
          // Một chuỗi một màu (§4d-2); phần bị brush loại lấy đúng màu "bị loại" của bản đồ.
          fill: (d: Bin) => (inRange(d) ? SERIES : MUTED_CSS),
          insetLeft: 0.4,
          insetRight: 0.4,
        }),
        // TRUNG VỊ — mốc tham chiếu, vai thứ hai của §4d-2 (hairline, KHÔNG mang màu dữ
        // liệu: nó không phải một chuỗi thứ hai). Nó là con số duy nhất trả lời được câu
        // "phân bố này lệch tới đâu" mà không cần rê chuột, và với phần lớn trường của bộ
        // này (lệch nặng, đuôi dài) thì trung vị nằm rất xa điểm giữa trục — đó chính là
        // phát biểu. Vẽ SAU cột để nó không bị cột che.
        ...(model.median === null
          ? []
          : [
              Plot.ruleX([model.median], { stroke: INK_MUTED, strokeWidth: 1 }),
              Plot.text([model.median], {
                x: (d: number) => d,
                y: model.max,
                text: () => "trung vị",
                dy: -1,
                dx: 3,
                textAnchor: "start",
                fill: INK_MUTED,
                fontSize: 9,
              }),
            ]),
      ],
    });
    el.append(chart);
    return () => chart.remove();
  }, [model, range]);

  // Cột dưới con trỏ. Dùng LẠI đúng `axis` mà brush dùng, nên số đọc ra không thể lệch khỏi
  // khoảng chọn được — cùng lý do `Axis` được khai tường minh (xem `brush-overlay.tsx`).
  const at = hover && model.bins.length > 0 ? binAt(model, toData(axis, hover.x)) : null;

  // Lớp phủ kéo chọn — trong suốt, phủ đúng vùng vẽ. `touch-none` để kéo trên máy có cảm
  // ứng không bị trình duyệt nuốt thành thao tác cuộn.
  const band =
    range && model.bins.length > 0
      ? { x: toPx(axis, Math.max(range.lo, model.lo)), w: Math.max(1, toPx(axis, Math.min(range.hi, model.hi)) - toPx(axis, Math.max(range.lo, model.lo))) }
      : null;
  const dragBand = live ? { x: Math.min(live.x0, live.x1), w: Math.abs(live.x1 - live.x0) } : null;
  const show = dragBand ?? band;

  return (
    <div>
      <div className="relative" style={{ width: W, height: H }}>
        <div ref={host} />
        <div
          ref={ref}
          className="absolute inset-0 cursor-ew-resize touch-none"
          title="kéo ngang để chọn khoảng giá trị · bấm một cái để bỏ chọn"
        >
          {show && (
            <div
              className="pointer-events-none absolute border-x"
              style={{
                left: show.x,
                width: show.w,
                top: M.top,
                bottom: M.bottom,
                borderColor: SERIES,
                background: `${SERIES}14`,
              }}
            />
          )}
        </div>
      </div>
      <Readout hint="rê ngang để đọc từng cột">
        {at && (
          <>
            <span className="tabular-nums text-ink">
              {formatBreak(at.x1)} – {formatBreak(at.x2)}
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums">
              {at.n.toLocaleString("vi-VN")} {unitNoun}
            </span>
            {model.median !== null && (
              <span className="text-ink-muted">
                · trung vị {formatBreak(model.median)}
              </span>
            )}
          </>
        )}
      </Readout>
      {/*
        Số mark KHÔNG có giá trị đứng ở đây chứ không ở trong hình: chúng **không có chỗ**
        trên một trục giá trị, và vẽ chúng ở 0 là bịa. Nhưng im lặng về chúng thì histogram
        trông như nói về toàn bộ dữ liệu — nên chúng phải ra chữ (ràng buộc 1 ở tầng chữ).
      */}
      {nMissing > 0 && (
        <p className="pt-0.5 text-note leading-snug text-ink-muted">
          {nMissing.toLocaleString("vi-VN")} {unitNoun} không có giá trị — chúng không nằm trên
          trục này, và không được vẽ ở 0.
        </p>
      )}
    </div>
  );
}

/** Cột chứa một giá trị. Cột cuối đóng ở hai đầu — nếu không thì `hi` không thuộc cột nào. */
function binAt(m: HistModel, v: number): Bin | null {
  for (let i = 0; i < m.bins.length; i++) {
    const b = m.bins[i]!;
    if (v >= b.x1 && (v < b.x2 || i === m.bins.length - 1)) return b;
  }
  return null;
}
