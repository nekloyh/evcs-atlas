/**
 * SINH TỰ ĐỘNG từ `src/evcs/schema/grid.py` — đừng sửa tay.
 *
 *     uv run python -m evcs.schema.emit
 *
 * Sửa cột thì sửa ở khai báo Python rồi sinh lại. Test `columns.test.ts` kiểm file này còn
 * khớp bản khai, và kiểm danh mục trường phủ đủ mọi cột tô màu được.
 */

/** Tên cột của `grid_h3_r8.parquet` — union kiểu, nên gõ sai là lỗi COMPILE. */
export type GridColumn =
  | "h3_r8"
  | "province_code"
  | "lat"
  | "lng"
  | "area_km2"
  | "area_frac"
  | "cell_state"
  | "commune_code"
  | "commune_name"
  | "commune_area_frac"
  | "population"
  | "pop_density_ppkm2"
  | "pop_source"
  | "n_stations"
  | "n_stations_operational"
  | "n_ports"
  | "power_kw_site"
  | "n_fuel"
  | "n_parking_off"
  | "n_parking_street"
  | "n_mall"
  | "n_dept_store"
  | "n_supermarket"
  | "n_market"
  | "n_apartment"
  | "n_poi_total"
  | "road_len_local_m"
  | "road_len_motorway_m"
  | "road_len_primary_m"
  | "road_len_secondary_m"
  | "road_len_service_m"
  | "road_len_tertiary_m"
  | "road_len_trunk_m"
  | "road_len_m"
  | "road_len_arterial_m"
  | "road_len_in_province_m"
  | "n_poi_1km"
  | "apartment_levels_sum"
  | "population_wp"
  | "tree_frac"
  | "shrub_frac"
  | "grass_frac"
  | "crop_frac"
  | "built_frac"
  | "bare_frac"
  | "snow_frac"
  | "water_frac"
  | "wetland_frac"
  | "mangrove_frac"
  | "moss_frac"
  | "dist_station_network_m"
  | "dist_station_euclid_m"
  | "detour_ratio"
  | "dist_station_asym_m"
  | "road_access_offset_m"
  | "network_reachable"
  | "evidence_grade_distance"
  | "screen_margin_m"
  | "screen_decision"
  | "util_cell"
  | "n_stations_measured";

export type ColumnRole = "key" | "identity" | "measure";
export type ColumnAgg = "sum" | "area_mean" | "none";

export interface ColumnMeta {
  /** Kiểu logic, khớp kiểu thật trên parquet. */
  dtype: "str" | "f64" | "i64" | "bool";
  /** `identity` = cột ĐỊNH DANH & XUẤT XỨ, cố ý không tô màu được. */
  role: ColumnRole;
  /** Bước sinh ra cột — cơ sở của `manifest.missing_layers`. */
  layer: string;
  /** Cách gộp lên bậc thô hơn. `none` = KHÔNG gộp được bằng phép nào. */
  agg: ColumnAgg;
  unit: string | null;
  polarity: "high-bad" | "high-good" | null;
  /** Có lên màn hình CẢ NƯỚC không. Khác `agg`: cộng được ≠ được chở đi. */
  national: boolean;
  /** Null ở cột này CÓ NGHĨA gì. `null` = "không biết". */
  nullMeans: string | null;
}

