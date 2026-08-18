/**
 * Hồ sơ biên 24 giờ của nhịp thành phố — sửa mục 10 của nghiệm thu, dựng sau M4.
 *
 * ── Vấn đề nó giải ────────────────────────────────────────────────────────────────────
 *
 * Heatmap 168h dùng **chung phép chia bậc** với chấm trạm (§8a luật 1), nhưng tầng thành
 * phố chỉ chạy 11%–36% của thang ấy, nên nó tiêu 2–3 bậc trong 7 và trông gần như đồng màu.
 * M4 đã khai điều này như một hệ quả chấp nhận được và in dải thật vào câu đơn vị — đúng,
 * nhưng một câu chữ không thay được một hình.
 *
 * ── Vì sao KHÔNG cấp thang riêng cho heatmap ──────────────────────────────────────────
 *
 * Rẻ về tương phản, đắt về nghĩa: cùng một màu cam sẽ nói hai điều khác nhau ở hai chỗ trên
 * cùng một màn hình, và toàn bộ giá trị của việc dùng chung thang (một ô heatmap và một
 * chấm bản đồ cùng màu thì cùng nghĩa) mất sạch.
 *
 * ── Cách chọn: đổi KÊNH, không đổi thang ──────────────────────────────────────────────
 *
 * Kênh MÀU đã bị trưng dụng cho một nghĩa, nên thứ cần nói thêm phải tìm kênh khác. Kênh
 * VỊ TRÍ đang trống, và nó là kênh mạnh nhất cho so sánh định lượng — một chênh lệch
 * 11%→36% không đọc nổi bằng độ đậm thì đọc rất rõ bằng độ cao. Đây là **cùng một lập luận**
 * mà app đã dùng hai lần: danh tính overlay từ hình học chứ không từ hue (§4d-1), và trạng
 * thái trạm từ nét chứ không từ màu (§4d-3a).
 *
 * ── Ba luật của hình này ──────────────────────────────────────────────────────────────
 *
 *   1. **Chung trục giờ với heatmap ngay trên** — cùng `HEAT_W`/`HEAT_M`, nhập từ
 *      `Heatmap168` chứ không chép. Cột 22h của hai hình phải thẳng hàng, nếu không thì
 *      việc đọc chéo — lý do hình này tồn tại — đòi mắt tự căn.
 *   2. **Một chuỗi ⇒ một màu, không legend** (§4d-2). Dải min–max không phải chuỗi thứ hai:
 *      nó là **cùng một đại lượng** ở hai đầu của cùng tập, nên nó lấy chính `c5` ở alpha
 *      thấp, không lấy một hue thứ hai.
 *   3. **Trục y bắt đầu từ 0.** Cắt gốc sẽ phóng đại nhịp ngày — đúng cái tội mà cả hình
 *      này được dựng ra để *tránh* mắc theo chiều ngược lại.
 */

import { useMemo, useState } from "react";

import { HOURS_IN_WEEK } from "../state/types";
import type { CityHour } from "../viz/occ";
import { hourProfile, type HourBand } from "../viz/occ";
import { HAIRLINE_HEX, INK_MUTED_HEX, RAMP_HEX } from "../viz/palette";
import { HEAT_M, HEAT_W } from "./Heatmap168";
import { Readout } from "./Readout";

/** `c5` — chuỗi dữ liệu, cùng hex mà histogram và Lorenz dùng (§4d-2). */
const SERIES = RAMP_HEX[4]!;

