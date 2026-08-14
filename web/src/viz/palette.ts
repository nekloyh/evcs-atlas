/**
 * Bảng màu và cách chia bậc — DESIGN.md §4 và §6a.
 *
 * Mọi hex ở đây là kết quả chạy `scripts/validate_palette.js` của skill dataviz trên
 * surface #f2f3f0 (nền thật của positron), không phải màu chọn bằng mắt.
 *
 * RÀNG BUỘC 1 sống ở file này: `colorFor()` là ĐƯỜNG VÀO DUY NHẤT từ giá trị sang màu,
 * và giá trị null trả về `null` (⇒ ô vẽ gạch chéo), không bao giờ rơi vào ramp.
 * Không có `?? 0` ở bất kỳ đâu trong file này. Đừng thêm.
 */

import type { AnalysisTheme } from "./theme";

export type RGB = [number, number, number];

export interface ThemePalette {
  hex: readonly [string, string, string, string, string, string, string];
  ink: readonly [string, string, string, string, string, string, string];
  rgb: RGB[];
  series: string;
  /**
   * Cánh CAN THIỆP của bảng PHÂN KỲ — 3 bậc, **sát mốc → xa mốc** (§4f).
   *
   * Không phải ba bậc bất kỳ của `hex`: chúng lấy mẫu chính đường cong sắc của theme tại
   * L 0,73 / 0,575 / 0,42, ba mức đã qua cổng đo. Bậc nhạt của `hex` không dùng được ở
   * đây — `#fff8db` của `screening` cho tương phản **1,04:1** với nền bản đồ, tức là vô hình.
   *
   * `null` = theme này **không dựng được** bảng phân kỳ, và đó là kết quả đo chứ không
   * phải chỗ chưa làm. Xem `DIVERGE_NEUTRAL_HEX`.
   */
  diverge: { hex: readonly [string, string, string]; ink: readonly [string, string, string] } | null;
}

/** Ramp choropleth mặc định (demand / exploration): cam tuần tự, 7 bậc, nhạt → đậm. */
export const RAMP_HEX = [
  "#e7997e",
  "#dd7c58",
  "#d35c2d",
  "#b94918",
  "#9b380b",
  "#7e2a03",
  "#601e01",
] as const;

/** Mực chữ đè lên swatch legend. Đổi ở bậc 4; mọi ô ≥ 4,5:1. DESIGN.md §4c. */
export const RAMP_INK = [
  "#0b0b0b",
  "#0b0b0b",
  "#0b0b0b",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#ffffff",
] as const;

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export const RAMP_RGB: RGB[] = RAMP_HEX.map(hexToRgb);

/**
 * Bảng màu 7 bậc riêng cho từng AnalysisTheme / Scene.
 * Được thiết kế và kiểm định theo chuẩn bản đồ học CARTOColors & Kepler.gl:
 * - Multi-hue sequential (dịch chuyển cả Hue lẫn Lightness) giúp phân biệt bậc tốt hơn.
 * - Đảm bảo độ tương phản WCAG 2.1 ≥ 4.5:1 trên nền positron #f2f3f0.
 */
