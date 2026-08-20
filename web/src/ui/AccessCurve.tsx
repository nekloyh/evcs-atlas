/**
 * Phase 4 — Access: Access Population Curve (PHASE4_VISUALIZATION.md §1.4).
 *
 * Chart ID: access-population-curve
 * All-population denominator, 2 km hairline & callout. Read-only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";

import { scaleUnit } from "../units";
import { BASEMAP_HEX, HAIRLINE_HEX, INK_2_HEX, INK_MUTED_HEX, getThemePalette, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import type { AccessCurveModel } from "../viz/chart-models";
import { Readout } from "./Readout";
import { CHART_W } from "./chart-size";

const INK_2 = INK_2_HEX;

export const CALLOUT_M = 2_000;

const W = CHART_W;
const H = 128;
const M = { left: 34, right: 10, top: 8, bottom: 24 };

const asPct = (d: number) => `${Math.round(d * 100)}%`;

export function AccessCurve({ model, theme }: { model: AccessCurveModel; theme: AnalysisTheme }) {
  const SERIES = seriesColorForTheme(theme);
  const CALLOUT = getThemePalette(theme).hex[6];
  const host = useRef<HTMLDivElement>(null);
  const [hoverDist, setHoverDist] = useState<number | null>(null);

  const xMax = Math.max(model.maxDomainDistanceM, CALLOUT_M, 1);
  const trimmed = model.maxDistanceM > xMax;

  const unit = useMemo(() => scaleUnit({ kind: "m" }, xMax), [xMax]);
  const fmtD = (m: number) =>
    `${(m / unit.divisor).toLocaleString("vi-VN", { maximumFractionDigits: unit.divisor === 1 ? 0 : 1 })}`;

  useEffect(() => {
    const el = host.current;
    if (!el || model.points.length === 0) return;

    const hasCallout = model.populationMeasured > 0;
    const callout = hasCallout
      ? [{ d: CALLOUT_M, share: model.shareWithin2km }]
      : [];

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
        label: `cự ly mạng đường tới trạm · ${unit.label} →`,
        labelAnchor: "center",
        labelOffset: 20,
      },
      y: { domain: [0, 1], ticks: 4, tickFormat: asPct, label: "% dân" },
      marks: [
        Plot.gridY({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.gridX({ stroke: HAIRLINE_HEX, strokeOpacity: 1, strokeWidth: 1 }),
        Plot.areaY(model.points, {
          x: "distanceM",
          y: "shareOfAllPop",
          fill: SERIES,
          fillOpacity: 0.1,
          curve: "step-after",
        }),
        Plot.line(model.points, {
          x: "distanceM",
          y: "shareOfAllPop",
          stroke: SERIES,
          strokeWidth: 2,
          curve: "step-after",
        }),
        ...(hasCallout
          ? [
              Plot.ruleX([CALLOUT_M], { stroke: HAIRLINE_HEX, strokeWidth: 2 }),
              Plot.dot(callout, {
                x: "d",
                y: "share",
                r: 4,
                fill: CALLOUT,
                stroke: BASEMAP_HEX,
                strokeWidth: 2,
              }),
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
  }, [model, xMax, unit.divisor, unit.label, SERIES, CALLOUT]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const plotW = W - M.left - M.right;
    const relX = Math.max(0, Math.min(1, (px - M.left) / plotW));
    const dist = relX * xMax;
    setHoverDist(dist);
  };

  // Find point at hoverDist
  let hoverPt = model.lookupPoints[0]!;
  if (hoverDist !== null) {
    for (const pt of model.lookupPoints) {
      if (pt.distanceM <= hoverDist) {
        hoverPt = pt;
      } else {
        break;
      }
    }
  }

  return (
    <div className="select-none min-w-0">
      <div
        className="relative cursor-crosshair touch-none"
        style={{ width: W, height: H }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverDist(null)}
      >
        <div ref={host} />
      </div>

      <Readout hint="rê chuột để tra phần trăm dân số trong từng cự ly">
        {hoverDist !== null && hoverPt && (
          <>
            <span className="tabular-nums font-semibold text-ink">
              {(hoverDist / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink">
              {(hoverPt.shareOfAllPop * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% dân số
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {hoverPt.cumulativePop.toLocaleString("vi-VN")} người
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {(model.populationMeasured - hoverPt.cumulativePop).toLocaleString("vi-VN")} người đo được ngoài cự ly
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {model.populationUnmeasured.toLocaleString("vi-VN")} người chưa rõ cự ly
            </span>
          </>
        )}
      </Readout>

      <div className="space-y-0.5 pt-1 text-note leading-snug text-ink-muted">
        {trimmed && (
          <p>
            Đã thu gọn 1% đuôi xa nhất (tới {(model.maxDistanceM / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km).
          </p>
        )}
        {model.populationUnmeasured > 0 && (
          <p>
            {model.populationUnmeasured.toLocaleString("vi-VN")} người ({((model.populationUnmeasured / model.populationTotal) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)
            sống ở ô chưa xác định được cự ly mạng đường tới trạm.
          </p>
        )}
      </div>
    </div>
  );
}
