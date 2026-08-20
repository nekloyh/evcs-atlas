/**
 * Hợp đồng Ô TRỐNG và hợp đồng GIÁ TRỊ ĐÁNG NGỜ — Phase 8 §1.2 & §1.3.
 *
 * Luật khung của cả pha, và của cả file này:
 *
 *   > Một ô trống chưa phải khuyết tật cho tới khi ta nói nó là LOẠI ô trống nào.
 *
 * Mọi ô trống trong gói đã ship rơi vào đúng một trong bốn trạng thái, **bằng một luật đọc
 * một cột đã ship** — không bằng một câu tiếng Việt ai đó gõ vào cạnh trường:
 *
 *   NOT_APPLICABLE  câu hỏi không có nghĩa với hàng này  → **TRỪ khỏi mẫu số**, không ⚠
 *   FILTERED        luật của CHÍNH TA gỡ giá trị đi      → ở lại mẫu số, luật được nêu tên
 *   NOT_MEASURED    đã nhìn, không thấy gì               → ở lại mẫu số, ⚠ khác chữ
 *   MISSING         lẽ ra phải có, nguồn không cấp       → ở lại mẫu số, ⚠
 *
 * INVALID không nằm trong bốn cái trên: nó là một giá trị CÓ MẶT đã trượt một phép kiểm
 * (§1.3). Đi tìm dữ liệu hỏng trong đám ô trống thì sẽ không thấy gì và kết luận gói này
 * sạch sẽ.
 *
 * ── Vì sao mỗi luật mang `basis` ────────────────────────────────────────────────────
 *
 * §1.1 Rule 0: *một trạng thái chỉ được gán bởi một luật ĐỌC DỮ LIỆU ĐÃ SHIP.* Đó là thứ
 * làm bảng này kiểm được, và là thứ ngăn phân loại trở thành một cách bào chữa cho mọi
 * khoảng trống. `basis` nói ra luật này thuộc loại nào:
 *
 *   "row_predicate"   — một cột trong CÙNG HÀNG nói ra điều đó. Kiểm lại được từng hàng.
 *   "table_invariant" — bảng đã ship KHÔNG có cột bạn đồng hành nào (`roads` chỉ có 5 cột;
 *                       `commune.quality_flag` trống nghĩa là "không cờ nào nổ" và không
 *                       cột nào chở điều đó). Trạng thái là một tuyên bố ở mức BẢNG và nó
 *                       phải mang `verifiedBy` trỏ tới một khoá manifest đối chiếu được.
 *                       UI vẽ ba trường hợp này khác đi thay vì để chúng giả trang thành
 *                       một vị từ theo hàng.
 *
 * Ba `table_invariant` va với §1.1 bước 4 (mặc định là MISSING) nhưng được §0.3 thẩm định
 * là NOT APPLICABLE, và AC-6 buộc `commune.quality_flag` KHÔNG mang cảnh báo. Xung đột nằm
 * trong chính bản đặc tả; ở đây chọn theo §0.3 + AC-6 và bắt luật tự khai mình là tuyên bố
 * mức bảng. Đã báo cáo ở QA 8-QA-022.
 *
 * ── Vì sao có `companions` ───────────────────────────────────────────────────────────
 *
 * `resolveRowNullState` đọc cột bạn đồng hành TỪ HÀNG ĐƯỢC TRUYỀN VÀO. Bảng phẳng ở chế độ
 * DỮ LIỆU chỉ chiếu những cột đang hiện, nên giấu `n_stations` đi là mọi ô trống `util_cell`
 * đọc thành "ô không có trạm" — một trạng thái suy ra từ dữ liệu VẮNG MẶT, đúng cái Rule 0
 * cấm. `companions` liệt kê cột mà luật cần; `datamode.ts` luôn chiếu thêm chúng, và hàm
 * dưới đây TỪ CHỐI phân giải khi thiếu thay vì đoán.
 */