export const THEME_PALETTES: Record<AnalysisTheme, ThemePalette> = {
  demand: {
    // CARTO OrYel / Warm Amber (Nhu cầu, Dân số, Cường độ)
    hex: [
      "#fef6b5",
      "#ffdd80",
      "#ffaa40",
      "#f26d21",
      "#d9381e",
      "#a61212",
      "#66000d",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#fef6b5",
      "#ffdd80",
      "#ffaa40",
      "#f26d21",
      "#d9381e",
      "#a61212",
      "#66000d",
    ].map(hexToRgb),
    series: "#f26d21",
    diverge: { hex: ["#f88425", "#d5351d", "#920b12"], ink: ["#0b0b0b", "#ffffff", "#ffffff"] },
  },
  supply: {
    // CARTO Mint / Teal-Cyan (Hạ tầng, Năng lượng sạc)
    hex: [
      "#e4f1e1",
      "#b4e1d4",
      "#74c4b2",
      "#36a394",
      "#1d8073",
      "#0b5c53",
      "#023834",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#e4f1e1",
      "#b4e1d4",
      "#74c4b2",
      "#36a394",
      "#1d8073",
      "#0b5c53",
      "#023834",
    ].map(hexToRgb),
    series: "#36a394",
    // Xanh mòng gần cánh xám-lam quá: cặp giáp mốc chỉ ΔE 9,2 (thường) và 6,4 (deutan),
    // dưới sàn 15 của cổng hạng mục. Không có trường phân kỳ nào thuộc cảnh này.
    diverge: null,
  },
  utilization: {
    // CARTO Purp / Magenta-Fuchsia (Tải trạm, Telemetry, Cường độ sạc)
    hex: [
      "#f3e0f7",
      "#e2b6e8",
      "#c884d4",
      "#a852b7",
      "#842893",
      "#5c0e6c",
      "#38004d",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#f3e0f7",
      "#e2b6e8",
      "#c884d4",
      "#a852b7",
      "#842893",
      "#5c0e6c",
      "#38004d",
    ].map(hexToRgb),
    series: "#a852b7",
    // Tím ↔ xám-lam là cặp mù màu kinh điển: giáp mốc còn **ΔE 0,3** dưới protan/deutan —
    // hai bên mốc thành CÙNG MỘT MÀU với người mù màu đỏ-lục.
    diverge: null,
  },
  accessibility: {
    // CARTO BluYl / Indigo-Cobalt (Mạng lưới đường, Khoảng cách tiếp cận)
    hex: [
      "#d7e1ee",
      "#9cbbe3",
      "#6093d6",
      "#356ec2",
      "#1d479e",
      "#0e2978",
      "#06134a",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#d7e1ee",
      "#9cbbe3",
      "#6093d6",
      "#356ec2",
      "#1d479e",
      "#0e2978",
      "#06134a",
    ].map(hexToRgb),
    series: "#356ec2",
    // Cùng sắc với cánh xám-lam (ΔE 1,9 giáp mốc) và đè luôn lên họ COLD của overlay
    // (ΔE 5,4). Cảnh này phải đổi cánh trung tính sang họ khác trước khi có trường phân kỳ.
    diverge: null,
  },
  "urban-context": {
    // CARTO Emerald / Forest-Sage (Môi trường đô thị, Đất, POI)
    hex: [
      "#eef7e8",
      "#c4e8b8",
      "#8ecf84",
      "#52b157",
      "#2e8b38",
      "#126322",
      "#053d11",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#eef7e8",
      "#c4e8b8",
      "#8ecf84",
      "#52b157",
      "#2e8b38",
      "#126322",
      "#053d11",
    ].map(hexToRgb),
    series: "#52b157",
    diverge: { hex: ["#6ebe6a", "#328f3b", "#105d1f"], ink: ["#0b0b0b", "#0b0b0b", "#ffffff"] },
  },
  screening: {
    // CARTO Gold-Bronze / Amber (Biên lọc, So sánh, Tiêu chí)
    hex: [
      "#fff8db",
      "#ffe49e",
      "#ffd059",
      "#f5b027",
      "#d4860b",
      "#9e5600",
      "#613000",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#fff8db",
      "#ffe49e",
      "#ffd059",
      "#f5b027",
      "#d4860b",
      "#9e5600",
      "#613000",
    ].map(hexToRgb),
    series: "#f5b027",
    diverge: { hex: ["#e19616", "#ae6402", "#753c00"], ink: ["#0b0b0b", "#ffffff", "#ffffff"] },
  },
  exploration: {
    // Ramp mặc định (Cam Hổ Phách / CARTO OrYel Classic)
    hex: RAMP_HEX,
    ink: RAMP_INK,
    rgb: RAMP_RGB,
    series: "#b94918",
    diverge: { hex: ["#e48f71", "#c35020", "#832d04"], ink: ["#0b0b0b", "#ffffff", "#ffffff"] },
  },
};

/**
 * Cánh KHÔNG-CAN-THIỆP của bảng phân kỳ — xám-lam, 3 bậc, **sát mốc → xa mốc** (§4f).
 *
 * Chung cho mọi theme, và cố ý nhạt giọng: nó nói "phía này không phải chỗ cần làm gì".
 * Nó **dừng ở L 0,58** trong khi cánh can thiệp xuống tới L 0,42, nên bất biến của §4b còn
 * nguyên — **thứ sẫm nhất trên bản đồ vẫn là chỗ cần can thiệp**, kể cả trên thang phân kỳ.
 *
 * Chroma bị kẹp giữa hai phía và cả hai đều đo được:
 *   · quá nhạt sắc thì đụng **vân null** `#898781` (ở C 0,04 chỉ còn ΔE 6,8) — "dưới mốc"
 *     đọc thành "không có dữ liệu";
 *   · quá đậm sắc thì đụng **họ COLD** của overlay `#3987e5` (ở C 0,095 còn ΔE 7,0).
 * C 0,070–0,088 là khoảng còn lại: ΔE 9,5 với vân null và 8,3 với COLD.
 */
export const DIVERGE_NEUTRAL_HEX = ["#86acd3", "#6b95c1", "#527fae"] as const;
export const DIVERGE_NEUTRAL_INK = ["#0b0b0b", "#0b0b0b", "#0b0b0b"] as const;

export function getThemePalette(theme?: AnalysisTheme): ThemePalette {
  return THEME_PALETTES[theme ?? "exploration"] ?? THEME_PALETTES.exploration;
}

export function seriesColorForTheme(theme?: AnalysisTheme): string {
  return getThemePalette(theme).series;
}

/** Họ màu lạnh dùng chung cho MỌI overlay. Danh tính overlay đến từ hình học. */
export const COLD_HEX = ["#3987e5", "#1c5cab", "#0d366b"] as const;

/**
 * Mực chữ đè lên swatch lạnh — cùng phép đo với RAMP_INK (§4c), chạy trên cùng công thức
 * tương phản WCAG: 5,41 · 6,63 · 11,95. Mọi ô ≥ 4,5:1.
 */
export const COLD_INK = ["#0b0b0b", "#ffffff", "#ffffff"] as const;

