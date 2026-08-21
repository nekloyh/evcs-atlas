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
import {
  COLD_HEX as TOKEN_COLD_HEX,
  COLOR_BASEMAP,
  COLOR_HAIRLINE,
  COLOR_INK,
  COLOR_INK_2,
  COLOR_INK_MUTED,
  COLOR_SELECT,
  COLOR_SELECT_CASING,
  DEFAULT_RAMP_HEX,
} from "../design-tokens";

export type RGB = [number, number, number];

export type ScaleMode = "binned" | "gradient";
export type ScaleTransform = "linear" | "sqrt";
export type ScaleClip = { lo: "min" | 0; hi: "p99" | "none" };

export type ScaleContract =
  | { color: "toggle"; transform: ScaleTransform; clip: ScaleClip }
  | { color: "fixed-binned"; transform: ScaleTransform; clip: ScaleClip; reason: string };

export interface NumericDomain {
  lo: number;
  hi: number;
  median: number;
  min: number;
  max: number;
  nClippedLow: number;
  nClippedHigh: number;
}

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
export const RAMP_HEX = DEFAULT_RAMP_HEX;

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
      "#feeea3",
      "#ffbd56",
      "#f98827",
      "#e5521c",
      "#c22819",
      "#950c12",
      "#66000d",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#feeea3",
      "#ffbd56",
      "#f98827",
      "#e5521c",
      "#c22819",
      "#950c12",
      "#66000d",
    ].map(hexToRgb),
    series: "#e5521c",
    diverge: { hex: ["#f88425", "#d5351d", "#920b12"], ink: ["#0b0b0b", "#ffffff", "#ffffff"] },
  },
  supply: {
    // CARTO Mint / Teal-Cyan (Hạ tầng, Năng lượng sạc)
    hex: [
      "#8dcfbf",
      "#60b8a7",
      "#34a091",
      "#1f8376",
      "#126a60",
      "#075049",
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
      "#8dcfbf",
      "#60b8a7",
      "#34a091",
      "#1f8376",
      "#126a60",
      "#075049",
      "#023834",
    ].map(hexToRgb),
    series: "#1f8376",
    // Xanh mòng gần cánh xám-lam quá: cặp giáp mốc chỉ ΔE 9,2 (thường) và 6,4 (deutan),
    // dưới sàn 15 của cổng hạng mục. Không có trường phân kỳ nào thuộc cảnh này.
    diverge: null,
  },
  utilization: {
    // CARTO Purp / Magenta-Fuchsia (Tải trạm, Telemetry, Cường độ sạc)
    hex: [
      "#e2b6e8",
      "#ce8fd8",
      "#b669c4",
      "#9c45ab",
      "#7e258e",
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
      "#e2b6e8",
      "#ce8fd8",
      "#b669c4",
      "#9c45ab",
      "#7e258e",
      "#5c0e6c",
      "#38004d",
    ].map(hexToRgb),
    series: "#9c45ab",
    // Tím ↔ xám-lam là cặp mù màu kinh điển: giáp mốc còn **ΔE 0,3** dưới protan/deutan —
    // hai bên mốc thành CÙNG MỘT MÀU với người mù màu đỏ-lục.
    diverge: null,
  },
  accessibility: {
    // CARTO BluYl / Indigo-Cobalt (Mạng lưới đường, Khoảng cách tiếp cận)
    hex: [
      "#a2bfe4",
      "#75a1db",
      "#4c82cd",
      "#2e63b8",
      "#1c449a",
      "#0e2877",
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
      "#a2bfe4",
      "#75a1db",
      "#4c82cd",
      "#2e63b8",
      "#1c449a",
      "#0e2877",
      "#06134a",
    ].map(hexToRgb),
    series: "#2e63b8",
    // Cùng sắc với cánh xám-lam (ΔE 1,9 giáp mốc) và đè luôn lên họ COLD của overlay
    // (ΔE 5,4). Cảnh này phải đổi cánh trung tính sang họ khác trước khi có trường phân kỳ.
    diverge: null,
  },
  "urban-context": {
    // CARTO Emerald / Forest-Sage (Môi trường đô thị, Đất, POI)
    hex: [
      "#abdc9e",
      "#7cc575",
      "#4eac53",
      "#33903c",
      "#1e742b",
      "#0e581d",
      "#053d11",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#abdc9e",
      "#7cc575",
      "#4eac53",
      "#33903c",
      "#1e742b",
      "#0e581d",
      "#053d11",
    ].map(hexToRgb),
    series: "#33903c",
    diverge: { hex: ["#6ebe6a", "#328f3b", "#105d1f"], ink: ["#0b0b0b", "#0b0b0b", "#ffffff"] },
  },
  screening: {
    // CARTO Gold-Bronze / Amber (Biên lọc, So sánh, Tiêu chí)
    hex: [
      "#ffe5a1",
      "#f9be3f",
      "#e49a18",
      "#c77a07",
      "#a75e01",
      "#844600",
      "#613000",
    ],
    ink: [
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#0b0b0b",
      "#ffffff",
      "#ffffff",
      "#ffffff",
    ],
    rgb: [
      "#ffe5a1",
      "#f9be3f",
      "#e49a18",
      "#c77a07",
      "#a75e01",
      "#844600",
      "#613000",
    ].map(hexToRgb),
    series: "#c77a07",
    diverge: { hex: ["#e19616", "#ae6402", "#753c00"], ink: ["#0b0b0b", "#ffffff", "#ffffff"] },
  },
  exploration: {
    // Ramp mặc định (Cam Hổ Phách / CARTO OrYel Classic)
    hex: RAMP_HEX,
    ink: RAMP_INK,
    rgb: RAMP_RGB,
    series: "#b74817",
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

interface Oklch {
  l: number;
  c: number;
  h: number;
}

interface Oklab {
  l: number;
  a: number;
  b: number;
}

const LUT_SIZE = 256;

function srgbToLinear(v: number): number {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
  return x * 255;
}

function rgbToOklab(rgb: RGB): Oklab {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgbRaw(lab: Oklab): RGB {
  const l = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function labToLch(lab: Oklab): Oklch {
  return { l: lab.l, c: Math.hypot(lab.a, lab.b), h: Math.atan2(lab.b, lab.a) };
}

function lchToLab(lch: Oklch): Oklab {
  return { l: lch.l, a: lch.c * Math.cos(lch.h), b: lch.c * Math.sin(lch.h) };
}

function inGamut(rgb: RGB): boolean {
  return rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 255);
}

/** Preserve OKLCH lightness and hue; reduce only chroma until the color is in sRGB gamut. */
function lchToRgb(lch: Oklch): RGB {
  let rgb = oklabToRgbRaw(lchToLab(lch));
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = lch.c;
    for (let i = 0; i < 20; i++) {
      const c = (lo + hi) / 2;
      const candidate = oklabToRgbRaw(lchToLab({ ...lch, c }));
      if (inGamut(candidate)) {
        lo = c;
        rgb = candidate;
      } else hi = c;
    }
  }
  // Keep sub-channel precision in the LUT. Rounding 256 samples to 8-bit creates repeated
  // lightness steps even when the OKLCH path is strictly monotonic; Deck.gl and CSS both
  // accept fractional sRGB channels and quantize only at the final framebuffer.
  return [
    Math.min(255, Math.max(0, rgb[0])),
    Math.min(255, Math.max(0, rgb[1])),
    Math.min(255, Math.max(0, rgb[2])),
  ];
}

function shorterHue(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function interpolateLch(a: Oklch, b: Oklch, t: number): Oklch {
  return { l: a.l + (b.l - a.l) * t, c: a.c + (b.c - a.c) * t, h: shorterHue(a.h, b.h, t) };
}

function labDistance(a: Oklab, b: Oklab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function relativeLuminance(rgb: RGB): number {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const BASEMAP_LUMINANCE = relativeLuminance(hexToRgb(COLOR_BASEMAP));

export function contrastAgainstBasemap(rgb: RGB): number {
  const l = relativeLuminance(rgb);
  return (Math.max(l, BASEMAP_LUMINANCE) + 0.05) / (Math.min(l, BASEMAP_LUMINANCE) + 0.05);
}

/**
 * Interpolate every declared anchor in OKLCH, then re-sample by perceptual arc length.
 *
 * KHÔNG có bước cắt/sửa nào ở đây: LUT[0] chính là anchor đầu và LUT[255] là anchor cuối
 * của danh sách được khai. Bản đầu tiên từng âm thầm cắt đầu nhạt cho tới điểm tương phản
 * 2:1 — QA 2.1-001 bác cách đó vì nó tạo một endpoint không nằm trong registry và làm cổng
 * kiểm chạy trên output đã sửa. Việc "đầu nhạt phải đạt 2:1" nay là chuyện của DANH SÁCH
 * ANCHOR NGUỒN (`SEQUENTIAL_GRADIENT_ANCHORS` + `gradientAvailability`), không phải của
 * hàm nội suy.
 */
function buildLut(anchors: readonly string[]): RGB[] {
  const lch = anchors.map((h) => labToLch(rgbToOklab(hexToRgb(h))));
  const path: RGB[] = [];
  for (let segment = 0; segment < lch.length - 1; segment++) {
    for (let i = 0; i < 64; i++) {
      if (segment > 0 && i === 0) continue;
      path.push(lchToRgb(interpolateLch(lch[segment]!, lch[segment + 1]!, i / 63)));
    }
  }
  const labs = path.map(rgbToOklab);
  const distance = [0];
  for (let i = 1; i < labs.length; i++) {
    distance.push(distance[i - 1]! + labDistance(labs[i - 1]!, labs[i]!));
  }
  const total = distance[distance.length - 1] ?? 0;
  if (total === 0) return Array.from({ length: LUT_SIZE }, () => path[0] ?? [0, 0, 0]);
  return Array.from({ length: LUT_SIZE }, (_, i) => {
    const target = (i / (LUT_SIZE - 1)) * total;
    let hi = 1;
    while (hi < distance.length && distance[hi]! < target) hi++;
    const lo = Math.max(0, hi - 1);
    const span = (distance[hi] ?? total) - distance[lo]!;
    const t = span > 0 ? (target - distance[lo]!) / span : 0;
    return lchToRgb(interpolateLch(
      labToLch(labs[lo]!),
      labToLch(labs[Math.min(hi, labs.length - 1)]!),
      t,
    ));
  });
}

/**
 * Anchor NGUỒN của gradient TUẦN TỰ — bảng khai thứ hai bên cạnh `THEME_PALETTES`, và nó
 * tồn tại vì hai chế độ chịu hai cổng khác nhau trên cùng một đầu nhạt:
 *
 *   · Ở chế độ BẬC, bậc c1 là một Ô legend có chữ đè lên (cổng là mực ≥ 4,5:1) — bản thân
 *     màu nhạt không cần 2:1 với nền, và mọi hex của `THEME_PALETTES` giữ nguyên byte để
 *     không đụng vào một pixel nào của Phase 2/4 đã QA.
 *   · Ở chế độ GRADIENT, đầu nhạt là một ĐIỂM DỮ LIỆU trên bản đồ, và điểm dưới 2:1 với nền
 *     `#f2f3f0` là điểm vô hình. Đo trên anchor gốc: demand 1,05 · supply 1,60 ·
 *     utilization 1,56 · accessibility 1,70 · urban-context 1,40 — CẢ NĂM đều rớt sàn,
 *     không chỉ screening (1,11) như spec §3 dự đoán.
 *
 * Nên đầu nhạt được TÁI NEO CÓ KHAI BÁO: mỗi hex đầu dưới đây là giao điểm 2,0:1 đo trên
 * chính đường cong OKLCH của theme đó (Viénot/WCAG, cùng công thức `contrastAgainstBasemap`),
 * làm tròn về phía đậm để hex 8-bit vẫn ≥ 2,0. Các anchor gốc còn nằm DƯỚI giao điểm bị
 * thay bằng giao điểm (demand và urban-context mất anchor thứ hai vì cả nó cũng dưới sàn —
 * vì thế hai theme đó còn 6 anchor). Đuôi đậm giữ nguyên từng byte của `THEME_PALETTES`.
 *
 * `screening` là `null` CÓ CHỦ Ý — spec §3/§8-3 ghim nó là nợ đã biết, bị CHẶN gradient
 * tuần tự cho tới khi được tái neo qua cổng validate_palette; test mã hoá kỳ vọng đó.
 */
export const SEQUENTIAL_GRADIENT_ANCHORS: Record<AnalysisTheme, readonly string[] | null> = {
  demand: ["#fb942f", ...THEME_PALETTES.demand.hex.slice(2)], // giao điểm 2,0103:1
  supply: ["#69bcac", ...THEME_PALETTES.supply.hex.slice(1)], // 2,0079:1
  utilization: ["#d39adc", ...THEME_PALETTES.utilization.hex.slice(1)], // 2,0003:1
  accessibility: ["#8cb0e0", ...THEME_PALETTES.accessibility.hex.slice(1)], // 2,0054:1
  "urban-context": ["#73bf6d", ...THEME_PALETTES["urban-context"].hex.slice(2)], // 2,0053:1
  screening: null,
  exploration: THEME_PALETTES.exploration.hex, // anchor gốc đã 2,037:1 — không cần tái neo
};

export interface ThemeLuts {
  sequential: readonly RGB[] | null;
  intervention: readonly RGB[] | null;
  neutral: readonly RGB[];
}

function lutsFor(theme: AnalysisTheme): ThemeLuts {
  const palette = THEME_PALETTES[theme];
  const anchors = SEQUENTIAL_GRADIENT_ANCHORS[theme];
  return {
    sequential: anchors ? buildLut(anchors) : null,
    intervention: palette.diverge ? buildLut(palette.diverge.hex) : null,
    neutral: buildLut(DIVERGE_NEUTRAL_HEX),
  };
}

export const THEME_LUTS: Record<AnalysisTheme, ThemeLuts> = {
  demand: lutsFor("demand"),
  supply: lutsFor("supply"),
  utilization: lutsFor("utilization"),
  accessibility: lutsFor("accessibility"),
  "urban-context": lutsFor("urban-context"),
  screening: lutsFor("screening"),
  exploration: lutsFor("exploration"),
};

// ── Cổng gradient: ĐO ở module scope, không hardcode theo tên theme ─────────────────────
//
// Hai cổng, hai phép đo, cùng chạy một lần lúc nạp module (như LUT):
//   · TUẦN TỰ — anchor nguồn đầu tiên phải ≥ 2,0:1 với nền bản đồ (sàn §3 của CR).
//   · PHÂN KỲ — cặp màu GIÁP MỐC (anchor sát mốc của cánh can thiệp vs cánh xám-lam) phải
//     giữ ΔE ≥ 15 dưới cả ba cách nhìn: thường, deutan, protan (§4f + acceptance test 5).
//     Nhờ endpoint identity của `buildLut`, đo trên anchor chính là đo trên LUT sample.

/** Sàn ΔE (Oklab ×100) cho cặp màu giáp mốc phân kỳ — cổng hạng mục §4f. */
export const PIVOT_MIN_DELTA_E = 15;

/**
 * Mô phỏng mù màu đỏ-lục theo Viénot–Brettel–Mollon 1999 trên RGB tuyến tính.
 * Chỉ hai loại đỏ-lục: tritan hiếm hơn hai bậc và §4f không đặt cổng cho nó.
 */
export function simulateCvd(rgb: RGB, kind: "deutan" | "protan"): RGB {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  const L = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b;
  const M = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b;
  const S = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b;
  const L2 = kind === "protan" ? 1.05118294 * M - 0.05116099 * S : L;
  const M2 = kind === "deutan" ? 0.9513092 * L + 0.04866992 * S : M;
  const clamp = (v: number) => Math.min(255, Math.max(0, linearToSrgb(v)));
  return [
    clamp(5.47221206 * L2 - 4.6419601 * M2 + 0.16963708 * S),
    clamp(-1.1252419 * L2 + 2.29317094 * M2 - 0.1678952 * S),
    clamp(0.02980165 * L2 - 0.19318073 * M2 + 1.16364789 * S),
  ];
}

/** Khoảng cách Oklab ×100 — cùng thang với các số đo §4f đã ghi trong file này (9,2 · 6,4 · 0,3). */
export function oklabDeltaE(a: RGB, b: RGB): number {
  return labDistance(rgbToOklab(a), rgbToOklab(b)) * 100;
}

type GradientGate = { allowed: true } | { allowed: false; reason: string };

function measureSequentialGate(theme: AnalysisTheme): GradientGate {
  const anchors = SEQUENTIAL_GRADIENT_ANCHORS[theme];
  if (!anchors || contrastAgainstBasemap(hexToRgb(anchors[0]!)) < 2) {
    return {
      allowed: false,
      reason: "Đầu sáng của bảng màu này chưa đạt tương phản 2:1 với nền bản đồ.",
    };
  }
  return { allowed: true };
}

function measureDivergingGate(theme: AnalysisTheme): GradientGate {
  const arm = THEME_PALETTES[theme].diverge;
  if (!arm) {
    return { allowed: false, reason: "Bảng phân kỳ của bảng màu này chưa qua cổng tương phản." };
  }
  const nearPivot = hexToRgb(arm.hex[0]);
  const neutral = hexToRgb(DIVERGE_NEUTRAL_HEX[0]);
  const passes =
    oklabDeltaE(nearPivot, neutral) >= PIVOT_MIN_DELTA_E &&
    (["deutan", "protan"] as const).every(
      (kind) => oklabDeltaE(simulateCvd(nearPivot, kind), simulateCvd(neutral, kind)) >= PIVOT_MIN_DELTA_E,
    );
  return passes
    ? { allowed: true }
    : {
        allowed: false,
        reason: "Cặp màu giáp mốc của bảng này không giữ được ΔE ≥ 15 dưới mù màu đỏ-lục.",
      };
}

const THEME_LIST = Object.keys(THEME_LUTS) as AnalysisTheme[];
const SEQUENTIAL_GATES = Object.fromEntries(
  THEME_LIST.map((theme) => [theme, measureSequentialGate(theme)]),
) as Record<AnalysisTheme, GradientGate>;
const DIVERGING_GATES = Object.fromEntries(
  THEME_LIST.map((theme) => [theme, measureDivergingGate(theme)]),
) as Record<AnalysisTheme, GradientGate>;

/**
 * Gradient có được BẬT cho theme này không — kết quả ĐO, không phải một danh sách tên.
 * `screening` tuần tự rớt vì không có anchor tái neo (nợ §3); `exploration` phân kỳ rớt vì
 * cặp giáp mốc chỉ còn ΔE 13,9 dưới protan — không trường phân kỳ nào đang dùng theme đó,
 * nhưng cổng phải chặn trước khi có trường đầu tiên chứ không phải sau.
 */
export function gradientAvailability(theme: AnalysisTheme, diverging: boolean): { allowed: boolean; reason?: string } {
  return diverging ? DIVERGING_GATES[theme] : SEQUENTIAL_GATES[theme];
}

export function getThemePalette(theme?: AnalysisTheme): ThemePalette {
  return THEME_PALETTES[theme ?? "exploration"] ?? THEME_PALETTES.exploration;
}

export function seriesColorForTheme(theme?: AnalysisTheme): string {
  return getThemePalette(theme).series;
}

/** Họ màu lạnh dùng chung cho MỌI overlay. Danh tính overlay đến từ hình học. */
export const COLD_HEX = TOKEN_COLD_HEX;

/**
 * Mực chữ đè lên swatch lạnh — cùng phép đo với RAMP_INK (§4c), chạy trên cùng công thức
 * tương phản WCAG: 5,41 · 6,63 · 11,95. Mọi ô ≥ 4,5:1.
 */
export const COLD_INK = ["#0b0b0b", "#ffffff", "#ffffff"] as const;

export const HATCH_HEX = "#898781"; // nét gạch chéo cho ô null
export const BASEMAP_HEX = COLOR_BASEMAP;
export const HAIRLINE_HEX = COLOR_HAIRLINE;

/**
 * Mực MỜ cho CHỮ trong biểu đồ — nhãn trục, mốc "trung vị", dòng đọc số.
 *
 * Cùng một giá trị với `--color-ink-muted` của `index.css`, và nó ở đây vì Observable Plot
 * nhận màu bằng chuỗi chứ không đọc được biến CSS. Trước đợt 17/8/2026 có **tám** bản chép
 * `const INK_MUTED = "#898781"` nằm rải trong `ui/`, tức tám chỗ phải nhớ sửa khi token đổi
 * — và chúng đã lệch khỏi token thật ngay ở lần đổi đầu tiên.
 *
 * KHÁC `HATCH_HEX` một cách có chủ ý dù hai giá trị từng trùng nhau: vân null là **mark**
 * trên bản đồ, ΔE của nó với dải phân kỳ đã đo ở §4f trên đúng `#898781`; còn đây là CHỮ,
 * nên nó chịu cổng 4,5:1 (đo được 4,90:1 trên nền panel).
 */
export const INK_HEX = COLOR_INK;
export const INK_MUTED_HEX = COLOR_INK_MUTED;
export const INK_2_HEX = COLOR_INK_2;

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
export const SELECT_HEX = COLOR_SELECT;
export const SELECT_CASING_HEX = COLOR_SELECT_CASING;
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
  mode: ScaleMode;
  domain: NumericDomain;
  transform: ScaleTransform;
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
  mode: "binned";
  /** Bậc 0 = false, bậc 1 = true. Hai bậc, dùng c2 và c6 — §6a quy tắc 4. */
  n: number;
  nNull: number;
  counts: [number, number];
}

export interface CategoricalScale {
  kind: "categorical";
  mode: "binned";
  /** Hạng mục xếp theo số ô giảm dần. Màu là bậc LẠNH, không phải ramp — §6a quy tắc 5. */
  categories: string[];
  counts: number[];
  n: number;
  nNull: number;
  /** Màu semantic cố định theo `categories`; vắng thì dùng palette hạng mục chung. */
  colors?: RGB[];
  inks?: string[];
}

export interface CategoricalContract {
  order: readonly string[];
  colors: readonly string[];
  inks: readonly string[];
}

/** Cách một trường được chia bậc. Một `Scale` phục vụ CẢ bản đồ lẫn legend — hai chỗ đó
 *  không được phép bất đồng về màu. */
export type Scale = NumericScale | BoolScale | CategoricalScale;

const MAX_CLASSES = 7;
const ZERO_SHARE_THRESHOLD = 0.05;
/** Số bậc MỖI PHÍA của thang phân kỳ. Bằng nhau hai bên là điều kiện để "cách mốc bao xa"
 *  đọc được bằng khoảng cách trên dải — lệch bậc thì cùng một quãng nói hai điều. */
const DIVERGING_PER_SIDE = 3;
const DEFAULT_SCALE_CONTRACT: ScaleContract = {
  color: "fixed-binned",
  transform: "linear",
  clip: { lo: "min", hi: "none" },
  reason: "Thang này chỉ hỗ trợ bậc.",
};

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

function emptyDomain(): NumericDomain {
  return { lo: 0, hi: 0, median: 0, min: 0, max: 0, nClippedLow: 0, nClippedHigh: 0 };
}

function domainFor(values: number[], contract: ScaleContract, diverge: Diverge | null): NumericDomain {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return emptyDomain();
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const lo = contract.clip.lo === 0 ? 0 : min;
  let hi: number;
  if (contract.clip.hi === "none") hi = max;
  else if (diverge) {
    const above = sorted.filter((v) => v >= diverge.at);
    hi = above.length ? quantile(above, 0.99) : diverge.at;
  } else hi = quantile(sorted, 0.99);
  if (!Number.isFinite(hi)) hi = max;
  return {
    lo,
    hi,
    median: quantile(sorted, 0.5),
    min,
    max,
    nClippedLow: sorted.reduce((n, v) => n + (v < lo ? 1 : 0), 0),
    nClippedHigh: sorted.reduce((n, v) => n + (v > hi ? 1 : 0), 0),
  };
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
    return {
      kind: "numeric", mode: "binned", domain: emptyDomain(), transform: "linear",
      breaks: [], zeroClass: false, max: null, counts: [], n: 0, nNull, diverge: null,
    };

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
    mode: "binned",
    domain: domainFor(present, DEFAULT_SCALE_CONTRACT, null),
    transform: "linear",
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
    mode: "binned",
    domain: domainFor(present, DEFAULT_SCALE_CONTRACT, d),
    transform: "linear",
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
    return {
      kind: "numeric", mode: "binned", domain: emptyDomain(), transform: "linear",
      breaks: [], zeroClass: false, max: null, counts: [], n: 0, nNull: 0, diverge: null,
    };

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
    mode: "binned",
    domain: domainFor(pool, DEFAULT_SCALE_CONTRACT, null),
    transform: "linear",
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
export interface ScaleBuildOptions {
  contract: ScaleContract;
  requestedMode?: ScaleMode;
  gradientAllowed?: boolean;
}

function numericScaleWithContract(
  scale: NumericScale,
  present: number[],
  options: ScaleBuildOptions,
): NumericScale {
  const requested = options.requestedMode ?? "binned";
  return {
    ...scale,
    // `scale.n > 0` là hợp đồng null (QA 2.1-004): tập rỗng/toàn-null không có miền số nào
    // để nội suy — `emptyDomain()` toàn số 0 là sentinel, và một dải gradient 0→0 sẽ trình
    // bày "không có dữ liệu" như một phép đo bằng 0 hợp lệ.
    mode:
      options.contract.color === "toggle" &&
      requested === "gradient" &&
      options.gradientAllowed !== false &&
      scale.n > 0
        ? "gradient"
        : "binned",
    domain: domainFor(present, options.contract, scale.diverge),
    transform: options.contract.transform,
  };
}

export function buildScale(
  kind: "numeric" | "bool" | "categorical",
  values: CellValue[],
  /** Khai báo phân kỳ của trường (`FieldMeta.diverge`) — vắng thì chia bậc tuần tự. */
  diverge?: Diverge | null,
  categorical?: CategoricalContract,
  options: ScaleBuildOptions = { contract: DEFAULT_SCALE_CONTRACT },
): Scale {
  if (kind === "numeric") {
    const nums = values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    const present = nums.filter((v): v is number => v !== null);
    return numericScaleWithContract(
      diverge ? computeDivergingClassing(nums, diverge) : computeClassing(nums),
      present,
      options,
    );
  }
  if (kind === "bool") {
    const counts: [number, number] = [0, 0];
    let nNull = 0;
    for (const v of values) {
      if (v === null || v === undefined) nNull++;
      else if (v) counts[1]++;
      else counts[0]++;
    }
    return { kind: "bool", mode: "binned", n: counts[0] + counts[1], nNull, counts };
  }
  const tally = new Map<string, number>();
  let nNull = 0;
  for (const v of values) {
    if (v === null || v === undefined) nNull++;
    else tally.set(String(v), (tally.get(String(v)) ?? 0) + 1);
  }
  const byFrequency = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const declared = categorical?.order.filter((key) => tally.has(key)) ?? [];
  const declaredSet = new Set(declared);
  const sorted = [
    ...declared.map((key) => [key, tally.get(key)!] as const),
    ...byFrequency.filter(([key]) => !declaredSet.has(key)),
  ];
  const colors = categorical
    ? sorted.map(([key]) => {
        const i = categorical.order.indexOf(key);
        return i >= 0 && categorical.colors[i] ? hexToRgb(categorical.colors[i]!) : COLD_RGB[0]!;
      })
    : undefined;
  const inks = categorical
    ? sorted.map(([key]) => {
        const i = categorical.order.indexOf(key);
        return i >= 0 && categorical.inks[i] ? categorical.inks[i]! : COLD_INK[0]!;
      })
    : undefined;
  return {
    kind: "categorical",
    mode: "binned",
    categories: sorted.map(([k]) => k),
    counts: sorted.map(([, c]) => c),
    n: sorted.reduce((s, [, c]) => s + c, 0),
    nNull,
    colors,
    inks,
  };
}

// ── Thang TUYỆT ĐỐI của lens Sử dụng ───────────────────────────────────────────
//
// `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §12.2.
//
// ── Vì sao thang này KHÔNG dựng từ dữ liệu ────────────────────────────────────────────
//
// Bản trước chia bậc theo PHÂN VỊ trên toàn bộ station-hour của gói đang mở. Nó đứng yên
// trong một phiên — đủ để scrub không đổi nghĩa màu — nhưng nó **không có nghĩa tuyệt đối
// xuyên tỉnh**, và điều đó đo được: cùng thuật toán cho Hà Nội các ngưỡng
// `0 · 0,015 · 8,3 · 16,7 · 25,8 · 36,8 · 52,4%` còn Lâm Đồng
// `0 · 0,036 · 2,6 · 5,6 · 10 · 16 · 26%`. Một vùng 20% là bậc c4 ở Hà Nội và bậc c6 ở Lâm
// Đồng. Với `Vùng tải` — nơi câu hỏi là "vùng nào có tỉ lệ cổng bận cao hơn" — một thang
// đổi nghĩa theo gói biến mọi so sánh giữa hai tỉnh thành sai.
//
// Hệ quả phải nói ra: **pixel màu đổi so với bản cũ**. Đó là migration có chủ ý (§23.3),
// không phải một lần tái sử dụng âm thầm ngưỡng phân vị cũ.
//
// ── Vì sao SQRT ──────────────────────────────────────────────────────────────────────
//
// Phân phối thật dồn về dải thấp: trung vị station-hour là 20,5% ở Hà Nội và 6,9% ở Lâm
// Đồng, còn aggregate vùng thì hầu như không bao giờ vượt 40%. Trên một thang tuyến tính
// `[0,1]`, hơn ba phần tư dữ liệu chen vào một phần ba đầu dải màu. `sqrt` dành nhiều
// khoảng cách tri giác hơn cho đúng dải phổ biến ấy, và nó là một phép ĐƠN ĐIỆU cố định —
// giá trị lớn hơn luôn cho màu đậm hơn, ở mọi giờ, mọi tỉnh, mọi mức phân giải.
//
// Nhãn tick vì thế đặt theo GIÁ TRỊ THÔ, không chia đều: chia đều nhãn trên một trục sqrt
// là in một trục tuyến tính lên một dải phi tuyến.

/**
 * Bảy khoảng TUYỆT ĐỐI. `breaks[i]` là ngưỡng DƯỚI của bậc `i`, bậc cuối là khoảng mở.
 *
 * `[0,5) [5,10) [10,20) [20,35) [35,55) [55,75) [75,100+]`
 *
 * Đây là **thang bản đồ cố định, không phải ngưỡng tốt/xấu.** 40% không có vị trí nào đặc
 * biệt ở đây và không được cấp một: ngưỡng sàng lọc 40% trả lời một câu hỏi khác
 * (`domain-thresholds.ts`), và mượn nó làm ngưỡng quá tải là khẳng định một điều mà dữ
 * liệu này — không có hàng đợi, không có thời gian chờ, không có SLA — không nói được.
 */
export const UTILIZATION_BREAKS: readonly number[] = [0, 0.05, 0.1, 0.2, 0.35, 0.55, 0.75];

/** Tick của dải gradient, theo giá trị THÔ. `sqrt` làm chúng KHÔNG cách đều trên dải. */
export const UTILIZATION_TICKS: readonly number[] = [0, 0.05, 0.1, 0.2, 0.35, 0.55, 0.75, 1];

/**
 * Thang tỉ lệ cổng bận — **hằng số của cách vẽ**, không phải dẫn xuất của gói đang mở.
 *
 * `values` chỉ dùng để ĐẾM (`counts`, `n`, `max`) cho legend nói được "≈ bao nhiêu
 * trạm-giờ mỗi bậc" và "bậc cuối thật ra chạy tới đâu". Chúng **không** đụng tới `breaks`
 * hay `domain`: bỏ hẳn `values` đi thì màu của mọi giá trị vẫn y nguyên.
 */
export function utilizationScale(values: readonly number[] = []): NumericScale {
  const present = values.filter((v) => Number.isFinite(v));
  const breaks = [...UTILIZATION_BREAKS];
  return {
    kind: "numeric",
    mode: "binned",
    // `lo: 0`/`hi: 1` là miền TUYỆT ĐỐI. Không `p99`, không `min`: nếu miền co theo dữ
    // liệu thì `sequentialPosition` sẽ trả về hai màu khác nhau cho cùng một tỉ lệ ở hai
    // gói, và cả lý do dựng thang này biến mất.
    domain: {
      lo: 0,
      hi: 1,
      median: present.length ? quantile([...present].sort((a, b) => a - b), 0.5) : 0,
      min: present.length ? Math.min(...present) : 0,
      max: present.length ? Math.max(...present) : 0,
      nClippedLow: 0,
      // Giá trị vượt 100% (không có trong ba gói đã audit) bị KẸP về endpoint khi tô, và
      // đếm ở đây để chỗ đọc số công bố được cờ `vượt mẫu số` thay vì im lặng sửa số.
      nClippedHigh: present.reduce((n, v) => n + (v > 1 ? 1 : 0), 0),
    },
    transform: "sqrt",
    breaks,
    // KHÔNG có bậc {0} riêng: `0` là một giá trị ĐO ĐƯỢC ("biết là không ai sạc"), và nó
    // đã khác `null` bằng chất liệu (vân xám) chứ không cần khác bằng một bậc màu. Tách
    // bậc {0} ra sẽ tiêu một trong bảy bậc cho một điểm duy nhất của trục.
    zeroClass: false,
    max: present.length ? Math.max(...present) : null,
    counts: tally(present, breaks),
    n: present.length,
    nNull: 0,
    diverge: null,
  };
}

/** Số bậc thật của một scale — legend hiện đúng chừng này swatch, không độn (§6a-3). */
export function classCount(s: Scale): number {
  return s.kind === "numeric" ? s.breaks.length : s.kind === "bool" ? 2 : s.categories.length;
}

/** Change only the encoding mode; domain/classing identity stays memoized with the dataset. */
export function applyScaleMode(
  scale: Scale,
  contract: ScaleContract,
  requested: ScaleMode,
  gradientAllowed: boolean,
): Scale {
  if (scale.kind !== "numeric") return scale;
  // Cùng luật n > 0 với `numericScaleWithContract` — xem chú thích ở đó (QA 2.1-004).
  const mode =
    contract.color === "toggle" && requested === "gradient" && gradientAllowed && scale.n > 0
      ? "gradient"
      : "binned";
  return scale.mode === mode ? scale : { ...scale, mode };
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
  if (s.kind === "categorical") return s.colors ?? s.categories.map((_, i) => COLD_RGB[i % COLD_RGB.length]!);
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
 * Cực tính không đảo ramp. Mọi thang tuần tự giữ một ngữ pháp duy nhất:
 * nhạt = ít, đậm = nhiều của đại lượng mang tên trong legend. Phán đoán tốt/xấu
 * nằm ở câu chữ, không đổi nghĩa của cùng một độ đậm giữa hai lens.
 *
 * Bool, hạng mục và thang phân kỳ cũng đi qua nguyên trạng.
 */
export function rampFor(s: Scale, _polarity?: Polarity, theme?: AnalysisTheme): { colors: RGB[]; inks: string[] } {
  const colors = scaleColors(s, theme);
  const inks = scaleInks(s, theme);
  return { colors, inks };
}

/** Mực chữ đè lên từng swatch — §4c. Đi kèm `scaleColors`, cùng thứ tự. */
export function scaleInks(s: Scale, theme?: AnalysisTheme): string[] {
  const palette = getThemePalette(theme);
  if (s.kind === "bool") return [palette.ink[1]!, palette.ink[5]!];
  if (s.kind === "categorical") return s.inks ?? s.categories.map((_, i) => COLD_INK[i % COLD_INK.length]!);
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
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (s.breaks.length === 0) return null;
  if (s.zeroClass && value === 0) return 0;
  let idx = 0;
  for (let i = 0; i < s.breaks.length; i++) if (value >= s.breaks[i]!) idx = i;
  return idx;
}

function transformed(x: number, transform: ScaleTransform): number {
  const clamped = Math.min(1, Math.max(0, x));
  return transform === "sqrt" ? Math.sqrt(clamped) : clamped;
}

export function sequentialPosition(value: number, scale: NumericScale): number {
  const { lo, hi } = scale.domain;
  if (!Number.isFinite(value)) return 0;
  if (!(hi > lo)) return value > hi ? 1 : 0;
  return transformed((Math.min(hi, Math.max(lo, value)) - lo) / (hi - lo), scale.transform);
}

/** Diverging color bars reserve exactly half their width for each arm. */
export function colorPosition(value: number, scale: NumericScale): number {
  const d = scale.diverge;
  if (!d) return sequentialPosition(value, scale);
  const { lo, hi } = scale.domain;
  if (value < d.at) {
    const span = d.at - lo;
    const magnitude = span > 0 ? (d.at - Math.max(lo, value)) / span : 0;
    return 0.5 * (1 - transformed(magnitude, scale.transform));
  }
  const span = hi - d.at;
  const magnitude = span > 0 ? (Math.min(hi, value) - d.at) / span : 0;
  return 0.5 + 0.5 * transformed(magnitude, scale.transform);
}

/** Shared continuous magnitude for elevation; diverging arms use one normalizer. */
export function elevationPosition(value: number, scale: NumericScale): number {
  const d = scale.diverge;
  if (!d) return sequentialPosition(value, scale);
  const { lo, hi } = scale.domain;
  const clipped = Math.min(hi, Math.max(lo, value));
  const span = Math.max(Math.abs(lo - d.at), Math.abs(hi - d.at));
  return span > 0 ? transformed(Math.abs(clipped - d.at) / span, scale.transform) : 0;
}

export interface GradientStop {
  color: RGB;
  /** CSS-position fraction on the legend bar. */
  position: number;
}

/**
 * Legend samples the exact module-scope LUTs used by `colorFor`; it never invents a CSS
 * interpolation space of its own. Diverging scales duplicate the pivot so the semantic
 * boundary remains a hard notch instead of blending the two arms into a third colour.
 */
export function gradientStops(
  scale: NumericScale,
  theme?: AnalysisTheme,
  sampleCount = 32,
): GradientStop[] {
  const count = Math.max(16, sampleCount);
  const activeTheme = theme ?? "exploration";
  const luts = THEME_LUTS[activeTheme];
  if (!scale.diverge) {
    const lut = luts.sequential;
    if (!lut) return [];
    return Array.from({ length: count }, (_, i) => ({
      color: lut[Math.round((i / (count - 1)) * (lut.length - 1))]!,
      position: i / (count - 1),
    }));
  }
  if (!luts.intervention) return [];
  const below = scale.diverge.hue === "below" ? luts.intervention : luts.neutral;
  const above = scale.diverge.hue === "below" ? luts.neutral : luts.intervention;
  const armCount = Math.max(8, Math.floor(count / 2));
  const stops: GradientStop[] = [];
  for (let i = 0; i < armCount; i++) {
    const p = i / (armCount - 1);
    stops.push({
      color: below[Math.round((1 - p) * (below.length - 1))]!,
      position: p * 0.5,
    });
  }
  for (let i = 0; i < armCount; i++) {
    const p = i / (armCount - 1);
    stops.push({
      color: above[Math.round(p * (above.length - 1))]!,
      position: 0.5 + p * 0.5,
    });
  }
  return stops;
}

/**
 * ĐƯỜNG VÀO DUY NHẤT từ giá trị sang màu.
 * Trả `null` khi không có giá trị — người gọi phải vẽ gạch chéo, KHÔNG được thay bằng 0.
 */
export function colorFor(value: CellValue, s: Scale, theme?: AnalysisTheme): RGB | null {
  if (s.kind === "numeric" && s.mode === "gradient") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const activeTheme = theme ?? "exploration";
    if (s.diverge) {
      const intervention = THEME_LUTS[activeTheme].intervention;
      if (!intervention) return null;
      const belowIntervention = s.diverge.hue === "below";
      const arm = value < s.diverge.at
        ? (belowIntervention ? intervention : THEME_LUTS[activeTheme].neutral)
        : (belowIntervention ? THEME_LUTS[activeTheme].neutral : intervention);
      const p = colorPosition(value, s);
      const magnitude = value < s.diverge.at ? 1 - p * 2 : (p - 0.5) * 2;
      return arm[Math.round(Math.min(1, Math.max(0, magnitude)) * (arm.length - 1))] ?? null;
    }
    const lut = THEME_LUTS[activeTheme].sequential;
    if (!lut) return null;
    return lut[Math.round(sequentialPosition(value, s) * (lut.length - 1))] ?? null;
  }
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
