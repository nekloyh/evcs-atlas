/**
 * Đường TIẾP CẬN tích luỹ theo DÂN — DESIGN.md §3d-2.
 *
 * Hình: một đường đơn điệu tăng, "bán kính → phần dân đã phủ". Một chuỗi ⇒ **không legend**
 * (tiêu đề đã gọi tên nó, §4d-2); wash 10% dưới đường để mắt bắt được hình dạng chứ không
 * phải một khối đặc.
 *
 * Ba vai màu, ba nguồn — y hệt `LorenzChart`, và cố ý y hệt: hai đường cong của app phải
 * đọc bằng cùng một từ vựng.
 *   · chuỗi dữ liệu — `c5`
 *   · mốc **2 km** — hairline. Nó KHÔNG phải chuỗi thứ hai nên nó không mang màu dữ liệu.
 *   · điểm được gọi tên tại mốc ấy — `c7`, đậm hơn trong CÙNG ramp.
 *
 * **Mốc 2 km không phải do tôi đặt.** Nó là ngưỡng đã có trong chính bộ dữ liệu
 * (`beyond2km = dist_station_network_m > 2000`, overlay §4d) — dùng lại nó, không bịa thêm
 * ngưỡng nào. Mọi bán kính khác trả lời bằng cách rê chuột, không bằng một nhãn nữa.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";

import { scaleUnit } from "../units";
import { BASEMAP_HEX, HAIRLINE_HEX, INK_2_HEX, INK_MUTED_HEX, RAMP_HEX } from "../viz/palette";
import { distForShare, shareWithin, thinAccess, type AccessCurve as Curve } from "../viz/access";
import { Readout } from "./Readout";
import { CHART_W } from "./chart-size";

const SERIES = RAMP_HEX[4];
const CALLOUT = RAMP_HEX[6];
const INK_2 = INK_2_HEX;

/** Ngưỡng đã có trong dữ liệu (overlay `beyond2km`), không phải một con số mới. */
export const CALLOUT_M = 2_000;

/**
 * Trục dừng ở bán kính phủ được ngần này dân, phần còn lại là khoảng MỞ.
 *
 * Ảnh render bắt được lý do: `maxD` của Hà Nội là **21,2 km**, trong khi 99% dân đã nằm
 * trong ~5 km. Vẽ hết miền thì ba phần tư khung là một đường phẳng sát 100%, và toàn bộ
 * phần có hình dạng bị ép vào 60 px đầu. Đây đúng là luật §3b đã áp cho legend — "bậc cuối
 * là khoảng MỞ, in thêm `→ max`" — nên áp lại ở đây, kèm câu nói ra cái bị cắt.
 */
const TRIM_SHARE = 0.99;

const W = CHART_W;
const H = 132;
const M = { left: 34, right: 10, top: 8, bottom: 26 };

const asPct = (d: number) => `${Math.round(d * 100)}%`;