export const HATCH_HEX = "#898781"; // nét gạch chéo cho ô null
export const BASEMAP_HEX = "#f2f3f0";
export const HAIRLINE_HEX = "#e1e0d9";

export const COLD_RGB: RGB[] = COLD_HEX.map(hexToRgb);
export const HATCH_RGB: RGB = hexToRgb(HATCH_HEX);

/**
 * ĐANG CHỌN — ký hiệu VÔ SẮC, dùng chung cho ô, xã, trạm, đoạn đường và POI.
 *
 * Trước đây nó là `COLD_HEX[2]` (#0d366b) và điều đó sai theo hai hướng cùng lúc:
 *
 *  1. **Nó biến mất.** Một nét navy 2,5 px nằm trên bậc c6/c7 (#7e2a03/#601e01) hay trên
 *     bậc sẫm của ramp `accessibility`/`utilization` gần như không có tương phản. Ảnh chụp
 *     ở z11,5 với Phường Hoàn Kiếm đang chọn là bằng chứng: người xem không thấy được thứ
 *     mình vừa bấm.
 *  2. **Nó nói nhầm.** Họ lạnh là danh tính của OVERLAY. Lấy đúng màu đó cho selection thì
 *     "đang chọn" đọc thành "một lớp bối cảnh", và với ramp `accessibility` (BluYl, cobalt)
 *     thì cả ba thứ — dữ liệu, overlay, selection — cùng một sắc.
 *
 * Cách sửa không phải đi tìm màu thứ tư: `THEME_PALETTES` có bảy ramp và chúng phủ gần hết
 * vòng sắc, nên KHÔNG có sắc nào còn trống. Thứ chưa ai chiếm là **độ sáng ở cả hai đầu** —
 * không ramp nào vừa có bậc trắng vừa có bậc đen. Nên selection là một nét mực trên một
 * casing sáng: cặp này đọc được trên bậc sáng nhất lẫn bậc sẫm nhất của cả bảy ramp, và nó
 * không thể bị nhầm với một giá trị vì nó không có màu nào để nhầm.
 */
export const SELECT_HEX = "#0b0b0b";
export const SELECT_CASING_HEX = "#ffffff";
export const SELECT_RGB: RGB = hexToRgb(SELECT_HEX);
export const SELECT_CASING_RGB: RGB = hexToRgb(SELECT_CASING_HEX);
/**
 * Nét lõi và nét casing, px.
 *
 * MỎNG là một phần của thiết kế, không phải một sự nhượng bộ. Cặp 2 px + 6 px đầu tiên đọc
 * được nhưng nặng: trên màn hình nó thành một dải trắng bọc một dải đen, dày ngang một con
 * đường, và đa giác đang chọn trông như bị dán đè lên bản đồ. Cặp 1,5 px + 4 px giữ nguyên
 * cơ chế (mực trên nền sáng ⇒ đọc được trên mọi ramp) mà chỉ còn là một nét bút.
 */
export const SELECT_CORE_W = 1.5;
export const SELECT_CASING_W = SELECT_CORE_W + 2.5;
/** Màu nền positron — dùng làm VÒNG VIỀN tách mark khỏi thứ bên dưới (§4d), không làm màu tô. */
export const BASEMAP_RGB: RGB = hexToRgb(BASEMAP_HEX);

/**
 * Mark bị BRUSH LOẠI — `#898781` @ 0,25 (§4e, §3d).
 *
 * Bị loại thì **mờ đi, không biến mất**: xoá mark khỏi bản đồ là nói dối về mật độ. Và
 * mark không có giá trị giữ nguyên **chất liệu** của nó (vân 45°/90°, chấm rỗng) mà chỉ
 * đổi **mực** sang màu này — hai kênh, hai câu: chất liệu nói ta biết tới đâu, màu nói nó
 * có được chọn không (§3d-1).
 *
 * **`#e1e0d9` @ 0,35 của bản gốc đã bị ẢNH RENDER bác bỏ ở M4** (§4e có bảng đo): hợp
 * thành trên nền bản đồ `#f2f3f0` nó cho ΔE **2,1** — dưới hẳn sàn 6–8 của §4b, và trên
 * ảnh thật thì ô bị loại biến mất hoàn toàn, tức phá đúng câu mà §3d dựng nó ra để giữ.
 * Gốc lỗi: `#e1e0d9` là hairline chọn cho nền PANEL `#f9f9f7`, không phải cho nền BẢN ĐỒ.
 *
 * `#898781` không phải hex mới — nó là mực mờ đã có ở §4e. Alpha 0,25 chứ không phải 0,35:
 * ở 0,35 khoảng cách tới nền (11,5) bắt kịp khoảng cách tới c1 (10,6) và ô bị loại bắt đầu
 * TRANH với dữ liệu; ở 0,25 nó vừa đọc được (8,1) vừa lùi hẳn sau c1 (12,9).
 */
export const MUTED_RGB: RGB = hexToRgb(HATCH_HEX);
export const MUTED_ALPHA = Math.round(0.25 * 255);

