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
  /** chỉ có ở util_cell — mẫu số toàn lưới đọc nhầm thành "đo kém"; mẫu số đúng là số ô CÓ TRẠM */
  cells_with_station?: number;
  share_measured_among_cells_with_station?: number;
}

/** Trạng thái ô trống — bốn cái, và chỉ NOT_APPLICABLE rời mẫu số. §0.2. */
export type NullStateName = "MISSING" | "NOT_APPLICABLE" | "NOT_MEASURED" | "FILTERED";

export interface NullStateBucket {
  n: number;
  /** Trạng thái thật. Khoá của xô có thể mang hậu tố (`MISSING@residual`) — đọc trường này. */
  state: NullStateName;
  /** Vị từ, hoặc lời tuyên bố mức bảng. In nguyên văn cạnh số đếm. */
  rule: string;
  /**
   * Trạng thái được gán BẰNG GÌ — điều kiện để §1.1 Rule 0 kiểm được.
   * `"residual"` nghĩa là KHÔNG luật nào giải thích được: một khuyết tật (§9), không phải
   * một ô trống lành tính. UI phải vẽ nó khác hẳn hai loại kia.
   */
  basis: "row_predicate" | "table_invariant" | "residual";
  /** Bắt buộc khi `basis === "table_invariant"`: khoá manifest đối chiếu được. */
  verified_by?: string;
  threshold?: { name: string; value: number | string; source: string };
}

export interface ColumnNullStateInfo {
  n_rows: number;
  n_present: number;
  /**
   * Mẫu số THÔ — `n_present / n_rows`. Đi CÙNG `share_of_applicable`, không bị nó thay thế:
   * `util_cell` đọc 9,93 % ở đây và 97,33 % ở kia, và đúng một trong hai đáng báo động.
   * AC-4 buộc cả hai có mặt trên màn hình.
   */
  share_rows: number;
  states: Record<string, NullStateBucket>;
  /** `n_rows − Σ NOT_APPLICABLE`. Phần của bảng mà câu hỏi CÓ nghĩa. */
  n_applicable: number;
  share_of_applicable: number;
  pop_share?: number;
}

export type NullStates = Record<string, Record<string, ColumnNullStateInfo>>;

/**
 * Khoá đã KHAI nhưng phép đo chưa từng chạy (§9-8). Khác hẳn "bằng 0" và khác hẳn ô trống:
 * một dấu gạch đứng cạnh các số đã đo đọc thành "không đáng kể".
 */
export type NotMeasured = Record<
  string,
  { reason: string; consequence: string; upstream_ask: string }
>;

export interface InvalidValueInfo {
  n: number;
  share_rows?: number;
  share_pop?: number;
  rule: string;
  disposition: string;
}

export type InvalidValues = Record<string, InvalidValueInfo>;
export type DegenerateColumns = Record<string, number | string>;

export interface FilterInfo {
  /**
   * `"removal"` — luật của TA gỡ dòng đi, và `before − removed = after` đóng kín.
   * `"two_sets"` — hai phép TRÍCH khác nhau, giao nhau một phần. Không tập nào là mẫu số của
   * tập kia, nên `removed` là `null`: ép nó thành một hiệu cho ra số ÂM ở những tỉnh mà tập
   * nhu cầu lớn hơn tập trực quan (Cao Bằng: 123 vs 84), và một phương trình vẫn "đóng kín"
   * trong khi con số nó khẳng định thì vô nghĩa.
   */
  kind: "removal" | "two_sets";
  name: string;
  rule_const: string;
  source_file: string;
  before: number;
  removed: number | null;
  after: number;
  denominator: string;
  share_removed_stations?: number;
  share_removed_ports?: number;
  share_removed_power?: number;
  /** Chỉ có ở `two_sets`: bốn con số thật thay cho một hiệu bịa ra. */
  n_visual?: number;
  n_demand?: number;
  n_both?: number;
  n_visual_only?: number;
  n_demand_only?: number;
}

export type Filters = Record<string, FilterInfo>;

