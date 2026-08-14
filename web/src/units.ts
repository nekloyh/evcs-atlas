/**
 * Token đơn vị đo — nguồn sự thật cho **cách in một con số** của mỗi trường.
 *
 * Trước file này, `FieldMeta.unit` là một chuỗi tự do, và 63 trường viết ra 30 cách khác
 * nhau — trong đó **bốn cách viết cho cùng một đơn vị mét**: `"mét"`, `"mét, theo mạng
 * đường"`, `"mét, đường chim bay"`, `"m, |đi − về|"`.
 *
 * Hệ quả ĐÃ NHÌN THẤY ĐƯỢC là ở dải chú giải. Không có đơn vị thì `formatBreak` chỉ biết
 * rút gọn theo độ lớn của TỪNG số, nên dải dân số in ra `0 · 100 · 200 · 600 · 1 ng ·
 * 1,8 ng · 3,4 ng` — bốn mốc đầu là người, ba mốc sau là nghìn người, trong cùng một
 * thang. Có `kind` thì thang chọn một lần cho cả dải: `0 · 0,1 · 0,2 · 0,6 · 1 · 1,8 ·
 * 3,4` với chữ "nghìn người" nói một lần ở mép.
 *
 * Hệ quả TIỀM ẨN là phép đoán kiểu. `isRatioField()` dò chuỗi `"0–1"` trong câu đơn vị;
 * nó bắt đúng `FRAC` và `util_cell` nhưng trượt `util_pctl_cell` ("phân vị…, 0,5 = trung
 * vị"). Chưa ai thấy lỗi ấy vì trường đó khai `map: false` nên không tô được — tức là một
 * quả mìn đã cài, không phải một đám cháy. Đo trực tiếp: đặt `#f=util_pctl_cell` thì hash
 * rơi về `commune:ports_per_10k_pop`, legend không bao giờ dựng.
 *
 * Hai phần tách bạch, và ranh giới giữa chúng là điều quan trọng nhất ở đây:
 *
 *   · `kind` — ĐƠN VỊ ĐO. Ổn định, là khoá của luật làm tròn.
 *   · `note` — CÂU CHỮ. Không ổn định, đổi vì lý do biên tập ("đường chim bay" → "cự ly
 *     thẳng"), nên nó **không được** làm khoá của bất cứ thứ gì.
 *
 * ── Vì sao chia thang MỘT LẦN cho cả ramp ──────────────────────────────────────
 *
 * Làm tròn từng ngưỡng độc lập thì `dist_station_network_m` in ra `0 · 320 · 850 · 1,4 km
 * · 3,1 km`: hai đơn vị trong một dải, và mắt phải quy đổi giữa hai ngưỡng cạnh nhau.
 * Chia thang theo giá trị LỚN NHẤT rồi in mọi ngưỡng trong cùng thang cho ra `0 · 0,3 ·
 * 0,9 · 1,4 · 3,1` với chữ "km" nói **một lần** ở câu đơn vị — đúng cách một chú giải bản
 * đồ giấy làm, và cũng là điều kiện để dải chú giải giữ được sự gọn mà chủ dự án đã yêu
 * cầu (bản có nhiều chữ bị bác: "rối hơn").
 */

import { formatBreak } from "./viz/palette";

/**
 * Đơn vị đo. Danh sách này là ĐÓNG: thêm một trường dùng đơn vị chưa có ở đây là fail
 * typecheck, chứ không phải lặng lẽ đẻ ra cách viết thứ 31.
 */
export type UnitKind =
  | "m"
  | "km2"
  | "person"
  | "ppkm2"
  | "poi"
  | "station"
  | "port"
  | "building"
  | "floor"
  | "kw"
  | "ratio"
  | "pctl"
  | "times"
  | "index";

export interface UnitSpec {
  kind: UnitKind;
  /**
   * Vế bổ nghĩa sau danh từ đơn vị — "theo mạng đường", "âm = chưa đủ xa".
   *
   * Đây là **copy**, không phải dữ liệu: nó tồn tại để câu ở legend đọc trọn nghĩa, và nó
   * không tham gia vào bất kỳ phép tính hay phép so sánh nào.
   */
  note?: string;
}