export type NullState = "MISSING" | "NOT_APPLICABLE" | "NOT_MEASURED" | "FILTERED";

/** Luật được gán bằng gì — điều kiện để §1.1 Rule 0 kiểm được. */
export type NullBasis = "row_predicate" | "table_invariant";

export interface NullRule {
  state: NullState;
  /** Câu tiếng Việt cho người đọc. Không phần trăm — §7c. */
  label: string;
  /** Vì sao câu hỏi không áp dụng / cái gì đã gỡ giá trị đi. */
  explain: string;
  /**
   * Vị từ SQL trên CÙNG MỘT HÀNG, khớp từng chữ với `_NULL_RULES` ở
   * `src/vn/n11_web_export.py`. `test/null-states.test.ts` đối chiếu hai bên theo cột và
   * kiểm mọi cột được nhắc tới đều có thật trong schema đã ship.
   */
  when: string;
  basis: NullBasis;
  /** Bắt buộc khi `basis === "table_invariant"`: khoá manifest đối chiếu được. */
  verifiedBy?: string;
  /** Ngưỡng có tên, khi `when` nhúng một con số. In cạnh số đếm. */
  rule?: { name: string; value: number | string; source: string };
  /** Vị từ trên hàng đã nạp. `null` ⇔ `basis === "table_invariant"` (khớp mọi ô trống). */
  test: ((row: Record<string, unknown>) => boolean) | null;
}

export type TableId =
  | "grid"
  | "stations"
  | "station_occupancy"
  | "roads"
  | "commune"
  | "poi"
  | "provinces";

export interface NullContract {
  table: TableId;
  column: string;
  /**
   * Có THỨ TỰ, khớp đầu tiên thắng — và thứ tự LÀ thủ tục §1.1: NOT_APPLICABLE trước, rồi
   * FILTERED, rồi NOT_MEASURED. Đảo thứ tự là đổi mẫu số, vì chỉ NOT_APPLICABLE bị trừ ra.
   * Không luật nào khớp ⇒ MISSING dư, và ô trống ấy là một KHUYẾT TẬT (§9), không phải một
   * ô trống đã giải thích được.
   */
  rules: readonly NullRule[];
  /** Cột mà `rules` cần đọc. Bảng phẳng phải chiếu thêm chúng — xem docstring đầu file. */
  companions: readonly string[];
}

export interface ValidityContract {
  table: TableId;
  /** Cột mà GIÁ TRỊ của nó đáng ngờ. */
  column: string;
  /** Vị từ SQL trên cùng hàng, đánh dấu một giá trị CÓ MẶT là không hợp lệ / đặc biệt. */
  invalidWhen: string;
  label: string;
  explain: string;
  /** Gói này SHIP những giá trị ấy — nó không im lặng bỏ chúng đi. */
  disposition: "shipped-with-label";
  /**
   * `false` cho `ZERO_NO_WEIGHT` (§1.4): không ai bảo nó SAI, nhưng nó là một giá trị có mặt
   * MÃ HOÁ một ô trống. Nó không được đếm là INVALID, và cũng không được biến mất.
   */
  isInvalid: boolean;
}

// ── Góc vân theo trạng thái — §6.4 ────────────────────────────────────────────────────
//
// DESIGN.md §7a đã gán 45° = "không biết", 90° = "không áp dụng". Mở rộng thành một góc cho
// mỗi trạng thái. Bốn góc cách nhau 45° là khoảng cách lớn nhất chia được cho bốn hướng, tức
// là ngưỡng phân biệt được ở nét 1 px — `test/null-states.test.ts` chốt cả bốn.
// INVALID KHÔNG có vân: nó là một giá trị có mặt và nhận một CHẤM trên giá trị.
export const NULL_STATE_HATCH_DEG: Record<NullState, 0 | 45 | 90 | 135> = {
  FILTERED: 0,
  MISSING: 45,
  NOT_APPLICABLE: 90,
  NOT_MEASURED: 135,
};

