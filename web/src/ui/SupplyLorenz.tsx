/**
 * Đường tập trung CUNG ↔ CẦU — DESIGN.md §3d-3.
 *
 * "x% dân được phục vụ dày nhất nắm y% số cổng." Cùng hình, cùng bộ màu và cùng cách đọc
 * với `LorenzChart` của cảnh CÂU CHUYỆN — **cố ý**: hai đường cong của app phải dùng chung
 * một từ vựng thị giác, nếu không mentor phải học hai lần cùng một cách đọc. Khác duy nhất
 * là hai TRỤC, và hai nhãn trục nói thẳng điều đó.
 *
 * Gini đi kèm đường cong chứ KHÔNG thay nó: một con số nói "lệch bao nhiêu", đường cong nói
 * "lệch theo hình dạng nào" — và câu hỏi "cung có đi theo cầu không" cần cái thứ hai.
 */

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";

import { areaShareForPop, popShareForArea, thin } from "../viz/lorenz";
import type { SupplyEquity } from "../viz/equity";
import { BASEMAP_HEX, HAIRLINE_HEX, INK_2_HEX, INK_MUTED_HEX, RAMP_HEX } from "../viz/palette";
import { Readout } from "./Readout";
import { CHART_W } from "./chart-size";

const SERIES = RAMP_HEX[4];
const CALLOUT = RAMP_HEX[6];
const INK_2 = INK_2_HEX;

/** Mốc được gọi tên: "bao nhiêu phần dân thì nắm một nửa số cổng của thành phố". */
const CALLOUT_PORT_SHARE = 0.5;

const W = CHART_W;
const H = 150;
const M = { left: 34, right: 12, top: 8, bottom: 26 };

const asPct = (d: number) => `${Math.round(d * 100)}%`;

export function SupplyLorenz({ data }: { data: SupplyEquity }) {
  const host = useRef<HTMLDivElement>(null);
  const [atPx, setAtPx] = useState<number | null>(null);
  const { l } = data;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const curve = thin(l.curve);
    const px = areaShareForPop(l, CALLOUT_PORT_SHARE);
    const callout = px === null ? [] : [{ a: px, p: CALLOUT_PORT_SHARE }];

    const chart = Plot.plot({
      width: W,
      height: H,
      marginLeft: M.left,
      marginRight: M.right,
      marginTop: M.top,
      marginBottom: M.bottom,
      style: { background: "transparent", fontSize: "9px", color: INK_MUTED_HEX },
      x: {
        domain: [0, 1],
        ticks: 4,
        tickFormat: asPct,
        label: "phần dân, dày cổng/người nhất trước →",
        labelAnchor: "center",
        labelOffset: 22,
      },
      y: { domain: [0, 1], ticks: 4, tickFormat: asPct, label: null },
      marks: [
        Plot.gridX({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.gridY({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        // Đường tham chiếu "nếu cung đi ĐÚNG theo cầu". Đây là cái mà hình này phủ định,
        // nên nó phải có mặt — một đường cong không có gì để so thì không nói được là nó cong.
        Plot.line(
          [
            { a: 0, p: 0 },
            { a: 1, p: 1 },
          ],
          { x: "a", y: "p", stroke: HAIRLINE_HEX, strokeWidth: 2 },
        ),
        Plot.areaY(curve, { x: "a", y1: (d: { a: number }) => d.a, y2: "p", fill: SERIES, fillOpacity: 0.1 }),
        Plot.line(curve, { x: "a", y: "p", stroke: SERIES, strokeWidth: 2, strokeLinejoin: "round" }),
        Plot.dot(callout, { x: "a", y: "p", r: 4, fill: CALLOUT, stroke: BASEMAP_HEX, strokeWidth: 2 }),
        Plot.text(callout, {
          x: "a",
          y: "p",
          text: (d: { a: number }) => `${asPct(d.a)} dân nắm nửa số cổng`,
          dx: 8,
          dy: 6,
          textAnchor: "start",
          fill: INK_2,
          fontSize: 10,
        }),
      ],
    });
    el.append(chart);
    return () => chart.remove();
  }, [l]);

  const inner = W - M.left - M.right;
  const aAt = atPx === null || inner <= 0 ? null : (atPx - M.left) / inner;
  const pAt = aAt === null || aAt < 0 || aAt > 1 ? null : popShareForArea(l, aAt);

  return (
    <div>
      {/* Số dẫn đầu: figure TỈ LỆ, không `tabular-nums` — nó đứng một mình, không xếp cột
          với số nào (§4e). */}
      <div className="flex items-baseline gap-2 pb-1">
        <span className="text-readout leading-none text-ink">
          {l.gini.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-note leading-snug text-ink-muted">
          Gini của cổng theo dân — 0 là mỗi người một phần bằng nhau, 1 là dồn hết vào một chỗ
        </span>
      </div>

      <div
        ref={host}
        className="cursor-crosshair"
        style={{ width: W }}
        onPointerMove={(e) => setAtPx(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setAtPx(null)}
      />

      <Readout hint="rê ngang để đọc “x% dân nắm bao nhiêu phần cổng”">
        {aAt !== null && pAt !== null && (
          <>
            <span className="tabular-nums text-ink">{asPct(aAt)} dân</span>
            <span className="text-ink-muted">nắm</span>
            <span className="tabular-nums text-ink">{asPct(pAt)} cổng</span>
            <span className="text-ink-muted">· nếu theo đúng cầu thì {asPct(aAt)}</span>
          </>
        )}
      </Readout>

      {data.portsNoPop > 0 && (
        <p className="pt-0.5 text-note leading-snug text-ink-muted">
          {data.portsNoPop.toLocaleString("vi-VN")}/{data.portsAll.toLocaleString("vi-VN")} cổng nằm
          ở ô <span className="text-ink-2">không có dân</span> — bãi đỗ, khu công nghiệp, trạm dừng.
          Chúng không thuộc về phần dân nào nên không nằm trên đường này; đó cũng chính là phần
          cung mà câu hỏi “cung theo cầu” không giải thích được.
        </p>
      )}
    </div>
  );
}
