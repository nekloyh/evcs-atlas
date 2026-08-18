/**
 * Heatmap 168h của occupancy TOÀN THÀNH PHỐ — DESIGN.md §3d, §4d-3b.
 *
 * Ba luật sống ở file này:
 *
 * **1. Ô thiếu quan sát vẽ VÂN XÁM, không tô bậc nhạt** (§4d-3b) — ràng buộc 1 mở rộng
 * sang chiều thời gian. Vân dùng đúng góc 45° và đúng mực `#898781` của ô null trên bản
 * đồ (§4b): một chất liệu cho một khái niệm, bất kể hình học.
 *
 * **2. Ramp cam của §4a, không phải bảng màu riêng của Plot** (§4d-2). Và nó là **cùng
 * phép chia bậc** mà chấm trạm dùng, nên một ô heatmap và một chấm trên bản đồ cùng màu
 * thì cùng nghĩa.
 *
 * **3. Đồng bộ HAI CHIỀU với scrubber** (§3e): ô của giờ đang xem có viền đậm, và bấm một
 * ô là đặt `t`. Một khái niệm ("đang xem giờ nào"), một nguồn sự thật — khoá `t`.
 */

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { WindowBrush } from "../state/brush";
import { DOW_LABELS, dowOf, hourOf, tOf } from "../state/types";
import type { CityHour } from "../viz/occ";
import { OBSERVED_H_MIN } from "../viz/occ";
import { BASEMAP_HEX, HATCH_HEX, INK_MUTED_HEX, classOf, rampFor, type Scale } from "../viz/palette";
import { bandIndex, useDragRect } from "./brush-overlay";
import { Readout } from "./Readout";
import { CHART_W } from "./chart-size";

const INK = "#0b0b0b";

/**
 * Hình học dùng CHUNG với hồ sơ biên 24 giờ (`HourProfile`) — xuất ra chứ không chép.
 *
 * Hai hình xếp chồng và **chia chung trục giờ**: cột 22h của heatmap phải nằm đúng trên cột
 * 22h của hồ sơ, nếu không thì việc đọc chéo giữa hai hình — chính là lý do hồ sơ tồn tại —
 * đòi mắt phải tự căn. Chép hai bộ lề ra hai file là cách chúng lệch nhau sau lần sửa thứ ba.
 */
export const HEAT_W = CHART_W;
export const HEAT_M = { left: 26, right: 8 };

const W = HEAT_W;
const H = 152;
const M = { left: HEAT_M.left, right: HEAT_M.right, top: 14, bottom: 18 };

const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/** Vân xám của ô thiếu quan sát — cùng góc 45° và cùng mực với ô null trên bản đồ (§4b). */
const HATCH_ID = "heat-thin-hatch";

const cellX = (hour: number) => M.left + (hour / 24) * PLOT_W;
const cellY = (dow: number) => M.top + (dow / 7) * PLOT_H;
const CELL_W = PLOT_W / 24;
const CELL_H = PLOT_H / 7;

