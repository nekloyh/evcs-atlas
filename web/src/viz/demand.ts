import type { RGB } from "./palette";

/** Tỉ lệ số 0 mà từ đó {0} đáng một nhóm riêng — cùng ngưỡng với §6a quy tắc 2. */
const ZERO_SHARE_THRESHOLD = 0.05;

/**
 * Ba nhóm cho MỘT trục của ma trận bivariate — P1, so sánh khám phá chứ không phải điểm số.
 *
 * **Phân vị ba không dùng được cho trục CUNG, và đây là số đo.** `n_ports` có 90,0% ô đúng
 * bằng 0, nên phân vị 1/3 và 2/3 **đều bằng 0**; `≤ breaks[0]` bắt hết, và **nhóm giữa
 * không một ô nào rơi vào được**. Đo trên dữ liệu thật, ma trận 3×3 ra thế này:
 *
 * ```
 *   1452      0     15
 *   1344      0    122
 *   1166      0    301
 * ```
 *
 * Chú giải vẽ chín ô màu, **ba trong đó không thể xuất hiện**. Đó không phải một thang chật
 * — đó là một thang có ba bậc không tồn tại.
 *
 * Cách vá dùng lại đúng luật đã có chứ không đẻ luật mới: **§6a quy tắc 2**. Nếu ≥5% giá trị
 * đúng bằng 0 thì {0} là nhóm 0, và các giá trị > 0 chia đôi ở trung vị của CHÍNH CHÚNG.
 * Ba nhóm khi ấy đều có ô, và mỗi nhóm nói được một câu: *chưa có gì · có ít · có nhiều*.
 *
 * Trục CẦU tự chọn nhánh còn lại: `population` chỉ 3,1% ô bằng 0, dưới ngưỡng, nên nó vẫn
 * chia phân vị ba như cũ. Một luật, hai hành vi, không cờ nào phải gõ tay.
 *
 * Cái luật này KHÔNG chữa: cột "chưa có gì" vẫn giữ 90% số ô. Bivariate cần cả hai trục có
 * cấu trúc không gian, mà cung thì không (Moran I = 0,19). Đó là việc của bước sau; ở đây
 * chỉ gỡ ba ô màu bất khả thi.
 */
export function tertileBreaks(values: number[]): [number, number] {
  const present = values.filter(Number.isFinite);
  if (present.length === 0) return [0, 0];

  const nZero = present.reduce((acc, v) => (v === 0 ? acc + 1 : acc), 0);
  if (nZero / present.length >= ZERO_SHARE_THRESHOLD) {
    const pos = present.filter((v) => v > 0).sort((a, b) => a - b);
    // Không có giá trị dương nào thì cả trục là một nhóm; trả về ngưỡng khiến mọi giá trị
    // rơi vào nhóm 0 thay vì bịa ra hai nhóm rỗng.
    if (pos.length === 0) return [0, 0];
    return [0, pos[Math.floor((pos.length - 1) / 2)]!];
  }

  const sorted = present.slice().sort((a, b) => a - b);
  return [
    sorted[Math.floor((sorted.length - 1) / 3)]!,
    sorted[Math.floor((sorted.length - 1) * 2 / 3)]!,
  ];
}

export function tertileClass(value: number, breaks: [number, number]): 0 | 1 | 2 {
  return value <= breaks[0] ? 0 : value <= breaks[1] ? 1 : 2;
}

/**
 * Nhóm nào của một trục THẬT SỰ có ô — legend chỉ được vẽ ô màu cho nhóm đạt tới được.
 *
 * Cần vì cách vá ở trên đảm bảo *thường* cả ba nhóm có ô, nhưng không đảm bảo *luôn*: một
 * trục toàn số 0, hay một trục mà mọi giá trị dương bằng nhau, vẫn co lại. Thà chú giải
 * hiện ít ô hơn là hiện một ô không bao giờ xuất hiện trên bản đồ (§6a quy tắc 3, cùng tinh
 * thần "không độn bậc giả").
 */
export function reachableClasses(values: number[], breaks: [number, number]): boolean[] {
  const seen = [false, false, false];
  for (const v of values) if (Number.isFinite(v)) seen[tertileClass(v, breaks)] = true;
  return seen;
}

/**
 * Hai trục của ma trận bivariate, dựng MỘT lần từ chính tập ô đang vẽ.
 *
 * Cùng lý do `Scale` tồn tại: bản đồ và chú giải không được phép bất đồng về màu. Trước đây
 * `demandSupplyLayer` tự tính ngưỡng còn chú giải vẽ một lưới 3×3 **cứng** không biết gì về
 * dữ liệu — nên khi ba nhóm co lại, chỉ bản đồ biết, chú giải vẫn hứa đủ chín ô.
 */
export interface BivariateAxes {
  /** Hàng — cầu. */
  pop: { breaks: [number, number]; reachable: boolean[] };
  /** Cột — cung. */
  ports: { breaks: [number, number]; reachable: boolean[] };
}

export function bivariateAxes(cells: readonly { pop: number | null; ports: number }[]): BivariateAxes {
  const pop = cells.map((d) => d.pop ?? NaN);
  const ports = cells.map((d) => d.ports);
  const pb = tertileBreaks(pop);
  const sb = tertileBreaks(ports);
  return {
    pop: { breaks: pb, reachable: reachableClasses(pop, pb) },
    ports: { breaks: sb, reachable: reachableClasses(ports, sb) },
  };
}

/** Hàng = cầu (nhạt → đậm), cột = cung (thấp → cao). */
export const DEMAND_SUPPLY_RGB: readonly (readonly RGB[])[] = [
  [[232, 229, 220], [176, 201, 211], [80, 139, 160]],
  [[238, 185, 157], [188, 157, 170], [105, 103, 151]],
  [[201, 89, 47], [151, 69, 91], [83, 54, 111]],
];