/**
 * Cùng màu đó cho BIỂU ĐỒ — bản đồ và dock phải nói cùng một câu bằng cùng một màu, nếu
 * không mentor phải học hai từ vựng cho một khái niệm.
 *
 * `a` mở ra vì §4d đã lập sẵn tiền lệ: mark MẢNH (chấm 1,3 px của scatter) cần mực đặc hơn
 * mark ĐẶC (cột histogram, ô hex) — *"nét mảnh ở alpha 0,5 thì biến mất, đó là lỗi chứ
 * không phải nhất quán"*. Cùng ký hiệu, khác độ đặc theo cỡ mark.
 */
export const mutedCss = (a = MUTED_ALPHA / 255): string =>
  `rgba(${MUTED_RGB[0]},${MUTED_RGB[1]},${MUTED_RGB[2]},${a})`;

// ── Chia bậc ────────────────────────────────────────────────────────────────────

/**
 * Giá trị một ô có thể mang: số, bool, hạng mục — hoặc KHÔNG CÓ.
 *
 * `undefined` nằm trong union một cách CÓ CHỦ Ý, không phải cho tiện. Đường GeoJSON thật
 * sự sinh ra nó: `feature.properties[col]` trả `undefined` khi feature thiếu hẳn khoá đó,
 * khác với `null` (có khoá, không có giá trị). `classOf` vẫn luôn kiểm cả hai. Trước đây
 * kiểu này chỉ khai `null`, tức nó nói dối về thứ hàm thật sự nhận — và một phép kiểm
 * `=== undefined` mà kiểu bảo không bao giờ xảy ra thì sớm muộn sẽ có người xoá đi.
 */
export type CellValue = number | boolean | string | null | undefined;

export interface NumericScale {
  kind: "numeric";
  /** Ngưỡng dưới của từng bậc, tăng dần. Độ dài = số bậc thật (có thể < 7). */
  breaks: number[];
  /** Bậc 1 có phải là tập {0} riêng không — DESIGN.md §6a quy tắc 2. */
  zeroClass: boolean;
  /**
   * Giá trị LỚN NHẤT thật. Legend cần nó vì bậc cuối là một khoảng MỞ: với
   * `ports_per_10k_pop`, bậc cuối bắt đầu ở 11 còn thực tế chạy tới 230,7 — mọi giá trị
   * trong khoảng đó chung một màu, và không có gì trên màn hình nói ra điều ấy.
   */
  max: number | null;
  /**
   * Số đơn vị rơi vào từng bậc — cùng độ dài với `breaks`.
   *
   * `BoolScale` và `CategoricalScale` đã có `counts` từ đầu; bậc số thì không, và sự vắng
   * mặt ấy có lý do cũ: chia bậc theo PHÂN VỊ nên mọi bậc xấp xỉ bằng nhau, một biểu đồ cột
   * ở đây sẽ phẳng và không nói gì. Nhưng nó phẳng **trừ hai chỗ**, và cả hai đều là chỗ
   * người xem cần biết: bậc {0} riêng (§6a quy tắc 2) không theo phân vị, và bậc bị gộp vì
   * trùng ngưỡng (quy tắc 3) gánh phần của bậc đã mất. Có `counts` thì legend nói được
   * "mỗi bậc ≈ bao nhiêu đơn vị" bằng số đo thay vì bằng niềm tin vào thuật toán.
   */
  counts: number[];
  n: number;
  nNull: number;
  /**
   * Thang này là PHÂN KỲ, và mốc nằm ở đâu trong `breaks` — `null` với thang tuần tự.
   *
   * Để ở `Scale` chứ không chỉ ở registry là có lý do: `colorFor`/`scaleColors` chỉ nhận
   * `Scale`, nên nếu mốc không đi cùng thang thì bản đồ và legend sẽ phải tự đi hỏi
   * registry lần nữa — và đó đúng là chỗ hai bên trôi khỏi nhau.
   */
  diverge: DivergeScale | null;
}

export interface BoolScale {
  kind: "bool";
  /** Bậc 0 = false, bậc 1 = true. Hai bậc, dùng c2 và c6 — §6a quy tắc 4. */
  n: number;
  nNull: number;
  counts: [number, number];
}

export interface CategoricalScale {
  kind: "categorical";
  /** Hạng mục xếp theo số ô giảm dần. Màu là bậc LẠNH, không phải ramp — §6a quy tắc 5. */
  categories: string[];
  counts: number[];
  n: number;
  nNull: number;
}

/** Cách một trường được chia bậc. Một `Scale` phục vụ CẢ bản đồ lẫn legend — hai chỗ đó
 *  không được phép bất đồng về màu. */
export type Scale = NumericScale | BoolScale | CategoricalScale;

const MAX_CLASSES = 7;
const ZERO_SHARE_THRESHOLD = 0.05;
/** Số bậc MỖI PHÍA của thang phân kỳ. Bằng nhau hai bên là điều kiện để "cách mốc bao xa"
 *  đọc được bằng khoảng cách trên dải — lệch bậc thì cùng một quãng nói hai điều. */
const DIVERGING_PER_SIDE = 3;

