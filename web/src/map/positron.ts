import type { StyleSpecification, LayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { BasemapStyle } from "../state/types";
export { INITIAL_VIEW, setInitialViewFromBbox, zoomForBbox } from "../state/view-config";

export const BASEMAP_URLS: Record<BasemapStyle, string> = {
  voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

export const POSITRON_URL = BASEMAP_URLS.positron;

/**
 * Nhãn nền được GIỮ — id lấy từ chính style của CARTO (positron/voyager/dark dùng chung bộ
 * id này). Thứ tự trong mảng là thứ tự vẽ: cái sau nằm trên.
 *
 * Luật cũ ("tắt toàn bộ layer symbol") giải đúng một nửa bài toán rồi đi quá đà. Nửa đúng:
 * tên POI, tên đường và số nhà là nhiễu — chúng đặc lại đúng ở mức phóng mà người xem đang
 * đọc mặt tô, và chúng không trả lời câu hỏi nào của app. Nửa sai: bỏ luôn tên NƠI CHỐN thì
 * bản đồ Hà Nội không còn một chữ nào, và câu hỏi đầu tiên của mọi người xem — "chỗ này là
 * chỗ nào?" — thành không trả lời được. Ảnh chụp ở z11 với inspector đang mở là bằng chứng:
 * một mảng màu không có lấy một mốc định vị.
 *
 * Nên bộ giữ lại đúng bằng bộ trả lời "ở đâu": tên khu dân cư và tên nước. Sông Hồng có tên
 * là thứ định vị mạnh nhất trên bản đồ này.
 */
const KEPT_LABELS: readonly string[] = [
  "waterway_label",
  "watername_lake",
  "watername_lake_line",
  "watername_ocean",
  "watername_sea",
  "place_hamlet",
  "place_suburbs",
  "place_villages",
  "place_town",
  "place_city_r6",
  "place_city_r5",
  "place_city_dot_r7",
  "place_city_dot_r4",
  "place_city_dot_r2",
  "place_capital_dot_z7",
  "place_state",
];

/** Nhãn phải mang MỰC CỦA APP, không mang mực của nhà cung cấp style. */
const LABEL_INK = "#0b0b0b";
const LABEL_INK_SOFT = "#52514e";
const LABEL_INK_WATER = "#5b6b78";
/** Quầng sáng lấy màu PANEL, không lấy trắng: trên mặt tô sẫm nó là thứ duy nhất giữ chữ
    đọc được, và nó phải là cùng một màu với các mặt nổi của app để không thành viền lạ. */
const LABEL_HALO = "#f9f9f7";

function isSymbol(l: LayerSpecification): l is SymbolLayerSpecification {
  return l.type === "symbol";
}

/**
 * Sửa style bản đồ: bỏ nhãn nhiễu, giữ nhãn định vị, và nhuộm nhãn giữ lại theo mực của app.
 */
export function transformPositron(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const l of style.layers) {
    if (!isSymbol(l)) {
      layers.push(l);
      continue;
    }
    if (!KEPT_LABELS.includes(l.id)) continue;

    const water = l.id.startsWith("watername") || l.id === "waterway_label";
    const major = l.id.startsWith("place_city") || l.id === "place_state";
    layers.push({
      ...l,
      paint: {
        ...l.paint,
        "text-color": water ? LABEL_INK_WATER : major ? LABEL_INK : LABEL_INK_SOFT,
        "text-halo-color": LABEL_HALO,
        // Quầng dày hơn mặc định của CARTO (1 px): nền của nó ở đây không phải nền xám
        // nhạt mà là bậc c7 nâu sẫm của choropleth.
        "text-halo-width": 1.6,
        "text-halo-blur": 0.4,
      },
    });
  }
  return { ...style, layers };
}

/** Id nhãn còn sống trong một style đã transform — dùng để nâng chúng lên trên lớp dữ liệu. */
export function labelLayerIds(style: StyleSpecification): string[] {
  return style.layers.filter(isSymbol).map((l) => l.id);
}

export async function loadStyle(styleId: BasemapStyle = "voyager"): Promise<StyleSpecification> {
  const url = BASEMAP_URLS[styleId] ?? BASEMAP_URLS.voyager;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được style ${styleId}: HTTP ${res.status}`);
  return transformPositron((await res.json()) as StyleSpecification);
}
