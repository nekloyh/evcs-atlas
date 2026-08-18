/**
 * Tập trung CUNG so với CẦU — "x% dân được phục vụ dày nhất nắm y% số cổng" (§3d-3).
 *
 * ── Vì sao dùng lại nguyên `lorenz()` của `story/` ────────────────────────────────────
 *
 * Phép tính giống hệt: sắp giảm dần theo **tỉ số hai đại lượng**, cộng dồn cả hai, chuẩn
 * hoá thành tỉ lệ, rồi lấy Gini bằng tích phân hình thang trên chính các điểm đó. Cảnh
 * CÂU CHUYỆN hỏi "x% *diện tích* chứa y% *dân*"; ở đây hỏi "x% *dân* nắm y% *cổng*". Cùng
 * một hàm, khác hai cái tên — nên nó được gọi lại chứ không được chép lại. Ba chỗ hàm ấy
 * có thể sai âm thầm đều đã có test (`test/story.test.ts`), và chép lại là bỏ hết số test đó.
 *
 * Chiều cong: `lorenz()` sắp **giảm dần** nên đường **vồng LÊN** trên đường chéo. Ở đây câu
 * đọc ra là "phần dân được phục vụ dày nhất nắm phần cổng lớn hơn tỉ lệ của họ" — đúng
 * hướng vồng, không cần đảo gì.
 */

import { lorenz, type Lorenz } from "../story/lorenz";

export interface SupplyEquity {
  l: Lorenz;
  /** Tổng cổng của mọi ô, kể cả ô bị bỏ khỏi đường cong. */
  portsAll: number;
  /**
   * Cổng nằm ở ô **không có dân**.
   *
   * `lorenz()` bỏ ô có `area = 0`, và ở đây `area` là DÂN — nên những cổng này rơi khỏi
   * đường cong. Đó là đúng (một cổng ở ô không người không thuộc về "x% dân" nào cả), và
   * chính vì thế nó phải được ĐẾM và nói ra: chúng là bãi đỗ ven đường, khu công nghiệp,
   * trạm dừng — tức phần cung mà bài toán "cung theo cầu" **không giải thích được**.
   */
  portsNoPop: number;
  /** Tổng dân của ô có dân — mẫu số của trục hoành. */
  popAll: number;
}

export function supplyEquity(
  cells: readonly { pop: number; ports: number }[],
): SupplyEquity {
  let portsAll = 0;
  let portsNoPop = 0;
  let popAll = 0;
  const rows: { area: number; pop: number }[] = [];
  for (const c of cells) {
    const pop = Number.isFinite(c.pop) ? c.pop : 0;
    const ports = Number.isFinite(c.ports) ? c.ports : 0;
    portsAll += ports;
    if (pop <= 0) {
      portsNoPop += ports;
      continue;
    }
    popAll += pop;
    // `area` ← DÂN, `pop` ← CỔNG. Đổi vai ở đúng một dòng, và đó là toàn bộ phép ánh xạ.
    rows.push({ area: pop, pop: ports });
  }
  return { l: lorenz(rows), portsAll, portsNoPop, popAll };
}
