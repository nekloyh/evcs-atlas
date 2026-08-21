/**
 * Hình học và câu chữ THUẦN của bảy hồ sơ ngày — `UtilizationDayProfiles.tsx` chỉ vẽ.
 *
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §9.1, §9.2, §9.3, §9.4.
 *
 * ── Vì sao tách khỏi component ────────────────────────────────────────────────────────
 *
 * Không phải để "sạch". Lý do là một ràng buộc đo được của bộ chạy test: `node --test` bóc
 * được kiểu TypeScript nhưng **không parse được JSX**, nên bất kỳ logic nào sống trong một
 * `.tsx` đều chỉ kiểm được bằng cách đọc mã nguồn bằng regex. Ba thứ dưới đây là những thứ
 * duy nhất ở biểu đồ này có thể SAI mà mắt không bắt được:
 *
 *   · phép ngắt đường qua ô `null` — nối liền qua nó là bịa ra một giá trị;
 *   · ánh xạ giá trị → toạ độ y, thứ phải TUYỆT ĐỐI và không bao giờ autoscale;
 *   · câu đọc cho trình đọc màn hình, thứ phải mang GIÁ TRỊ chứ không chỉ vị trí.
 *
 * Nên chúng ở đây, nơi test gọi được thẳng.
 */

import { DOW_FULL } from "../state/types";
import type { UtilizationHourCell } from "./chart-models";
import { hourBucketLabel, type OccTimezoneState } from "./occ-time";

// ── Hằng BỐ CỤC — §9.1 ───────────────────────────────────────────────────────
//
// `ROW_H = 24` và `ROW_GAP = 4` đến thẳng từ spec. Bảy hàng vì thế cao đúng
// `7 × 24 + 6 × 4 = 192 px`, và cả khung (kể cả trục giờ) là 214 px — dưới trần 224 px.

export const UTIL_ROW_H = 24;
export const UTIL_ROW_GAP = 4;
export const UTIL_MARGIN = { left: 28, right: 4, top: 8, bottom: 14 } as const;
export const UTIL_ROWS_H = 7 * UTIL_ROW_H + 6 * UTIL_ROW_GAP;
export const UTIL_CHART_H = UTIL_MARGIN.top + UTIL_ROWS_H + UTIL_MARGIN.bottom;

export const utilRowTop = (dow: number) => UTIL_MARGIN.top + dow * (UTIL_ROW_H + UTIL_ROW_GAP);

/**
 * Giá trị → toạ độ y trong hàng. Miền `[0,1]` là **hằng số**, không phải tham số.
 *
 * Không có đường nào truyền một miền khác vào đây, và đó là toàn bộ ý: một hàm nhận
 * `domain` sẽ mời gọi một lời gọi autoscale "chỉ cho trường hợp này", và khi ấy Hà Nội
 * (11→36%) với Lâm Đồng (2→14%) sẽ trông giống hệt nhau — xoá đúng cái khác nhau giữa hai
 * tỉnh mà hình này tồn tại để cho xem.
 */
export function utilY(dow: number, value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return utilRowTop(dow) + UTIL_ROW_H * (1 - clamped);
}

/** Bề rộng một ô giờ, suy từ bề rộng khung — 24 cột đều nhau. */
export const utilColW = (width: number) =>
  (width - UTIL_MARGIN.left - UTIL_MARGIN.right) / 24;

export const utilX = (width: number, hour: number) => UTIL_MARGIN.left + hour * utilColW(width);

export interface StepPoint {
  hour: number;
  value: number;
}

/** Cực trị tuần, bỏ qua ô thiếu nhưng giữ 0 là một giá trị quan sát hợp lệ. */
export function weekExtrema(cells: readonly UtilizationHourCell[]): {
  high: UtilizationHourCell;
  low: UtilizationHourCell;
} | null {
  const observed = cells.filter(
    (cell): cell is UtilizationHourCell & { utilization: number } =>
      cell.utilization !== null && Number.isFinite(cell.utilization),
  );
  if (observed.length === 0) return null;
  return observed.slice(1).reduce(
    (result, cell) => ({
      high: cell.utilization > result.high.utilization! ? cell : result.high,
      low: cell.utilization < result.low.utilization! ? cell : result.low,
    }),
    { high: observed[0]!, low: observed[0]! },
  );
}

/**
 * Cắt 24 ô giờ thành các ĐOẠN LIÊN TỤC, ngắt qua mọi ô `null`.
 *
 * Trả về dữ liệu chứ không trả về chuỗi `d`: phép ngắt-qua-null là thứ duy nhất ở đây đáng
 * kiểm, và kiểm nó trên một mảng thì đọc được, còn kiểm trên một chuỗi SVG thì phải parse
 * ngược lại chính thứ vừa sinh ra.
 *
 * Nhiều đoạn rời chứ không một `<path>` nhiều `M`: mỗi đoạn cần `strokeLinecap` riêng để
 * một ô đơn độc giữa hai ô null vẫn nhìn thấy được.
 */
export function stepRuns(hours: readonly (number | null)[]): StepPoint[][] {
  const out: StepPoint[][] = [];
  let run: StepPoint[] = [];
  const flush = () => {
    if (run.length > 0) out.push(run);
    run = [];
  };
  hours.forEach((value, hour) => {
    if (value === null || !Number.isFinite(value)) flush();
    else run.push({ hour, value });
  });
  flush();
  return out;
}

/**
 * Một đoạn bậc thang: mỗi ô giờ là một bậc PHẲNG phủ `[h, h+1)`.
 *
 * Không nội suy giữa hai ô, và đó là một phát biểu về dữ liệu chứ không về thẩm mỹ: `occ`
 * là trung bình TRONG một ô giờ, không phải một mẫu tại một thời điểm. Một spline qua các
 * điểm giữa ô sẽ vẽ ra những giá trị chưa từng được đo.
 */
export function stepPath(run: readonly StepPoint[], dow: number, width: number): string {
  return run
    .map((p, i) => {
      const y = utilY(dow, p.value).toFixed(2);
      return `${i === 0 ? "M" : "L"}${utilX(width, p.hour).toFixed(2)} ${y} L${utilX(width, p.hour + 1).toFixed(2)} ${y}`;
    })
    .join(" ");
}

const pct1 = (v: number) => `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const pct0 = (v: number) => `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
const num1 = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const int = (v: number) => Math.round(v).toLocaleString("vi-VN");

/**
 * Tên đọc được của một ô giờ — §9.4.
 *
 * Ba thứ bắt buộc, và mỗi thứ vá một chỗ mù khác nhau của trình đọc màn hình:
 *   · **ngày + ô giờ** — vị trí, thứ mà một biểu đồ vẽ bằng toạ độ thì AT không thấy;
 *   · **giá trị HOẶC "chưa đủ quan sát"** — không bao giờ là `0%` cho một ô null;
 *   · **coverage ngắn** — một tỉ lệ không kiểm được nếu không biết nó gộp từ bao nhiêu.
 */
export function utilCellName(cell: UtilizationHourCell, timezone: OccTimezoneState): string {
  const value =
    cell.utilization === null
      ? "chưa đủ quan sát"
      : `${pct1(cell.utilization)} cổng bận, ${num1(cell.busyPortsAvg)} trên ${int(cell.observedPorts)} cổng`;
  const coverage =
    cell.portCoverage === null
      ? "chưa có cổng nào biết được"
      : `coverage cổng ${pct0(cell.portCoverage)}, ${int(cell.contributingStations)} trạm đóng góp`;
  return `${DOW_FULL[cell.dow]}, ${hourBucketLabel(cell.hour, timezone)}; ${value}; ${coverage}`;
}