export interface ExclusionsInfo {
  thresholds?: Record<string, number>;
  excluded: boolean;
  exclusion_reasons?: string[];
  exclusion_flags?: string[];
  poi_not_interpretable: boolean;
  poi_details?: Record<string, unknown>;
}

export interface FreshnessInfo {
  exported_utc: string;
  inputs: {
    osm_pbf: string;
    stations_canonical: string;
    vnsdi_valid_from: string;
    occupancy_window: [string, string] | null;
  };
  row_level: {
    column: string;
    unit: string | null;
    note: string;
    p50: number | null;
    p90: number | null;
    max: number | null;
    n_present: number;
    n_rows: number;
  };
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
  vintage?: {
    name: string;
    source: string;
    valid_from: string;
    published: string;
    levels: string[];
    n_provinces: number;
    n_communes: number;
    province_key: string;
    commune_key: string;
    rejected?: Record<string, string>;
  };
  n_cells: number;
  // Runtime also accepts the legacy string[] emitted by the Hà Nội bundle.
  files: Record<string, ManifestFile>;
  coverage: Record<string, Coverage>;
  null_states?: NullStates;
  not_measured?: NotMeasured;
  invalid_values?: InvalidValues;
  degenerate_columns?: DegenerateColumns;
  filters?: Filters;
  exclusions?: ExclusionsInfo;
  freshness?: FreshnessInfo;
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
     * "Chưa đo được" tách theo LÝ DO — `OK` / `THIEU_COVERAGE` / `THIEU_PEER` (§2.5).
     * Từ vựng KHÔNG được cứng hoá ở TS: nó là `value_counts` của cột, và tỉnh khác có thể
     * mang giá trị khác (AC-20).
     */
    occ_status_counts?: Record<string, number>;
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
  /**
   * Số đo tổng hợp cấp TỈNH — `n10_quality`. Optional vì bộ Hà Nội gốc không phát khối này.
   *
   * Chỉ khai những khoá thật sự có chỗ đọc. Khai cả bảng "cho đủ" là mời người viết sau
   * đọc một khoá chưa ai kiểm là có tồn tại — cùng cái bẫy đã làm trắng màn hình ở
   * `source_metrics`.
   */
  quality?: {
    util_median?: number;
    share_stations_measured?: number;
    n_stations_with_occ?: number;
    pop_beyond_2km_network?: number;
    share_pop_beyond_2km?: number;
    dist_station_network_median_m?: number;
    detour_ratio_median?: number;
    poi_bias_phuong_vs_xa?: number;
    private_ac_share_stations?: number;
    private_ac_share_power?: number;
    n_private_ac_dropped?: number;
  };
  snapshots: {
    occupancy_snapshot_id: string;
    occupancy_window: [string, string];
    vnsdi_valid_from: string;
    osm_pbf: string;
    stations_canonical: string;
    /**
     * Múi giờ của trục `dow`/`hour` trong hồ sơ 168 giờ — **CHƯA PHÁT** (§10 U1).
     *
     * Vắng khoá này thì cảnh `nhip-tuan` nói được HÌNH DẠNG ("giờ bận nhất gấp 3,3 lần giờ
     * vắng nhất") nhưng KHÔNG được nói NHÃN ĐỒNG HỒ ("23:00"): dưới cách đọc giờ địa
     * phương đường cong hợp lý, dưới UTC thì đỉnh rơi vào 06:00 sáng. Hai câu chuyện khác
     * hẳn nhau, và không có gì trong kho nói được cái nào đúng.
     */
    occupancy_hour_tz?: string;
  };
  /**
   * Phản thực của luật loại điểm sạc cá nhân — **CHƯA PHÁT** (§10 U2).
   *
   * Con số này tồn tại trong `data/qa/critique/a14.json`, thứ KHÔNG ship ra web, và bản
   * "sau" của file đó đã lệch khỏi lưới đang ship. Chép nó vào UI bị từ chối dứt khoát:
   * chính chỗ lệch ấy là lý do luật cần được nói ra.
   */
  counterfactual?: {
    ac_filter?: {
      dist_median_before_m: number;
      dist_median_after_m: number;
      pop_moved_beyond_2km: number;
    };
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
