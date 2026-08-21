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
 *
 * ── Bàn phím và AT, thêm ở bản redesign lens Sử dụng (spec §20, §17) ─────────────────
 *
 * Trước bản này 168 ô chỉ nghe `onClick`: người dùng bàn phím không có đường nào tới điều
 * khiển này, và `role="img"` + một `aria-label` duy nhất khiến trình đọc màn hình công bố
 * "nhịp 168 giờ của trạm" rồi hết — 168 giá trị bên trong không tồn tại với AT.
 *
 * Nay nó dùng đúng khuôn của biểu đồ chính: **một** chặng Tab vào hình, roving tabindex ở
 * ô đang chọn, mũi tên đi trong lưới, và mỗi ô có tên đọc được mang GIÁ TRỊ hoặc chữ "chưa
 * quan sát đủ". Hai hình cùng nói về một khái niệm thì phải điều khiển được bằng cùng một
 * bộ phím — nếu không, người dùng bàn phím phải học hai lần cho một thứ.
 */

import { useRef } from "react";
import type { KeyboardEvent } from "react";

import { DOW_FULL, DOW_LABELS, dowOf, hourOf, scrubberKeyStep, tOf } from "../state/types";
import { HATCH_HEX, INK_MUTED_HEX, colorFor, type RGB, type Scale } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import { OCC_TZ_UNKNOWN, hourBucketLabel, type OccTimezoneState } from "../viz/occ-time";
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
  theme,
  t,
  onT,
  timezone = OCC_TZ_UNKNOWN,
}: {
  /** 168 giá trị theo `t`; `null` = một trong ba đường "không biết" của `stationOccAt` */
  values: (number | null)[];
  /** CÙNG `Scale` mà chấm trạm và heatmap dock dùng — xem luật 1 ở đầu file */
  scale: Scale | null;
  /** CÙNG theme mà bản đồ dùng cho trường này — người gọi lấy từ registry, không mặc định. */
  theme: AnalysisTheme;
  t: number;
  onT: (t: number) => void;
  /** Trục giờ được phép gọi là gì (§16). Mặc định: chưa công bố ⇒ "ô giờ". */
  timezone?: OccTimezoneState;
}) {
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  if (!scale) return null;

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    // ↑/↓ = cùng giờ, ngày khác (±24) — cùng ánh xạ mà `UtilizationDayProfiles` dùng, và
    // cùng hàm. Phím lạ KHÔNG `preventDefault`, nếu không Tab chết trong hình.
    const key =
      event.key === "ArrowUp" ? "PageUp" : event.key === "ArrowDown" ? "PageDown" : event.key;
    const next = scrubberKeyStep(t, key);
    if (next === null) return;
    event.preventDefault();
    onT(next);
    cellRefs.current[next]?.focus();
  };

  return (
    <div className="relative" style={{ width: W, height: H }}>
    <svg
      width={W}
      height={H}
      className="block"
      aria-hidden
      focusable="false"
    >
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
        const color = colorFor(v, scale, theme);
        const fill = !color ? `url(#${HATCH_ID})` : rgbCss(color);
        return (
          <rect
            key={i}
            x={LEFT + h * CELL_W}
            y={TOP + d * CELL_H}
            width={CELL_W - 0.4}
            height={CELL_H - 0.4}
            fill={fill}
          />
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

    {/* 168 hit target thật, roving tabindex — cùng khuôn với biểu đồ chính. */}
    {values.map((v, i) => (
      <button
        key={i}
        ref={(node) => {
          cellRefs.current[i] = node;
        }}
        type="button"
        tabIndex={i === t ? 0 : -1}
        aria-pressed={i === t}
        aria-label={`${DOW_FULL[dowOf(i)]}, ${hourBucketLabel(hourOf(i), timezone)}; ${
          v === null ? "chưa quan sát đủ" : pctOf(v)
        }`}
        onClick={() => onT(tOf(dowOf(i), hourOf(i)))}
        onKeyDown={move}
        title={`${DOW_LABELS[dowOf(i)]} ${hourBucketLabel(hourOf(i), timezone)} — ${
          v === null ? "chưa quan sát đủ" : pctOf(v)
        }`}
        className="absolute z-[1] cursor-pointer border-0 bg-transparent p-0 outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        style={{
          left: LEFT + hourOf(i) * CELL_W,
          top: TOP + dowOf(i) * CELL_H,
          width: CELL_W,
          height: CELL_H,
        }}
      />
    ))}
    </div>
  );
}

const pctOf = (v: number) =>
  `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% cổng bận`;

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}
