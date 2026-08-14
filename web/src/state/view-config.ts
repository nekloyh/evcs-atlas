/** Camera bootstrap state, độc lập renderer MapLibre để state/data không import map/. */
export const INITIAL_VIEW = {
  center: [105.84, 21.0] as [number, number], zoom: 9.3, pitch: 0, bearing: 0,
};

/**
 * Chrome ăn vào khung nhìn khi tính mức phóng ban đầu, px.
 *
 * `NAV_RAIL` là thanh điều hướng trái — nó chiếm chỗ thật và mãi mãi. Con số cũ ở đây là
 * **320**, bề rộng của cột workspace thời layout ba cột; workspace giờ là một mặt NỔI đè
 * lên bản đồ, nên trừ 320 là trừ một cột không còn tồn tại và khung nhìn co lại vô cớ.
 *
 * `BOTTOM` gộp scrubber và dòng attribution — chúng che mép dưới, nên phần bản đồ THẤY được
 * thấp hơn `innerHeight`.
 */
const CHROME = { NAV_RAIL: 56, BOTTOM: 96 };

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
  const mapW = Math.max(320, (typeof window === "undefined" ? 1400 : window.innerWidth) - CHROME.NAV_RAIL);
  const mapH = Math.max(320, (typeof window === "undefined" ? 900 : window.innerHeight) - CHROME.BOTTOM);
  const lat = ((s + n) / 2) * (Math.PI / 180);
  const zx = Math.log2(((mapW / 512) * 360) / Math.max(e - w, 1e-6));
  const zy = Math.log2(((mapH / 512) * 360) / Math.max((n - s) / Math.max(Math.cos(lat), .1), 1e-6));
  return Math.max(4, Math.min(12, Math.round((Math.min(zx, zy) - Math.log2(FIT_PADDING)) * 10) / 10));
}
