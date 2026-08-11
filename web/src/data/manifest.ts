import { dataPath } from "./province";

/**
 * `manifest.json` — mọi CON SỐ về phủ và về nguồn đến từ đây, không từ TS.
 *
 * Ràng buộc 4 (DESIGN.md §7c, §10): bảng phủ tính tại thời điểm export. TS chỉ giữ câu
 * chữ. Nếu bạn thấy mình sắp gõ một con số phần trăm vào `fields.ts`, dừng lại — nó
 * thuộc về `web_export.py`.
 */

export interface Coverage {
  n_present: number;
  cell_share: number;
  /**
   * Phần DÂN nằm trong các ô có giá trị.
   *
   * **OPTIONAL**, và đó là một sự thật về dữ liệu chứ không phải một chỗ phòng hờ: store
   * toàn quốc chưa có lớp dân số, nên `n06_web_export._coverage` cố ý **không phát** khoá
   * này — thà thiếu tường minh còn hơn phát một `pop_share` tính bằng trọng số đều rồi để
   * người đọc tưởng đó là dân số thật. Chỗ nào đọc nó phải nói "chưa có lớp dân số", không
   * được vẽ một meter rỗng (meter rỗng đọc thành **0%**).
   */
  pop_share?: number;
  /** chỉ có ở apartment_levels_sum — cột không null nhưng lệch 0 nặng */
  nonzero_cells?: number;
  share_of_cells_with_apartments?: number;
  /** chỉ có ở util_cell — mẫu số toàn lưới đọc nhầm thành "đo kém"; mẫu số đúng là số ô CÓ TRẠM */
  cells_with_station?: number;
  share_measured_among_cells_with_station?: number;
}

export interface CategoryCounts {
  values: Record<string, number>;
  n_null: number;
}

/**
 * Một lát cắt của tổng cung — M4.2, khối `totals` của manifest (§3f-1).
 *
 * `n_ports_missing`/`power_missing` KHÔNG phải trang trí: một phép cộng trên cột có null là
 * một **chặn dưới**, và KPI row phải in được điều đó. In tổng mà im lặng về mẫu số là đúng
 * loại nói dối mà ràng buộc 1 cấm trên bản đồ, chỉ khác là bằng chữ.
 */
export interface TotalsCut {
  n_stations: number;
  n_ports: number;
  n_ports_missing: number;
  power_mw: number;
  power_missing: number;
}

/** Khối chỉ có ở manifest của một TỈNH (store toàn quốc). Vắng = bộ Hà Nội gốc. */
export interface ProvinceBlock {
  province_code: string;
  province_name: string;
  n_communes: number;
  n_dac_khu: number;
  /** [lngMin, latMin, lngMax, latMax] — khung nhìn ban đầu suy từ đây, không hardcode. */
  bbox: [number, number, number, number];
  center: [number, number];
}

export type ManifestFile = { bytes: number; rows: number | null };
export type ManifestFiles = Record<string, ManifestFile> | string[];

/** Manifest cũ của bộ Hà Nội phát danh sách tên file; manifest tỉnh mới phát bảng metadata. */
export function hasManifestFile(files: ManifestFiles | undefined, name: string): boolean {
  if (!files) return false;
  return Array.isArray(files) ? files.includes(name) : name in files;
}

export function manifestFile(files: ManifestFiles | undefined, name: string): ManifestFile | null {
  if (!files || Array.isArray(files)) return null;
  return files[name] ?? null;
}