/** Thang đã chọn cho một ramp cụ thể: chia mọi ngưỡng cho `divisor`, gọi tên bằng `label`. */
export interface ScaledUnit {
  divisor: number;
  /** Danh từ đơn vị SAU khi chia. Rỗng = đại lượng không có danh từ (chỉ số thuần). */
  label: string;
  /**
   * Số chữ số thập phân **cố định cho cả dãy** — do `withDigits()` chốt. Vắng = mỗi giá
   * trị tự chọn theo độ lớn của nó, đúng cho một số đứng một mình.
   */
  digits?: number;
}

const PLAIN = (label: string): ScaledUnit => ({ divisor: 1, label });

/**
 * Bậc thang theo độ lớn — dùng chung cho mọi đại lượng ĐẾM ĐƯỢC có thể lên tới hàng triệu.
 *
 * Ngưỡng đổi thang là 10.000 chứ không phải 1.000: dưới 10.000 thì "8.400 người" vẫn đọc
 * trôi và giữ nguyên độ chính xác, còn "8,4 nghìn người" thì vừa dài hơn vừa mất một chữ số.
 */
function magnitudeScale(max: number, one: string, thousand: string, million: string): ScaledUnit {
  const a = Math.abs(max);
  if (a >= 1_000_000) return { divisor: 1_000_000, label: million };
  if (a >= 10_000) return { divisor: 1_000, label: thousand };
  return PLAIN(one);
}

/**
 * Chọn thang cho cả một ramp.
 *
 * `magnitude` là giá trị lớn nhất của thang — không phải một giá trị lẻ. Truyền một giá trị
 * lẻ vào đây là dựng hai thang khác nhau cho hai ngưỡng của cùng một dải.
 */
export function scaleUnit(u: UnitSpec | null, magnitude: number): ScaledUnit {
  if (!u) return PLAIN("");
  switch (u.kind) {
    case "m":
      // Mốc 1 km, không phải 1.000 m: đây là ngưỡng mà người đọc bản đồ đô thị tự đổi đơn
      // vị trong đầu, nên in theo nó là in theo cách người ta đã nghĩ.
      return Math.abs(magnitude) >= 1_000 ? { divisor: 1_000, label: "km" } : PLAIN("m");
    case "km2":
      return PLAIN("km²");
    case "person":
      return magnitudeScale(magnitude, "người", "nghìn người", "triệu người");
    case "ppkm2":
      return magnitudeScale(magnitude, "người/km²", "nghìn người/km²", "triệu người/km²");
    case "poi":
      return magnitudeScale(magnitude, "điểm", "nghìn điểm", "triệu điểm");
    case "station":
      return PLAIN("trạm");
    case "port":
      return PLAIN("cổng");
    case "building":
      return PLAIN("toà");
    case "floor":
      return magnitudeScale(magnitude, "tầng", "nghìn tầng", "triệu tầng");
    // Công suất giữ nguyên kW tới tận hàng triệu: MW là đơn vị của ngành truyền tải, còn
    // bảng này nói về công suất đặt tại một trạm sạc — đổi sang MW là đổi luôn hệ quy chiếu.
    case "kw":
      return PLAIN("kW");
    // Tỉ lệ và phân vị cùng in theo phần trăm, nhưng KHÔNG gộp làm một `kind`: câu đơn vị
    // của chúng khác nhau ("52% cổng-giờ bận" ≠ "phân vị 52"), và gộp lại thì mất chỗ để
    // nói ra sự khác nhau ấy.
    case "ratio":
    case "pctl":
      return { divisor: 0.01, label: "%" };
    case "times":
      return PLAIN("lần");
    case "index":
      return PLAIN("");
  }
}

/**
 * Một ngưỡng, in trong thang đã chọn.
 *
 * Số chữ số bám giá trị chứ không cố định, vì lý do `formatBreak` đã ghi: làm tròn `0,01%`
 * thành `0%` tạo ra hai bậc cùng đọc là `0%` và biến một ngưỡng thật thành ngưỡng giả.
 */
