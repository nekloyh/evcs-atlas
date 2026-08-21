/**
 * Phase 6 — Spatial Simulation Geometry Primitives (geometry.ts)
 *
 * Deterministic pure functions for spherical distance and point-in-polygon containment.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §0.2, §1.3
 */

import { cellToBoundary, isValidCell } from "h3-js";

export const EARTH_RADIUS_M = 6371008.8;

/**
 * UX §14.4 — hộp bao của một nhóm ô H3, để đưa bản đồ tới đúng khu vực đang trỏ.
 *
 * Dùng ĐƯỜNG BAO của ô chứ không dùng tâm: một nhóm một ô có hộp bao rỗng nếu chỉ lấy tâm,
 * và phép fit sẽ rơi về mức phóng tối đa. Trả `null` khi không có ô nào tra được — không
 * có hộp bao thì không có lệnh camera nào để phát, và im lặng ở đây đúng hơn một cú nhảy.
 */
export function simulationAreaBbox(
  h3s: readonly string[],
): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const h of h3s) {
    // `isValidCell` chứ không phải `try/catch`: `cellToBoundary` KHÔNG ném cho một chuỗi
    // bất kỳ — nó trả về một đa giác vô nghĩa (đo được: một chuỗi tiếng Việt cho hộp bao
    // lng −34,8…145,6). Một `catch` ở đây trông như đã gác mà thật ra chưa gác gì.
    if (!isValidCell(h)) continue;
    const ring = cellToBoundary(h, true) as number[][];
    for (const pt of ring) {
      const lng = pt[0]!;
      const lat = pt[1]!;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return Number.isFinite(w) && Number.isFinite(s) ? [w, s, e, n] : null;
}

/**
 * Great-circle distance between two WGS84 points using the Haversine formula.
 * R = 6 371 008.8 m as defined in §1.3.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const radLat1 = lat1 * toRad;
  const radLat2 = lat2 * toRad;

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLng2 = Math.sin(dLng / 2);

  const a =
    sinDLat2 * sinDLat2 +
    Math.cos(radLat1) * Math.cos(radLat2) * sinDLng2 * sinDLng2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_M * c;
}

/**
 * Standard ray-casting algorithm to test if a 2D point is inside a linear ring.
 * Point: [lng, lat], Ring: Array of [lng, lat].
 */
export function pointInRing(
  pt: [number, number],
  ring: Array<[number, number] | number[]>,
): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Test if a point [lng, lat] is inside a GeoJSON Polygon coordinates array.
 * Polygon coordinates: Array of rings (first is exterior, subsequent are holes).
 */
export function pointInPolygonCoords(
  pt: [number, number],
  rings: Array<Array<[number, number] | number[]>>,
): boolean {
  if (rings.length === 0 || !rings[0]) return false;
  if (!pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (rings[i] && pointInRing(pt, rings[i]!)) return false; // Inside hole
  }
  return true;
}

/**
 * Test if a point [lng, lat] is inside a GeoJSON MultiPolygon coordinates array.
 */
export function pointInMultiPolygonCoords(
  pt: [number, number],
  polys: Array<Array<Array<[number, number] | number[]>>>,
): boolean {
  for (const poly of polys) {
    if (pointInPolygonCoords(pt, poly)) return true;
  }
  return false;
}

/**
 * Test if a point [lng, lat] is inside any Feature of a GeoJSON FeatureCollection or Geometry.
 */
export function isPointInGeoJson(
  lng: number,
  lat: number,
  geojson: any,
): boolean {
  if (!geojson) return false;
  const pt: [number, number] = [lng, lat];

  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (isPointInGeometry(pt, f.geometry)) return true;
    }
    return false;
  }
  // Một object CÓ `geometry` là một feature, kể cả khi nó không khai `type: "Feature"`.
  // Kiểu `CommuneFeature` của `admissions.ts` khai đúng hình dạng ấy (`{properties,
  // geometry}`), nên nhánh chỉ-nhận-`type` cũ trả `false` LẶNG cho chính cái kiểu mà API
  // này công bố — PIP trượt, rơi thẳng xuống fallback theo mã ô, và không ai thấy.
  if (geojson.type === "Feature" || geojson.geometry) {
    return isPointInGeometry(pt, geojson.geometry);
  }
  return isPointInGeometry(pt, geojson);
}

export function isPointInGeometry(pt: [number, number], geom: any): boolean {
  if (!geom || !geom.type || !geom.coordinates) return false;
  if (geom.type === "Polygon") {
    return pointInPolygonCoords(pt, geom.coordinates);
  }
  if (geom.type === "MultiPolygon") {
    return pointInMultiPolygonCoords(pt, geom.coordinates);
  }
  return false;
}

/**
 * Generates an array of [lng, lat] coordinates forming a circle of radiusM around (lat, lng).
 */
export function generateCirclePath(
  lat: number,
  lng: number,
  radiusM: number,
  nPoints = 64,
): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  const toRad = Math.PI / 180;
  const radLat = lat * toRad;
  const radLng = lng * toRad;
  const dR = radiusM / EARTH_RADIUS_M;

  for (let i = 0; i <= nPoints; i++) {
    const bearing = (i * 2 * Math.PI) / nPoints;
    const ptLat = Math.asin(
      Math.sin(radLat) * Math.cos(dR) +
        Math.cos(radLat) * Math.sin(dR) * Math.cos(bearing),
    );
    const ptLng =
      radLng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dR) * Math.cos(radLat),
        Math.cos(dR) - Math.sin(radLat) * Math.sin(ptLat),
      );
    coords.push([ptLng / toRad, ptLat / toRad]);
  }
  return coords;
}


/**
 * F7 — vòng bán kính `radiusM` quanh P có điểm nào rơi ra ngoài ranh giới gói không.
 * Đo bằng hình học (64 điểm trên vòng), KHÔNG đoán từ số ô: vùng thưa ô giữa tỉnh không
 * phải là mép gói, và mép gói dày ô vẫn là mép gói.
 */
export function zoneTruncatedAt(
  lat: number,
  lng: number,
  radiusM: number,
  boundaryGeoJson: unknown,
): boolean {
  if (!boundaryGeoJson) return false;
  const circle = generateCirclePath(lat, lng, radiusM, 64);
  for (const [ptLng, ptLat] of circle) {
    if (!isPointInGeoJson(ptLng, ptLat, boundaryGeoJson)) return true;
  }
  return false;
}
