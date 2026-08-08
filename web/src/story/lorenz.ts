/**
 * Đường Lorenz "x% diện tích chứa y% dân" — mark của luận điểm A (DESIGN.md §13d-A, §14b).
 *
 * Hàm thuần, không đụng dữ liệu lẫn DOM, vì §12: đây là một **phép tính**, và ảnh chụp
 * chứng minh được một phân bố cụ thể chứ không chứng minh được một phép tính. Ba chỗ nó
 * có thể sai âm thầm và cả ba đều có test: sắp xếp sai khoá, tích luỹ trước khi chuẩn hoá,
 * và tra ngược nhầm đầu (trả về ô cuối cùng dưới ngưỡng thay vì ô đầu tiên đạt ngưỡng).
 */

/** Một ô: diện tích và số người của nó. Đơn vị nào cũng được, miễn nhất quán — kết quả là TỈ LỆ. */
export interface AreaPop {
  area: number;
  pop: number;
}

export interface LorenzPoint {
  /** tỉ lệ diện tích tích luỹ, 0–1 */
  a: number;
  /** tỉ lệ dân tích luỹ, 0–1 */
  p: number;
}

export interface Lorenz {
  /** Bắt đầu ở (0,0). Đơn điệu không giảm ở cả hai trục. */
  curve: LorenzPoint[];
  /**
   * Hệ số Gini của phân bố dân theo diện tích — 0 là trải đều tuyệt đối, 1 là dồn hết vào
   * một điểm. Đi kèm đường cong chứ không thay nó: một con số nói "lệch bao nhiêu", đường
   * cong nói "lệch theo hình dạng nào", và luận điểm A cần cái thứ hai.
   */
  gini: number;
  nCells: number;
}

/**
 * Dựng đường Lorenz, sắp xếp theo **mật độ giảm dần**.
 *
 * Vì sao mật độ chứ không phải dân số: câu ta nói là "**x% diện tích** chứa y% dân", nên
 * thứ tự phải là thứ tự làm cho câu đó chặt nhất — tức ô nào cho nhiều người nhất **trên
 * mỗi km²** thì đứng trước. Với lưới H3 thì hai cách gần trùng nhau (ô gần như cùng diện
 * tích) và chênh lệch chỉ ở ô biên; nhưng "gần như" không phải một định nghĩa, và ô biên
 * là chỗ `area_frac` khác 1.
 *
 * Ô diện tích 0 bị bỏ: chúng không đóng góp vào trục hoành, nên để lại thì đường cong có
 * đoạn thẳng đứng ở đầu — một cấu trúc do phép tính sinh ra, không có trong thành phố.
 */
export function lorenz(cells: AreaPop[]): Lorenz {
  const usable = cells.filter((c) => Number.isFinite(c.area) && c.area > 0 && Number.isFinite(c.pop));
  const areaAll = usable.reduce((s, c) => s + c.area, 0);
  const popAll = usable.reduce((s, c) => s + c.pop, 0);
  if (areaAll <= 0 || popAll <= 0) return { curve: [{ a: 0, p: 0 }], gini: 0, nCells: 0 };

  const sorted = [...usable].sort((x, y) => y.pop / y.area - x.pop / x.area);

  const curve: LorenzPoint[] = [{ a: 0, p: 0 }];
  let ca = 0;
  let cp = 0;
  for (const c of sorted) {
    ca += c.area;
    cp += c.pop;
    curve.push({ a: ca / areaAll, p: cp / popAll });
  }

  // Gini = 2 × (diện tích giữa đường cong và đường chéo). Tích phân hình thang trên chính
  // các điểm vừa dựng — không lấy mẫu lại, nên không có sai số do lấy mẫu.
  let area2 = 0;
  for (let i = 1; i < curve.length; i++) {
    const l = curve[i - 1]!;
    const r = curve[i]!;
    area2 += ((r.p + l.p) / 2) * (r.a - l.a);
  }
  return { curve, gini: 2 * area2 - 1, nCells: usable.length };
}

/**
 * Tỉ lệ **diện tích** nhỏ nhất chứa được `popShare` dân — "bao nhiêu phần diện tích thì đủ
 * chứa một nửa Hà Nội".
 *
 * Trả về điểm ĐẦU TIÊN đạt ngưỡng, không phải điểm cuối cùng còn dưới ngưỡng. Lấy nhầm đầu
 * là báo một con số nhỏ hơn sự thật, tức phóng đại chính luận điểm đang muốn chứng minh —
 * loại sai số tệ nhất ở đây.
 */
export function areaShareForPop(l: Lorenz, popShare: number): number | null {
  for (const pt of l.curve) if (pt.p >= popShare) return pt.a;
  return null;
}

/** Chiều ngược lại: `areaShare` diện tích dày nhất chứa bao nhiêu phần dân. */
export function popShareForArea(l: Lorenz, areaShare: number): number | null {
  for (const pt of l.curve) if (pt.a >= areaShare) return pt.p;
  return null;
}

/**
 * Giảm số điểm cho biểu đồ, giữ nguyên hai đầu.
 *
 * 4.400 điểm vẽ thành một đường 2px thì phần lớn rơi vào cùng một pixel; giữ hết chỉ làm
 * SVG nặng mà không thêm nét nào nhìn thấy được. Lấy mẫu ĐỀU theo chỉ số (không theo giá
 * trị) nên hình dạng không đổi, và điểm cuối luôn được giữ để đường cong chạm (1,1).
 */
export function thin(curve: LorenzPoint[], maxPoints = 400): LorenzPoint[] {
  if (curve.length <= maxPoints) return curve;
  const step = (curve.length - 1) / (maxPoints - 1);
  const out: LorenzPoint[] = [];
  for (let i = 0; i < maxPoints - 1; i++) out.push(curve[Math.round(i * step)]!);
  out.push(curve[curve.length - 1]!);
  return out;
}
