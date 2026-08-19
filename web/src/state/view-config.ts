import { READ_COL_W } from "../ui/chart-size";
import { CHROME_BOTTOM, NAV_RAIL_W } from "../design-tokens";

/** Camera bootstrap state, độc lập renderer MapLibre để state/data không import map/. */
export const INITIAL_VIEW = {
  center: [105.84, 21.0] as [number, number], zoom: 9.3, pitch: 0, bearing: 0,
};

/**
 * Chrome ăn vào khung nhìn khi tính mức phóng ban đầu, px.
 *
 * **Luật một câu: chỉ trừ thứ nằm TRONG LUỒNG.** Một mặt NỔI không lấy pixel nào của phần
 * tử bản đồ — nó đè lên trên — nên trừ nó là co khung nhìn cho một cột không tồn tại. Một
 * cột trong luồng thì ngược lại: không trừ nó, mức phóng được tính cho một bề rộng rộng hơn
 * bề rộng thật, và tỉnh bị đẩy ra sau panel ngay lúc mở app.
 *
 * Bảng cũ trừ `NAV_RAIL + INFO_PANEL + BOTTOM` nhưng **không trừ chồng nổi TRÁI** — 352 px
 * chú giải + workspace đè lên mép tây. Hệ quả đo được: fit canh Hà Nội vào giữa một hộp mà
 * 352 px bên trái đang bị che, nên Ba Vì và Sơn Tây nằm dưới thẻ chú giải ngay khung hình
 * đầu tiên. Lỗi ấy **không sửa được bằng một phép trừ nữa**: mặt nổi che một phần bản đồ mà
 * `zoomForBbox` không biết là phần nào, nên nó chỉ biết thu nhỏ chứ không biết dịch tâm.
 * Bố cục A′ (§3h) chữa nó ở gốc — không còn mặt nổi nào **thường trực**, nên bảng này lại
 * đếm đủ và đếm đúng.
 *
 * `READ_COL` là cột đọc trong luồng bên trái bản đồ, mặc định mở từ 1024 px (dưới ngưỡng đó
 * nó là sheet phủ, không chiếm bề rộng nào). Con số đến từ `READ_COL_W`, không gõ lại: nó
 * suy ra từ bề rộng biểu đồ (xem `ui/chart-size.ts`), nên hai chỗ không thể lệch nhau.
 *
 * `BOTTOM` chỉ còn dòng attribution + nút phóng của MapLibre. Con số cũ **96** gộp cả
 * scrubber, thứ mà §3e chỉ dựng khi trường đang tô là nhịp trạm — tức gần như không bao giờ
 * ở bố cục này. Và bbox Hà Nội **cao hơn rộng** (tỉ lệ 0,833), nên khung nhìn bị giới hạn
 * bởi CHIỀU CAO: mỗi px trừ thừa ở đây thu nhỏ tỉnh thật, còn px trừ thừa theo bề rộng thì
 * không. Scrubber khi có mặt nằm trong luồng và MapLibre tự `resize` theo — nó đổi khung
 * nhìn SAU khi fit, không phải trước.
 */
const CHROME = { NAV_RAIL: NAV_RAIL_W, READ_COL: READ_COL_W, BOTTOM: CHROME_BOTTOM };

/**
 * Lề quanh tỉnh khi khớp khung nhìn. `1,7` cũ để lại gần một nửa màn hình là nền trống:
 * ở 1680 × 1000 nó cho z8,9 và Hà Nội chỉ chiếm phần giữa, phần còn lại là xám. Bản đồ chủ
 * đề phải LẤP khung nhìn — khoảng trống quanh nó không mang thông tin nào.
 */
const FIT_PADDING = 1.12;

export function setInitialViewFromBbox(bbox: [number, number, number, number]): void {
  const [w, s, e, n] = bbox;
  INITIAL_VIEW.center = [(w + e) / 2, (s + n) / 2];
  INITIAL_VIEW.zoom = zoomForBbox(bbox);
}