/**
 * Khai báo PHÂN KỲ của một trường — thứ mà `Polarity` không nói được.
 *
 * Cực tính trả lời "đầu nào cần can thiệp" trên một thang MỘT CHIỀU. Phân kỳ là câu hỏi
 * khác: có một giá trị mà **hai bên nó là hai phát biểu khác nhau**, không phải "nhiều hơn"
 * và "ít hơn". Với `screen_margin_m` thì đó là 0 — dưới 0 là chưa đủ xa ngưỡng, trên 0 là
 * đã đủ, và một thang tuần tự gộp cả hai vào một bậc màu ở đúng chỗ quan trọng nhất.
 *
 * Một trường KHÔNG được khai cả `polarity` lẫn `diverge`: cực tính đảo ánh xạ, phân kỳ
 * thay hẳn bảng màu, và áp cả hai thì bảng màu bị đảo hai lần theo hai luật khác nhau.
 * `test/diverging.test.ts` giữ luật này.
 */
export interface Diverge {
  /** Giá trị MỐC. Một ngưỡng được ghim ĐÚNG ở đây, không phải gần đây. */
  at: number;
  /** Phía mang SẮC của theme = phía cần can thiệp. Phía kia là cánh xám-lam. */
  hue: "above" | "below";
}

export interface DivergeScale extends Diverge {
  /** Chỉ số của ngưỡng ghim ở mốc, tính SAU khi gộp ngưỡng trùng (§6a-3). */
  index: number;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  const a = sorted[lo]!;
  if (lo === hi) return a;
  return a + (sorted[hi]! - a) * (i - lo);
}

/**
 * Chia bậc theo DESIGN.md §6a:
 *   1. mặc định 7 bậc phân vị trên giá trị không null
 *   2. nếu ≥5% giá trị là đúng 0 → bậc 1 là {0}, 6 bậc còn lại chia phân vị trên >0
 *   3. ngưỡng trùng nhau thì GỘP bậc và trả về đúng số bậc còn lại — không độn bậc giả
 */
/** Đếm giá trị rơi vào từng bậc. `breaks[i]` là ngưỡng DƯỚI của bậc i, nên bậc cuối là mở. */
function tally(present: number[], breaks: number[]): number[] {
  const counts = new Array<number>(breaks.length).fill(0);
  if (breaks.length === 0) return counts;
  for (const v of present) {
    let k = breaks.length - 1;
    while (k > 0 && v < breaks[k]!) k--;
    counts[k]!++;
  }
  return counts;
}

export function computeClassing(values: (number | null | undefined)[]): NumericScale {
  const present: number[] = [];
  let nNull = 0;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) nNull++;
    else present.push(v);
  }
  if (present.length === 0)
    return { kind: "numeric", breaks: [], zeroClass: false, max: null, counts: [], n: 0, nNull, diverge: null };

  const nZero = present.reduce((acc, v) => (v === 0 ? acc + 1 : acc), 0);
  const zeroClass = nZero / present.length >= ZERO_SHARE_THRESHOLD;

  const pool = (zeroClass ? present.filter((v) => v > 0) : present).slice().sort((a, b) => a - b);
  const k = zeroClass ? MAX_CLASSES - 1 : MAX_CLASSES;

  const raw: number[] = [];
  for (let i = 0; i < k; i++) raw.push(quantile(pool, i / k));

  // gộp ngưỡng trùng (quy tắc 3)
  const breaks: number[] = [];
  for (const b of raw) {
    if (!Number.isNaN(b) && (breaks.length === 0 || b > breaks[breaks.length - 1]!)) breaks.push(b);
  }
  if (zeroClass) breaks.unshift(0);

  return {
    kind: "numeric",
    breaks,
    zeroClass,
    max: pool[pool.length - 1] ?? null,
    counts: tally(present, breaks),
    n: present.length,
    nNull,
    diverge: null,
  };
}

/**
 * Chia bậc HAI PHÍA quanh một mốc — §6a quy tắc 6, dùng cho trường khai `diverge`.
 *
 * Khác thang tuần tự ở đúng ba chỗ, và cả ba đều bắt buộc:
 *
 * 1. **Mốc là một NGƯỠNG, không phải một bậc.** Phân vị được tính riêng trong từng phía,
 *    rồi `at` được ghim vào làm cạnh dưới của bậc đầu tiên phía trên. Không ghim thì mốc
 *    rơi vào GIỮA một bậc, và đó chính là lỗi đang chạy: với `screen_margin_m`, bậc thứ 5
 *    của thang phân vị 7 bậc chạy từ **−74 m tới +372 m** — một ô chưa đủ xa ngưỡng và một
 *    ô đã đủ xa được tô **cùng một màu**, ở đúng chỗ quyết định lật.
 *
 * 2. **Không có bậc {0} riêng.** Quy tắc 2 nói về 0-là-VẮNG-MẶT ("không có trạm nào"); ở
 *    đây 0 là ranh giới quyết định và nó đã là một ngưỡng. Cho nó thêm một bậc riêng là
 *    đếm cùng một sự thật hai lần, và làm số bậc hai phía lệch nhau.
 *
 * 3. **Phân vị tính TRONG phía, nên hai phía không cùng mật độ.** Với `screen_margin_m`:
 *    2.618 ô âm chia 3 bậc (≈873/bậc) và 1.782 ô dương chia 3 bậc (≈594/bậc). Legend phải
 *    nói ra điều đó — xem `classingNote`.
 *
 * Một phía rỗng thì không có gì để phân kỳ: trả về thang tuần tự thường, vì vẽ một bảng
 * hai sắc cho dữ liệu chỉ có một phía là hứa một ranh giới không tồn tại.
 */
