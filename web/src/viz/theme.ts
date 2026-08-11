import type { FieldMeta } from "../fields";
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