/** Trạng thái nào đeo ⚠. NOT_APPLICABLE và FILTERED thì KHÔNG — cả hai đều là "biết là không". */
export const NULL_STATE_WARNS: Record<NullState, boolean> = {
  MISSING: true,
  NOT_MEASURED: true,
  NOT_APPLICABLE: false,
  FILTERED: false,
};

/** Trạng thái nào bị TRỪ khỏi mẫu số phủ (§0.2). Chỉ một. */
export const NULL_STATE_LEAVES_DENOMINATOR: Record<NullState, boolean> = {
  NOT_APPLICABLE: true,
  MISSING: false,
  NOT_MEASURED: false,
  FILTERED: false,
};

export const NULL_STATE_LABEL: Record<NullState, string> = {
  NOT_APPLICABLE: "không áp dụng",
  FILTERED: "đã lọc theo luật",
  NOT_MEASURED: "chưa đo được",
  MISSING: "thiếu nguồn",
};

// ── Vị từ dùng chung ──────────────────────────────────────────────────────────────────

const UNREACHABLE_GRADES = ["UNREACHABLE_NO_PATH", "UNREACHABLE_NO_ROAD_ACCESS"];
const UNREACHABLE_SQL = `evidence_grade_distance IN ('UNREACHABLE_NO_PATH', 'UNREACHABLE_NO_ROAD_ACCESS')`;

const isUnreachable = (r: Record<string, unknown>) =>
  UNREACHABLE_GRADES.includes(String(r["evidence_grade_distance"] ?? ""));

/** Hằng của `src/evcs/core/roadgraph.py`. Dưới mức này tỉ số đi vòng là nhiễu, không phải số đo. */
export const DETOUR_MIN_EUCLID_M = 200;

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

// ── Nhà máy luật ──────────────────────────────────────────────────────────────────────

function rowRule(
  state: NullState,
  label: string,
  explain: string,
  when: string,
  test: (row: Record<string, unknown>) => boolean,
  extra: Partial<NullRule> = {},
): NullRule {
  return { state, label, explain, when, basis: "row_predicate", test, ...extra };
}

function tableRule(
  state: NullState,
  label: string,
  explain: string,
  when: string,
  verifiedBy: string,
): NullRule {
  return { state, label, explain, when, basis: "table_invariant", verifiedBy, test: null };
}

const unreachableRule = () =>
  rowRule(
    "NOT_APPLICABLE",
    "không thể tiếp cận qua đường bộ",
    "OpenStreetMap không vẽ đường nào tới được ô này, nên khoảng cách dẫn đường không tồn tại — khác hẳn với chưa tính được.",
    UNREACHABLE_SQL,
    isUnreachable,
  );

const bufferRule = (what: string) =>
  rowRule(
    "NOT_APPLICABLE",
    "vành đệm ngoài tỉnh",
    `Trạm nằm trong vành đệm 5 km NGOÀI ranh giới tỉnh, nên nó không thuộc ${what} nào của tỉnh này.`,
    "scope = 'BUFFER'",
    (r) => r["scope"] === "BUFFER",
  );

const unknownPortConfigRule = (what: string) =>
  rowRule(
    "MISSING",
    `nguồn không khai ${what}`,
    `Nguồn không khai báo cấu hình cổng cho trạm này, nên ${what} không có giá trị nào để chở.`,
    "port_config_source = 'UNKNOWN'",
    (r) => r["port_config_source"] === "UNKNOWN",
  );

const notReportableRule = (what: string) =>
  rowRule(
    "NOT_MEASURED",
    "không đủ điều kiện báo cáo",
    `Đã nhìn nhưng không thấy đủ: trạm thiếu độ phủ quan sát hoặc thiếu nhóm đối chuẩn (THIEU_COVERAGE / THIEU_PEER), nên ${what} không được công bố.`,
    "util_reportable = false",
    (r) => r["util_reportable"] === false,
  );