export function Heatmap168({
  cells,
  scale,
  t,
  win,
  onT,
  onWindow,
}: {
  cells: CityHour[];
  /** CÙNG `Scale` mà chấm trạm dùng — hai hình phải đọc bằng một từ vựng (§8a). */
  scale: Scale | null;
  t: number;
  win: WindowBrush | undefined;
  onT: (t: number) => void;
  onWindow: (w: WindowBrush | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  const { ref, live, hover } = useDragRect((r, el) => {
    if (!r) {
      // Bấm một cái (không kéo) = ĐẶT GIỜ, không phải xoá cửa sổ — đây là nửa còn lại của
      // đồng bộ hai chiều với scrubber (§3e), và nó là thao tác người dùng làm nhiều nhất.
      // Xoá cửa sổ có nút riêng ở tiêu đề dock.
      return;
    }
    void el;
    const h0 = bandIndex(24, M.left, W - M.right, r.x0);
    const h1 = bandIndex(24, M.left, W - M.right, r.x1);
    const d0 = bandIndex(7, M.top, H - M.bottom, r.y0);
    const d1 = bandIndex(7, M.top, H - M.bottom, r.y1);
    onWindow({
      dow: { lo: Math.min(d0, d1), hi: Math.max(d0, d1) },
      hour: { lo: Math.min(h0, h1), hi: Math.max(h0, h1) },
    });
  });

  useEffect(() => {
    const el = host.current;
    if (!el || !scale) return;
    const { colors } = rampFor(scale, "high-bad");

    const chart = Plot.plot({
      width: W,
      height: H,
      marginLeft: M.left,
      marginRight: M.right,
      marginTop: M.top,
      marginBottom: M.bottom,
      style: { background: "transparent", fontSize: "9px", color: INK_MUTED_HEX },
      x: { domain: Array.from({ length: 24 }, (_, i) => i), tickFormat: (h: number) => (h % 6 === 0 ? String(h) : ""), label: null },
      y: { domain: [0, 1, 2, 3, 4, 5, 6], tickFormat: (d: number) => DOW_LABELS[d] ?? "", label: null },
      marks: [
        Plot.cell(cells, {
          x: (d: CityHour) => hourOf(d.t),
          y: (d: CityHour) => dowOf(d.t),
          fill: (d: CityHour) => {
            // Thiếu quan sát ⇒ VÂN, không phải một bậc nhạt (§4d-3b). Không có nhánh nào
            // biến "chưa biết" thành một màu của ramp.
            if (d.observedH < OBSERVED_H_MIN || d.value === null) return `url(#${HATCH_ID})`;
            const k = classOf(d.value, scale);
            return k === null ? `url(#${HATCH_ID})` : rgbCss(colors[k]);
          },
          // Ô ngoài cửa sổ brush MỜ ĐI, không biến mất — cùng luật với mark trên bản đồ (§3d).
          fillOpacity: (d: CityHour) => (inWin(win, d.t) ? 1 : 0.28),
          inset: 0.3,
        }),
      ],
    });

    // Pattern phải chèn tay: Plot không có API cho `fill` dạng vân, và §4d-1 lại cấm mảng
    // phẳng cho thứ "vắng thông tin" một cách vô điều kiện. Sáu dòng SVG rẻ hơn một quy tắc
    // ngoại lệ.
    const svg = chart as unknown as SVGSVGElement;
    if (svg.namespaceURI?.includes("svg")) {
      const NS = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(NS, "defs");
      const pat = document.createElementNS(NS, "pattern");
      pat.setAttribute("id", HATCH_ID);
      pat.setAttribute("width", "5");
      pat.setAttribute("height", "5");
      pat.setAttribute("patternUnits", "userSpaceOnUse");
      pat.setAttribute("patternTransform", "rotate(45)");
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", "0");
      line.setAttribute("y2", "5");
      line.setAttribute("stroke", HATCH_HEX);
      line.setAttribute("stroke-width", "1");
      pat.append(line);
      defs.append(pat);
      svg.insertBefore(defs, svg.firstChild);
    }

    el.append(chart);
    return () => chart.remove();
  }, [cells, scale, win]);

  const dragBox = live
    ? {
        x: Math.min(live.x0, live.x1),
        y: Math.min(live.y0, live.y1),
        w: Math.abs(live.x1 - live.x0),
        h: Math.abs(live.y1 - live.y0),
      }
    : null;

  // Ô dưới con trỏ. Dùng LẠI `bandIndex` mà brush cửa sổ dùng, nên ô đọc ra và ô chọn ra
  // không thể là hai ô khác nhau.
  const at = hover
    ? cells.find(
        (c) =>
          hourOf(c.t) === bandIndex(24, M.left, W - M.right, hover.x) &&
          dowOf(c.t) === bandIndex(7, M.top, H - M.bottom, hover.y),
      ) ?? null
    : null;

  return (
    <div>
    <div className="relative" style={{ width: W, height: H }}>
      <div ref={host} />
      <div
        ref={ref}
        className="absolute inset-0 cursor-crosshair touch-none"
        title="bấm một ô để nhảy tới giờ đó · kéo để chọn cửa sổ thứ × giờ"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const h = bandIndex(24, M.left, W - M.right, e.clientX - r.left);
          const d = bandIndex(7, M.top, H - M.bottom, e.clientY - r.top);
          onT(tOf(d, h));
        }}
      >
        {/* Cửa sổ đang chọn — khung, không phải mảng: bên trong khung là thứ phải nhìn. */}
        {win && (
          <div
            className="pointer-events-none absolute border"
            style={{
              left: cellX(win.hour.lo),
              top: cellY(win.dow.lo),
              width: (win.hour.hi - win.hour.lo + 1) * CELL_W,
              height: (win.dow.hi - win.dow.lo + 1) * CELL_H,
              borderColor: INK,
            }}
          />
        )}
        {dragBox && (
          <div
            className="pointer-events-none absolute border"
            style={{ left: dragBox.x, top: dragBox.y, width: dragBox.w, height: dragBox.h, borderColor: INK }}
          />
        )}
        {/* Giờ đang xem — nửa còn lại của đồng bộ hai chiều (§3e). Viền mực chính + vòng
            ngoài màu surface, để nó đọc được cả trên ô cam đậm lẫn trên ô vân. */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: cellX(hourOf(t)) - 1,
            top: cellY(dowOf(t)) - 1,
            width: CELL_W + 2,
            height: CELL_H + 2,
            boxShadow: `0 0 0 1px ${BASEMAP_HEX}, inset 0 0 0 2px ${INK}`,
          }}
        />
      </div>
    </div>
      <Readout hint="rê để đọc từng ô giờ · bấm để nhảy tới giờ đó">
        {at && (
          <>
            <span className="text-ink">
              {DOW_LABELS[dowOf(at.t)]} {hourOf(at.t)}h
            </span>
            <span className="text-ink-muted">·</span>
            {/* `null` in thành CHỮ, không thành 0 — ràng buộc 1 ở tầng chữ. Và số trạm đóng
                góp đi kèm, vì mẫu số của phép gộp đổi theo giờ (xem `cityProfile`): một tỉ
                lệ 30% gộp từ 400 trạm và một tỉ lệ 30% gộp từ 700 trạm không cùng độ tin. */}
            <span className="tabular-nums text-ink">
              {at.value === null ? "chưa quan sát đủ" : pctOf(at.value)}
            </span>
            <span className="tabular-nums text-ink-muted">
              · {at.nStations.toLocaleString("vi-VN")} trạm góp
            </span>
          </>
        )}
      </Readout>
    </div>
  );
}

const pctOf = (v: number) =>
  `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% cổng bận`;

function inWin(w: WindowBrush | undefined, t: number): boolean {
  if (!w) return true;
  const d = dowOf(t);
  const h = hourOf(t);
  return d >= w.dow.lo && d <= w.dow.hi && h >= w.hour.lo && h <= w.hour.hi;
}

function rgbCss(c: [number, number, number] | undefined): string {
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : "transparent";
}
