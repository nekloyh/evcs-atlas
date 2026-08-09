/**
 * Chọn BẬC LƯỚI theo mức phóng — phần THUẦN, có test (§12).
 *
 * ── Vấn đề nó giải ────────────────────────────────────────────────────────────────────
 *
 * Một ô r6 rộng ~6,8 km. Ở khung nhìn cả nước (đo được ~2,3 km/px) nó chiếm **~3 px** —
 * vừa đủ để đọc thành một ô, và ở chế độ 3D thì vừa đủ để đọc thành một khối. Phóng vào
 * hai bậc zoom nữa thì cùng ô ấy chiếm 12 px, và thảm ô biến thành một tấm khảm thô: 3D
 * lúc đó là những hộp to bằng cả một huyện.
 *
 * r7 nhỏ hơn r6 **√7 ≈ 2,65 lần theo cạnh** (5,8 km² so với 40,1 km²). Đổi sang nó lúc
 * phóng vào là giữ cho một ô luôn nằm quanh 3–8 px — cỡ mà mắt đọc được vừa hình vừa khối.
 *
 * ── VÀ VÌ SAO KHÔNG DÙNG r7 CHO MỌI MỨC PHÓNG ─────────────────────────────────────────
 *
 * Ở khung nhìn cả nước một ô r7 rộng ~1,1 px. Mịn hơn pixel không phải là chi tiết hơn —
 * nó là **nhoè**: bảy bậc màu trộn vào nhau dưới ngưỡng phân giải, và ở 3D thì khối rộng
 * 1 px không còn mặt bên nào để đọc. Cộng thêm 2,14 MB tải cho một thứ không hiện ra.
 *
 * ── TRỄ (HYSTERESIS) ──────────────────────────────────────────────────────────────────
 *
 * Hai ngưỡng chứ không một. Đổi bậc là **đổi cả bậc màu** (phân vị tính trên chính tập
 * đang xem, mà một ô r7 đo dân của 5,8 km² chứ không phải 40,1 km²) — nên một cú lăn chuột
 * đúng ngay ranh giới sẽ làm toàn bộ thang màu nhấp nháy qua lại. Lên ở 6,0, xuống ở 5,6:
 * khoảng chết 0,4 zoom rộng hơn hẳn một nấc lăn chuột.
 */

/** Bậc mặc định — nhìn cả nước. Luôn có mặt, nằm trong 0,52 MB tải lần đầu. */
export const RES_BASE = 6;

/** Bậc MỊN, nạp lười (2,14 MB). `manifest.grids["7"]` là hợp đồng khai nó có tồn tại. */
export const RES_ZOOM = 7;

/** Phóng tới đây thì lên bậc mịn. */
export const ZOOM_UP = 6.0;

/** Thu về dưới đây thì xuống lại bậc thô. Thấp hơn `ZOOM_UP` — xem đoạn TRỄ ở docstring. */
export const ZOOM_DOWN = 5.6;

/**
 * Bậc nên dùng ở mức phóng này, biết bậc ĐANG dùng. Hàm THUẦN.
 *
 * `available` là tập bậc thật sự có file (đọc từ `manifest.grids`). Thiếu r7 — một bản
 * build cũ, hay `n12` chưa chạy lại — thì hàm luôn trả `RES_BASE`, và màn hình chạy y như
 * trước khi có LOD. Thiếu dữ liệu là "không có bậc mịn", không phải một màn hình lỗi.
 */
export function resolutionForZoom(
  zoom: number,
  current: number,
  available: ReadonlySet<number>,
): number {
  if (!available.has(RES_ZOOM)) return RES_BASE;
  if (current === RES_ZOOM) return zoom < ZOOM_DOWN ? RES_BASE : RES_ZOOM;
  return zoom >= ZOOM_UP ? RES_ZOOM : RES_BASE;
}
