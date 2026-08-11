/** Camera bootstrap state, độc lập renderer MapLibre để state/data không import map/. */
export const INITIAL_VIEW = {
  center: [105.84, 21.0] as [number, number], zoom: 9.3, pitch: 0, bearing: 0,
};

export function setInitialViewFromBbox(bbox: [number, number, number, number]): void {
  const [w, s, e, n] = bbox;
  INITIAL_VIEW.center = [(w + e) / 2, (s + n) / 2];
  INITIAL_VIEW.zoom = zoomForBbox(bbox);
}

export function zoomForBbox([w, s, e, n]: [number, number, number, number]): number {
  const mapW = Math.max(320, (typeof window === "undefined" ? 1400 : window.innerWidth) - 320);
  const mapH = Math.max(320, typeof window === "undefined" ? 900 : window.innerHeight);
  const lat = ((s + n) / 2) * (Math.PI / 180);
  const zx = Math.log2(((mapW / 512) * 360) / Math.max(e - w, 1e-6));
  const zy = Math.log2(((mapH / 512) * 360) / Math.max((n - s) / Math.max(Math.cos(lat), .1), 1e-6));
  return Math.max(4, Math.min(12, Math.round((Math.min(zx, zy) - Math.log2(1.7)) * 10) / 10));
}