export function zoomForBbox([w, s, e, n]: [number, number, number, number]): number {
  const win = typeof window === "undefined" ? 1400 : window.innerWidth;
  // Cột đọc chỉ nằm trong luồng từ 1024 px trở lên (xem `useIsDesktop`) — dưới ngưỡng đó nó
  // là sheet phủ, không chiếm bề rộng nào của bản đồ.
  const chromeW = CHROME.NAV_RAIL + (win >= 1024 ? CHROME.READ_COL : 0);
  const mapW = Math.max(320, win - chromeW);
  const mapH = Math.max(320, (typeof window === "undefined" ? 900 : window.innerHeight) - CHROME.BOTTOM);
  const lat = ((s + n) / 2) * (Math.PI / 180);
  const zx = Math.log2(((mapW / 512) * 360) / Math.max(e - w, 1e-6));
  const zy = Math.log2(((mapH / 512) * 360) / Math.max((n - s) / Math.max(Math.cos(lat), .1), 1e-6));
  return Math.max(4, Math.min(12, Math.round((Math.min(zx, zy) - Math.log2(FIT_PADDING)) * 10) / 10));
}

// ── Phase 5 §1.8 — mức phóng khi ĐIỀU HƯỚNG tới một đối tượng ────────────────

/**
 * Lề quanh một đối tượng khi khớp khung nhìn vào nó. Rộng hơn `FIT_PADDING` của phép fit
 * tỉnh vì một xã cần thấy được rìa của mình so với hàng xóm, không chỉ thấy chính nó.
 */
const FEATURE_FIT_PADDING = 1.15;

/**
 * Kẹp mức phóng khi đi tới một XÃ — §1.8.
 *
 * Trần 15 để một phường 1,93 km không phóng tới mức mất hết ngữ cảnh; sàn 10 để một xã
 * 15,54 km vẫn còn đọc được nền.
 */
export const COMMUNE_ZOOM_MIN = 10;
export const COMMUNE_ZOOM_MAX = 15;
/** Sàn mức phóng khi đi tới một TRẠM — một điểm không có bề rộng nào để khớp. */
export const STATION_MIN_ZOOM = 14.5;
/** Sàn mức phóng khi đi tới một Ô H3 r8 (~0,74 km²). */
export const CELL_MIN_ZOOM = 13.5;

/**
 * Mức phóng khớp hộp bao của MỘT đối tượng.
 *
 * Vì sao không dùng một hằng: bề ngang lớn nhất của hộp bao xã đo được trải từ 1,93 km
 * (Phường Hoàn Kiếm) tới 15,54 km (Xã Đa Phúc) — **8,1 lần**. Ở `zoom: 12.5` cố định của bản
 * cũ, tỉ lệ là 25,23 m/px tại vĩ độ 21°, nên cùng một điều khiển vẽ hai xã đó ra 77 px và
 * 616 px bề ngang: một cái là một chấm, cái kia tràn màn hình.
 */
export function zoomForFeatureBounds(
  bbox: readonly [number, number, number, number],
): number {
  const [w, s, e, n] = bbox;
  const win = typeof window === "undefined" ? 1400 : window.innerWidth;
  const chromeW = CHROME.NAV_RAIL + (win >= 1024 ? CHROME.READ_COL : 0);
  const mapW = Math.max(320, win - chromeW);
  const mapH = Math.max(320, (typeof window === "undefined" ? 900 : window.innerHeight) - CHROME.BOTTOM);
  const lat = ((s + n) / 2) * (Math.PI / 180);
  const zx = Math.log2(((mapW / 512) * 360) / Math.max(e - w, 1e-9));
  const zy = Math.log2(((mapH / 512) * 360) / Math.max((n - s) / Math.max(Math.cos(lat), 0.1), 1e-9));
  const z = Math.min(zx, zy) - Math.log2(FEATURE_FIT_PADDING);
  return Math.max(COMMUNE_ZOOM_MIN, Math.min(COMMUNE_ZOOM_MAX, Math.round(z * 10) / 10));
}
