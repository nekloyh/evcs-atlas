import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

export const POSITRON_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Khung nhìn ban đầu — bbox thật của lưới H3. DESIGN.md §2b.
 *
 * Dùng từ vựng của MapLibre (`center`), KHÔNG dùng `longitude`/`latitude` kiểu deck.gl:
 * ở chế độ interleaved thì MapLibre giữ camera, và nó lặng lẽ bỏ qua khoá nó không hiểu —
 * đặt sai tên là bản đồ về [0,0] giữa Đại Tây Dương mà không có lỗi nào.
 */
export const INITIAL_VIEW = {
  center: [105.84, 21.0] as [number, number],
  zoom: 9.3,
  pitch: 0,
  bearing: 0,
};

/**
 * Đặt khung nhìn ban đầu theo bbox của TỈNH đang mở — gọi TRƯỚC khi `store.ts` được nạp.
 *
 * `store.ts` đọc `INITIAL_VIEW` ngay lúc module khởi tạo, nên chỗ duy nhất sửa được là
 * trước lần import đó. `main.tsx` vì thế nạp manifest rồi mới `import("./App")` động.
 *
 * Vì sao không để mặc định Hà Nội rồi bay sau: một khung nhìn nhảy sau khi đã vẽ là nói
 * với người xem rằng bản đồ vừa đổi nghĩa. Với 34 tỉnh, mở tỉnh nào cũng thấy Hà Nội một
 * nhịp là lỗi nhìn thấy được ở MỌI lần mở.
 */
export function setInitialViewFromBbox(bbox: [number, number, number, number]): void {
  const [w, s, e, n] = bbox;
  const lat = (s + n) / 2;
  INITIAL_VIEW.center = [(w + e) / 2, lat];
  INITIAL_VIEW.zoom = zoomForBbox(bbox);
}

/**
 * Zoom vừa khít bbox trong vùng bản đồ, có lề.
 *
 * Hiệu chuẩn bằng một điểm neo đã biết chứ không bằng cảm tính: bbox Hà Nội
 * (0,73° × 0,83°) phải ra ~9,3 — đúng con số mà `INITIAL_VIEW` dùng từ M1 và đã được
 * kiểm bằng ảnh render. `FIT_PADDING` là hệ số làm khớp neo đó.
 *
 * Trục dọc quy đổi qua Mercator (`/ cos(lat)`): một độ vĩ chiếm nhiều pixel hơn một độ
 * kinh khi đi xa xích đạo, và bỏ qua điều này sẽ cắt cụt các tỉnh dài theo hướng bắc-nam.
 */
const FIT_PADDING = 1.7;
const TILE_PX = 512;

export function zoomForBbox([w, s, e, n]: [number, number, number, number]): number {
  const mapW = Math.max(320, (typeof window === "undefined" ? 1400 : window.innerWidth) - 320);
  const mapH = Math.max(320, typeof window === "undefined" ? 900 : window.innerHeight);
  const lat = ((s + n) / 2) * (Math.PI / 180);
  const dLng = Math.max(e - w, 1e-6);
  const dLat = Math.max((n - s) / Math.max(Math.cos(lat), 0.1), 1e-6);
  const zx = Math.log2(((mapW / TILE_PX) * 360) / dLng);
  const zy = Math.log2(((mapH / TILE_PX) * 360) / dLat);
  const z = Math.min(zx, zy) - Math.log2(FIT_PADDING);
  return Math.max(4, Math.min(12, Math.round(z * 10) / 10));
}

/**
 * Sửa style positron theo DESIGN.md §2a: **tắt toàn bộ nhãn** (mọi layer `symbol`).
 * Dữ liệu là nội dung, nhãn OSM là nhiễu.
 *
 * Chỉ còn một việc. Phần nhấn sông Hồng (tách `class == "river"`, tô `#9ec5f4`, thêm nét
 * viền xanh) đã **bỏ ở M1.1** — nhấn sông là thao tác của MỘT cảnh (§13d-C), không phải
 * một sửa đổi vĩnh viễn của nền: nền nhấn ở cả 45 bản đồ không liên quan thì thành trang
 * trí. Nó sẽ quay lại ở M3 dưới dạng lớp của cảnh.
 */
export function transformPositron(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = style.layers.filter((l) => l.type !== "symbol");
  return { ...style, layers };
}

export async function loadStyle(): Promise<StyleSpecification> {
  const res = await fetch(POSITRON_URL);
  if (!res.ok) throw new Error(`Không tải được style positron: HTTP ${res.status}`);
  return transformPositron((await res.json()) as StyleSpecification);
}