const neverActiveRule = (what: string) =>
  rowRule(
    "NOT_APPLICABLE",
    "không hoạt động trong kỳ",
    `Trạm không phát sinh phiên sạc nào trong suốt kỳ quan sát 30 ngày, nên ${what} không xác định.`,
    "ever_active = false",
    (r) => r["ever_active"] === false,
  );

const pctlRules = (what: string): NullRule[] => [
  rowRule(
    "NOT_APPLICABLE",
    "không có mức sử dụng để xếp hạng",
    "Trạm không có giá trị mức sử dụng, nên không có gì để đặt vào một thang phân vị.",
    "util IS NULL",
    (r) => r["util"] === null || r["util"] === undefined,
  ),
  rowRule(
    "FILTERED",
    "loại khỏi xếp hạng do thiếu quan sát",
    `Giá trị CÓ TỒN TẠI; chính luật của ta gỡ trạm khỏi ${what} vì độ phủ quan sát telemetry không đủ để so sánh công bằng.`,
    "occ_status = 'THIEU_COVERAGE'",
    (r) => r["occ_status"] === "THIEU_COVERAGE",
  ),
];

// ── 27 hợp đồng, 7 bảng (§0.3) ────────────────────────────────────────────────────────

export const NULL_CONTRACTS: readonly NullContract[] = [
  // 1. grid — 4 cột nullable trên 61
  {
    table: "grid",
    column: "dist_station_network_m",
    companions: ["evidence_grade_distance"],
    rules: [unreachableRule()],
  },
  {
    table: "grid",
    column: "dist_station_asym_m",
    companions: ["evidence_grade_distance"],
    rules: [unreachableRule()],
  },
  {
    table: "grid",
    column: "detour_ratio",
    companions: ["evidence_grade_distance", "dist_station_euclid_m"],
    // NOT_APPLICABLE đứng TRƯỚC FILTERED — thủ tục §1.1, không phải sở thích. Ở dữ liệu hôm
    // nay hai thứ tự cho cùng con số (0 ô vừa không tới được vừa có chim bay < 200 m, đo trên
    // cả 34 tỉnh), nên đây là sửa cho đúng luật trước khi nó thành một con số sai.
    rules: [
      unreachableRule(),
      rowRule(
        "FILTERED",
        `chim bay dưới ${DETOUR_MIN_EUCLID_M} m`,
        "Khoảng cách chim bay quá ngắn để tỉ số đi vòng có nghĩa; luật của ta triệt tiêu nó thay vì công bố nhiễu.",
        `dist_station_euclid_m < ${DETOUR_MIN_EUCLID_M}`,
        (r) => {
          const e = num(r["dist_station_euclid_m"]);
          // `null` KHÔNG khớp. `?? 0` ở bản trước biến một ô trống thành 0 và 0 < 200, tức
          // mọi ô thiếu chim bay đều bị dán nhãn ĐÃ LỌC.
          return e !== null && e < DETOUR_MIN_EUCLID_M;
        },
        {
          rule: {
            name: "DETOUR_MIN_EUCLID_M",
            value: DETOUR_MIN_EUCLID_M,
            source: "src/evcs/core/roadgraph.py",
          },
        },
      ),
    ],
  },
  {
    table: "grid",
    column: "util_cell",
    companions: ["n_stations", "n_stations_measured"],
    rules: [
      rowRule(
        "NOT_APPLICABLE",
        "ô không có trạm sạc",
        "Không trạm nào nằm trong ô, nên mức sử dụng của ô không phải một câu hỏi có nghĩa — đây KHÔNG phải bận bằng 0.",
        "n_stations = 0",
        (r) => num(r["n_stations"]) === 0,
      ),
      rowRule(
        "NOT_MEASURED",
        "ô có trạm nhưng chưa trạm nào đo được",
        "Ô có trạm, nhưng không trạm nào trong đó có telemetry đọc được. Đã nhìn, không thấy gì.",
        "n_stations > 0 AND n_stations_measured = 0",
        (r) => {
          const st = num(r["n_stations"]);
          const m = num(r["n_stations_measured"]);
          return st !== null && m !== null && st > 0 && m === 0;
        },
      ),
    ],
  },

  // 2. stations — 9 cột nullable trên 26
  {
    table: "stations",
    column: "commune_code",
    companions: ["scope"],
    rules: [bufferRule("xã")],
  },
  {
    table: "stations",
    column: "commune_name",
    companions: ["scope"],
    rules: [bufferRule("xã")],
  },
  {
    table: "stations",
    column: "commune_kind",
    companions: ["scope"],
    rules: [bufferRule("xã")],
  },
  {
    table: "stations",
    column: "n_ports",
    companions: ["port_config_source"],
    rules: [unknownPortConfigRule("số cổng")],
  },
  {
    table: "stations",
    column: "n_guns_imputed",
    companions: ["port_config_source"],
    // Cột SẮC NHẤT trong gói: 97,2 % trống, và đó là con số TỐT. Nó ghi lại việc *một phép
    // gán ước tính đã xảy ra*; trống nghĩa là không cần gán. Một thanh phủ trên nó đọc 2,8 %.
    rules: [
      rowRule(
        "NOT_APPLICABLE",
        "không cần gán ước tính",
        "Trạm có cấu hình cổng rõ ràng từ nguồn nên không phải đoán gì cả. Ô trống ở đây là dấu hiệu LÀNH MẠNH.",
        "port_config_source <> 'UNKNOWN'",
        (r) =>
          r["port_config_source"] !== undefined &&
          r["port_config_source"] !== null &&
          r["port_config_source"] !== "UNKNOWN",
      ),
    ],
  },
  {
    table: "stations",
    column: "current_type",
    companions: ["port_config_source"],
    rules: [unknownPortConfigRule("loại dòng điện")],
  },
  {
    table: "stations",
    column: "power_kw_max_port",
    companions: ["port_config_source"],
    rules: [unknownPortConfigRule("công suất cổng lớn nhất")],
  },
  {
    table: "stations",
    column: "power_kw_site",
    companions: ["port_config_source"],
    rules: [unknownPortConfigRule("tổng công suất trạm")],
  },
  {
    table: "stations",
    column: "freshness",
    companions: ["has_timeseries"],
    rules: [
      rowRule(
        "NOT_APPLICABLE",
        "không có chuỗi thời gian",
        "Trạm không có chuỗi quan sát telemetry nào, nên không có gì để tính độ tươi.",
        "has_timeseries = false",
        (r) => r["has_timeseries"] === false,
      ),
    ],
  },

  // 3. station_occupancy — 8 cột nullable trên 25
  {
    table: "station_occupancy",
    column: "util",
    companions: ["util_reportable"],
    // ĐỪNG đọc ô trống ở đây thành "không có nhu cầu". 28 trạm `ever_active = false` mang
    // `util` KHÔNG trống — một số 0 ĐO ĐƯỢC. Ô trống là ca ngược lại: ta không nhìn được.
    rules: [notReportableRule("mức sử dụng")],
  },
  {
    table: "station_occupancy",
    column: "util_p95",
    companions: ["util_reportable"],
    rules: [notReportableRule("phân vị 95")],
  },
  {
    table: "station_occupancy",
    column: "util_denominator_ports",
    companions: ["util_reportable"],
    rules: [notReportableRule("mẫu số cổng")],
  },
  {
    table: "station_occupancy",
    column: "current_type",
    companions: ["util_reportable"],
    rules: [notReportableRule("loại dòng điện")],
  },
  {
    table: "station_occupancy",
    column: "night_share",
    companions: ["ever_active"],
    rules: [neverActiveRule("tỉ lệ sạc ban đêm")],
  },
  {
    table: "station_occupancy",
    column: "weekend_ratio",
    companions: ["ever_active"],
    rules: [neverActiveRule("tỉ số sử dụng cuối tuần")],
  },
  {
    table: "station_occupancy",
    column: "util_pctl",
    companions: ["util", "occ_status"],
    rules: pctlRules("bảng xếp hạng phân vị"),
  },
  {
    table: "station_occupancy",
    column: "util_pctl_peer",
    companions: ["util", "occ_status"],
    rules: pctlRules("bảng xếp hạng nhóm đồng đẳng"),
  },

  // 4. roads — 1 cột nullable trên 5.
  // Bảng đã ship chỉ có `osm_id, road_class, bridge, dist_station_m, coords`: KHÔNG cột nào
  // nói đoạn đường có nối vào đồ thị dẫn đường hay không. Tuyên bố mức bảng, đối chiếu được.
  {
    table: "roads",
    column: "dist_station_m",
    companions: [],
    rules: [
      tableRule(
        "NOT_APPLICABLE",
        "không nối tới trạm sạc nào",
        "Đoạn đường không thuộc thành phần liên thông nào chứa trạm sạc, nên khoảng cách tới trạm không tồn tại.",
        "đoạn đường không nối được tới trạm nào trong đồ thị dẫn đường",
        "roads.ways_unreachable_null_dist",
      ),
    ],
  },

  // 5. commune — 2 cột nullable trên 21
  {
    table: "commune",
    column: "quality_flag",
    companions: [],
    // Cái bẫy KINH ĐIỂN mà pha này sinh ra để chặn: 98,4 % trống, và trống là ca LÀNH MẠNH.
    // Chạy bộ đếm phủ hôm nay lên nó là vẽ một thanh 1,6 % trên một cột đang hoạt động hoàn hảo.
    rules: [
      tableRule(
        "NOT_APPLICABLE",
        "không có cờ chất lượng nào",
        "Xã không phát sinh cờ cảnh báo nào. Ô trống ở đây là dấu hiệu LÀNH MẠNH, không phải dữ liệu thiếu.",
        "xã không phát sinh cờ chất lượng nào",
        "quality.n_communes_flagged",
      ),
    ],
  },
  {
    table: "commune",
    column: "util_mean_port_weighted",
    companions: ["n_stations"],
    // Cột này CÓ bạn đồng hành, và nó tách được làm hai — đo trên cả 34 tỉnh: 1.381 / 1.402 ô
    // trống là xã KHÔNG có trạm nào (câu hỏi không áp dụng), 21 ô còn lại là xã CÓ trạm mà
    // không trạm nào đo được (đã nhìn, không thấy gì). Gộp hai thứ đó vào một nhãn gõ tay là
    // mất đúng phân biệt mà cả pha này dựng ra.
    rules: [
      rowRule(
        "NOT_APPLICABLE",
        "xã không có trạm sạc nào",
        "Không trạm nào trong xã, nên mức sử dụng bình quân theo cổng không phải một câu hỏi có nghĩa.",
        "n_stations = 0",
        (r) => (num(r["n_stations"]) ?? 0) === 0,
      ),
      rowRule(
        "NOT_MEASURED",
        "xã có trạm nhưng chưa trạm nào đo được",
        "Xã có trạm, nhưng không trạm nào có telemetry đọc được để lấy bình quân.",
        "n_stations > 0 AND không trạm nào đo được mức sử dụng",
        (r) => (num(r["n_stations"]) ?? 0) > 0,
      ),
    ],
  },

  // 6. poi — 2 cột nullable trên 8. OSM không mang thẻ; MISSING theo §1.1 bước 4.
  {
    table: "poi",
    column: "levels",
    companions: [],
    rules: [
      tableRule(
        "MISSING",
        "OSM thiếu số tầng",
        "Đối tượng trên OpenStreetMap không có thuộc tính building:levels. Đây là đầu vào của lớp đùn 3-D.",
        "OSM không có thẻ building:levels",
        "poi.n_visual",
      ),
    ],
  },
  {
    table: "poi",
    column: "name",
    companions: [],
    rules: [
      tableRule(
        "MISSING",
        "OSM thiếu tên",
        "Đối tượng trên OpenStreetMap không có thẻ name.",
        "OSM không có thẻ name",
        "poi.n_visual",
      ),
    ],
  },

  // 7. provinces — 1 cột nullable trên 28. Bảng 34 dòng TOÀN QUỐC ở
  // `web/public/data/provinces.parquet`; mỗi manifest tỉnh mang một bản giống hệt.
  {
    table: "provinces",
    column: "quality_flags",
    companions: [],
    rules: [
      tableRule(
        "NOT_APPLICABLE",
        "không có cờ chất lượng nào",
        "Tỉnh không phát sinh cờ cảnh báo nào — 3 trong 34 tỉnh sạch hoàn toàn.",
        "tỉnh không phát sinh cờ chất lượng nào",
        "vintage.n_provinces",
      ),
    ],
  },
] as const;