export function formatIn(v: number, s: ScaledUnit): string {
  const x = v / s.divisor;
  const a = Math.abs(x);
  if (a === 0) return "0";
  // Không chia thang ⇒ giữ nguyên luật cũ, gồm cả rút gọn "ng"/"tr" cho đại lượng không
  // có bậc thang riêng (chỉ số, số lần).
  if (s.divisor === 1 && s.digits === undefined && a >= 1_000) return formatBreak(x);
  const digits =
    s.digits ?? (a >= 10 ? 0 : a >= 1 ? 1 : Math.min(4, 2 - Math.floor(Math.log10(a))));
  return x.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

const MAX_DIGITS = 6;

/** Số chữ số thích ứng theo độ lớn — luật gốc của `formatBreak`, tách ra để dùng lại. */
function digitsFor(a: number): number {
  if (a === 0) return 0;
  return a >= 10 ? 0 : a >= 1 ? 1 : Math.min(4, 2 - Math.floor(Math.log10(a)));
}

/**
 * Chốt số chữ số thập phân cho cả một dãy ngưỡng, lấy theo ĐẦU LỚN của dãy.
 *
 * Để mỗi ngưỡng tự chọn thì một dải km in ra `0 · 0,32 · 0,85 · 1,4 · 3,1` — bốn kiểu số
 * lẻ cạnh nhau, và mắt phải căn lại mỗi lần nhảy sang swatch kế.
 *
 * Vì sao lấy theo đầu LỚN chứ không lấy số nhỏ nhất còn giữ được mọi nhãn phân biệt: cách
 * sau nghe chặt hơn nhưng hỏng đúng ở dải nhiều bậc thập phân. `station:occ` có một ngưỡng
 * `0,01%` sát 0, và để tách nó khỏi `0` thì cả dải phải mang 2 chữ số —
 * `0 · 0,01 · 8,33 · 16,67 · 25,83 · 36,81 · 52,43`, tức là một ngưỡng ngoại lệ bắt sáu
 * ngưỡng còn lại trả giá. Chốt theo đầu lớn cho `0 · 0,01 · 8 · 17 · 26 · 37 · 52`: gọn ở
 * chỗ gọn được, chính xác ở đúng chỗ cần chính xác.
 */
export function withDigits(s: ScaledUnit, values: readonly number[]): ScaledUnit {
  const xs = values.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v / s.divisor));
  if (xs.length < 2) return s;
  return { ...s, digits: digitsFor(Math.max(...xs)) };
}

/**
 * Cả dãy nhãn của một ramp — chốt chữ số một lần, rồi **nâng riêng** nhãn nào bị trùng.
 *
 * Hai ngưỡng thật đọc thành cùng một chữ là biến một ngưỡng thành ngưỡng giả (bẫy mà
 * `formatBreak` đã ghi). Nhưng cách chữa phải trả giá **cục bộ**: chỉ những nhãn thực sự
 * đụng nhau mới được thêm chữ số, chứ không kéo cả dãy theo. Với `station:occ` thì đúng
 * một nhãn — `0,01` — mang số lẻ, sáu nhãn còn lại là số nguyên.
 */
export function formatSeries(values: readonly number[], s: ScaledUnit): string[] {
  const labels = values.map((v) => formatIn(v, s));
  const count = new Map<string, number>();
  for (const l of labels) count.set(l, (count.get(l) ?? 0) + 1);

  return labels.map((label, i) => {
    if ((count.get(label) ?? 0) < 2) return label;
    const v = values[i]!;
    for (let d = (s.digits ?? 0) + 1; d <= MAX_DIGITS; d++) {
      const next = formatIn(v, { ...s, digits: d });
      if (!labels.some((other, j) => j !== i && other === next)) return next;
    }
    return label;
  });
}

/** Vế đơn vị của câu legend: danh từ đã chia thang, cộng vế bổ nghĩa nếu có. */
export function unitPhrase(u: UnitSpec | null, s: ScaledUnit): string | null {
  if (!u) return null;
  if (!s.label) return u.note ?? null;
  return u.note ? `${s.label}, ${u.note}` : s.label;
}

/**
 * Vế đơn vị ở THANG GỐC — dùng cho panel, nơi số đi kèm là một giá trị đơn lẻ.
 *
 * Panel và legend cố ý khác nhau ở đây, và ranh giới là số lượng: legend in một DÃY ngưỡng
 * nên phải chọn một thang chung để dãy đọc liền mạch; panel in MỘT số và ưu tiên đọc đúng,
 * nên nó giữ nguyên giá trị thật (`1.400 m`, không phải `1,4 km`). Chia thang cho một số
 * đơn lẻ chỉ làm mất chữ số mà không được gì.
 */
export function baseUnitPhrase(u: UnitSpec | null): string | null {
  return unitPhrase(u, scaleUnit(u, 0));
}
