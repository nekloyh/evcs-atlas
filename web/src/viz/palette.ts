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

export type RGB = [number, number, number];

/** Ramp choropleth: cam tuần tự, 7 bậc, nhạt → đậm. Đã PASS ordinal validator. */
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

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export const RAMP_RGB: RGB[] = RAMP_HEX.map(hexToRgb);
export const COLD_RGB: RGB[] = COLD_HEX.map(hexToRgb);
export const HATCH_RGB: RGB = hexToRgb(HATCH_HEX);
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
  n: number;
  nNull: number;
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
export function computeClassing(values: (number | null | undefined)[]): NumericScale {
  const present: number[] = [];
  let nNull = 0;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) nNull++;
    else present.push(v);
  }
  if (present.length === 0)
    return { kind: "numeric", breaks: [], zeroClass: false, max: null, n: 0, nNull };

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

  return { kind: "numeric", breaks, zeroClass, max: pool[pool.length - 1] ?? null, n: present.length, nNull };
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
    return { kind: "numeric", breaks: [], zeroClass: false, max: null, n: 0, nNull: 0 };

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
  return { kind: "numeric", breaks, zeroClass: false, max: pool[pool.length - 1]!, n: pool.length, nNull: 0 };
}

/**
 * Dựng `Scale` cho một trường bất kỳ — §6a.
 *
 * Quy tắc 4: bool → 2 bậc. Quy tắc 5: hạng mục → bậc lạnh, KHÔNG dùng ramp tuần tự, vì
 * thứ tự ở đó không có nghĩa. Cả hai vẫn chỉ tô MỘT trường mỗi lúc (ràng buộc 2).
 */
export function buildScale(kind: "numeric" | "bool" | "categorical", values: CellValue[]): Scale {
  if (kind === "numeric") {
    return computeClassing(values.map((v) => (typeof v === "number" ? v : null)));
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
export function scaleColors(s: Scale): RGB[] {
  if (s.kind === "bool") return [RAMP_RGB[1]!, RAMP_RGB[5]!]; // c2, c6 — §6a quy tắc 4
  if (s.kind === "categorical") return s.categories.map((_, i) => COLD_RGB[i % COLD_RGB.length]!);
  // Khi số bậc thật < 7, trải các bậc còn lại đều trên toàn ramp để vẫn dùng hết biên độ
  // nhạt→đậm thay vì dồn về đầu ramp.
  const n = s.breaks.length;
  return s.breaks.map(
    (_, k) => RAMP_RGB[n <= 1 ? RAMP_RGB.length - 1 : Math.round((k / (n - 1)) * (RAMP_RGB.length - 1))]!,
  );
}

/**
 * Cực tính của một trường — DESIGN.md M2.1-(B).
 *
 * Vấn đề nó giải: hai trường xã dùng CÙNG ramp cam để nói NGƯỢC nhau. `dist_station_*`
 * nhạt = TỐT (gần trạm); `ports_per_10k_pop` nhạt = XẤU (ít cổng trên đầu người). Người
 * xem đọc gestalt màu trước khi đọc câu đơn vị, nên lật qua lại hai trường liền kề trong
 * một danh sách là đọc sai một trong hai.
 */
export type Polarity = "high-bad" | "high-good";

/**
 * Màu + mực cho từng bậc, đã áp cực tính.
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
 */
export function rampFor(s: Scale, polarity?: Polarity): { colors: RGB[]; inks: string[] } {
  const colors = scaleColors(s);
  const inks = scaleInks(s);
  if (s.kind !== "numeric" || polarity !== "high-good") return { colors, inks };
  // Đảo CẢ HAI, cùng lúc: mực chữ phải đi theo swatch của nó, nếu không §4c gãy và chữ
  // trắng rơi lên nền nhạt.
  return { colors: [...colors].reverse(), inks: [...inks].reverse() };
}

/** Mực chữ đè lên từng swatch — §4c. Đi kèm `scaleColors`, cùng thứ tự. */
export function scaleInks(s: Scale): string[] {
  if (s.kind === "bool") return [RAMP_INK[1]!, RAMP_INK[5]!];
  if (s.kind === "categorical") return s.categories.map((_, i) => COLD_INK[i % COLD_INK.length]!);
  const n = s.breaks.length;
  return s.breaks.map(
    (_, k) => RAMP_INK[n <= 1 ? RAMP_INK.length - 1 : Math.round((k / (n - 1)) * (RAMP_INK.length - 1))]!,
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
export function colorFor(value: CellValue, s: Scale): RGB | null {
  const k = classOf(value, s);
  if (k === null) return null;
  return scaleColors(s)[k] ?? null;
}

/** Nhãn ngưỡng cho legend — in giá trị thật, không in "bậc 1..7". DESIGN.md §3b. */
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
