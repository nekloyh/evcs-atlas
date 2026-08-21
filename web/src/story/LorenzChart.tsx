import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";

import { HAIRLINE_HEX, BASEMAP_HEX, INK_2_HEX, INK_MUTED_HEX, getThemePalette, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import { Readout } from "../ui/Readout";
import { areaShareForPop, popShareForArea, thin, type Lorenz } from "../viz/lorenz";

/**
 * Đường Lorenz "x% diện tích chứa y% dân" — biểu đồ ĐẦU TIÊN của app (DESIGN.md §13d-A).
 *
 * Màu lấy nguyên từ §4 qua §4d-2, không có palette riêng cho chart: mọi hex ở §4 đã qua
 * `validate_palette.js` trên surface `#f2f3f0`, và một màu mới sẽ phải đo lại toàn bộ 21
 * cặp + hai kiểu mù màu + mực chữ §4c.
 *
 * Bốn vai, bốn nguồn màu:
 *   · chuỗi dữ liệu — `c5` (ramp cam). MỘT chuỗi ⇒ KHÔNG legend, tiêu đề đã gọi tên nó.
 *   · đường tham chiếu "nếu trải đều" — hairline `#e1e0d9`. Nó không phải chuỗi thứ hai,
 *     nên nó không được mang màu dữ liệu.
 *   · điểm được gọi tên — `c7`, tức ĐẬM HƠN trong CÙNG ramp, không phải một hue thứ hai.
 *   · trục · nhãn · số — mực §4e. Chữ không bao giờ mang màu dữ liệu.
 */

const INK_2 = INK_2_HEX;

/** Ngưỡng được gọi tên trên đường cong: "bao nhiêu phần diện tích thì đủ chứa một nửa Hà Nội". */
export const CALLOUT_POP_SHARE = 0.5;

/**
 * Nhãn trục.
 *
 * Tự định dạng thay vì dùng `percent: true` của Plot — và đây là một cái bẫy đã sập một
 * lần, nên nó được ghi lại: `percent: true` nhân **giá trị** với 100 nhưng **không** nhân
 * `domain`. Đặt cả hai (`percent: true` + `domain: [0, 1]`) thì dữ liệu 0–1 thành 0–100
 * trong một khung chỉ cao tới 1 — đường cong bắn thẳng lên và ra khỏi khung, mà **không có
 * lỗi nào**: trông y hệt một phân bố cực đoan, tức đúng cái mà biểu đồ này định chứng minh.
 * Cùng loại bẫy với `INITIAL_VIEW` ở §11 — sai lặng lẽ, và triệu chứng trông hợp lý.
 */
const asPct = (d: number) => `${Math.round(d * 100)}%`;

/** Lề của khung vẽ. Readout đổi pixel ↔ tỉ lệ diện tích bằng CHÍNH hai số này. */
const MARGIN = { left: 52, right: 18 };

export function LorenzChart({
  data,
  theme,
  width = 356,
}: {
  data: Lorenz;
  theme: AnalysisTheme;
  width?: number;
}) {
  /** `c5` — chuỗi dữ liệu. */
  const SERIES = seriesColorForTheme(theme);
  /** `c7` — điểm được gọi tên. Nhấn bằng độ đậm trong cùng ramp (§4d-2). */
  const CALLOUT = getThemePalette(theme).hex[6];
  const host = useRef<HTMLDivElement>(null);
  const [areaAt, setAreaAt] = useState<number | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const curve = thin(data.curve);
    const ax = areaShareForPop(data, CALLOUT_POP_SHARE);
    const callout = ax === null ? [] : [{ a: ax, p: CALLOUT_POP_SHARE }];

    const chart = Plot.plot({
      width,
      height: 240,
      // Lề đo từ ảnh chụp, không đoán: nhãn tick `100%` ở 10px rộng ~26 px, nên lề trái 42
      // không còn chỗ cho nhãn trục xoay dọc (nó đè lên tick `60%`), và lề phải 10 xén mất
      // chữ `%` của tick cuối cùng.
      marginLeft: MARGIN.left,
      marginBottom: 34,
      marginTop: 10,
      marginRight: MARGIN.right,
      style: { background: "transparent", fontSize: "10px", color: INK_MUTED_HEX },
      x: {
        domain: [0, 1],
        label: "phần diện tích trong ranh giới, dày dân nhất trước →",
        labelAnchor: "center",
        labelOffset: 30,
        ticks: 5,
        tickFormat: asPct,
      },
      y: {
        domain: [0, 1],
        label: "↑ phần dân số cộng dồn",
        labelAnchor: "center",
        ticks: 5,
        tickFormat: asPct,
      },
      marks: [
        // Lưới + trục: hairline ĐẶC, một bậc lệch khỏi surface, lùi hẳn về sau (§4d-2).
        // Không nét đứt — nét đứt đọc thành "ngưỡng" hoặc "dự báo" trong khi nó chỉ là lưới.
        Plot.gridX({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.gridY({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),

        // ĐƯỜNG THAM CHIẾU: "nếu người trải đều thì đường cong nằm ở đây". Đây là cái mà
        // luận điểm A phủ định, nên nó phải có mặt — một đường cong không có gì để so thì
        // không nói được là nó cong.
        Plot.line(
          [
            { a: 0, p: 0 },
            { a: 1, p: 1 },
          ],
          { x: "a", y: "p", stroke: HAIRLINE_HEX, strokeWidth: 2 },
        ),

        // Vệt tô giữa đường cong và đường chéo — chính là "sự vón cục", ở dạng diện tích.
        // Wash ~10% (spec mark của skill dataviz), không phải khối đặc.
        Plot.areaY(curve, { x: "a", y1: (d: { p: number; a: number }) => d.a, y2: "p", fill: SERIES, fillOpacity: 0.1 }),

        Plot.line(curve, { x: "a", y: "p", stroke: SERIES, strokeWidth: 2, strokeLinejoin: "round" }),

        // Điểm được gọi tên + vòng viền 2px màu surface, để nó không lẫn vào đường bên dưới.
        Plot.dot(callout, { x: "a", y: "p", r: 4.5, fill: CALLOUT, stroke: BASEMAP_HEX, strokeWidth: 2 }),
        // Nhãn trực tiếp, và CHỈ MỘT — một con số cạnh mọi điểm thì không con số nào được đọc.
        Plot.text(callout, {
          x: "a",
          y: "p",
          text: (d: { a: number }) => `${(d.a * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% diện tích`,
          dx: 10,
          dy: 2,
          textAnchor: "start",
          fill: INK_2,
          fontSize: 11,
        }),
      ],
    });

    el.append(chart);
    return () => chart.remove();
  }, [data, width, SERIES, CALLOUT]);

  const p = areaAt === null ? null : popShareForArea(data, areaAt);

  return (
    <div className="px-2 py-2">
      {/*
        Lớp phủ đọc số. Nó KHÔNG brush gì — cảnh CÂU CHUYỆN không có bộ lọc (§3d-1) — nó chỉ
        biến đường cong từ một hình thành một thứ tra được. Trước lượt này, Lorenz có đúng
        MỘT điểm được gọi tên (§13d-A cấm nhãn ở mọi điểm, và đúng), nên mọi câu hỏi khác
        ("20% diện tích thì bao nhiêu dân?") không trả lời được. Rê chuột trả lời được cả
        đường cong mà vẫn giữ hình sạch — nhãn chỉ hiện khi được hỏi.
      */}
      <div
        ref={host}
        className="cursor-crosshair"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const inner = r.width - MARGIN.left - MARGIN.right;
          const a = inner > 0 ? (e.clientX - r.left - MARGIN.left) / inner : -1;
          setAreaAt(a >= 0 && a <= 1 ? a : null);
        }}
        onPointerLeave={() => setAreaAt(null)}
      />
      <Readout hint="rê ngang để đọc “x% diện tích chứa bao nhiêu dân”">
        {areaAt !== null && p !== null && (
          <>
            <span className="tabular-nums text-ink">{asPct(areaAt)} diện tích</span>
            <span className="text-ink-muted">chứa</span>
            <span className="tabular-nums text-ink">{asPct(p)} dân</span>
            <span className="text-ink-muted">
              · nếu trải đều thì đúng {asPct(areaAt)}
            </span>
          </>
        )}
      </Readout>
    </div>
  );
}
