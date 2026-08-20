/**
 * Phase 4.2 — Opportunity EVIDENCE: Demand × Access Scatter.
 *
 * Chart ID: `opportunity-demand-access-scatter` — **bằng chứng, không phải biểu đồ chính**.
 *
 * ── Biểu đồ này KHÔNG PHÁT GÌ ─────────────────────────────────────────────────────────
 *
 * Không bộ lọc, không mốc giờ, không lựa chọn thực thể. Ba `on*Intent` **vắng mặt khỏi kiểu
 * props**, không phải "có mà không dùng": một lần nối dây về sau là một lỗi biên dịch chứ
 * không phải một hành vi mới lặng lẽ xuất hiện.
 *
 * Và điều đó đã được state bảo đảm sẵn, không chỉ bằng lời hứa (CR 4.2 F1): `isFilterCompatible`
 * chỉ nhận filter `h3-cell` dưới lens Cầu và filter `station` dưới lens Cung — cả ba cửa
 * (boot, `hashchange`, `switchLens`/`setField`) đều chạy nó. Dưới lens Cơ hội **không có
 * filter nào tồn tại được**, nên biểu đồ này không có tập con nào để vẽ và không có gì để phát.
 *
 * Vì thế bản này VIẾT LẠI module cũ thay vì nối dây nó: bản M4 import `ScatterBrush`,
 * `SCATTER_X`, `SCATTER_Y` từ `state/brush.ts` và `useDragRect` từ `brush-overlay`. Gắn nó
 * lên như cũ sẽ hồi sinh đúng module brush mà §5.5 bước 5 đã cho nghỉ, tức là dựng lại một
 * HÌNH DẠNG BỘ LỌC THỨ HAI — chuyện mà §1.7 hoãn hẳn việc kích hoạt biểu đồ này để tránh.
 *
 * ── Vì sao đọc TOẠ ĐỘ CON TRỎ chứ không đọc "chấm gần nhất" ───────────────────────────
 *
 * Giữ lại lý lẽ của bản cũ, nay có số đo: tới 89 ô H3 trên một pixel. "Chấm gần nhất" trả về
 * một phần tử tuỳ ý trong chồng ấy và đọc thành một khẳng định về MỘT ô cụ thể mà nó không
 * có quyền nói. Toạ độ con trỏ thì luôn đúng, và `n` trả lời đúng câu người ta hỏi khi nhìn
 * một vệt đậm: "ở đây có bao nhiêu ô".
 */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { COLOR_PANEL } from "../design-tokens";