export const NULL_CONTRACT_MAP = new Map<string, NullContract>(
  NULL_CONTRACTS.map((c) => [`${c.table}.${c.column}`, c]),
);

export function getNullContract(table: TableId, column: string): NullContract | undefined {
  return NULL_CONTRACT_MAP.get(`${table}.${column}`);
}

/**
 * Cột mà một bảng phẳng PHẢI chiếu để `resolveRowNullState` chạy được — xem docstring đầu file.
 */
export function companionColumns(table: TableId): string[] {
  const out = new Set<string>();
  for (const c of NULL_CONTRACTS) {
    if (c.table === table) for (const k of c.companions) out.add(k);
  }
  for (const v of VALIDITY_CONTRACTS) {
    if (v.table === table) for (const k of v.companions) out.add(k);
  }
  return [...out];
}

// ── Hợp đồng GIÁ TRỊ ĐÁNG NGỜ — §1.3 & §1.4 ──────────────────────────────────────────

export const VALIDITY_CONTRACTS: readonly (ValidityContract & {
  companions: readonly string[];
})[] = [
  {
    table: "grid",
    column: "population",
    companions: ["pop_source"],
    invalidWhen: "pop_source = 'WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE'",
    label: "dân số công bố không hợp lý",
    explain:
      "Con số công bố cho xã này không khớp bề mặt trọng số; pipeline giữ nó và gắn nhãn ngay trong tên của chính giá trị.",
    disposition: "shipped-with-label",
    isInvalid: true,
  },
  {
    table: "grid",
    column: "population",
    companions: ["pop_source"],
    // §1.4 — KHÔNG phải trạng thái thứ năm. Đây là một giá trị CÓ MẶT mã hoá một ô trống:
    // cột `population` phủ 100 % ở mọi nơi, nên không bộ đếm null nào chạm tới được nó. Toàn
    // quốc nó lớn hơn TỔNG mọi ô trống trong gói cộng lại.
    invalidWhen: "pop_source = 'ZERO_NO_WEIGHT'",
    label: "dân số 0 do thiếu bề mặt trọng số",
    explain:
      "Ô mang dân số đúng bằng 0,0 vì không có bề mặt trọng số nào ở đó — đây KHÔNG phải một phép đo ra 0 người.",
    disposition: "shipped-with-label",
    isInvalid: false,
  },
  {
    table: "commune",
    column: "population",
    companions: ["quality_flag"],
    invalidWhen: "quality_flag = 'DANSO_CONG_BO_QUA_THAP'",
    label: "dân số công bố quá thấp",
    explain: "Bản sinh đôi ở mức xã của cùng phát hiện: con số công bố chính thức thấp bất thường.",
    disposition: "shipped-with-label",
    isInvalid: true,
  },
] as const;

