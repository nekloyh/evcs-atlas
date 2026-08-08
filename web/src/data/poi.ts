/**
 * Lớp POI VISUAL 4 nhóm — M3.5. Phần THUẦN, test được bằng `node:test` (§12):
 * registry nhóm, quy tắc "POI này có polygon hay không", diện tích polygon.
 *
 * Danh tính nhóm đến từ HÌNH DẠNG mark, không từ hue — §4d-4, và đó là kết quả ĐO
 * (validator giết cả 4 hue ứng viên), không phải khẩu vị. Một màu lạnh `#1c5cab` cho cả
 * 4 nhóm; đặc = có hình học thật, rỗng = chỉ biết vị trí ("không biết cạnh ở đâu" phải
 * nhìn khác "có cạnh" — P4).
 *
 * Ở file này KHÔNG có fetch/canvas: phần nạp ở `queries.ts`, phần vẽ icon ở
 * `viz/poi-icons.ts` — cùng lý do `h3.ts` tách khỏi `queries.ts`.
 */

import type { OverlayId } from "../state/types";

/** Hình dạng mark của một nhóm — §4d-4. Chấm TRÒN đã là trạm sạc, nên POI lấy 4 hình khác. */
export type PoiShape = "square" | "diamond" | "triangle" | "cross";

export interface PoiGroupMeta {
  /** ID overlay trong tab LAYER và khoá hash `l` */
  id: OverlayId;
  /** khoá `group` trong poi.geojson / manifest.poi.groups — do `s03b` sinh */
  group: string;
  label: string;
  shape: PoiShape;
  /** một câu mô tả tag đã chốt — bảng tag đầy đủ ở DESIGN §11 M3.5 */
  desc: string;
}

export const POI_GROUPS: readonly PoiGroupMeta[] = [
  {
    id: "poi_apartment",
    group: "apartment",
    label: "Chung cư / nhà ở tập thể",
    shape: "square",
    desc: "building=apartments hoặc residential=apartments — đúng tập n_apartment của lưới.",
  },
  {
    id: "poi_mall",
    group: "mall",
    label: "Trung tâm thương mại",
    shape: "diamond",
    desc: "shop=mall hoặc shop=department_store.",
  },
  {
    id: "poi_public",
    group: "public",
    label: "Công cộng, khu vui chơi",
    shape: "triangle",
    desc: "leisure=park · playground · garden, hoặc amenity=community_centre.",
  },
  {
    id: "poi_edu_health",
    group: "edu_health",
    label: "Bệnh viện, trường học",
    shape: "cross",
    desc: "amenity=hospital · school · university · college.",
  },
] as const;

export const POI_GROUP_BY_ID = new Map(POI_GROUPS.map((g) => [g.id, g]));
export const POI_GROUP_BY_KEY = new Map(POI_GROUPS.map((g) => [g.group, g]));

/**
 * Chiều cao khối POI ở chế độ 3D — HẰNG SỐ MỘT GIÁ TRỊ, quyết định ở DESIGN §11 M3.5-P5.
 *
 * KHÔNG đến từ cột nào (kể cả `levels`: 41,2% tag — trộn thật với hằng là để mark đọc như
 * dữ liệu trong khi 59% là bịa). §4d-1 cấm kích thước chở giá trị; hằng số là cách duy
 * nhất để chiều cao KHÔNG nói gì. Tab LAYER in con số này kèm câu "không phải chiều cao
 * thật" — nó phải hiện ra được, không được chôn trong code.
 */
export const POI_BLOCK_HEIGHT_M = 40;

/** Các overlay POI đang bật, theo thứ tự registry. */
export function poiGroupsOn(layers: ReadonlySet<OverlayId>): PoiGroupMeta[] {
  return POI_GROUPS.filter((g) => layers.has(g.id));
}

// ── GeoJSON đã ship — poi.geojson (§5a) ────────────────────────────────────────

export type PoiGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface PoiProps {
  group: string;
  tag: string;
  name: string | null;
  levels: number | null;
  lat: number;
  lng: number;
  osm_type: "node" | "way" | "relation";
  osm_id: number;
}

export interface PoiFeature {
  type: "Feature";
  geometry: PoiGeometry;
  properties: PoiProps;
}

export interface PoiCollection {
  type: "FeatureCollection";
  features: PoiFeature[];
}

/**
 * Quy tắc "POI này có polygon hay không" — P4, và nó phải đọc từ HÌNH HỌC đã ship chứ
 * không từ một cờ ngoài lề: cờ và hình học có thể trôi khỏi nhau, hình học thì không.
 *
 * Có polygon ⇒ mark ĐẶC + vẽ được cạnh thật; chỉ điểm ⇒ mark RỖNG, không bao giờ vẽ
 * vòng tròn bán kính bịa thay cho hình.
 */
export function hasShape(geometry: { type: string }): boolean {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

/** Tham chiếu `n|w|r<osm_id>` của một feature — khớp khoá `c=poi:` (§9). */
export function poiRef(p: Pick<PoiProps, "osm_type" | "osm_id">): string {
  return p.osm_type[0]! + String(p.osm_id);
}

// ── Diện tích polygon — panel POI (P6) ─────────────────────────────────────────

const M_PER_DEG_LAT = 110_574;

/** Shoelace trên một vành, chiếu equirectangular quanh vĩ độ của chính vành đó. */
function ringAreaM2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring[0]![1]! * Math.PI) / 180;
  const mLng = M_PER_DEG_LAT * Math.cos(lat0);
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    s += ax! * mLng * (by! * M_PER_DEG_LAT) - bx! * mLng * (ay! * M_PER_DEG_LAT);
  }
  return Math.abs(s) / 2;
}

/**
 * Diện tích m² của một POI có polygon, `null` cho POI chỉ-điểm — không biết cạnh thì
 * không biết diện tích, và không bịa (§12). Vành trong (lỗ) bị TRỪ.
 *
 * Sai số của phép chiếu ở cỡ toà nhà/công viên là <0,1% — đủ cho một dòng panel; con số
 * này TÍNH LÚC CHẠY từ hình học đã ship, không precompute (§13c-1).
 */
export function poiAreaM2(geometry: PoiGeometry): number | null {
  if (geometry.type === "Point") return null;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const poly of polys) {
    for (let r = 0; r < poly.length; r++) {
      const a = ringAreaM2(poly[r]!);
      total += r === 0 ? a : -a;
    }
  }
  return Math.max(total, 0);
}