export function AccessCurve({ data }: { data: Curve }) {
  const host = useRef<HTMLDivElement>(null);
  const [atPx, setAtPx] = useState<number | null>(null);

  // Mốc 2 km luôn phải nằm TRONG trục — nếu không, chú thích duy nhất của hình rơi ra ngoài
  // khung ở đúng những tỉnh mà mọi người đều ở gần trạm.
  const xMax = Math.max(distForShare(data, TRIM_SHARE) ?? data.maxD, CALLOUT_M, 1);
  const trimmed = data.maxD > xMax;

  // Thang đơn vị chốt MỘT LẦN cho cả trục (§6a): trộn "600 m" với "5 km" trên cùng một hàng
  // tick là bắt người đọc đổi đơn vị giữa hai nhãn cạnh nhau.
  const unit = useMemo(() => scaleUnit({ kind: "m" }, xMax), [xMax]);
  const fmtD = (m: number) =>
    `${(m / unit.divisor).toLocaleString("vi-VN", { maximumFractionDigits: unit.divisor === 1 ? 0 : 1 })}`;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const curve = thinAccess(data.curve);
    const hasCallout = data.maxD >= CALLOUT_M;
    const callout = hasCallout ? [{ d: CALLOUT_M, share: shareWithin(data, CALLOUT_M) }] : [];

    const chart = Plot.plot({
      width: W,
      height: H,
      marginLeft: M.left,
      marginRight: M.right,
      marginTop: M.top,
      marginBottom: M.bottom,
      style: { background: "transparent", fontSize: "9px", color: INK_MUTED_HEX },
      x: {
        domain: [0, xMax],
        ticks: 4,
        tickFormat: fmtD,
        label: `bán kính tới trạm · ${unit.label} →`,
        labelAnchor: "center",
        labelOffset: 22,
      },
      y: { domain: [0, 1], ticks: 4, tickFormat: asPct, label: null },
      marks: [
        // Lưới hairline ĐẶC, một bậc lệch khỏi surface. Không nét đứt — nét đứt đọc thành
        // "ngưỡng" trong khi ngưỡng thật ở đây là đúng một đường, vẽ bên dưới.
        Plot.gridY({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.gridX({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.areaY(curve, { x: "d", y: "share", fill: SERIES, fillOpacity: 0.1, curve: "step-after" }),
        // `step-after`: giá trị của một hàm bậc thang tại `d` là bậc ĐÃ đạt tới. Nối thẳng
        // hai điểm sẽ vẽ ra những phần dân chưa được phủ ở bán kính đó.
        Plot.line(curve, { x: "d", y: "share", stroke: SERIES, strokeWidth: 2, curve: "step-after" }),
        ...(hasCallout
          ? [
              Plot.ruleX([CALLOUT_M], { stroke: HAIRLINE_HEX, strokeWidth: 2 }),
              Plot.dot(callout, { x: "d", y: "share", r: 4, fill: CALLOUT, stroke: BASEMAP_HEX, strokeWidth: 2 }),
              // Nhãn trực tiếp, và CHỈ MỘT.
              Plot.text(callout, {
                x: "d",
                y: "share",
                text: (p: { share: number }) => `${asPct(p.share)} trong 2 km`,
                dx: 8,
                dy: 8,
                textAnchor: "start",
                fill: INK_2,
                fontSize: 10,
              }),
            ]
          : []),
      ],
    });
    el.append(chart);
    return () => chart.remove();
  }, [data, xMax, unit.divisor, unit.label]);

  // Đổi pixel ↔ mét bằng CHÍNH hai lề và CHÍNH miền mà Plot vừa dùng, không đo lại từ DOM.
  const inner = W - M.left - M.right;
  const dAt = atPx === null || inner <= 0 ? null : ((atPx - M.left) / inner) * xMax;
  const shareAt = dAt === null || dAt < 0 || dAt > xMax ? null : shareWithin(data, dAt);

  return (
    <div>
      <div
        ref={host}
        className="cursor-crosshair"
        style={{ width: W }}
        onPointerMove={(e) => setAtPx(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setAtPx(null)}
      />
      <Readout hint="rê ngang để đọc “trong bao nhiêu mét thì phủ được bao nhiêu dân”">
        {dAt !== null && shareAt !== null && (
          <>
            <span className="tabular-nums text-ink">
              {fmtD(dAt)} {unit.label}
            </span>
            <span className="text-ink-muted">phủ</span>
            <span className="tabular-nums text-ink">{asPct(shareAt)} dân</span>
            <span className="text-ink-muted">
              · {Math.round(shareAt * data.popMeasured).toLocaleString("vi-VN")} người
            </span>
          </>
        )}
      </Readout>
      {trimmed && (
        <p className="pt-0.5 text-note leading-snug text-ink-muted">
          Trục dừng ở {asPct(TRIM_SHARE)} dân; {asPct(1 - TRIM_SHARE)} còn lại kéo tới{" "}
          <span className="text-ink-2">
            {(data.maxD / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km
          </span>{" "}
          — vẽ hết miền thì ba phần tư khung là một đường phẳng và phần có hình dạng bị ép mất.
        </p>
      )}
      {data.popUnmeasured > 0 && (
        <p className="pt-0.5 text-note leading-snug text-ink-muted">
          {Math.round(data.popUnmeasured).toLocaleString("vi-VN")} người ở ô không đo được khoảng
          cách — họ không nằm trên trục này, và không được cộng vào bất kỳ bán kính nào.
        </p>
      )}
    </div>
  );
}
