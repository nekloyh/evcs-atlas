/**
 * Đường TIẾP CẬN — "bao nhiêu phần DÂN nằm trong bán kính d" (DESIGN.md §3d-2).
 *
 * ── Vì sao nó không thừa bên cạnh histogram của cùng một cột ──────────────────────────
 *
 * Histogram của `dist_station_network_m` đếm **Ô**. Nhưng đơn vị ra quyết định là **NGƯỜI**,
 * và lưới H3 phủ đều không gian chứ không phủ đều dân: phần lớn ô ngoại thành có vài chục
 * người, vài ô nội thành có vài nghìn. Nên cùng một cột, đếm theo ô và đếm theo dân, ra hai
 * hình khác hẳn nhau — và **chênh lệch giữa hai hình đó chính là một phát biểu**, không phải
 * hai cách vẽ cùng một thứ. Đây là lý do trường `commune:dist_station_m_pop_weighted` tồn
 * tại ở tầng xã; đường này là cùng ý ở tầng ô, dạng tích luỹ.
 *
 * Hàm thuần, không đụng DOM lẫn dữ liệu — cùng lý do đã ghi ở `story/lorenz.ts`: đây là một
 * **phép tính**, và ảnh chụp chứng minh được một phân bố chứ không chứng minh được phép tính.
 */

/** Một điểm trên đường: trong bán kính `d` mét có `share` phần dân (0–1). */
export interface AccessPoint {
  d: number;
  share: number;
}

export interface AccessCurve {
  /** Bắt đầu ở `{d: 0, share: 0}`, đơn điệu không giảm ở cả hai trục. */
  curve: AccessPoint[];
  /** Tổng dân ĐO ĐƯỢC khoảng cách — mẫu số của mọi `share`. */
  popMeasured: number;
  /**
   * Dân ở ô **không đo được** khoảng cách. Không nằm trên trục này và không được vẽ ở 0
   * (ràng buộc 1); nó phải ra chữ, nếu không đường cong trông như nói về cả thành phố.
   */
  popUnmeasured: number;
  /** Khoảng cách xa nhất còn có người — cạnh phải của trục. */
  maxD: number;
}

const EMPTY: AccessCurve = { curve: [{ d: 0, share: 0 }], popMeasured: 0, popUnmeasured: 0, maxD: 0 };

/**
 * Dựng đường tích luỹ theo dân.
 *
 * Ô **không có người** bị bỏ khỏi đường cong dù nó đo được khoảng cách: nó không dịch
 * `share` một chút nào, nên để lại chỉ thêm những bậc phẳng trùng nhau — cấu trúc do phép
 * tính sinh ra, không có trong thành phố. Cùng lập luận mà `lorenz()` dùng để bỏ ô diện
 * tích 0.
 */
export function accessCurve(cells: readonly { pop: number | null; dist: number | null }[]): AccessCurve {
  const usable: { pop: number; dist: number }[] = [];
  let popUnmeasured = 0;
  for (const c of cells) {
    const pop = typeof c.pop === "number" && Number.isFinite(c.pop) ? c.pop : 0;
    if (pop <= 0) continue;
    if (c.dist === null || !Number.isFinite(c.dist)) {
      popUnmeasured += pop;
      continue;
    }
    usable.push({ pop, dist: c.dist });
  }
  if (usable.length === 0) return { ...EMPTY, popUnmeasured };

  usable.sort((a, b) => a.dist - b.dist);
  const popMeasured = usable.reduce((s, c) => s + c.pop, 0);

  const curve: AccessPoint[] = [{ d: 0, share: 0 }];
  let cum = 0;
  for (const c of usable) {
    cum += c.pop;
    const share = cum / popMeasured;
    const last = curve[curve.length - 1]!;
    // Gộp các ô cùng khoảng cách vào MỘT điểm: hai điểm cùng hoành độ vẽ ra một đoạn thẳng
    // đứng, và một đường tích luỹ không có đoạn thẳng đứng nào ngoài chỗ trùng khoá.
    if (last.d === c.dist) last.share = share;
    else curve.push({ d: c.dist, share });
  }
  return { curve, popMeasured, popUnmeasured, maxD: usable[usable.length - 1]!.dist };
}

/**
 * Phần dân trong bán kính `d`. Tra ĐIỂM CUỐI CÙNG còn ≤ `d` — đường là hàm bậc thang, và
 * giá trị của nó tại `d` là bậc đã đạt tới, không phải bậc kế tiếp.
 */
export function shareWithin(c: AccessCurve, d: number): number {
  let out = 0;
  for (const p of c.curve) {
    if (p.d > d) break;
    out = p.share;
  }
  return out;
}

/**
 * Chiều ngược lại: bán kính nhỏ nhất phủ được `share` dân. Trả điểm ĐẦU TIÊN đạt ngưỡng,
 * cùng luật (và cùng lý do) với `areaShareForPop` của `story/lorenz.ts`.
 */
export function distForShare(c: AccessCurve, share: number): number | null {
  for (const p of c.curve) if (p.share >= share) return p.d;
  return null;
}

/**
 * Giảm số điểm cho SVG, giữ nguyên hai đầu — 4.400 điểm trên một đường 2 px thì phần lớn
 * rơi vào cùng một pixel.
 *
 * Bản sao của `thin()` trong `story/lorenz.ts` và **cố ý** không dùng chung: hàm kia mang
 * kiểu `LorenzPoint` và một hợp đồng đã có test riêng; gộp hai bên bằng generic sẽ bắt một
 * hàm đang đúng phải đổi chữ ký để phục vụ chỗ thứ hai (§12 — thay đổi tối thiểu).
 */
export function thinAccess(curve: AccessPoint[], maxPoints = 400): AccessPoint[] {
  if (curve.length <= maxPoints) return curve;
  const step = (curve.length - 1) / (maxPoints - 1);
  const out: AccessPoint[] = [];
  for (let i = 0; i < maxPoints - 1; i++) out.push(curve[Math.round(i * step)]!);
  out.push(curve[curve.length - 1]!);
  return out;
}
