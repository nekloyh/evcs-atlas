/**
 * Danh mục trường của màn hình TOÀN QUỐC — hai đơn vị đọc, không phải một.
 *
 * Đây là danh mục THỨ HAI trong app, và việc nó không dùng chung `fields.ts` là có chủ ý:
 * `FIELDS` mô tả lưới **r8 trong một tỉnh** (0,74 km²/ô, 45 trường, có cả lớp tính toán).
 * Ở đây đơn vị đọc là **ô gộp r6** (~36 km²) và **tỉnh** (34 đa giác). Cùng một cái tên
 * `population` mang hai đại lượng khác nhau ở hai bậc — nhập chúng vào một danh mục là mời
 * một trường của bậc này rơi sang bản đồ của bậc kia, và bậc là thứ không nhìn thấy được.
 *
 * ── KÊNH THỊ GIÁC: TỈNH KHÔNG ĐƯỢC MÃ HOÁ BẰNG HUE ─────────────────────────────────────
 *
 * `docs/adr/0004` cấm lấy hue mã hoá chiều tỉnh, và màn hình này không vi
 * phạm: hue ở đây chở **một đại lượng đo được** (dân số, số cổng, tỉ lệ…), đúng vai nó vẫn
 * chở ở mọi choropleth khác của app. Cái KHÔNG được làm — và không được làm ở đây — là cho
 * 34 tỉnh 34 màu để phân biệt danh tính. Danh tính tỉnh đã được **vị trí** mã hoá hoàn hảo:
 * 34 đa giác rời nhau theo định nghĩa. Nhãn tỉnh là CHỮ, và chọn tỉnh là một `<select>`.
 */

import type { ScaleContract } from "../viz/palette";

export type NationalUnit = "province" | "cell";

export interface NationalKpiOperand {
  column: string;
  aggregation: "sum" | "published" | "derived";
  source: string;
}

export interface NationalKpiContract {
  numerator: NationalKpiOperand;
  denominator: NationalKpiOperand;
  nullRule: "null-propagates";
  /** Hệ số nhân sau phép chia, ví dụ 10.000 dân. */
  factor: number;
  disclosure?: string;
}

export interface ComparabilityContract {
  sourceLayer?: string;
  requiredFlagAbsence?: string;
  /** Cột nguồn vắng/null nghĩa là không thể áp cùng phương pháp, không phải chỉ thiếu UI. */
  requiredValueColumn?: string;
}

const SQRT_COUNT_SCALE: ScaleContract = {
  color: "fixed-binned",
  transform: "sqrt",
  clip: { lo: 0, hi: "p99" },
  reason: "Màn hình toàn quốc giữ thang bậc đã kiểm định; cao độ vẫn dùng miền liên tục.",
};
const LINEAR_RATIO_SCALE: ScaleContract = {
  color: "fixed-binned",
  transform: "linear",
  clip: { lo: 0, hi: "none" },
  reason: "Màn hình toàn quốc giữ thang bậc đã kiểm định; tỉ lệ dùng miền vật lý liên tục.",
};

export interface NationalField {
  id: string;
  unit: NationalUnit;
  column: string;
  label: string;
  /** đơn vị đo, in sau con số trong tooltip và ở cuối dải legend */
  unit_label: string;
  /** một câu: cột này ĐO cái gì, và (nếu có) không được đọc thành cái gì */
  desc: string;
  /** số chữ số thập phân khi in giá trị */
  decimals?: number;
  /** giá trị là tỉ lệ 0–1 ⇒ in ra phần trăm */
  percent?: boolean;
  /** cao = chỗ cần chú ý (mặc định), hay cao = tốt */
  polarity?: "high-bad" | "high-good";
  scaleContract: ScaleContract;
  /** Có mặt trên mọi KPI đã chuẩn hoá; không được suy mẫu số từ tên cột. */
  kpi?: NationalKpiContract;
  comparability?: ComparabilityContract;
}

const POPULATION_DISCLOSURE =
  "Mẫu số là dân số công bố VNSDI; bề mặt độc lập chênh ×0,95–×1,61 theo tỉnh. Số cổng là chặn dưới khi trạm thiếu cấu hình cổng.";

/**
 * Trường của TỈNH — 34 giá trị, đọc từ `vn/provinces.json`.
 *
 * Mọi cột ở đây đều là **số đo hoặc phép chia của hai số đo**, không có cột nào là kết quả
 * của một mô hình. Đó là điều kiện để màn hình này đứng được trong khi lớp tính toán toàn
 * quốc còn đang nợ.
 */
