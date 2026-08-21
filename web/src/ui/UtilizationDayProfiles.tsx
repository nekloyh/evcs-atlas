/**
 * BẢY HỒ SƠ NGÀY — biểu đồ chính của lens Sử dụng.
 *
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §8B, §9, §12.1, §17.
 *
 * ── Nó thay cái gì, và vì sao ─────────────────────────────────────────────────────────
 *
 * Thay cặp `Heatmap168 + HourProfile`. Lý do là một phép đo, không phải một sở thích:
 * 168 ô gộp của Hà Nội chỉ chiếm **11,0–36,2%** của thang trạm-giờ, và trên thang ấy
 * trough→peak cách nhau **ΔE 13,08** — chia cho 168 ô nhỏ thì mắt đọc ra "gần như đồng
 * màu". Bản chia bậc còn tệ hơn: aggregate chỉ chạm **3 trong 7 bậc** suốt cả tuần
 * (c3 22 giờ · c4 88 giờ · c5 58 giờ), tức 4 bậc của chú giải không bao giờ xuất hiện.
 *
 * Nhịp thì có thật: **25,18 điểm %** giữa đáy và đỉnh, tỉ số 3,29×. Vấn đề không phải dữ
 * liệu phẳng mà là **kênh sai**. Nên đổi kênh, không đổi thang — cùng lập luận app đã dùng
 * cho danh tính overlay (hình học, không phải hue) và trạng thái trạm (nét, không phải
 * màu). Kênh VỊ TRÍ đang trống và nó mạnh nhất trong bảng Cleveland–McGill.
 *
 * ── Bốn luật ─────────────────────────────────────────────────────────────────────────
 *
 *   1. **Trục y TUYỆT ĐỐI `[0,1]`, không autoscale.** Hà Nội chiếm đúng 25% chiều cao,
 *      Lâm Đồng đúng 12%. Kéo cả hai lên full height sẽ làm hai tỉnh trông giống hệt nhau
 *      và xoá mất chính điều khác nhau giữa chúng. Trục cũng KHÔNG đổi theo `t` — cùng
 *      luật mà thang màu phải giữ (§12).
 *   2. **Step-line theo bucket giờ, không nội suy.** `occ` là trung bình TRONG một ô giờ,
 *      không phải một mẫu tại một thời điểm; vẽ spline qua nó là bịa ra giá trị ở giữa hai
 *      ô. Bucket `h` phủ `[h, h+1)` và đường KHÔNG nối qua null.
 *   3. **Màu không mang giá trị.** Bảy hàng dùng đúng MỘT mực chuỗi. Giá trị đọc bằng độ
 *      cao, nên biểu đồ này không cần `Scale` và không thể lệch màu với bản đồ — đó cũng
 *      là cách RF-2 (khe hình có trục mà không có ô) chết hẳn thay vì được canh bằng test.
 *   4. **Giờ đang chọn không nhận diện bằng màu.** Nó có đường dẫn dọc qua cả bảy hàng,
 *      viền hàng, và một dấu VUÔNG có casing — ba kênh không phải hue (§17).
 *
 * Không có transition, không có tween, không có nhấp nháy ở bất kỳ chế độ nào — nên
 * `prefers-reduced-motion` không cần một nhánh riêng ở đây: không có gì để giảm.
 */

import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";

