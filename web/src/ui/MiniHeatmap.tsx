/**
 * Mini-heatmap 7×24 của MỘT trạm — DESIGN.md §8a-3, M4.1.
 *
 * Ba luật, và cả ba là **cùng bộ luật** mà heatmap dock đã theo (§4d-3b). Đó là điểm của
 * hình này: hai heatmap trên cùng một màn hình phải đọc bằng **một từ vựng**, nếu không
 * mentor phải học hai lần cho một khái niệm.
 *
 *   1. **Cùng phép chia bậc** với chấm trạm và với heatmap thành phố — `scale` truyền vào,
 *      không tính lại từ 168 giá trị của riêng trạm này. Tính riêng thì trạm vắng nhất
 *      thành phố cũng có một ô c7, và "đậm" mất nghĩa.
 *   2. **Ô thiếu quan sát vẽ VÂN XÁM**, không tô bậc nhạt — ràng buộc 1 trên chiều thời
 *      gian. Ở tầng TRẠM luật này nổ thật (khác tầng thành phố): 2,11% ô giờ rớt ngưỡng
 *      `observed_h` và 236/939 trạm rỗng hoàn toàn.
 *   3. **Giờ đang xem có viền**, và bấm một ô là đặt `t` — cùng cơ chế đồng bộ hai chiều
 *      của §3e. Panel không phải một ngõ cụt: nó nối ngược lại scrubber và bản đồ.
 *
 * SVG thuần chứ không Observable Plot: hình 296×92 px với 168 ô không cần trục, không cần
 * thang, không cần lề — thứ Plot mang lại ở đây chỉ là ba lớp `<g>` thừa và một pattern
 * phải chèn tay y như cũ.
 */

import { DOW_LABELS, dowOf, hourOf, tOf } from "../state/types";
import { HATCH_HEX, INK_MUTED_HEX, classOf, rampFor, type Scale } from "../viz/palette";
import { CHART_W } from "./chart-size";

const W = CHART_W;
const LEFT = 16;
const TOP = 9;
const CELL_W = (W - LEFT) / 24;
const CELL_H = 10;
const H = TOP + 7 * CELL_H;

const HATCH_ID = "mini-heat-hatch";
const INK = "#0b0b0b";

export function MiniHeatmap({
  values,
  scale,
  t,
  onT,
}: {
  /** 168 giá trị theo `t`; `null` = một trong ba đường "không biết" của `stationOccAt` */
  values: (number | null)[];
  /** CÙNG `Scale` mà chấm trạm và heatmap dock dùng — xem luật 1 ở đầu file */
  scale: Scale | null;
  t: number;
  onT: (t: number) => void;
}) {
  if (!scale) return null;
  const { colors } = rampFor(scale, "high-bad");

  return (
    <svg width={W} height={H} className="block" role="img" aria-label="nhịp 168 giờ của trạm">
      <defs>
        {/* Vân 45° cùng góc và cùng mực với ô null trên bản đồ (§4b) — một chất liệu cho
            một khái niệm, bất kể hình học. */}
        <pattern id={HATCH_ID} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke={HATCH_HEX} strokeWidth="1" />
        </pattern>
      </defs>

      {/* Nhãn giờ — chỉ 0/6/12/18, đủ để định vị mà không thành một hàng số. */}
      {[0, 6, 12, 18].map((h) => (
        <text key={h} x={LEFT + h * CELL_W} y={TOP - 2} fontSize="8" fill={INK_MUTED_HEX}>
          {h}h
        </text>
      ))}

      {DOW_LABELS.map((label, d) => (
        <text key={label} x={0} y={TOP + d * CELL_H + CELL_H - 2.5} fontSize="8" fill={INK_MUTED_HEX}>
          {label}
        </text>
      ))}

      {values.map((v, i) => {
        const d = dowOf(i);
        const h = hourOf(i);
        const k = v === null ? null : classOf(v, scale);
        const fill = k === null ? `url(#${HATCH_ID})` : rgbCss(colors[k]);
        return (
          <rect
            key={i}
            x={LEFT + h * CELL_W}
            y={TOP + d * CELL_H}
            width={CELL_W - 0.4}
            height={CELL_H - 0.4}
            fill={fill}
            className="cursor-pointer"
            onClick={() => onT(tOf(d, h))}
          >
            {/* `<title>` là tooltip GỐC của SVG: không dựng thẻ nổi, không phá luật §3
                ("không thẻ nổi nào"), và nó đọc được bằng trình đọc màn hình. */}
            <title>
              {`${DOW_LABELS[d]} ${h}h — ${v === null ? "chưa quan sát đủ" : pctOf(v)}`}
            </title>
          </rect>
        );
      })}

      {/* Giờ đang xem — viền mực chính, cùng ký hiệu với heatmap dock (§3e). */}
      <rect
        x={LEFT + hourOf(t) * CELL_W - 0.5}
        y={TOP + dowOf(t) * CELL_H - 0.5}
        width={CELL_W + 0.6}
        height={CELL_H + 0.6}
        fill="none"
        stroke={INK}
        strokeWidth="1.5"
        pointerEvents="none"
      />
    </svg>
  );
}

const pctOf = (v: number) =>
  `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% cổng bận`;

function rgbCss(c: [number, number, number] | undefined): string {
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : "transparent";
}
