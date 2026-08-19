/**
 * Chọn CẦU đáng kẻ đậm trong cảnh C — M3.1.
 *
 * Bài toán có thật, tìm ra khi render lần đầu: kẻ đậm mọi đoạn `bridge = true` thì ở zoom
 * toàn thành phố chúng thành một lớp chấm đen phủ khắp tỉnh, nuốt mất chính cái ramp mà
 * cảnh đang muốn cho xem. Phần lớn là cống, cầu vượt bộ hành, lối chui. Chúng đúng là cầu,
 * nhưng chúng không chở luận điểm nào: cầu đáng nói ở đây là cầu **bắc qua một con sông đủ
 * rộng để bắt xe đi vòng**.
 *
 * Bộ dữ liệu không có cờ "qua sông Hồng" — nên ta không được vẽ như thể có. Cái đo được là
 * **chiều dài**, và nó tách hai nhóm rất sạch. Đo trên `roads.parquet` đã ship,
 * `exported_utc = 2026-08-19T10:16:16Z` (bảng này là ẢNH CHỤP để đọc, KHÔNG phải nguồn của
 * bất kỳ con số nào trên màn hình — `majorBridges()` đếm lại lúc chạy):
 *
 * | phân vị | chiều dài |
 * |---|---:|
 * | trung vị | 16,5 m |
 * | p90 | 102,2 m |
 * | p99 | 1.372,4 m |
 * | max | 4.474,5 m |
 *
 * `n` = 3.027 đoạn mang cờ `bridge` trong 115.931 đoạn đã ship; `> 1.000 m` giữ lại 45.
 *
 * Lưu ý một cái bẫy đã bắt được: `manifest.roads.bridge_ways_shipped` đếm **trước** bộ lọc
 * class/access, nên nó nói 3.319 trong khi file có 3.027. Cảnh đọc số đếm LÚC CHẠY của
 * chính mảng nó vẽ, không đọc khoá manifest ấy.
 *
 * **Ngưỡng này là GIẢ ĐỊNH KHAI BÁO, không phải số đo** — cùng hạng với `cellSize` của
 * mặt độ cầu (§1b ràng buộc 1), nên nó phải hiện ra trong câu chữ của cảnh. Và câu chữ đó
 * nói đúng thứ ngưỡng này chọn: **"cầu dài hơn 1 km"**, KHÔNG phải "cầu qua sông Hồng" —
 * đoạn dài nhất nằm ở phía tây và không bắc qua sông Hồng. Nói "qua sông Hồng" là gán cho
 * bộ lọc một ý nghĩa nó không có.
 */

export { MAJOR_BRIDGE_MIN_M } from "../domain-thresholds";
import { MAJOR_BRIDGE_MIN_M } from "../domain-thresholds";

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