const W = HEAT_W;
const H = 64;
const M = { left: HEAT_M.left, right: HEAT_M.right, top: 8, bottom: 12 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const COL_W = PLOT_W / 24;

export function HourProfile({
  cells,
  t,
  onT,
}: {
  cells: CityHour[];
  /** giờ đang xem — cột của nó được nhấn, cùng đồng bộ hai chiều với scrubber (§3e) */
  t: number;
  onT: (t: number) => void;
}) {
  const bands = useMemo(() => hourProfile(cells), [cells]);
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  // Đỉnh của trục y — lấy từ `hi` lớn nhất, làm tròn LÊN, và **không cắt gốc**.
  const top = useMemo(() => {
    const hi = bands.reduce((m, b) => Math.max(m, b.hi ?? 0), 0);
    return hi > 0 ? hi * 1.1 : 1;
  }, [bands]);

  const y = (v: number) => M.top + PLOT_H * (1 - v / top);
  const x = (h: number) => M.left + h * COL_W;
  const hourNow = t % HOURS_IN_WEEK % 24;

  const mid = bands.filter((b): b is HourBand & { mid: number } => b.mid !== null);
  const path = mid
    .map((b, i) => `${i === 0 ? "M" : "L"}${(x(b.hour) + COL_W / 2).toFixed(1)} ${y(b.mid).toFixed(1)}`)
    .join(" ");

  const at = hoverHour === null ? null : bands[hoverHour] ?? null;

  return (
    <div>
      <svg
        width={W}
        height={H}
        className="block cursor-pointer"
        role="img"
        aria-label="hồ sơ nhịp theo 24 giờ"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const h = Math.floor(((e.clientX - r.left - M.left) / PLOT_W) * 24);
          setHoverHour(h >= 0 && h < 24 ? h : null);
        }}
        onPointerLeave={() => setHoverHour(null)}
        onClick={() => {
          // Bấm một cột giữ NGUYÊN thứ đang xem và chỉ đổi giờ: cột này gộp cả 7 thứ nên nó
          // không có ý kiến về thứ, và tự chọn hộ một thứ là bịa thêm nửa thông tin.
          if (hoverHour !== null) onT(Math.floor(t / 24) * 24 + hoverHour);
        }}
      >
        {/* Lưới: đúng hai mức — 0 và đỉnh. Nhiều hơn thì lưới cạnh tranh với chính dữ liệu
            trong một hình cao 44 px. */}
        <line x1={M.left} y1={y(0)} x2={W - M.right} y2={y(0)} stroke={HAIRLINE_HEX} strokeWidth="1" />
        <text x={0} y={y(0)} fontSize="8" fill={INK_MUTED_HEX} dominantBaseline="middle">
          0
        </text>
        <text x={0} y={M.top + 3} fontSize="8" fill={INK_MUTED_HEX}>
          {pctShort(top)}
        </text>

        {/* Dải thấp nhất–cao nhất trong 7 thứ. Cùng `c5` ở alpha thấp — nó là cùng một đại
            lượng, không phải một chuỗi thứ hai (luật 2). */}
        {bands.map((b) =>
          b.lo === null || b.hi === null ? null : (
            <rect
              key={b.hour}
              x={x(b.hour) + COL_W * 0.28}
              y={y(b.hi)}
              width={COL_W * 0.44}
              height={Math.max(1, y(b.lo) - y(b.hi))}
              fill={SERIES}
              fillOpacity={0.22}
            />
          ),
        )}

        {/* Trung bình — đường liền, đọc ra NHỊP NGÀY. Đây là thứ heatmap không nói được. */}
        <path d={path} fill="none" stroke={SERIES} strokeWidth="1.75" strokeLinejoin="round" />
        {mid.map((b) => (
          <circle key={b.hour} cx={x(b.hour) + COL_W / 2} cy={y(b.mid)} r="1.4" fill={SERIES} />
        ))}

        {/* Giờ đang xem — cùng ký hiệu "viền mực chính" của heatmap và scrubber (§3e). */}
        <rect
          x={x(hourNow)}
          y={M.top}
          width={COL_W}
          height={PLOT_H}
          fill="none"
          stroke="#0b0b0b"
          strokeWidth="1"
        />

        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={x(h)} y={H - 2} fontSize="8" fill={INK_MUTED_HEX}>
            {h}h
          </text>
        ))}
      </svg>

      <Readout hint="rê để đọc từng giờ · bấm để nhảy tới giờ đó trong thứ đang xem">
        {at && (
          <>
            <span className="text-ink">{at.hour}h</span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink">
              {at.mid === null ? "chưa quan sát đủ" : `TB ${pctShort(at.mid)}`}
            </span>
            {at.lo !== null && at.hi !== null && (
              <span className="tabular-nums text-ink-muted">
                · dải {pctShort(at.lo)}–{pctShort(at.hi)} qua {at.n} thứ
              </span>
            )}
          </>
        )}
      </Readout>
    </div>
  );
}

const pctShort = (v: number) =>
  `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
