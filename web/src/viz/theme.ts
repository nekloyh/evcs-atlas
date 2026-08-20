import { defaultFieldOfLens, type FieldMeta, type LensId } from "../fields";
import type { DemandRepresentation } from "../state/types";

export type AnalysisTheme =
  | "demand"
  | "supply"
  | "utilization"
  | "accessibility"
  | "urban-context"
  | "screening"
  | "exploration";

/** One semantic door from the selected question to its scene treatment. */
export function themeFor(field: FieldMeta, demand: DemandRepresentation): AnalysisTheme {
  if (field.id === "population" && field.readAs === "cell" && demand !== "hex") return "demand";
  if (field.id === "util_cell" || field.id === "station:occ" || field.id === "util_pctl_cell") return "utilization";
  if (field.id === "detour_ratio" || field.id === "dist_station_network_m" || field.id === "road:dist_station_m") return "accessibility";
  if (field.id === "screen_decision" || field.id === "screen_margin_m") return "screening";
  if (field.group === "cung") return "supply";
  if (field.group === "dat" || field.id.startsWith("n_poi") || field.id === "n_apartment" || field.id === "apartment_levels_sum") return "urban-context";
  return "exploration";
}

/**
 * Theme của một LENS — đường duy nhất từ câu hỏi sang mực của biểu đồ (CR 4.1 §C2).
 *
 * Vì sao phải có hàm này thay vì mỗi biểu đồ gõ tên theme của mình: ánh xạ lens → theme đã
 * sống ở `themeFor` + trường mặc định của lens. Gõ lại `"supply"` trong `PowerTierBreakdown`
 * là nhân bản ánh xạ ấy ra năm chỗ, và năm bản sao đó không có gì buộc chúng đổi theo khi
 * registry đổi — đúng cái mâu thuẫn mà §C2 sinh ra để xoá.
 *
 * `demand` phải là representation ĐANG BẬT, không phải một mặc định: ở lens Cầu, `themeFor`
 * trả `demand` hay `exploration` tuỳ representation, nên ghim `"hex"` ở đây sẽ khiến biểu đồ
 * và `ThemeReadout` — hai thứ nằm cùng một cột đọc — sơn hai màu khác nhau.
 */
export function themeOfLens(lens: LensId, demand: DemandRepresentation): AnalysisTheme {
  const field = defaultFieldOfLens(lens);
  return field ? themeFor(field, demand) : "exploration";
}