export const GRID_COLUMNS: Record<GridColumn, ColumnMeta> = {
  "h3_r8": { dtype: "str", role: "key", layer: "grid", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "province_code": { dtype: "str", role: "identity", layer: "grid", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "lat": { dtype: "f64", role: "identity", layer: "grid", agg: "none", unit: "độ", polarity: null, national: false, nullMeans: null },
  "lng": { dtype: "f64", role: "identity", layer: "grid", agg: "none", unit: "độ", polarity: null, national: false, nullMeans: null },
  "area_km2": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "km²", polarity: null, national: false, nullMeans: null },
  "area_frac": { dtype: "f64", role: "measure", layer: "grid", agg: "none", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "cell_state": { dtype: "str", role: "identity", layer: "grid", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "commune_code": { dtype: "str", role: "identity", layer: "grid", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "commune_name": { dtype: "str", role: "identity", layer: "grid", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "commune_area_frac": { dtype: "f64", role: "identity", layer: "grid", agg: "none", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "population": { dtype: "f64", role: "measure", layer: "population", agg: "sum", unit: "người trên ô ~0,74 km²", polarity: null, national: true, nullMeans: null },
  "pop_density_ppkm2": { dtype: "f64", role: "measure", layer: "population", agg: "none", unit: "người/km²", polarity: null, national: false, nullMeans: null },
  "pop_source": { dtype: "str", role: "identity", layer: "population", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "n_stations": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "trạm", polarity: null, national: true, nullMeans: null },
  "n_stations_operational": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "trạm", polarity: null, national: true, nullMeans: null },
  "n_ports": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "súng", polarity: null, national: true, nullMeans: null },
  "power_kw_site": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "kW", polarity: null, national: true, nullMeans: null },
  "n_fuel": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_parking_off": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_parking_street": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_mall": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_dept_store": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_supermarket": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_market": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "n_apartment": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "toà", polarity: null, national: true, nullMeans: null },
  "n_poi_total": { dtype: "i64", role: "measure", layer: "grid", agg: "sum", unit: "điểm", polarity: null, national: true, nullMeans: null },
  "road_len_local_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_motorway_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_primary_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_secondary_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_service_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_tertiary_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_trunk_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: false, nullMeans: null },
  "road_len_arterial_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: true, nullMeans: null },
  "road_len_in_province_m": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "mét", polarity: null, national: true, nullMeans: null },
  "n_poi_1km": { dtype: "i64", role: "measure", layer: "grid", agg: "none", unit: "POI trong bán kính 1 km", polarity: null, national: false, nullMeans: null },
  "apartment_levels_sum": { dtype: "f64", role: "measure", layer: "grid", agg: "sum", unit: "tầng", polarity: null, national: true, nullMeans: null },
  "population_wp": { dtype: "f64", role: "measure", layer: "population", agg: "sum", unit: "người trên ô ~0,74 km²", polarity: null, national: true, nullMeans: null },
  "tree_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: true, nullMeans: null },
  "shrub_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "grass_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "crop_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: true, nullMeans: null },
  "built_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: true, nullMeans: null },
  "bare_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "snow_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "water_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: true, nullMeans: null },
  "wetland_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "mangrove_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "moss_frac": { dtype: "f64", role: "measure", layer: "landcover", agg: "area_mean", unit: "tỉ lệ, 0–1", polarity: null, national: false, nullMeans: null },
  "dist_station_network_m": { dtype: "f64", role: "measure", layer: "distance", agg: "none", unit: "mét, theo mạng đường", polarity: "high-bad", national: false, nullMeans: "ô không tới được bằng đường trong bán kính neo" },
  "dist_station_euclid_m": { dtype: "f64", role: "measure", layer: "distance", agg: "none", unit: "mét, đường chim bay", polarity: null, national: false, nullMeans: null },
  "detour_ratio": { dtype: "f64", role: "measure", layer: "distance", agg: "none", unit: "lần", polarity: "high-bad", national: false, nullMeans: "khoảng cách chim bay dưới 200 m — dưới mức đó tỉ số là nhiễu" },
  "dist_station_asym_m": { dtype: "f64", role: "measure", layer: "distance", agg: "none", unit: "m, |đi − về|", polarity: "high-bad", national: false, nullMeans: null },
  "road_access_offset_m": { dtype: "f64", role: "measure", layer: "distance", agg: "none", unit: "mét", polarity: null, national: false, nullMeans: null },
  "network_reachable": { dtype: "bool", role: "measure", layer: "distance", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "evidence_grade_distance": { dtype: "str", role: "measure", layer: "distance", agg: "none", unit: null, polarity: null, national: false, nullMeans: null },
  "screen_margin_m": { dtype: "f64", role: "measure", layer: "screening", agg: "none", unit: "m, âm = chưa đủ xa", polarity: "high-good", national: false, nullMeans: "ô không tính được khoảng cách nên rule không chạy" },
  "screen_decision": { dtype: "str", role: "measure", layer: "screening", agg: "none", unit: null, polarity: null, national: false, nullMeans: "ô không tính được khoảng cách — KHÁC với 'đã xét và từ chối'" },
  "util_cell": { dtype: "f64", role: "measure", layer: "assemble", agg: "none", unit: "tỉ lệ cổng-giờ bận, 0–1", polarity: null, national: false, nullMeans: "ô không có trạm đo được — KHÔNG phải bận bằng 0" },
  "n_stations_measured": { dtype: "i64", role: "measure", layer: "assemble", agg: "sum", unit: "trạm", polarity: null, national: false, nullMeans: null },
};

export const GRID_COLUMN_NAMES = Object.keys(GRID_COLUMNS) as GridColumn[];

/** Cột tô màu lên bản đồ được — mỗi cột ở đây PHẢI có một mục trong danh mục trường. */
export const MAPPABLE_COLUMNS = GRID_COLUMN_NAMES.filter(
  (c) => GRID_COLUMNS[c].role === "measure",
);

/** Cột theo bước sinh ra nó. Tỉnh thiếu một lớp thì thiếu đúng những cột ở đây. */
export const COLUMNS_BY_LAYER: Record<string, GridColumn[]> = {
  "grid": [
    "h3_r8",
    "province_code",
    "lat",
    "lng",
    "area_km2",
    "area_frac",
    "cell_state",
    "commune_code",
    "commune_name",
    "commune_area_frac",
    "n_stations",
    "n_stations_operational",
    "n_ports",
    "power_kw_site",
    "n_fuel",
    "n_parking_off",
    "n_parking_street",
    "n_mall",
    "n_dept_store",
    "n_supermarket",
    "n_market",
    "n_apartment",
    "n_poi_total",
    "road_len_local_m",
    "road_len_motorway_m",
    "road_len_primary_m",
    "road_len_secondary_m",
    "road_len_service_m",
    "road_len_tertiary_m",
    "road_len_trunk_m",
    "road_len_m",
    "road_len_arterial_m",
    "road_len_in_province_m",
    "n_poi_1km",
    "apartment_levels_sum"
  ],
  "population": [
    "population",
    "pop_density_ppkm2",
    "pop_source",
    "population_wp"
  ],
  "landcover": [
    "tree_frac",
    "shrub_frac",
    "grass_frac",
    "crop_frac",
    "built_frac",
    "bare_frac",
    "snow_frac",
    "water_frac",
    "wetland_frac",
    "mangrove_frac",
    "moss_frac"
  ],
  "distance": [
    "dist_station_network_m",
    "dist_station_euclid_m",
    "detour_ratio",
    "dist_station_asym_m",
    "road_access_offset_m",
    "network_reachable",
    "evidence_grade_distance"
  ],
  "screening": [
    "screen_margin_m",
    "screen_decision"
  ],
  "assemble": [
    "util_cell",
    "n_stations_measured"
  ]
} as Record<string, GridColumn[]>;