export const PROVINCE_FIELDS: readonly NationalField[] = [
  {
    id: "p:population",
    unit: "province",
    column: "population",
    label: "Dân số",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "người",
    desc: "Tổng dân số công bố của tỉnh — trường `danso` của VNSDI, hiệu lực 16/6/2025.",
  },
  {
    id: "p:pop_density",
    unit: "province",
    column: "pop_density_ppkm2",
    label: "Mật độ dân số",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "người/km²",
    decimals: 0,
    desc: "Dân số chia DIỆN TÍCH HÌNH HỌC của đa giác, không chia diện tích công bố — hai số này lệch nhau ở vài tỉnh và số hình học là số kiểm được.",
  },
  {
    id: "p:n_stations",
    unit: "province",
    column: "n_stations",
    label: "Số trạm sạc",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "trạm",
    polarity: "high-good",
    desc: "Trạm nằm TRONG ranh giới tỉnh; bản sao ở vành đệm 5 km đã bị loại nên tổng 34 tỉnh đúng bằng 6.380 trạm toàn quốc.",
  },
  {
    id: "p:n_ports",
    unit: "province",
    column: "n_ports",
    label: "Số cổng sạc",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "cổng",
    polarity: "high-good",
    desc: "Tổng số cổng của các trạm trong tỉnh.",
  },
  {
    id: "p:power",
    unit: "province",
    column: "power_kw_site",
    label: "Công suất đặt",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "kW",
    decimals: 0,
    polarity: "high-good",
    desc: "Tổng công suất đặt của các trạm trong tỉnh.",
  },
  {
    id: "p:ports_per_10k",
    unit: "province",
    column: "ports_per_10k_pop",
    label: "Cổng trên 10 nghìn dân",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "cổng/10k dân",
    decimals: 2,
    polarity: "high-good",
    desc: "Số cổng chia dân số — phép chia của hai số đo, KHÔNG phải một chỉ số nhu cầu: nó không biết gì về số xe điện thật ở tỉnh đó.",
    kpi: {
      numerator: { column: "n_ports", aggregation: "sum", source: "trạm IN sau loại 1 súng AC" },
      denominator: { column: "population", aggregation: "published", source: "VNSDI 16/6/2025" },
      nullRule: "null-propagates",
      factor: 10_000,
      disclosure: POPULATION_DISCLOSURE,
    },
  },
  {
    id: "p:power_per_urban_km2",
    unit: "province",
    column: "power_kw_per_urban_km2",
    label: "Công suất trên km² đô thị",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "kW/km² đô thị",
    decimals: 1,
    polarity: "high-good",
    desc: "Công suất đặt chia diện tích xây dựng trong tỉnh; diện tích đô thị dùng built_frac × area_km2 × area_frac, không cộng trọn ô biên.",
    kpi: {
      numerator: { column: "power_kw_site", aggregation: "sum", source: "trạm IN" },
      denominator: { column: "urban_km2", aggregation: "derived", source: "WorldCover 2021 × diện tích hiệu dụng" },
      nullRule: "null-propagates",
      factor: 1,
      disclosure: "Bề mặt xây dựng là WorldCover 2021, cung là ảnh chụp 2026. Tổng công suất là chặn dưới khi trạm thiếu công suất danh định.",
    },
  },
  {
    id: "p:access_within_2km",
    unit: "province",
    column: "population_access_within_2km",
    label: "Dân tiếp cận trong 2 km",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "dân số",
    decimals: 1,
    percent: true,
    polarity: "high-good",
    desc: "Phần dân số lưới ở ô tới được trạm trong 2 km theo mạng đường; dân không tới được vẫn nằm trong mẫu số và không vào tử số.",
    kpi: {
      numerator: { column: "population_within_2km", aggregation: "sum", source: "lưới r8, reachable và khoảng cách ≤ BEYOND_2KM_M" },
      denominator: { column: "population_grid", aggregation: "sum", source: "cùng lưới r8" },
      nullRule: "null-propagates",
      factor: 1,
      disclosure: "Tử và mẫu cùng dùng dân số dasymetric; dân không tới được bằng đường vẫn ở mẫu số.",
    },
    comparability: {
      sourceLayer: "distance",
      requiredValueColumn: "population_within_2km",
    },
  },
  {
    id: "p:utilization",
    unit: "province",
    column: "util_median",
    label: "Mức sử dụng trung vị",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "cổng-giờ bận",
    percent: true,
    polarity: "high-good",
    desc: "Trung vị mức sử dụng tại trạm đo được; tỉnh dưới ngưỡng 50% trạm đo được không được so hạng.",
    comparability: {
      sourceLayer: "occupancy",
      requiredFlagAbsence: "KHONG_DO_DUOC_SU_DUNG",
    },
  },
  {
    id: "p:private_ac_stations",
    unit: "province",
    column: "private_ac_share_stations",
    label: "Trạm 1 súng AC (theo số trạm)",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "số trạm",
    percent: true,
    desc: "Phần TRẠM là điểm sạc AC một súng — loại khỏi phân tích cung công cộng. Tính lại cho từng tỉnh: con số 71,8% là của Hà Nội và không phải hằng số quốc gia.",
  },
  {
    id: "p:private_ac_power",
    unit: "province",
    column: "private_ac_share_power",
    label: "Trạm 1 súng AC (theo công suất)",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "công suất",
    percent: true,
    desc: "Cùng tập trạm với trường trên nhưng đo bằng CÔNG SUẤT. Hai con số lệch nhau cả chục lần, và đó chính là luận điểm: chúng đông nhưng nhỏ.",
  },
  {
    id: "p:n_communes",
    unit: "province",
    column: "n_communes",
    label: "Số xã / phường / đặc khu",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "đơn vị",
    desc: "Số đơn vị hành chính cấp xã sau cải cách 01/7/2025 — không còn cấp huyện.",
  },
  {
    id: "p:area",
    unit: "province",
    column: "area_km2_geom",
    label: "Diện tích",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "km²",
    decimals: 0,
    desc: "Diện tích đo trên chính đa giác VNSDI, không lấy số công bố.",
  },
  {
    id: "p:poi_coverage",
    unit: "province",
    column: "share_communes_zero_poi",
    label: "Xã KHÔNG có POI nào",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "số xã",
    percent: true,
    desc: "CHỈ SỐ ĐỘ PHỦ, không phải một số đo về địa bàn: nó nói OSM thiếu dữ liệu ở đâu. Cao nghĩa là ở tỉnh đó KHÔNG được diễn giải lớp POI — cấm dùng POI làm cơ cấu hay làm rule loại trừ.",
  },
  {
    id: "p:occ_measured",
    unit: "province",
    column: "share_stations_measured",
    label: "Trạm đo được mức sử dụng",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "số trạm",
    percent: true,
    polarity: "high-good",
    desc: "Phần trạm có `util` đọc được. Dưới 50% thì lớp mức sử dụng bị TẮT ở màn hình tỉnh — suy đoán không được vẽ như quan sát.",
  },
];

