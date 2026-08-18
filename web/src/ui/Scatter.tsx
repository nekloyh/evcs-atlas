/**
 * Scatter `population` × `dist_station_network_m`, brush 2D — DESIGN.md §3d.
 *
 * Vì sao đúng cặp này là mặc định: nó là luận điểm B ở dạng biểu đồ — **cầu** trên một
 * trục, **khoảng cách tới cung** trên trục kia, nên góc "đông người mà xa trạm" chính là
 * tập ô mà bài toán đặt trạm nói về. Kéo một hộp ở góc đó rồi nhìn lên bản đồ là toàn bộ
 * lý do dock tồn tại.
 *
 * Hai điều về thang đo, cả hai đều là quyết định:
 *
 * **Trục X căn bậc hai.** Dân số lệch nặng (trung vị vài trăm, đuôi tới hàng chục nghìn):
 * trên thang tuyến tính 90% số ô dồn vào một vệt sát trục và không kéo chọn được gì. Căn
 * bậc hai trải phần thấp ra mà vẫn nhận **giá trị 0** — log thì không, và 0 người là một
 * giá trị thật của trường này. Trục vẫn in ngưỡng THẬT (§3b), nên không con số nào bị giấu.
 *
 * **Ô null KHÔNG có mặt trên biểu đồ.** 51 ô không có `dist_station_network_m` không có
 * chỗ nào trên một mặt phẳng hai trục giá trị — đặt chúng ở 0 là bịa. Chúng vẫn nằm trên
 * bản đồ (vân xám) và vẫn bị brush loại, và dock đếm chúng ra thành chữ.
 */