export interface Manifest {
  exported_utc: string;
  n_cells: number;
  // Runtime also accepts the legacy string[] emitted by the Hà Nội bundle.
  files: Record<string, ManifestFile>;
  coverage: Record<string, Coverage>;
  categories: Record<string, CategoryCounts>;
  /**
   * Tổng cung — KPI row của chế độ DỮ LIỆU (§3f-1), phát ở M4.2.
   *
   * Khối RIÊNG chứ không nằm trong `source_metrics`: khối kia đo *chất lượng nguồn*, khối
   * này đo *tổng cung*. Optional vì manifest của tỉnh (store toàn quốc) có thể chưa có nó —
   * và khi vắng thì KPI row không hiện, chứ không đoán một con số.
   */
  totals?: {
    all: TotalsCut;
    /**
     * Lát cắt "thuộc phạm vi đang xem" — Hà Nội ở bộ gốc, tỉnh ở store toàn quốc.
     *
     * Tên là `in_scope` chứ không phải `hanoi`, và đó là điều kiện để khối này đọc được ở
     * cả hai bộ: một khoá tên `hanoi` trong manifest của Cao Bằng hoặc phải bỏ trống (KPI
     * mất) hoặc phải mang số của Cao Bằng (tên nói dối). Cả hai đều tệ hơn việc đổi tên.
     */
    in_scope: TotalsCut;
    buffer: TotalsCut;
    /** `OPERATIONAL` · `MAINTENANCE` · `OUT_OF_SERVICE` · `UNKNOWN` — cùng nguồn với §4d-3a. */
    op_status: Record<string, number>;
    connectors: {
      by_standard: Record<string, { n_rows: number; n_guns: number }>;
      n_guns: number;
      n_stations_with_connectors: number;
    };
    /**
     * Chất lượng đo ở TẦNG TRẠM — bản TRUNG TÍNH của `source_metrics.occ_status_ok`.
     *
     * Có mặt ở cả hai bộ. Khối cũ vẫn còn trong manifest Hà Nội và không bị đụng, nhưng
     * UI đọc khối này: một khái niệm phải có **một** hình dạng, nếu không thì mỗi bộ dữ
     * liệu là một từ vựng và mọi chỗ đọc phải biết mình đang ở bộ nào.
     */
    occ_status_ok?: { n_total: number; n_ok: number; share: number };
    /**
     * Điểm sạc cá nhân đã loại — bản TRUNG TÍNH của `source_metrics.private_ac_dropped`.
     * Tên trường bỏ chữ `hanoi` (`share_of_hanoi_stations_before` → `share_stations`).
     */
    private_ac_dropped?: {
      n: number;
      share_stations: number;
      share_ports: number;
      share_power: number;
    };
  };
  /**
   * Số đo về **nguồn thượng nguồn** — badge ⚠ nguồn (§7).
   *
   * **OPTIONAL, và đó là một sửa lỗi có ảnh render làm bằng chứng.** Manifest của một tỉnh
   * (store toàn quốc) **không có khối này**; khai nó là bắt buộc thì TS im lặng cho qua mọi
   * `m.source_metrics.x`, và ở tỉnh chúng nổ thành `TypeError: Cannot read properties of
   * undefined` ⇒ **màn hình trắng**. Đã bắt được đúng như thế ở `#tinh=04&d=1`.
   *
   * Optional ở đây không phải để "cho an toàn" — nó là để **trình biên dịch chỉ ra cả 6 chỗ
   * đọc**, và mỗi chỗ phải tự quyết định câu trả lời khi khối vắng. Câu trả lời đúng ở cả 6
   * chỗ là *không hiện gì*, không phải *đoán một con số* — cùng luật ràng buộc 4 (§7c).
   */
  source_metrics?: {
    poi_empty_1km?: { n_cells: number; n_cells_zero: number; share_cells: number; share_pop: number };
  apartment_levels_tagged?: { n_total: number; n_tagged: number; share: number };
    /** chất lượng đo ở TẦNG TRẠM — khác mẫu số với phủ tầng ô (§7b) */
    occ_status_ok?: { n_total: number; n_ok: number; share: number };
    /** điểm sạc cá nhân bị loại khỏi bộ dữ liệu — DECISIONS §3a */
    private_ac_dropped?: {
      predicate: string;
      n_dropped_total: number;
      n_dropped_hanoi: number;
      n_dropped_buffer: number;
      share_of_hanoi_stations_before: number;
      share_of_hanoi_ports_before: number;
      share_of_hanoi_power_before: number;
    };
    /**
     * Trạm biến áp OSM — M5, §7c đã liệt kê khoá này từ M1 và M5 mới phát nó thật.
     *
     * Đây là số đo về NGUỒN, và nó thuộc loại "chặn dưới": OSM phủ hạ tầng điện rất thưa,
     * nên `n` nói *ít nhất bấy nhiêu*, không nói *bấy nhiêu*. Tab LAYER phải in ra điều đó
     * TRƯỚC KHI người xem bấm — cùng khuôn `apartment_levels_sum` ở §7.
     */
    osm_substations?: {
      n: number;
      n_mapped_as_area: number;
      n_mapped_as_node: number;
      n_named: number;
      tag: string;
      aoi: string;
    };
  };
  /**
   * Lớp POI VISUAL 4 nhóm — M3.5. Tab LAYER in tỉ lệ có-polygon từng nhóm từ đây
   * (ràng buộc 4 — tính lúc export, không hardcode trong TS).
   */
  poi?: {
    groups: Record<string, { n: number; n_polygon: number; share_polygon: number }>;
  };
  /** Số đo của bước export mạng đường — M3-R. Mọi con số của cảnh C lấy từ đây, không gõ tay. */
  roads?: {
    ways_total_raw: number;
    ways_shipped: number;
    ways_dropped_service: number;
    /** Đường OSM tồn tại nhưng public vehicle không được vào; không thuộc surface Access. */
    ways_dropped_access_blocked?: number;
    ways_unreachable_null_dist: number;
    points_before_simplify: number;
    points_after_simplify: number;
    simplify_tolerance_deg: number;
    bridge_ways_shipped: number;
    showcase_rule: string;
    showcase_cells: string[];
  };
  /** Có mặt ⇒ đang xem một tỉnh của store toàn quốc. */
  province?: ProvinceBlock;
  /**
   * Cột THẬT SỰ có trong `grid_h3_r8.parquet` của tỉnh này.
   *
   * Đây là thứ chặn màn hình trắng: bộ toàn quốc chưa có lớp TÍNH TOÁN, nên một `SELECT`
   * cột không tồn tại sẽ làm DuckDB ném lỗi. Rail lọc trường theo danh sách này.
   */
  available_columns?: string[];
  /** Thuộc tính có mặt trong `commune.geojson` — trường của XÃ đọc từ đó, không từ lưới. */
  available_commune_columns?: string[];
  /** Cột của `roads.parquet` / `stations.parquet` — chỉ store toàn quốc khai. */
  available_road_columns?: string[];
  available_station_columns?: string[];
  /** Cột vắng và VÌ SAO — "chưa tính" khác "dữ liệu hỏng", và người đọc phải phân biệt được. */
  missing_layers?: { reason: string; columns: string[] };
  /** Chế độ CÂU CHUYỆN chỉ mở ở tỉnh mà cảnh được viết cho (hiện tại: Hà Nội). */
  story_enabled?: boolean;
  /**
   * Lớp có cột nhưng KHÔNG đọc được — khác `missing_layers` (cột không tồn tại).
   *
   * Cột vắng làm truy vấn nổ; lớp không đọc được thì truy vấn chạy và trả gần như toàn null,
   * rồi bản đồ gần trống bị đọc thành "giá trị thấp". Dạng hỏng thứ hai im lặng hơn.
   */
  unusable_layers?: { layer: string; reason: string; measured: string }[];
  snapshots: {
    occupancy_snapshot_id: string;
    occupancy_window: [string, string];
    vnsdi_valid_from: string;
    osm_pbf: string;
    stations_canonical: string;
  };
}

let cache: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  cache ??= fetch(new URL(`data/${dataPath("manifest.json")}`, window.location.href))
    .then((r) => {
      if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status} — chạy \`make web-data\` chưa?`);
      return r.json() as Promise<Manifest>;
    });
  return cache;
}

/**
 * Phần trăm cho badge và legend.
 *
 * Một chữ số thập phân ở **hai đuôi** — trên 90% và dưới 10% thì phần lẻ chính là thông
 * tin (98,8% ≠ 99%; 1,1% ≠ 1%). Ở giữa thì 29,8% làm tròn thành 30% không mất gì.
 */
export function pct(share: number): string {
  return share.toLocaleString("vi-VN", {
    style: "percent",
    maximumFractionDigits: share > 0.9 || share < 0.1 ? 1 : 0,
  });
}
