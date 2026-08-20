/**
 * Nạp dữ liệu cho màn hình TOÀN QUỐC.
 *
 * Khác hẳn `queries.ts` ở một điểm và điểm đó quyết định cả kiến trúc file này: **bảng ở
 * đây đủ nhỏ để nạp trọn vào RAM một lần**. 9.813 ô gộp × 28 cột là ~275 nghìn con số;
 * 6.380 trạm; 25.220 POI. `queries.ts` phải truy vấn lại mỗi lần đổi trường vì lưới r8
 * của một tỉnh lớn tới 30 nghìn ô × 61 cột và range-request là cách duy nhất; ở đây một
 * truy vấn lúc boot rồi đổi trường **không chạm mạng nữa**.
 *
 * Vẫn đi qua DuckDB-WASM chứ không phải một bộ đọc parquet thứ hai: engine đã ở trong
 * bundle, và hai đường đọc cùng một định dạng là hai chỗ để lệch nhau.
 */

import { getRegisteredParquetNames, query, registerParquet } from "../data/duckdb";
import type { PoiShape } from "../data/poi";
import { PROVINCE_FIELDS } from "./fields";

/** Một bậc lưới đã xuất — `n12_national._grid_agg`. */
export interface GridMeta {
  file: string;
  /** tên cột khoá trong parquet: `h3_r6` / `h3_r7` */
  key: string;
  n_cells: number;
  cell_km2_median: number;
  bytes: number;
}

export interface NationalManifest {
  vintage: Record<string, unknown>;
  resolution: number;
  bbox: [number, number, number, number];
  /** khung nhìn mặc định — bbox chứa 99,5% DÂN, không lấy Trường Sa làm mép đông */
  view_bbox: [number, number, number, number];
  n_cells: number;
  n_stations: number;
  n_poi: number;
  n_provinces: number;
  cell_km2_median: number;
  available_columns: string[];
  /**
   * Các bậc lưới đã xuất, khoá là bậc H3 dạng chuỗi (`"6"`, `"7"`) — hợp đồng của LOD.
   *
   * **OPTIONAL**, và đó là một sự thật về dữ liệu: một bản build dựng trước `n12` VERSION 4
   * không có khối này, và màn hình phải chạy y như trước (chỉ r6). Khai nó bắt buộc là để
   * TS im lặng cho qua `m.grids["7"]` rồi nổ `undefined` ở trình duyệt.
   *
   * `cell_km2_median` ở đây là thứ chú giải in ra — KHÔNG gõ tay diện tích ô vào TS
   * (ràng buộc 4): đổi bậc là đổi đơn vị đọc, và câu chữ phải đi theo.
   */
  grids?: Record<string, GridMeta>;
  poi_groups: Record<string, { file: string; n: number; n_polygon: number; bytes: number }>;
  bytes_first_load: number;
  totals: Record<string, number>;
}

/** Một dòng của `vn/provinces.json` — mọi cột đo được của tỉnh, không có hình học. */
export interface ProvinceRow {
  province_code: string;
  province_name: string;
  in_store: boolean;
  quality_flags?: string | null;
  [column: string]: unknown;
}

export interface ProvinceFeature {
  type: "Feature";
  // Hình học thật là `Polygon | MultiPolygon`; khai đúng kiểu GeoJSON chứ không `unknown`,
  // vì `GeoJsonLayer` của deck.gl nhận `Feature[]` và một `unknown` ở đây sẽ buộc chỗ gọi
  // phải ép kiểu — tức đẩy một lời nói dối về kiểu ra khỏi chỗ duy nhất biết sự thật.
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: ProvinceRow;
}

export interface NationalCell {
  h3: string;
  province_code: string;
  lat: number;
  lng: number;
  [column: string]: unknown;
}

export interface NationalStation {
  station_code: string;
  lat: number;
  lng: number;
  name: string | null;
  station_type: string | null;
  current_type: string | null;
  op_status: string | null;
  n_ports: number | null;
  power_kw_site: number | null;
  province_code: string;
}

export interface NationalPoi {
  group: string;
  shape: PoiShape;
  tag: string | null;
  name: string | null;
  lat: number;
  lng: number;
  province_code: string;
}

const url = (name: string) => new URL(`data/${name}`, window.location.href).toString();

async function json<T>(name: string): Promise<T> {
  const r = await fetch(url(name));
  if (!r.ok) throw new Error(`Không nạp được ${name}: HTTP ${r.status} — đã chạy \`make vn\` chưa?`);
  return (await r.json()) as T;
}

let manifestCache: Promise<NationalManifest> | null = null;
let rowsCache: Promise<Record<string, ProvinceRow>> | null = null;
let shapesCache: Promise<ProvinceFeature[]> | null = null;
const cellsCache = new Map<string, Promise<NationalCell[]>>();
let stationsCache: Promise<NationalStation[]> | null = null;
let poiCache: Promise<NationalPoi[]> | null = null;

export const loadNationalManifest = () =>
  (manifestCache ??= json<NationalManifest>("vn/manifest.json"));
export function validateProvinceRows(rows: Record<string, ProvinceRow>): Record<string, ProvinceRow> {
  const required = new Set(PROVINCE_FIELDS.map((field) => field.column));
  for (const [code, row] of Object.entries(rows)) {
    const suffixed = Object.keys(row).find((key) => /_[xy]$/.test(key));
    if (suffixed) throw new Error(`Schema tỉnh ${code} còn cột merge ${suffixed}`);
    for (const column of required) {
      if (!(column in row)) throw new Error(`Schema tỉnh ${code} thiếu cột ${column}`);
    }
  }
  return rows;
}