// ── Phân giải theo hàng ───────────────────────────────────────────────────────────────

export interface ResolvedNullState {
  state: NullState;
  label: string;
  explain: string;
  basis: NullBasis | "unresolved";
  /** `true` khi không luật nào khớp: ô trống này là một KHUYẾT TẬT, không phải đã giải thích. */
  residual: boolean;
  rule?: NullRule["rule"];
  verifiedBy?: string;
}

/** Ô trống không luật nào giải thích. §1.1 bước 4 — mặc định là MISSING, và nó nói ra điều đó. */
const RESIDUAL: ResolvedNullState = {
  state: "MISSING",
  label: "thiếu — không luật nào giải thích",
  explain:
    "Không luật đã khai nào phân giải được ô trống này. Đó là một khuyết tật cần khai báo (§9), không phải một ô trống lành tính.",
  basis: "unresolved",
  residual: true,
};

/**
 * Ta không phân giải nổi vì HÀNG thiếu cột bạn đồng hành — khác hẳn với "dữ liệu thiếu".
 *
 * Trả về cái này thay vì đoán là điều làm Rule 0 có hiệu lực ở tầng UI: một bảng đang giấu
 * cột `n_stations` không được phép tuyên bố mọi ô trống `util_cell` là "ô không có trạm".
 */