import type { UtilizationHourCell, UtilizationWeekModel } from "../viz/chart-models";
import { DOW_FULL, DOW_LABELS, dowOf, hourOf, scrubberKeyStep } from "../state/types";
import { HAIRLINE_HEX, HATCH_HEX, INK_HEX, INK_MUTED_HEX, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import { hourBucketLabel, occTimezoneDisclosure, type OccTimezoneState } from "../viz/occ-time";
import {
  UTIL_CHART_H,
  UTIL_MARGIN,
  UTIL_ROWS_H,
  UTIL_ROW_H,
  stepPath,
  stepRuns,
  utilCellName,
  utilColW,
  utilRowTop,
  utilX,
  utilY,
  weekExtrema,
} from "../viz/utilization-chart";
import { CHART_W } from "./chart-size";

const W = CHART_W;
const M = UTIL_MARGIN;
const ROW_H = UTIL_ROW_H;
const PLOT_W = W - M.left - M.right;
const COL_W = utilColW(W);
const ROWS_H = UTIL_ROWS_H;
const H = UTIL_CHART_H;

const HATCH_ID = "util-day-null-hatch";

const rowTop = utilRowTop;
const yIn = utilY;
const xAt = (hour: number) => utilX(W, hour);

const pct1 = (v: number) => `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const num1 = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const int = (v: number) => Math.round(v).toLocaleString("vi-VN");

export function UtilizationDayProfiles({
  model,
  theme,
  t,
  timezone,
  onTimeIntent,
}: {
  model: UtilizationWeekModel;
  /** Mực CHUỖI của lens — một chuỗi, một màu, không chú giải (§4d-2). */
  theme: AnalysisTheme;
  t: number;
  timezone: OccTimezoneState;
  /** Vắng ⇒ trong một CẢNH, nơi giờ do cảnh sở hữu (§2.6). Ô giờ khi ấy không bấm được. */
  onTimeIntent?: (t: number) => void;
}) {
  const series = seriesColorForTheme(theme);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hover, setHover] = useState<UtilizationHourCell | null>(null);

  if (model.disabledReason) {
    return (
      <div className="py-6 text-center text-body text-ink-muted" role="status">
        <p className="font-semibold text-ink-2">Dữ liệu vận hành chưa khả dụng</p>
        <p className="mt-1 text-note">{model.disabledReason}</p>
      </div>
    );
  }
  if (model.cells.length === 0) return null;

  const curDow = dowOf(t);
  const curHour = hourOf(t);
  const at = hover ?? model.cells[t] ?? null;
  const disclosure = occTimezoneDisclosure(timezone);
  const extrema = weekExtrema(model.cells);

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    // ↑/↓ đọc là "cùng giờ, ngày khác" — tức ±24, đúng ngữ nghĩa của PageUp/PageDown mà
    // `scrubberKeyStep` đã định. Bốn phím một luật, viết ở MỘT chỗ.
    const key =
      event.key === "ArrowUp" ? "PageUp" : event.key === "ArrowDown" ? "PageDown" : event.key;
    const next = scrubberKeyStep(t, key);
    // Phím lạ đi tiếp — nếu `preventDefault` ở đây thì Tab chết trong biểu đồ (§9.4).
    if (next === null || !onTimeIntent) return;
    event.preventDefault();
    onTimeIntent(next);
    cellRefs.current[next]?.focus();
  };

  return (
    <div className="select-none min-w-0">
      <div className="flex items-baseline justify-between pb-1 text-note text-ink-muted">
        <span>tỉ lệ cổng bận theo ô giờ</span>
        <span>trục 0–100% chung cho cả 7 ngày</span>
      </div>
      {extrema && (
        <p className="pb-1 text-note leading-[13px] text-ink-2">
          Cao nhất {DOW_LABELS[extrema.high.dow]} · {hourBucketLabel(extrema.high.hour, timezone)} · {pct1(extrema.high.utilization!)}
          {" · thấp nhất "}
          {DOW_LABELS[extrema.low.dow]} · {hourBucketLabel(extrema.low.hour, timezone)} · {pct1(extrema.low.utilization!)}
        </p>
      )}

      <div className="relative" style={{ width: W, height: H }} onPointerLeave={() => setHover(null)}>
        <svg width={W} height={H} className="block" aria-hidden focusable="false">
          <defs>
            {/* Cùng vân 45°, cùng mực với ô null của bản đồ và MiniHeatmap — một chất liệu
                cho một khái niệm, bất kể hình học. */}
            <pattern id={HATCH_ID} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={HATCH_HEX} strokeWidth="1" />
            </pattern>
          </defs>

          {/*
            Hai mốc của trục, đặt ôm lấy ĐÚNG MỘT HÀNG — hàng đầu.

            Bản đầu đặt `100%` ở đỉnh hàng T2 và `0` ở đáy hàng CN, tức hai mốc ôm trọn cả
            khối bảy hàng. Ảnh render bắt được hệ quả: cặp nhãn ấy đọc thành **một trục duy
            nhất trải suốt bảy hàng**, nên một đường nằm ở hàng T5 trông như "khoảng 40% của
            cả khối" thay vì "khoảng 25% của ngày T5". Sai một bậc về đơn vị đọc.

            Ôm một hàng thì quan hệ được dạy ra ngay bằng hình: một hàng = 0–100%. Câu
            "trục 0–100% chung cho cả 7 ngày" ở đầu hình nói phần còn lại — rằng sáu hàng
            kia dùng đúng trục ấy.
          */}
          <text x={0} y={M.top + 6} fontSize="8" fill={INK_MUTED_HEX}>100%</text>
          <text x={0} y={M.top + ROW_H} fontSize="8" fill={INK_MUTED_HEX}>0</text>

          {model.days.map((row) => {
            const top = rowTop(row.dow);
            const values = row.hours.map((c) => c.utilization);
            return (
              <g key={row.dow}>
                {/* Nền hàng đang chọn — nhận diện KHÔNG bằng hue: một khối xám rất nhạt. */}
                {row.dow === curDow && (
                  <rect x={M.left} y={top} width={PLOT_W} height={ROW_H} fill={`${HAIRLINE_HEX}44`} />
                )}
                {/* Lưới: 0% (đáy), 50% (đứt), 100% (đỉnh). */}
                <line x1={M.left} y1={top + ROW_H} x2={W - M.right} y2={top + ROW_H} stroke={HAIRLINE_HEX} strokeWidth="1" />
                <line
                  x1={M.left}
                  y1={top + ROW_H / 2}
                  x2={W - M.right}
                  y2={top + ROW_H / 2}
                  stroke={HAIRLINE_HEX}
                  strokeWidth="0.5"
                  strokeDasharray="2 3"
                />
                <line x1={M.left} y1={top} x2={W - M.right} y2={top} stroke={HAIRLINE_HEX} strokeWidth="0.5" strokeDasharray="2 3" />

                <text x={0} y={top + ROW_H / 2 + 3} fontSize="8" fill={INK_MUTED_HEX}>
                  {DOW_LABELS[row.dow]}
                </text>

                {/* Ô KHÔNG ĐỦ QUAN SÁT: vân phủ trọn bề cao hàng. Không hạ về đáy — hạ về
                    đáy là vẽ số 0, đúng câu mà ràng buộc 1 cấm nói. */}
                {row.hours.map((c) =>
                  c.utilization === null ? (
                    <rect
                      key={c.t}
                      x={xAt(c.hour)}
                      y={top}
                      width={COL_W}
                      height={ROW_H}
                      fill={`url(#${HATCH_ID})`}
                    />
                  ) : null,
                )}

                {stepRuns(values).map((run, i) => (
                  <path
                    key={i}
                    d={stepPath(run, row.dow, W)}
                    fill="none"
                    stroke={series}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}

          {/* Đường dẫn dọc tại giờ đang chọn, chạy qua CẢ BẢY hàng: đó là thứ cho phép so
              cùng một giờ giữa các ngày mà không phải căn mắt (job #2 của §5). */}
          <line
            x1={xAt(curHour) + COL_W / 2}
            y1={M.top}
            x2={xAt(curHour) + COL_W / 2}
            y2={M.top + ROWS_H}
            stroke={INK_HEX}
            strokeWidth="1"
            strokeDasharray="3 2"
            pointerEvents="none"
          />

          {/* Dấu của ô đang chọn — VUÔNG có casing trắng, không phải một chấm đổi màu. */}
          {(() => {
            const cell = model.cells[t];
            if (!cell) return null;
            const cx = xAt(curHour) + COL_W / 2;
            if (cell.utilization === null) {
              return (
                <rect
                  x={xAt(curHour) - 0.5}
                  y={rowTop(curDow) - 0.5}
                  width={COL_W + 1}
                  height={ROW_H + 1}
                  fill="none"
                  stroke={INK_HEX}
                  strokeWidth="1.5"
                  pointerEvents="none"
                />
              );
            }
            const cy = yIn(curDow, cell.utilization);
            return (
              <g pointerEvents="none">
                <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} fill="#ffffff" />
                <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} fill={series} stroke={INK_HEX} strokeWidth="1.5" />
              </g>
            );
          })()}

          {/* Cực trị có hình dạng riêng để peak/trough đọc được ngay cả khi không phân biệt
              màu. Thang y vẫn tuyệt đối 0–100%; đây chỉ là chú thích, không autoscale. */}
          {extrema && (
            <g pointerEvents="none">
              <rect
                x={xAt(extrema.high.hour) + COL_W / 2 - 2.5}
                y={yIn(extrema.high.dow, extrema.high.utilization!) - 2.5}
                width={5}
                height={5}
                fill={INK_HEX}
              />
              <rect
                x={xAt(extrema.low.hour) + COL_W / 2 - 2.5}
                y={yIn(extrema.low.dow, extrema.low.utilization!) - 2.5}
                width={5}
                height={5}
                fill="#ffffff"
                stroke={INK_HEX}
                strokeWidth="1"
                transform={`rotate(45 ${xAt(extrema.low.hour) + COL_W / 2} ${yIn(extrema.low.dow, extrema.low.utilization!)})`}
              />
            </g>
          )}

          {[0, 6, 12, 18].map((h) => (
            <text key={h} x={xAt(h)} y={H - 3} fontSize="8" fill={INK_MUTED_HEX}>
              {h}
            </text>
          ))}
          <text x={W - M.right} y={H - 3} fontSize="8" fill={INK_MUTED_HEX} textAnchor="end">
            23
          </text>
        </svg>

        {/* 168 hit target thật. Roving tabindex: MỘT lần Tab vào biểu đồ, rồi mũi tên đi
            trong nó — không phải 168 chặng Tab. */}
        {model.cells.map((cell) => (
          <button
            key={cell.t}
            ref={(node) => {
              cellRefs.current[cell.t] = node;
            }}
            type="button"
            tabIndex={cell.t === t ? 0 : -1}
            aria-pressed={cell.t === t}
            aria-label={utilCellName(cell, timezone)}
            disabled={!onTimeIntent}
            onClick={() => onTimeIntent?.(cell.t)}
            onFocus={() => setHover(cell)}
            onBlur={() => setHover(null)}
            onPointerEnter={() => setHover(cell)}
            onKeyDown={move}
            className="absolute z-[1] border-0 bg-transparent p-0 outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink enabled:cursor-pointer"
            style={{
              left: xAt(cell.hour),
              top: rowTop(cell.dow),
              width: COL_W,
              height: ROW_H,
            }}
          />
        ))}
      </div>

      {/*
        Bốn dòng, chiều cao CỐ ĐỊNH. Không dùng `Readout` (một dòng, `nowrap`): hợp đồng
        §9.2 đòi tử số, mẫu số, hai coverage và câu công bố múi giờ cùng lúc, và nhồi cả
        bốn vào một dòng 296 px sẽ bị xén — thứ tệ hơn là bị xén ở đúng phần mẫu số.
      */}
      <div className="mt-1 h-[52px] overflow-hidden text-note leading-[13px] text-ink-2" aria-live="off">
        {at && (
          <>
            <div>
              <span className="font-semibold text-ink">{DOW_FULL[at.dow]}</span>
              <span className="text-ink-muted"> · </span>
              <span>{hourBucketLabel(at.hour, timezone)}</span>
              <span className="text-ink-muted"> · </span>
              <span className="tabular-nums font-semibold text-ink">
                {at.utilization === null ? "chưa đủ quan sát" : `${pct1(at.utilization)} cổng bận`}
              </span>
            </div>
            <div className="tabular-nums">
              {num1(at.busyPortsAvg)} / {int(at.observedPorts)} cổng · {int(at.contributingStations)}/
              {int(model.allStations)} trạm
            </div>
            <div className="tabular-nums">
              coverage cổng {at.portCoverage === null ? "—" : pct1(at.portCoverage)} ·{" "}
              {num1(at.observedHoursPerPort)} giờ quan sát/cổng
            </div>
            <div className="text-ink-muted">
              {disclosure ?? `Trục giờ theo ${timezone.kind === "declared" ? timezone.tz : ""}`}
            </div>
          </>
        )}
      </div>

      {onTimeIntent && (
        <p className="pt-1 text-note leading-snug text-ink-muted">
          Bấm một ô giờ để chuyển scrubber · ←/→ đổi giờ, ↑/↓ đổi ngày. Đậm hơn = tỉ lệ cổng
          bận cao hơn, không phải “quá tải”.
        </p>
      )}
    </div>
  );
}