/**
 * Trường của Ô GỘP r6 — ~9,8 nghìn ô, đọc từ `vn/grid_h3_r6.parquet`.
 *
 * Mọi trường ở đây là **tổng** của các ô r8 nằm trong ô gộp (hoặc trung bình có trọng số
 * diện tích với `*_frac`). Không có trường nào của lớp TÍNH TOÁN — khoảng cách theo mạng
 * đường, sàng lọc, mức sử dụng đều là của bậc r8 trong một tỉnh và không gộp lên được.
 */
export const CELL_FIELDS: readonly NationalField[] = [
  {
    id: "c:population",
    unit: "cell",
    column: "population",
    label: "Dân số",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "người",
    decimals: 0,
    desc: "Dân số dasymetric cộng lên ô gộp ~36 km². Neo theo tổng kiểm soát VNSDI của từng tỉnh, trọng số WorldPop 100 m.",
  },
  {
    id: "c:pop_density",
    unit: "cell",
    column: "pop_density_ppkm2",
    label: "Mật độ dân số",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "người/km²",
    decimals: 0,
    desc: "Dân số chia diện tích PHẦN ĐẤT của ô gộp — ô nửa ngoài biển vẫn ra mật độ đúng cho phần đất của nó.",
  },
  {
    id: "c:n_apartment",
    unit: "cell",
    column: "n_apartment",
    label: "Chung cư",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "toà",
    desc: "Số toà `building=apartments` của OSM. Phủ OSM rất lệch giữa các tỉnh — xem trường ĐỘ PHỦ POI trước khi đọc.",
  },
  {
    id: "c:apartment_levels",
    unit: "cell",
    column: "apartment_levels_sum",
    label: "Tổng tầng chung cư",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "tầng",
    decimals: 0,
    desc: "Cộng `building:levels`. Chỉ 41,2% toà có tag này, nên đây là một CHẶN DƯỚI, không phải tổng thật.",
  },
  {
    id: "c:n_poi_total",
    unit: "cell",
    column: "n_poi_total",
    label: "Tổng điểm quan tâm",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "điểm",
    desc: "Tổng POI sinh cầu (chung cư, TTTM, siêu thị, chợ, bãi đỗ, cây xăng) trong ô gộp.",
  },
  {
    id: "c:n_mall",
    unit: "cell",
    column: "n_mall",
    label: "Trung tâm thương mại",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "điểm",
    desc: "`shop=mall`.",
  },
  {
    id: "c:n_supermarket",
    unit: "cell",
    column: "n_supermarket",
    label: "Siêu thị",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "điểm",
    desc: "`shop=supermarket`.",
  },
  {
    id: "c:n_market",
    unit: "cell",
    column: "n_market",
    label: "Chợ",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "điểm",
    desc: "`amenity=marketplace`.",
  },
  {
    id: "c:n_parking_off",
    unit: "cell",
    column: "n_parking_off",
    label: "Bãi đỗ xe",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "bãi",
    desc: "Bãi đỗ ngoài lòng đường — `amenity=parking` không phải `parking=street_side`.",
  },
  {
    id: "c:n_fuel",
    unit: "cell",
    column: "n_fuel",
    label: "Cây xăng",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "điểm",
    desc: "`amenity=fuel` — vị trí đã có hạ tầng phục vụ phương tiện dừng đỗ.",
  },
  {
    id: "c:n_stations",
    unit: "cell",
    column: "n_stations",
    label: "Số trạm sạc",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "trạm",
    polarity: "high-good",
    desc: "Trạm nằm trong ô gộp, đã loại điểm sạc AC một súng.",
  },
  {
    id: "c:n_ports",
    unit: "cell",
    column: "n_ports",
    label: "Số cổng sạc",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "cổng",
    polarity: "high-good",
    desc: "Tổng cổng của các trạm trong ô gộp.",
  },
  {
    id: "c:power",
    unit: "cell",
    column: "power_kw_site",
    label: "Công suất đặt",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "kW",
    decimals: 0,
    polarity: "high-good",
    desc: "Tổng công suất đặt trong ô gộp.",
  },
  {
    id: "c:road",
    unit: "cell",
    column: "road_len_in_province_m",
    label: "Chiều dài đường",
    scaleContract: SQRT_COUNT_SCALE,
    unit_label: "m",
    decimals: 0,
    desc: "Tổng chiều dài đường bộ OSM trong ô gộp, đã cắt theo ranh giới tỉnh.",
  },
  {
    id: "c:built",
    unit: "cell",
    column: "built_frac",
    label: "Tỉ lệ đất xây dựng",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "diện tích",
    percent: true,
    desc: "ESA WorldCover 10 m (2021), lớp `built`. Trung bình có trọng số diện tích của các ô r8 bên trong.",
  },
  {
    id: "c:water",
    unit: "cell",
    column: "water_frac",
    label: "Tỉ lệ mặt nước",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "diện tích",
    percent: true,
    desc: "ESA WorldCover 10 m (2021), lớp `water`.",
  },
  {
    id: "c:tree",
    unit: "cell",
    column: "tree_frac",
    label: "Tỉ lệ cây che phủ",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "diện tích",
    percent: true,
    desc: "ESA WorldCover 10 m (2021), lớp `tree`.",
  },
  {
    id: "c:crop",
    unit: "cell",
    column: "crop_frac",
    label: "Tỉ lệ đất canh tác",
    scaleContract: LINEAR_RATIO_SCALE,
    unit_label: "diện tích",
    percent: true,
    desc: "ESA WorldCover 10 m (2021), lớp `crop`.",
  },
];

export const NATIONAL_FIELDS = [...PROVINCE_FIELDS, ...CELL_FIELDS];
export const FIELD_BY_ID = new Map(NATIONAL_FIELDS.map((f) => [f.id, f]));
/** Selector KPI chỉ được phép đưa ra các phép chuẩn hoá có contract đầy đủ. */
export const NORMALIZED_PROVINCE_FIELDS = PROVINCE_FIELDS.filter(
  (f): f is NationalField & { kpi: NationalKpiContract; polarity: "high-bad" | "high-good" } =>
    Boolean(f.kpi && f.polarity),
);
/** Phần còn lại vẫn phải có đường vào UI; không KPI nào được chỉ mở bằng cách gõ hash. */
export const OTHER_PROVINCE_FIELDS = PROVINCE_FIELDS.filter(
  (field) => !NORMALIZED_PROVINCE_FIELDS.includes(field as never),
);
export const DEFAULT_NATIONAL_FIELD = "p:ports_per_10k";

export function formatValue(f: NationalField, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (f.percent) return `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString("vi-VN", { maximumFractionDigits: f.decimals ?? 0 });
}