function unresolvable(missing: string[]): ResolvedNullState {
  return {
    state: "MISSING",
    label: "chưa phân giải được",
    explain: `Không đọc được trạng thái vì hàng đang thiếu cột phân giải: ${missing.join(", ")}. Hiện thêm cột đó để đọc được lý do.`,
    basis: "unresolved",
    residual: false,
  };
}

/** Phân giải trạng thái ô trống cho MỘT hàng đã nạp trong bộ nhớ. */
export function resolveRowNullState(
  table: TableId,
  column: string,
  row: Record<string, unknown>,
): ResolvedNullState {
  const contract = getNullContract(table, column);
  if (!contract) return RESIDUAL;

  const missing = contract.companions.filter((c) => !(c in row));
  if (missing.length > 0) return unresolvable(missing);

  for (const r of contract.rules) {
    if (r.test === null || r.test(row)) {
      return {
        state: r.state,
        label: r.label,
        explain: r.explain,
        basis: r.basis,
        residual: false,
        ...(r.rule ? { rule: r.rule } : {}),
        ...(r.verifiedBy ? { verifiedBy: r.verifiedBy } : {}),
      };
    }
  }
  return RESIDUAL;
}

export interface RowValidity {
  /** Chỉ `true` cho INVALID thật. `ZERO_NO_WEIGHT` là `false` — xem §1.4. */
  isInvalid: boolean;
  /** `true` cho cả INVALID lẫn `ZERO_NO_WEIGHT`: giá trị này mang nhãn và phải hiện ra. */
  isLabelled: boolean;
  label?: string;
  explain?: string;
}

const CLEAN: RowValidity = { isInvalid: false, isLabelled: false };

/** Giá trị CÓ MẶT của hàng này có mang nhãn cảnh báo nào không (§1.3/§1.4)? */
export function checkRowValidity(
  table: TableId,
  column: string,
  row: Record<string, unknown>,
): RowValidity {
  for (const v of VALIDITY_CONTRACTS) {
    if (v.table !== table || v.column !== column) continue;
    if (v.companions.some((c) => !(c in row))) continue;
    // `invalidWhen` luôn có dạng `<cột> = '<hằng>'`; đọc thẳng hằng ra thay vì chép nó lần
    // thứ hai vào một câu `if` — hai bản chép là hai chỗ để chúng lệch nhau.
    const m = /^(\w+)\s*=\s*'([^']+)'$/.exec(v.invalidWhen);
    if (!m) continue;
    if (String(row[m[1]!] ?? "") === m[2]) {
      return { isInvalid: v.isInvalid, isLabelled: true, label: v.label, explain: v.explain };
    }
  }
  return CLEAN;
}
