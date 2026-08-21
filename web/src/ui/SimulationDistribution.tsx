/**
 * UX redesign — Trước/Sau của mô phỏng (ui/SimulationDistribution.tsx)
 *
 * Hai dải xếp chồng CÙNG mẫu số, cộng một bảng số đầy đủ trong disclosure. Thay ba KPI +
 * bảng bốn hàng của Phase 6 §3.2.3: ba ô số buộc người đọc tự tính sự dịch chuyển giữa các
 * dải, còn câu hỏi ở đây là PHÂN BỐ — thứ mà hai thanh cùng mẫu số trả lời bằng hình.
 *
 * Không có phép tính nào ở đây: `distributionModel` đã dựng xong mô hình.
 *
 * Reference: docs/UX_SIMULATION_REDESIGN_SPEC.md §11
 */

import * as React from "react";

import { THEME_PALETTES } from "../viz/palette";
import {
  BAND_TICK,
  DISTRIBUTION_DISCLOSURE,
  DISTRIBUTION_QUALIFIER,
  formatCount,
  type BandKey,
  type BandRow,
  type DistributionModel,
} from "../simulation/presenter";

/**
 * §11.3 — bốn bậc lấy từ ramp TUẦN TỰ đã đăng ký cho cự ly (`accessibility`, CARTO BluYl).
 * Không một hex mới nào: gần = nhạt, xa = đậm, đúng chiều mà bản đồ đang dùng cho chính
 * `dist_station_network_m`. Lấy bậc 1·3·5·7 của bảy để bốn bậc cách đều nhau trên đường cong.
 */
const BAND_FILL: Record<BandKey, string> = {
  le1km: THEME_PALETTES.accessibility.hex[0]!,
  b1_2km: THEME_PALETTES.accessibility.hex[2]!,
  b2_5km: THEME_PALETTES.accessibility.hex[4]!,
  gt5km: THEME_PALETTES.accessibility.hex[6]!,
};

const BAND_KEYS: BandKey[] = ["le1km", "b1_2km", "b2_5km", "gt5km"];

function Bar({ row }: { row: BandRow }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-note text-ink-2">{row.label}</span>
      <div
        className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-xs border border-hairline bg-basemap"
        aria-hidden="true"
      >
        {row.segments.map((seg, i) => (
          <div
            key={seg.key}
            // Segment rỗng vẫn giữ hàng trong bảng số (§11.2) nhưng có bề rộng 0 ở hình —
            // một vạch 1 px cho một dải không có ai đọc thành "có một ít người ở đây".
            style={{
              width: `${(seg.share * 100).toFixed(2)}%`,
              backgroundColor: BAND_FILL[seg.key],
              // Hairline phân tách, KHÔNG gradient (§11.3).
              borderLeft: i === 0 ? undefined : "1px solid var(--color-panel)",
            }}
            title={`${seg.label}: ${formatCount(seg.population)} người`}
          />
        ))}
      </div>
    </div>
  );
}

export function SimulationDistribution({
  model,
}: {
  model: DistributionModel;
}): React.JSX.Element {
  if (model.total <= 0) {
    return (
      <p className="text-body text-ink-2">
        Không có dân số dương trong các ô đủ điều kiện so sánh; không dựng được phân bố
        theo dải cự ly.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <figure className="m-0 space-y-0.5">
        {/* §11.4 — tóm tắt của figure đọc CẢ hai hàng bốn dải; không có gì chỉ nằm ở hover. */}
        <figcaption className="sr-only">{model.summary}</figcaption>
        <Bar row={model.before} />
        <Bar row={model.after} />

        {/* §11.3 — chú giải bốn dải luôn hiện, đơn vị `km` in đúng một lần.
            §6.3 — dòng delta theo dải, không dấu `+`; `aria-hidden` vì cả bốn delta đã
            nằm nguyên văn trong figcaption ở trên.

            QA vòng 2.1b — hai dòng này nay dùng CHUNG một lưới bốn cột neo vào đúng thân
            bar (rail 32 px + gap 8 px = mép trái bar). Trước đó chú giải là một cụm dồn
            trái kết thúc ở x=208 còn Δ dàn đều tới x=327: khoá dải thứ tư ở 161–186 mà
            giá trị của nó ở 285–327, lệch 124 px (đo ở panel 340 px). Bốn con số ngồi
            dưới khoá của dải KHÁC là một chú giải nói sai.

            Cột để giá trị TỰ XUỐNG DÒNG chứ không `whitespace-nowrap`: ở 320 px một cột
            rộng 64 px, còn `~thêm 199.102` (tỉnh sáu chữ số) đo 70,7 px — cho phép ngắt
            thì lưới giữ nguyên, cấm ngắt thì scroller tràn ngang. */}
        <div className="flex items-baseline gap-2" aria-hidden="true">
          <span className="w-8 shrink-0 text-note text-ink-muted">km</span>
          <div className="grid min-w-0 flex-1 grid-cols-4">
            {BAND_KEYS.map((key) => (
              <span key={key} className="flex items-center gap-1 text-note text-ink-muted">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-[1px] border border-hairline"
                  style={{ backgroundColor: BAND_FILL[key] }}
                />
                {BAND_TICK[key]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-baseline gap-2" aria-hidden="true" data-sim-delta>
          <span className="w-8 shrink-0 text-note text-ink-2">Δ</span>
          <div className="grid min-w-0 flex-1 grid-cols-4 text-note tabular-nums text-ink-2">
            {model.table.map((r) => (
              <span key={r.key}>{r.deltaText}</span>
            ))}
          </div>
        </div>
      </figure>

      <details className="group">
        <summary className="cursor-pointer text-note text-ink-2 marker:text-ink-muted hover:text-ink">
          {DISTRIBUTION_DISCLOSURE}
        </summary>
        {/* Vòng 2.1 — qualifier chuyển vào disclosure để giữ fold V3 (AC-01); nội dung
            "Sau chỉ thay ô cải thiện" vẫn hiện diện cùng bảng số và trong figcaption. */}
        <p className="mt-1.5 text-note text-ink-muted">{DISTRIBUTION_QUALIFIER}</p>
        <table className="mt-1.5 w-full border-collapse text-note">
          <thead>
            <tr className="border-b border-hairline text-ink-muted">
              <th scope="col" className="py-1 text-left font-medium">
                Dải cự ly
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Trước
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Sau
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Thay đổi
              </th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {model.table.map((r) => (
              <tr key={r.key} className="border-b border-hairline/60 last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  {r.label}
                </th>
                <td className="py-1 text-right tabular-nums">{formatCount(r.before)}</td>
                <td className="py-1 text-right tabular-nums">~{formatCount(r.after)}</td>
                {/* Không dùng dấu `+` như một màu "tốt" (§11.4): hướng đọc được từ chữ. */}
                <td className="py-1 text-right tabular-nums">{r.deltaText}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-note text-ink-muted">
          Đơn vị: người. Cả hai cột dùng chung {formatCount(model.total)} người có nền so
          sánh; ô không có nền được nói riêng ở phần chưa thể kết luận.
        </p>
      </details>
    </div>
  );
}
