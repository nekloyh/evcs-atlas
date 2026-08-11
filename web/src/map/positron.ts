import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import type { BasemapStyle } from "../state/types";
export { INITIAL_VIEW, setInitialViewFromBbox, zoomForBbox } from "../state/view-config";

export const BASEMAP_URLS: Record<BasemapStyle, string> = {
  voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

export const POSITRON_URL = BASEMAP_URLS.positron;


/**
 * Sửa style bản đồ theo DESIGN.md §2a: **tắt toàn bộ nhãn** (mọi layer `symbol`).
 * Dữ liệu là nội dung, nhãn OSM là nhiễu.
 */
export function transformPositron(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = style.layers.filter((l) => l.type !== "symbol");
  return { ...style, layers };
}

export async function loadStyle(styleId: BasemapStyle = "voyager"): Promise<StyleSpecification> {
  const url = BASEMAP_URLS[styleId] ?? BASEMAP_URLS.voyager;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được style ${styleId}: HTTP ${res.status}`);
  return transformPositron((await res.json()) as StyleSpecification);
}