export const loadProvinceRows = () =>
  (rowsCache ??= json<Record<string, ProvinceRow>>("vn/provinces.json").then(validateProvinceRows));

async function registerNationalParquet(name: string): Promise<string> {
  if (!name.startsWith("vn/")) throw new Error(`Tên parquet national sai namespace: ${name}`);
  const registeredName = await registerParquet(name);
  const invalid = getRegisteredParquetNames().filter((item) => !item.startsWith("vn/"));
  if (invalid.length) throw new Error(`National mode đã đăng ký file ngoài vn/*: ${invalid.join(", ")}`);
  if (getRegisteredParquetNames().length > 4) throw new Error("National mode vượt ngân sách 4 parquet");
  return registeredName;
}

/**
 * 34 đa giác tỉnh — dùng LẠI file mà bộ chọn tỉnh đã tải, không xuất bản thứ hai.
 *
 * `n11` đã ghi `provinces.geojson` với hình học đã đơn giản hoá 0,005° (~550 m). Thuộc tính
 * đầy đủ đến từ `vn/provinces.json` và ghép theo `province_code` — xem `_provinces_json`.
 */
export async function loadProvinceShapes(): Promise<ProvinceFeature[]> {
  shapesCache ??= json<{ features: ProvinceFeature[] }>("provinces.geojson").then((fc) => fc.features);
  return shapesCache;
}

/** Số Arrow về JS: `bigint` của cột int64 phải đổi, và `NaN` phải thành `null`. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  return null;
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/**
 * Nạp một bậc lưới. `grid` đến từ `manifest.grids` — tên file và tên cột khoá KHÔNG được
 * dựng bằng chuỗi ở đây, vì thế thì TS và Python cùng phải nhớ một quy ước đặt tên.
 *
 * Trả về `NationalCell` với khoá đã đổi tên thành `h3` ở cả hai bậc: tầng vẽ không cần
 * biết nó đang vẽ r6 hay r7, `H3HexagonLayer` nhận một mã H3 và tự suy ra bậc từ chính mã.
 */
export async function loadCells(columns: string[], grid: GridMeta): Promise<NationalCell[]> {
  const key = `${grid.file}:${columns.join(",")}`;
  let cached = cellsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const f = await registerNationalParquet(`vn/${grid.file}`);
      const cols = [grid.key, "province_code", "lat", "lng", ...columns]
        .map((c) => `"${c}"`)
        .join(", ");
      const t = await query(`SELECT ${cols} FROM "${f}"`);
      return t.toArray().map((r) => {
        const o = r.toJSON() as Record<string, unknown>;
        const cell: NationalCell = {
          h3: String(o[grid.key]),
          province_code: String(o.province_code),
          lat: num(o.lat) ?? 0,
          lng: num(o.lng) ?? 0,
        };
        for (const c of columns) cell[c] = num(o[c]);
        return cell;
      });
    })();
    cellsCache.set(key, cached);
  }
  return cached;
}

export async function loadStations(): Promise<NationalStation[]> {
  if (stationsCache) return stationsCache;
  stationsCache = (async () => {
  const f = await registerNationalParquet("vn/stations.parquet");
  const t = await query(`SELECT * FROM "${f}"`);
  return t.toArray().map((r) => {
    const o = r.toJSON() as Record<string, unknown>;
    return {
      station_code: String(o.station_code),
      lat: num(o.lat) ?? 0,
      lng: num(o.lng) ?? 0,
      name: str(o.name),
      station_type: str(o.station_type),
      current_type: str(o.current_type),
      op_status: str(o.op_status),
      n_ports: num(o.n_ports),
      power_kw_site: num(o.power_kw_site),
      province_code: String(o.province_code),
    };
  });
  })();
  return stationsCache;
}

/**
 * POI toàn quốc — 25.220 điểm, đọc bảng CHẤM chứ không đọc bốn file GeoJSON.
 *
 * Bốn file `vn/poi/<nhóm>.geojson` (13,8 MB) mang cả đa giác và là bản bàn giao dữ liệu.
 * Ở mức phóng của cả nước một đa giác 4 ha vẽ ra đúng bằng một chấm, nên bản đồ này đọc
 * `poi.parquet` (0,78 MB, chỉ toạ độ + thuộc tính). Cùng một tập đối tượng, cùng số đếm —
 * khác ở chỗ file nào trả lời được câu hỏi nào.
 */
export async function loadPoi(shapeOf: (group: string) => PoiShape): Promise<NationalPoi[]> {
  if (poiCache) return poiCache;
  poiCache = (async () => {
  const f = await registerNationalParquet("vn/poi.parquet");
  const t = await query(`SELECT "group", tag, name, lat, lng, province_code FROM "${f}"`);
  return t.toArray().map((r) => {
    const o = r.toJSON() as Record<string, unknown>;
    const group = String(o.group);
    return {
      group,
      shape: shapeOf(group),
      tag: str(o.tag),
      name: str(o.name),
      lat: num(o.lat) ?? 0,
      lng: num(o.lng) ?? 0,
      province_code: String(o.province_code),
    };
  });
  })();
  return poiCache;
}