import { BEYOND_2KM_M } from "../domain-thresholds";
import { formatIn, type UnitSpec } from "../units";
import { HAIRLINE_HEX, INK_2_HEX, INK_MUTED_HEX, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import {
  SCATTER_COLS,
  SCATTER_LATTICE_PX,
  SCATTER_PLOT_H,
  SCATTER_PLOT_W,
  SCATTER_ROWS,
  populationAtFrac,
  scatterDistAtFrac,
  scatterDistFrac,
  scatterStackAt,
  type DemandAccessScatterModel,
} from "../viz/chart-models";
import { CHART_W } from "./chart-size";
import { formatNumber, formatPop } from "./format";
import { Readout } from "./Readout";
import {
  SCATTER_EMPTY_LATTICE,
  SCATTER_HOVER_HINT,
  SCATTER_RULE_LABEL,
  SCATTER_STATE_COPY,
  SCATTER_X_AXIS_TITLE,
  scatterCountsLines,
  scatterXDecadeTicks,
  scatterYTicks,
} from "./scatter-copy";

const W = CHART_W;
const H = 168;
/**
 * `left: 40` chứ không phải 32 của histogram: vạch Y ở đây mang nhãn km. Hai biểu đồ không
 * bao giờ cùng hiện (khác lens), nên yêu cầu ĐỒNG BỘ nằm ở phép ánh xạ dữ liệu→phân số, chứ
 * không nằm ở pixel. `296 − 40 − 8 = 248` và `168 − 6 − 28 = 134`: khung chia hết cho lưới 2 px.
 */
const M = { left: 40, right: 8, top: 6, bottom: 28 };

/** Ô lưới đầu tiên của dải DƯƠNG — chỗ con trỏ bàn phím hạ xuống ở lần focus đầu. */
const FIRST_POSITIVE_COL = Math.floor(SCATTER_COLS / 24);

const clampIndex = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

interface Cursor {
  col: number;
  row: number;
}

export function Scatter({
  model,
  theme,
  distUnit,
}: {
  /** `null` = snapshot lưới ô H3 chưa nằm trong RAM (§F, trạng thái Đang nạp). */
  model: DemandAccessScatterModel | null;
  /** Mực chuỗi = anchor `series` của theme lens đang mở (CR 4.1 §C2). */
  theme: AnalysisTheme;
  /** PHẢI là `FIELD_BY_ID.get("dist_station_network_m").unit` — presenter không gõ đơn vị. */
  distUnit: UnitSpec;
}) {
  const SERIES = seriesColorForTheme(theme);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  // Chỉ phím mới đọc thành tiếng: một cú rê 60 Hz sẽ biến vùng live thành tiếng ồn liên tục.
  const [spoken, setSpoken] = useState("");
  const plotRef = useRef<SVGRectElement>(null);

  const yTicks = useMemo(
    () => scatterYTicks(model?.maxDistanceM ?? 0, distUnit),
    [model?.maxDistanceM, distUnit],
  );
  const xTicks = useMemo(
    () => (model ? scatterXDecadeTicks(model.domain, SCATTER_PLOT_W) : []),
    [model],
  );

  if (!model) {
    return (
      <p className="py-4 text-center text-note text-ink-muted" role="status">
        {SCATTER_STATE_COPY.loading}
      </p>
    );
  }

  const counts = scatterCountsLines(model);

  if (model.nPlotted === 0) {
    // Không khung trục rỗng: §6.1 mục 4. Một khung trống đọc thành "đo rồi, không có gì".
    return (
      <div className="space-y-0.5 text-note leading-snug text-ink-muted">
        <p className="text-ink-2">{SCATTER_STATE_COPY.empty}</p>
        {counts.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    );
  }

  const ruleFrac = scatterDistFrac(BEYOND_2KM_M, model.maxDistanceM);
  const ruleY = M.top + (1 - ruleFrac) * SCATTER_PLOT_H;
  const ruleInBox = model.maxDistanceM >= BEYOND_2KM_M;
  const ruleRow = clampIndex(Math.floor((1 - ruleFrac) * SCATTER_ROWS), SCATTER_ROWS - 1);

  /** Tâm ô lưới → giá trị THẬT của hai trục. Không luỹ thừa nào tới được màn hình. */
  const readAt = (c: Cursor) => {
    const fx = ((c.col + 0.5) * SCATTER_LATTICE_PX) / SCATTER_PLOT_W;
    const fy = 1 - ((c.row + 0.5) * SCATTER_LATTICE_PX) / SCATTER_PLOT_H;
    return {
      pop: populationAtFrac(fx, model.domain),
      dist: scatterDistAtFrac(fy, model.maxDistanceM),
      n: scatterStackAt(model, c.col, c.row),
    };
  };

  const readoutText = (c: Cursor) => {
    const r = readAt(c);
    const d = `${formatIn(r.dist, yTicks.scaled)} ${yTicks.scaled.label}`;
    /*
     * CR viết `formatPop(x)` cho dòng đọc. Ảnh render bác: `GridCell.pop` là số THỰC, và
     * `formatPop` làm tròn mọi giá trị dưới 0,5 thành đúng chuỗi `"0"` — tức là nhãn của khe
     * `=0`. Trên `p/01` con trỏ ở ô lưới thứ 7 (đã nằm trong dải DƯƠNG) đọc ra "0 người",
     * khẳng định một ô không người ở chỗ dữ liệu nói có người. `formatPop` vẫn đúng cho nhãn
     * trục — ở đó mọi giá trị là một bậc thập phân — nhưng sai cho một vị trí con trỏ bất kỳ.
     */
    const pop = r.pop === 0 ? "đúng 0" : formatNumber(r.pop);
    return `${pop} người · ${d} · ${r.n > 0 ? `${r.n.toLocaleString("vi-VN")} ô` : SCATTER_EMPTY_LATTICE}`;
  };

  const cursorAt = (clientX: number, clientY: number): Cursor | null => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      col: clampIndex(Math.floor(((clientX - box.left) / box.width) * SCATTER_COLS), SCATTER_COLS - 1),
      row: clampIndex(Math.floor(((clientY - box.top) / box.height) * SCATTER_ROWS), SCATTER_ROWS - 1),
    };
  };

  /** Đặt con trỏ + đọc thành tiếng. Tính NGOÀI updater: updater phải thuần. */
  const commit = (next: Cursor) => {
    setCursor(next);
    setSpoken(readoutText(next));
  };

  const moveBy = (dc: number, dr: number) => {
    const base = cursor ?? { col: FIRST_POSITIVE_COL, row: ruleRow };
    commit({
      col: clampIndex(base.col + dc, SCATTER_COLS - 1),
      row: clampIndex(base.row + dr, SCATTER_ROWS - 1),
    });
  };

  const jumpTo = (col: number) => commit({ col, row: cursor?.row ?? ruleRow });

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowLeft": moveBy(-step, 0); break;
      case "ArrowRight": moveBy(step, 0); break;
      // Trục Y của SVG chạy ngược: phím LÊN là chỉ số hàng GIẢM. Viết ra vì đây là chỗ dễ
      // lật dấu nhất, và lật dấu thì con trỏ đi ngược mà không có lỗi nào phát ra.
      case "ArrowUp": moveBy(0, -step); break;
      case "ArrowDown": moveBy(0, step); break;
      case "Home": jumpTo(0); break;
      case "End": jumpTo(SCATTER_COLS - 1); break;
      case "Escape": setCursor(null); setSpoken(""); return;
      default: return;
    }
    e.preventDefault();
  };

  const ariaLabel =
    `${SCATTER_X_AXIS_TITLE}. ${yTicks.axisTitle}. ` +
    counts.join(" ") +
    " Dùng phím mũi tên để đọc mốc hai trục.";

  return (
    <div className="select-none min-w-0">
      {/*
        MỘT tiêu đề trên đầu, không phải hai. Ảnh render bắt được: hai câu đơn vị đặt cạnh
        nhau trong một dải 296 px thì cả hai cùng xuống hai dòng và đọc thành một khối chữ.
        Tiêu đề X đi xuống ĐÁY khung — chỗ trục X thật sự nằm — trong phần lề `bottom: 28`
        vốn được nới ra (histogram dùng 22) chính vì lý do này.
      */}
      <div className="truncate pb-1 text-note text-ink-muted">{yTicks.axisTitle}</div>

      <div
        className="relative cursor-crosshair touch-none"
        style={{ width: W, height: H }}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        // Lần focus đầu hạ con trỏ xuống ĐÚNG đường 2 km ở mép trái dải dương, nên thứ đầu
        // tiên một người đọc bằng bàn phím gặp là luật miền đã khai báo.
        onFocus={() => setCursor((prev) => prev ?? { col: FIRST_POSITIVE_COL, row: ruleRow })}
        onPointerMove={(e) => setCursor(cursorAt(e.clientX, e.clientY))}
        onPointerLeave={() => setCursor(null)}
      >
        <svg width={W} height={H} className="overflow-visible">
          {/* Lưới ngang ở đúng vị trí vạch Y — mắt đọc mốc mà không phải kẻ tay. */}
          {yTicks.values.map((v, i) => {
            const y = M.top + (1 - i / (yTicks.values.length - 1)) * SCATTER_PLOT_H;
            return (
              <line
                key={v}
                x1={M.left}
                x2={M.left + SCATTER_PLOT_W}
                y1={y}
                y2={y}
                stroke={HAIRLINE_HEX}
                strokeDasharray={i === 0 ? undefined : "2,2"}
              />
            );
          })}

          {/* Vách ngăn khe `=0` với dải dương — cùng cấu tạo với §1.2. */}
          {model.domain.hasPositive && (
            <line
              x1={M.left + SCATTER_PLOT_W / 24}
              x2={M.left + SCATTER_PLOT_W / 24}
              y1={M.top}
              y2={M.top + SCATTER_PLOT_H + 4}
              stroke={INK_MUTED_HEX}
              strokeWidth={1}
            />
          )}

          {/*
            MỘT `<path>` cho mỗi bậc chồng, tối đa sáu — bất kể bộ dữ liệu có 4.397 hay
            200.000 hàng. Không hàng nào bị bỏ và không hàng nào bị rút mẫu: góc "đông người
            mà xa trạm" là phần THƯA của đám mây, nên mọi luật rút mẫu đều xoá ưu tiên đúng
            những chấm mà biểu đồ này tồn tại để cho thấy.
          */}
          <g transform={`translate(${M.left}, ${M.top})`}>
            {model.levels.map((lv) => (
              <path
                key={lv.level}
                d={lv.marks
                  .map((m) => {
                    const x = m.col * SCATTER_LATTICE_PX;
                    const y = m.row * SCATTER_LATTICE_PX;
                    return `M${x} ${y}h${SCATTER_LATTICE_PX}v${SCATTER_LATTICE_PX}h-${SCATTER_LATTICE_PX}Z`;
                  })
                  .join("")}
                fill={SERIES}
                fillOpacity={lv.alpha}
                shapeRendering="crispEdges"
              />
            ))}
          </g>

          {/* Đường 2 km, vẽ TRÊN các mark. Nhãn nói *ngưỡng quy định*, không nói *break*. */}
          {ruleInBox && (
            <g pointerEvents="none">
              <line
                x1={M.left}
                x2={M.left + SCATTER_PLOT_W}
                y1={ruleY}
                y2={ruleY}
                stroke={HAIRLINE_HEX}
                strokeWidth={2}
              />
              {/*
                Quầng nền cùng màu panel quanh chữ. Ảnh render bắt được: đường 2 km rơi đúng
                vào dải ĐẶC nhất của đám mây, nên nhãn nằm đè lên hàng trăm mark và nhoè đi.
                `paintOrder="stroke"` vẽ viền TRƯỚC rồi mới vẽ ruột chữ — cùng thủ pháp tách
                nền mà `AccessCurve` dùng cho chấm callout (`stroke={BASEMAP_HEX}`), chứ không
                phải một thẻ nổi (§3 cấm vô điều kiện).
              */}
              <text
                x={M.left + 3}
                y={ruleY - 3}
                fontSize={9}
                fill={INK_2_HEX}
                stroke={COLOR_PANEL}
                strokeWidth={2.5}
                paintOrder="stroke"
                strokeLinejoin="round"
                textAnchor="start"
              >
                {SCATTER_RULE_LABEL}
              </text>
            </g>
          )}

          {/* Con trỏ đọc — hai nét mảnh, không một thẻ nổi nào (§3 cấm vô điều kiện). */}
          {cursor && (
            <g pointerEvents="none">
              <line
                x1={M.left + (cursor.col + 0.5) * SCATTER_LATTICE_PX}
                x2={M.left + (cursor.col + 0.5) * SCATTER_LATTICE_PX}
                y1={M.top}
                y2={M.top + SCATTER_PLOT_H}
                stroke={INK_MUTED_HEX}
                strokeDasharray="2,2"
              />
              <line
                x1={M.left}
                x2={M.left + SCATTER_PLOT_W}
                y1={M.top + (cursor.row + 0.5) * SCATTER_LATTICE_PX}
                y2={M.top + (cursor.row + 0.5) * SCATTER_LATTICE_PX}
                stroke={INK_MUTED_HEX}
                strokeDasharray="2,2"
              />
            </g>
          )}

          {/* Vùng bắt con trỏ — cũng là hệ quy chiếu pixel của phép đổi toạ độ. */}
          <rect
            ref={plotRef}
            x={M.left}
            y={M.top}
            width={SCATTER_PLOT_W}
            height={SCATTER_PLOT_H}
            fill="transparent"
          />

          {/* Vạch Y: giá trị đã nghịch biến đổi về mét, in qua `scaleUnit` một thang chung. */}
          {yTicks.labels.map((label, i) => (
            <text
              key={yTicks.values[i]}
              x={M.left - 4}
              y={M.top + (1 - i / (yTicks.values.length - 1)) * SCATTER_PLOT_H + 3}
              fontSize={9}
              fill={INK_MUTED_HEX}
              textAnchor="end"
            >
              {label}
            </text>
          ))}

          {/* Vạch X: dân số THẬT, không phải logarit. */}
          <text
            x={M.left + SCATTER_PLOT_W / 48}
            y={H - 16}
            fontSize={9}
            fill={INK_MUTED_HEX}
            textAnchor="middle"
          >
            =0
          </text>
          {xTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={M.left + tick.frac * SCATTER_PLOT_W}
                x2={M.left + tick.frac * SCATTER_PLOT_W}
                y1={M.top + SCATTER_PLOT_H}
                y2={M.top + SCATTER_PLOT_H + 3}
                stroke={INK_MUTED_HEX}
              />
              <text
                x={M.left + tick.frac * SCATTER_PLOT_W}
                y={H - 16}
                fontSize={9}
                fill={INK_MUTED_HEX}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}
          {model.domain.hasPositive && (
            <text x={W - M.right} y={H - 16} fontSize={9} fill={INK_MUTED_HEX} textAnchor="end">
              {formatPop(model.domain.maxPop)}
            </text>
          )}
          <text x={W - M.right} y={H - 3} fontSize={9} fill={INK_MUTED_HEX} textAnchor="end">
            {SCATTER_X_AXIS_TITLE} →
          </text>
        </svg>
      </div>

      <Readout hint={SCATTER_HOVER_HINT}>
        {cursor && <span className="tabular-nums text-ink">{readoutText(cursor)}</span>}
      </Readout>

      {/* Bản đọc thành tiếng chỉ đổi khi con trỏ đi bằng PHÍM — xem docstring của `spoken`. */}
      <span className="sr-only" aria-live="polite">
        {spoken}
      </span>

      <div className="space-y-0.5 pt-1 text-note leading-snug text-ink-muted">
        {counts.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
