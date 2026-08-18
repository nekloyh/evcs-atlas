/** Pure presentation rules shared by Phase 3 Inspector panels and QA tests. */

export function formatPercentile(value: number): string {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

export function formatTriState(
  value: unknown,
  yes = "Có",
  no = "Không",
  missing = "Chưa có dữ liệu",
): string {
  if (value === true) return yes;
  if (value === false) return no;
  return missing;
}

export function screeningThresholdM(communeKind: string | null | undefined): number | null {
  if (communeKind === "PHUONG" || communeKind === "DAC_KHU") return 500;
  if (communeKind === "XA") return 2_000;
  return null;
}

export function networkDistanceMissingText(networkReachable: unknown): string {
  return networkReachable === false ? "không có tuyến mạng hợp lệ" : "chưa có số liệu";
}

export type InspectorGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** Center of the selected geometry's bounding box; never falls back to a province constant. */
export function geometryCenter(geometry: InspectorGeometry): [number, number] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      minLng = Math.min(minLng, value[0]);
      minLat = Math.min(minLat, value[1]);
      maxLng = Math.max(maxLng, value[0]);
      maxLat = Math.max(maxLat, value[1]);
      return;
    }
    for (const child of value) visit(child);
  };

  visit(geometry.coordinates);
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}
