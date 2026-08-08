/**
 * Chọn CẦU đáng kẻ đậm trong cảnh C — M3.1.
 *
 * Bài toán có thật, tìm ra khi render lần đầu: dữ liệu có **4.154 đoạn `bridge = true`**,
 * và kẻ đậm tất cả thì ở zoom toàn thành phố chúng thành một lớp chấm đen phủ khắp tỉnh,
 * nuốt mất chính cái ramp mà cảnh đang muốn cho xem. Trung vị một đoạn cầu là **16 m** —
 * phần lớn là cống, cầu vượt bộ hành, lối chui. Chúng đúng là cầu, nhưng chúng không chở
 * luận điểm nào: cầu đáng nói ở đây là cầu **bắc qua một con sông đủ rộng để bắt xe đi
 * vòng**.
 *
 * Bộ dữ liệu không có cờ "qua sông Hồng" — nên ta không được vẽ như thể có. Cái đo được là
 * **chiều dài**, và nó tách hai nhóm rất sạch:
 *
 * | phân vị | chiều dài |
 * |---|---:|
 * | trung vị | 16 m |
 * | p90 | 90 m |
 * | p99 | 1.146 m |
 * | max | 4.475 m |
 *
 * `> 1.000 m` giữ lại 48 đoạn, và toạ độ của chúng rơi đúng vào các nút vượt sông
 * (105,823/21,10 · 105,888/21,017 · 105,819/20,974 …).
 *
 * **Ngưỡng này là GIẢ ĐỊNH KHAI BÁO, không phải số đo** — cùng hạng với `cellSize` của
 * mặt độ cầu (§1b ràng buộc 1), nên nó phải hiện ra trong câu chữ của cảnh. Và câu chữ đó
 * nói đúng thứ ngưỡng này chọn: **"cầu dài hơn 1 km"**, KHÔNG phải "cầu qua sông Hồng" —
 * đoạn dài nhất (4.475 m) nằm ở phía tây, không bắc qua sông Hồng. Nói "qua sông Hồng" là
 * gán cho bộ lọc một ý nghĩa nó không có.
 */

export const MAJOR_BRIDGE_MIN_M = 1000;

const M_PER_DEG_LAT = 110_574;
/** Ở vĩ độ 21° — cùng hằng số mà `queries.ts` dùng cho lưới gộp của mặt độ cầu. */
const M_PER_DEG_LON = 103_940;

/**
 * Chiều dài một polyline `[lng, lat, lng, lat, …]`, tính bằng mét.
 *
 * Xấp xỉ phẳng, và đó là đủ: Hà Nội trải chưa tới 1° vĩ độ nên sai số của phép xấp xỉ nhỏ
 * hơn nhiều so với dung sai đơn giản hoá hình học ~10 m đã áp lúc export. Dùng haversine ở
 * đây là chính xác hơn một đại lượng vốn đã được làm tròn thô hơn thế.
 */
export function pathLengthM(path: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 2; i < path.length; i += 2) {
    const dx = (path[i]! - path[i - 2]!) * M_PER_DEG_LON;
    const dy = (path[i + 1]! - path[i - 1]!) * M_PER_DEG_LAT;
    sum += Math.hypot(dx, dy);
  }
  return sum;
}

/** Đoạn cầu dài hơn ngưỡng — thứ duy nhất được kẻ đậm trong cảnh C. */
export function majorBridges<T extends { path: number[]; bridge: boolean }>(
  segs: T[],
  minM = MAJOR_BRIDGE_MIN_M,
): T[] {
  return segs.filter((s) => s.bridge && pathLengthM(s.path) > minM);
}
