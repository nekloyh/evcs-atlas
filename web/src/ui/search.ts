import type { CommuneCollection, CommuneFeature, GridCell, StationPoint } from "../data/queries";

export type SearchResultItem =
  | {
      category: "commune";
      id: string;
      code: string;
      title: string;
      subtitle: string;
      center: [number, number];
      zoom: number;
    }
  | {
      category: "station";
      id: string;
      title: string;
      subtitle: string;
      center: [number, number];
      zoom: number;
    }
  | {
      category: "cell";
      id: string;
      title: string;
      subtitle: string;
      center: [number, number];
      zoom: number;
    };

/** Normalize text for fuzzy accent-insensitive search */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

/** Compute approximate center [lng, lat] from GeoJSON geometry */
export function calculateGeometryCenter(feature: CommuneFeature): [number, number] {
  const geom = feature.geometry;
  if (!geom || !geom.coordinates) return [105.8, 21.0];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const traverse = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lng, lat] = coords as [number, number];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const item of coords) {
        traverse(item);
      }
    }
  };

  traverse(geom.coordinates);
  if (minLng === Infinity) return [105.8, 21.0];
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * Filter items across communes, stations, and H3 cells.
 */
export function filterSearchResults(
  rawQuery: string,
  communes: CommuneCollection | null,
  stations: StationPoint[] | null,
  cells: GridCell[] | null,
): SearchResultItem[] {
  const q = normalizeSearchText(rawQuery);
  if (!q || q.length < 1) return [];

  const items: SearchResultItem[] = [];

  // 1. Communes search
  if (communes?.features) {
    let count = 0;
    for (const feat of communes.features) {
      if (count >= 5) break;
      const p = feat.properties;
      const code = String(p["commune_code"] ?? "");
      const name = String(p["commune_name"] ?? p["ten_xa"] ?? "");
      const district = String(p["district_name"] ?? p["ten_huyen"] ?? "");

      const normalizedName = normalizeSearchText(name);
      const normalizedDistrict = normalizeSearchText(district);

      if (
        normalizedName.includes(q) ||
        normalizedDistrict.includes(q) ||
        code.startsWith(q)
      ) {
        const center = calculateGeometryCenter(feat);
        items.push({
          category: "commune",
          id: `commune:${code}`,
          code,
          title: name || `Xã ${code}`,
          subtitle: district ? `Quận/Huyện ${district} · Mã: ${code}` : `Mã xã: ${code}`,
          center,
          zoom: 12.5,
        });
        count++;
      }
    }
  }

  // 2. Stations search
  if (stations && stations.length > 0) {
    let count = 0;
    for (const s of stations) {
      if (count >= 5) break;
      const id = String(s.id ?? "");
      const normalizedId = normalizeSearchText(id);

      if (normalizedId.includes(q)) {
        items.push({
          category: "station",
          id: `station:${s.id}`,
          title: `Trạm ${s.id}`,
          subtitle: `Cổng: ${s.nPorts ?? 0} · Trạng thái: ${s.opStatus || "Hoạt động"}`,
          center: [s.lng, s.lat],
          zoom: 14.5,
        });
        count++;
      }
    }
  }

  // 3. Cells search (H3 index)
  if (q.startsWith("8") && cells && cells.length > 0) {
    let count = 0;
    for (const c of cells) {
      if (count >= 3) break;
      if (c.h3.toLowerCase().startsWith(q)) {
        items.push({
          category: "cell",
          id: c.h3,
          title: `Ô H3 ${c.h3.slice(0, 10)}…`,
          subtitle: `Dân số: ${(c.pop ?? 0).toLocaleString("vi-VN")} ng · Cự ly: ${
            c.dist !== null ? `${Math.round(c.dist)}m` : "N/A"
          }`,
          center: [c.lng, c.lat],
          zoom: 13.5,
        });
        count++;
      }
    }
  }

  return items;
}