import { useEffect, useMemo, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { Range, ScatterBrush } from "../state/brush";
import { SCATTER_X, SCATTER_Y } from "../state/brush";
import { HAIRLINE_HEX, INK_MUTED_HEX, RAMP_HEX, formatBreak, mutedCss } from "../viz/palette";
import { toData, toPx, useDragRect, type Axis } from "./brush-overlay";
import { Readout } from "./Readout";
import { CHART_W } from "./chart-size";

const SERIES = RAMP_HEX[4];
// Chấm 1,3 px cần mực ĐẶC hơn cột histogram: §4d đã lập sẵn tiền lệ — "nét mảnh ở
// alpha 0,5 thì biến mất, đó là lỗi chứ không phải nhất quán". Cùng ký hiệu, khác độ đặc.
const MUTED_CSS = mutedCss(0.55);

const W = CHART_W;
const H = 168;
const M = { left: 40, right: 8, top: 6, bottom: 26 };

export interface Point {
  x: number;
  y: number;
}

const within = (v: number, r: Range) => v >= r.lo && v <= r.hi;

export function Scatter({
  points,
  brush,
  onBrush,
  nMissing,
}: {
  points: Point[];
  brush: ScatterBrush | undefined;
  onBrush: (b: ScatterBrush | null) => void;
  /** ô thiếu MỘT trong hai trục — chúng không có chỗ trên mặt phẳng, xem docstring đầu file */
  nMissing: number;
}) {
  const host = useRef<HTMLDivElement>(null);

  const dom = useMemo(() => {
    let xh = 0;
    let yh = 0;
    for (const p of points) {
      if (p.x > xh) xh = p.x;
      if (p.y > yh) yh = p.y;
    }
    return { xh: xh || 1, yh: yh || 1 };
  }, [points]);

  const ax: Axis = { d0: 0, d1: dom.xh, r0: M.left, r1: W - M.right, kind: "sqrt" };
  // Trục Y của SVG chạy ngược: `r0` là đáy khung, `r1` là đỉnh. Viết ra vì đây là chỗ dễ
  // lật dấu nhất, và lật dấu thì hộp brush lệch mà không có lỗi nào.
  const ay: Axis = { d0: 0, d1: dom.yh, r0: H - M.bottom, r1: M.top, kind: "linear" };

  const { ref, live, hover } = useDragRect((r) => {
    if (!r) return onBrush(null);
    const x0 = toData(ax, r.x0);
    const x1 = toData(ax, r.x1);
    // `r.y0` là mép TRÊN của hộp pixel ⇒ giá trị LỚN hơn trên trục dữ liệu.
    const yTop = toData(ay, r.y0);
    const yBot = toData(ay, r.y1);
    onBrush({
      x: SCATTER_X,
      xr: { lo: Math.min(x0, x1), hi: Math.max(x0, x1) },
      y: SCATTER_Y,
      yr: { lo: Math.min(yTop, yBot), hi: Math.max(yTop, yBot) },
    });
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const inBox = (p: Point) => !brush || (within(p.x, brush.xr) && within(p.y, brush.yr));
    const chart = Plot.plot({
      width: W,
      height: H,
      marginLeft: M.left,
      marginRight: M.right,
      marginTop: M.top,
      marginBottom: M.bottom,
      style: { background: "transparent", fontSize: "9px", color: INK_MUTED_HEX },
      x: { type: "sqrt", domain: [0, dom.xh], ticks: 4, tickFormat: formatBreak, label: "dân số ô →", labelOffset: 22 },
      y: { domain: [0, dom.yh], ticks: 4, tickFormat: formatBreak, label: "↑ m tới trạm" },
      marks: [
        Plot.gridX({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.gridY({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.dot(points, {
          x: "x",
          y: "y",
          r: 1.3,
          // 4.400 chấm chồng nhau: alpha thấp để mật độ đọc được bằng độ đậm, thay vì một
          // mảng đặc. Cùng ý với "chấm là hạt ở zoom thấp" của lớp trạm (§4d-1).
          fill: (d: Point) => (inBox(d) ? SERIES : MUTED_CSS),
          fillOpacity: 0.45,
        }),
      ],
    });
    el.append(chart);
    return () => chart.remove();
  }, [points, brush, dom]);

  const box = brush
    ? {
        x: toPx(ax, brush.xr.lo),
        w: Math.max(1, toPx(ax, brush.xr.hi) - toPx(ax, brush.xr.lo)),
        y: toPx(ay, brush.yr.hi),
        h: Math.max(1, toPx(ay, brush.yr.lo) - toPx(ay, brush.yr.hi)),
      }
    : null;
  const dragBox = live
    ? {
        x: Math.min(live.x0, live.x1),
        w: Math.abs(live.x1 - live.x0),
        y: Math.min(live.y0, live.y1),
        h: Math.abs(live.y1 - live.y0),
      }
    : null;
  const show = dragBox ?? box;

  return (
    <div>
      <div className="relative" style={{ width: W, height: H }}>
        <div ref={host} />
        <div
          ref={ref}
          className="absolute inset-0 cursor-crosshair touch-none"
          title="kéo một hộp để chọn theo CẢ HAI trục · bấm một cái để bỏ chọn"
        >
          {show && (
            <div
              className="pointer-events-none absolute border"
              style={{
                left: show.x,
                top: show.y,
                width: show.w,
                height: show.h,
                borderColor: SERIES,
                background: `${SERIES}14`,
              }}
            />
          )}
        </div>
      </div>
      {/*
        Readout ở đây in TOẠ ĐỘ CON TRỎ, không in "chấm gần nhất". Có chủ ý: 4.400 chấm
        1,3 px chồng nhau ở góc trái dưới, nên "chấm gần nhất" trả về một ô ngẫu nhiên
        trong đám đó và đọc thành một khẳng định về một ô cụ thể mà nó không có quyền nói.
        Toạ độ thì luôn đúng, và nó trả lời đúng câu hỏi người ta hỏi trước khi kéo: "tôi
        sắp cắt ở mốc nào".
      */}
      <Readout hint="rê để đọc mốc hai trục">
        {hover && (
          <>
            <span className="tabular-nums text-ink">{formatBreak(toData(ax, hover.x))}</span>
            <span className="text-ink-muted">người ·</span>
            <span className="tabular-nums text-ink">{formatBreak(toData(ay, hover.y))}</span>
            <span className="text-ink-muted">m tới trạm · {points.length.toLocaleString("vi-VN")} ô đang vẽ</span>
          </>
        )}
      </Readout>
      {nMissing > 0 && (
        <p className="pt-0.5 text-note leading-snug text-ink-muted">
          {nMissing.toLocaleString("vi-VN")} ô thiếu một trục — không có chỗ nào trên một mặt
          phẳng hai trục giá trị, nên chúng không được vẽ. Trên bản đồ chúng vẫn là vân xám.
        </p>
      )}
    </div>
  );
}