export function computeDivergingClassing(
  values: (number | null | undefined)[],
  d: Diverge,
): NumericScale {
  const present: number[] = [];
  let nNull = 0;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) nNull++;
    else present.push(v);
  }
  const below = present.filter((v) => v < d.at).sort((a, b) => a - b);
  const above = present.filter((v) => v >= d.at).sort((a, b) => a - b);
  if (below.length === 0 || above.length === 0) return computeClassing(values);

  const raw: number[] = [];
  for (let i = 0; i < DIVERGING_PER_SIDE; i++) raw.push(quantile(below, i / DIVERGING_PER_SIDE));
  raw.push(d.at);
  for (let i = 1; i < DIVERGING_PER_SIDE; i++) raw.push(quantile(above, i / DIVERGING_PER_SIDE));

  // gộp ngưỡng trùng (quy tắc 3). `at` không bao giờ bị gộp mất vì mọi giá trị phía dưới
  // đều nhỏ hơn nó THẬT SỰ; ngưỡng phía trên thì có thể, và chỉ số của mốc đọc lại SAU khi
  // gộp chứ không giả định là DIVERGING_PER_SIDE.
  const breaks: number[] = [];
  for (const b of raw) {
    if (!Number.isNaN(b) && (breaks.length === 0 || b > breaks[breaks.length - 1]!)) breaks.push(b);
  }
  const index = breaks.indexOf(d.at);

  return {
    kind: "numeric",
    breaks,
    zeroClass: false,
    max: above[above.length - 1] ?? null,
    counts: tally(present, breaks),
    n: present.length,
    nNull,
    diverge: { ...d, index },
  };
}

/**
 * Chia bậc sao cho mỗi dải chứa xấp xỉ **cùng một lượng TRỌNG SỐ**, không phải cùng một
 * số ô — M2.1 (F8).
 *
 * Dùng cho mặt độ cầu, nơi giá trị của một ô gộp CHÍNH LÀ trọng số của nó (số người).
 * Đo trên dữ liệu thật, 449 ô gộp 3 km:
 *
 * | cách chia | dải thấp nhất chứa |
 * |---|---|
 * | đều theo Ô *(cũ)* | 64 ô = **0,18% dân** — 1/7 dải màu để nói "gần như không có ai" |
 * | đều theo NGƯỜI *(này)* | 247 ô = **14,3% dân** |
 *
 * Vì sao đúng hơn cho MẶT ĐỘ: bản đồ này trả lời "người ở đâu", nên mỗi bậc màu phải đại
 * diện cho cùng một lượng người. Chia đều theo ô là trả lời "diện tích ở đâu" — một câu
 * hỏi khác, và là câu không ai đặt ra.
 *
 * Vẫn in NGƯỠNG THẬT lên legend (§3b): đây là đổi chỗ CẮT, không đổi con số.
 * §6a quy tắc 3 (gộp ngưỡng trùng, không độn bậc giả) giữ nguyên.
 */
export function computeClassingByWeight(values: number[]): NumericScale {
  const pool = values.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b);
  if (pool.length === 0)
    return { kind: "numeric", breaks: [], zeroClass: false, max: null, counts: [], n: 0, nNull: 0, diverge: null };

  const total = pool.reduce((a, b) => a + b, 0);
  const breaks: number[] = [];
  let acc = 0;
  let i = 0;
  for (let k = 0; k < MAX_CLASSES; k++) {
    const target = (total * k) / MAX_CLASSES;
    while (i < pool.length - 1 && acc + pool[i]! < target) acc += pool[i++]!;
    const b = pool[i]!;
    if (breaks.length === 0 || b > breaks[breaks.length - 1]!) breaks.push(b);
  }
  return {
    kind: "numeric",
    breaks,
    zeroClass: false,
    max: pool[pool.length - 1]!,
    counts: tally(pool, breaks),
    n: pool.length,
    nNull: 0,
    diverge: null,
  };
}

/**
 * Dựng `Scale` cho một trường bất kỳ — §6a.
 *
 * Quy tắc 4: bool → 2 bậc. Quy tắc 5: hạng mục → bậc lạnh, KHÔNG dùng ramp tuần tự, vì
 * thứ tự ở đó không có nghĩa. Cả hai vẫn chỉ tô MỘT trường mỗi lúc (ràng buộc 2).
 */
export function buildScale(
  kind: "numeric" | "bool" | "categorical",
  values: CellValue[],
  /** Khai báo phân kỳ của trường (`FieldMeta.diverge`) — vắng thì chia bậc tuần tự. */
  diverge?: Diverge | null,
): Scale {
  if (kind === "numeric") {
    const nums = values.map((v) => (typeof v === "number" ? v : null));
    return diverge ? computeDivergingClassing(nums, diverge) : computeClassing(nums);
  }
  if (kind === "bool") {
    const counts: [number, number] = [0, 0];
    let nNull = 0;
    for (const v of values) {
      if (v === null || v === undefined) nNull++;
      else if (v) counts[1]++;
      else counts[0]++;
    }
    return { kind: "bool", n: counts[0] + counts[1], nNull, counts };
  }
  const tally = new Map<string, number>();
  let nNull = 0;
  for (const v of values) {
    if (v === null || v === undefined) nNull++;
    else tally.set(String(v), (tally.get(String(v)) ?? 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return {
    kind: "categorical",
    categories: sorted.map(([k]) => k),
    counts: sorted.map(([, c]) => c),
    n: sorted.reduce((s, [, c]) => s + c, 0),
    nNull,
  };
}

/** Số bậc thật của một scale — legend hiện đúng chừng này swatch, không độn (§6a-3). */
export function classCount(s: Scale): number {
  return s.kind === "numeric" ? s.breaks.length : s.kind === "bool" ? 2 : s.categories.length;
}

/**
 * Màu của từng bậc. Bản đồ và legend cùng gọi hàm này — không có đường nào khác.
 *
 * Trường hạng mục có nhiều hơn 3 hạng mục thì màu lạnh sẽ lặp lại; hai trường hạng mục
 * hiện có (`pop_source` 3 · `evidence_grade_distance` 3 · `cell_state` 2) đều không chạm
 * ngưỡng đó. Nếu một ngày nào đó chạm, đây là chỗ phải nghĩ lại chứ không phải chỗ để
 * âm thầm lặp màu.
 */
export function scaleColors(s: Scale, theme?: AnalysisTheme): RGB[] {
  const palette = getThemePalette(theme);
  if (s.kind === "bool") return [palette.rgb[1]!, palette.rgb[5]!]; // c2, c6 — §6a quy tắc 4
  if (s.kind === "categorical") return s.categories.map((_, i) => COLD_RGB[i % COLD_RGB.length]!);
  const div = divergingSwatches(s, theme);
  if (div) return div.hex.map(hexToRgb);
  // Khi số bậc thật < 7, trải các bậc còn lại đều trên toàn ramp để vẫn dùng hết biên độ
  // nhạt→đậm thay vì dồn về đầu ramp.
  const n = s.breaks.length;
  return s.breaks.map(
    (_, k) => palette.rgb[n <= 1 ? palette.rgb.length - 1 : Math.round((k / (n - 1)) * (palette.rgb.length - 1))]!,
  );
}

/**
 * Sáu ô màu của một thang PHÂN KỲ, xếp theo thứ tự bậc (thấp → cao). `null` nếu thang này
 * không phân kỳ, hoặc theme không có cánh can thiệp (`ThemePalette.diverge === null`).
 *
 * Rơi về `null` là rơi về thang tuần tự — thấy được ngay trên màn hình, chứ không phải một
 * bảng màu sai lặng lẽ. `test/diverging.test.ts` chặn để không trường nào rơi vào đó.
 */
function divergingSwatches(
  s: Scale,
  theme?: AnalysisTheme,
): { hex: string[]; ink: string[] } | null {
  if (s.kind !== "numeric" || !s.diverge) return null;
  const arm = getThemePalette(theme).diverge;
  if (!arm) return null;
  const cool = { hex: DIVERGE_NEUTRAL_HEX, ink: DIVERGE_NEUTRAL_INK };
  const below = s.diverge.hue === "below" ? arm : cool;
  const above = s.diverge.hue === "above" ? arm : cool;
  const nBelow = s.diverge.index;
  const nAbove = s.breaks.length - nBelow;
  return {
    // Cánh khai theo chiều SÁT MỐC → XA MỐC, còn `breaks` chạy thấp → cao: nên phía dưới
    // phải đảo lại (xa mốc đứng trước), phía trên thì giữ nguyên. Đảo nhầm là lật cả nghĩa
    // "càng xa mốc càng đậm".
    hex: [...steps(below.hex, nBelow).reverse(), ...steps(above.hex, nAbove)],
    ink: [...steps(below.ink, nBelow).reverse(), ...steps(above.ink, nAbove)],
  };
}

/** `n` bậc trải đều trên một cánh 3 bậc — cùng luật với ramp tuần tự khi bậc bị gộp (§6a-3). */
function steps(arm: readonly string[], n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [arm[arm.length - 1]!];
  return Array.from({ length: n }, (_, i) => arm[Math.round((i / (n - 1)) * (arm.length - 1))]!);
}

/**
 * Cực tính của một trường — DESIGN.md M2.1-(B).
 *
 * Vấn đề nó giải: hai trường xã dùng CÙNG ramp để nói NGƯỢC nhau. `dist_station_*`
 * nhạt = TỐT (gần trạm); `ports_per_10k_pop` nhạt = XẤU (ít cổng trên đầu người). Người
 * xem đọc gestalt màu trước khi đọc câu đơn vị, nên lật qua lại hai trường liền kề trong
 * một danh sách là đọc sai một trong hai.
 */
export type Polarity = "high-bad" | "high-good";

/**
 * Màu + mực cho từng bậc, đã áp cực tính và theo theme của cảnh.
 *
 * `high-good` thì **đảo thứ tự gán**, để bất biến duy nhất mà mắt cần nhớ là:
 *
 * > **ĐẬM = CHỖ CẦN CAN THIỆP**, ở mọi bản đồ.
 *
 * Đây là đảo ÁNH XẠ giá trị→bậc, không phải đảo bản thân ramp: vẫn đúng 7 hex đã PASS
 * validator, nên §4a còn nguyên và không có màu mới nào cần đo lại. Đó cũng là lý do
 * chọn cách này thay vì một ramp phân kỳ (xem M2.1-B).
 *
 * Chỉ áp cho thang SỐ. Bool và hạng mục không có "nhiều/ít" để đảo — hạng mục còn dùng
 * bậc lạnh chứ không dùng ramp (§6a-5).
 *
 * Thang PHÂN KỲ đi thẳng qua đây không đảo gì: bảng màu của nó đã tự nói phía nào cần can
 * thiệp bằng SẮC (§4f), nên áp thêm cực tính là đảo hai lần theo hai luật khác nhau.
 */
export function rampFor(s: Scale, polarity?: Polarity, theme?: AnalysisTheme): { colors: RGB[]; inks: string[] } {
  const colors = scaleColors(s, theme);
  const inks = scaleInks(s, theme);
  if (s.kind !== "numeric" || s.diverge || polarity !== "high-good") return { colors, inks };
  // Đảo CẢ HAI, cùng lúc: mực chữ phải đi theo swatch của nó, nếu không §4c gãy và chữ
  // trắng rơi lên nền nhạt.
  return { colors: [...colors].reverse(), inks: [...inks].reverse() };
}

/** Mực chữ đè lên từng swatch — §4c. Đi kèm `scaleColors`, cùng thứ tự. */
export function scaleInks(s: Scale, theme?: AnalysisTheme): string[] {
  const palette = getThemePalette(theme);
  if (s.kind === "bool") return [palette.ink[1]!, palette.ink[5]!];
  if (s.kind === "categorical") return s.categories.map((_, i) => COLD_INK[i % COLD_INK.length]!);
  const div = divergingSwatches(s, theme);
  if (div) return div.ink;
  const n = s.breaks.length;
  return s.breaks.map(
    (_, k) => palette.ink[n <= 1 ? palette.ink.length - 1 : Math.round((k / (n - 1)) * (palette.ink.length - 1))]!,
  );
}

/** Bậc của một giá trị, hoặc `null` nếu không có giá trị. */
export function classOf(value: CellValue, s: Scale): number | null {
  if (value === null || value === undefined) return null;
  if (s.kind === "bool") return typeof value === "boolean" ? (value ? 1 : 0) : null;
  if (s.kind === "categorical") {
    const i = s.categories.indexOf(String(value));
    return i < 0 ? null : i;
  }
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (s.breaks.length === 0) return null;
  if (s.zeroClass && value === 0) return 0;
  let idx = 0;
  for (let i = 0; i < s.breaks.length; i++) if (value >= s.breaks[i]!) idx = i;
  return idx;
}

/**
 * ĐƯỜNG VÀO DUY NHẤT từ giá trị sang màu.
 * Trả `null` khi không có giá trị — người gọi phải vẽ gạch chéo, KHÔNG được thay bằng 0.
 */
export function colorFor(value: CellValue, s: Scale, theme?: AnalysisTheme): RGB | null {
  const k = classOf(value, s);
  if (k === null) return null;
  return scaleColors(s, theme)[k] ?? null;
}

/** Nhãn ngưỡng cho legend — in giá trị thật, không in "bậc 1..7". DESIGN.md §3b. */
/**
 * `formatBreak` không biết ĐƠN VỊ, nên nó chỉ rút gọn được theo độ lớn của từng số một —
 * và một dải chú giải dựng bằng nó sẽ trộn hai đơn vị (`600` cạnh `1 ng`). Chú giải nay đi
 * qua `units.ts` (`scaleUnit` → `withDigits` → `formatSeries`), nơi thang chọn một lần cho
 * cả dải. Hàm này còn lại cho các con số ĐỨNG RIÊNG, chỗ không có dải nào để mà thống nhất.
 *
 * `formatRatioBreak` từng đứng cạnh đây, in phần trăm cho trường mà `isRatioField()` đoán
 * là tỉ lệ. Cả hai đã bị xoá cùng lúc: `unit.kind` nói thẳng ra điều mà phép đoán phải mò.
 */
export function formatBreak(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ng`;
  if (a >= 10) return v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  if (a >= 1) return v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  // Giá trị nhỏ phải giữ đủ chữ số có nghĩa: làm tròn 0,00047 thành "0" sẽ tạo ra hai
  // swatch cùng đọc là "0" và biến một ngưỡng thật thành ngưỡng giả.
  const digits = Math.min(8, Math.max(2, 2 - Math.floor(Math.log10(a))));
  return v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}
