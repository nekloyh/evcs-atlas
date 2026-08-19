/**
 * Trường ảo `station:occ` và hồ sơ 168h — DESIGN.md §13c-1, §4d-3b, §3e.
 *
 * Logic THUẦN (§12): công thức, ngưỡng, phép gộp. Không đụng DuckDB, không đụng DOM —
 * `data/occupancy.ts` lo phần nạp, file này lo phần *nghĩa*.
 *
 * Đây là chỗ ràng buộc 1 sống trên chiều thời gian, cùng vai mà `palette.colorFor` giữ
 * trên chiều giá trị: **một đường vào duy nhất** từ (trạm, giờ) sang giá trị, và nó trả
 * `null` ở cả ba đường "không biết". Không có `?? 0` ở đây. Đừng thêm.
 */

import { HOURS_IN_WEEK } from "../state/types";

/**
 * Ngưỡng `observed_h` — dưới mức này thì `occ` KHÔNG được tô, DESIGN.md §4d-3b.
 *
 * **1 h là số ĐO, không phải số tròn chọn cho đẹp.** Đo trên chính
 * `station_occupancy_profile_168h.parquet`: khớp `var(t) = a + b/t` trên phần dư của
 * `occ / n_ports` (đã trừ trung bình của chính trạm tại cùng giờ, để bỏ nhịp ngày đi) cho
 * `a = 0,005454` (biến thiên THẬT) và `b = 0,003205` (nhiễu LẤY MẪU) ⇒ hai thứ bằng nhau
 * tại `t* = 0,588 h`. 1 h là lượng tử tự nhiên đầu tiên trên `t*` — `observed_h` đếm bằng
 * giờ, nên dưới 1 h nghĩa là ô giờ đó **chưa từng được quan sát trọn một giờ**.
 *
 * Phân vị của `observed_h` KHÔNG dùng được để chọn ngưỡng: phân bố dồn cục ở đỉnh (trung
 * vị 4,0 · tối đa 5,0) nên nó không có chỗ gãy nào. Câu hỏi đúng là "từ đâu thì nhiễu lấy
 * mẫu thôi lấn át biến thiên thật", và câu đó phải đo trên `occ`, không đo trên `observed_h`.
 */
export const OBSERVED_H_MIN = 1;

/**
 * Hồ sơ 168h ở dạng phẳng — `Float32Array` chỉ số `s * 168 + t`.
 *
 * Không phải mảng object: 703 trạm × 168 giờ là 118 nghìn ô, và ở dạng `{occ, observed_h}`
 * thì đó là 118 nghìn object cho một thứ được đọc lại mỗi khung hình khi scrubber chạy.
 * `NaN` = không có dòng nào cho ô giờ đó (1.319 ô như vậy) — khác 0, và phải khác.
 */
export interface OccProfiles {
  /** `occ` — SỐ CỔNG BẬN trung bình, không phải tỉ lệ. Mẫu số ở `nPorts`. */
  occ: Float32Array;
  observed: Float32Array;
  /** số cổng LẮP ĐẶT của từng trạm; `NaN` khi cột `n_ports` khuyết (26/939 trạm) */
  nPorts: Float32Array;
  /** Mảng đánh dấu trạm thuộc phạm vi IN (trừ trạm đệm BUFFER) — PHASE4_VISUALIZATION.md §0.1, §1.5 */
  /**
   * Trạm nào thuộc phạm vi IN — BẮT BUỘC, không phải tuỳ chọn.
   *
   * Mọi số gộp toàn lens (§1.5) chỉ được đi trên mặt nạ này. Để `?` sẽ khiến một
   * `OccProfiles` dựng thiếu mặt nạ âm thầm gộp cả trạm BUFFER vào mẫu số — đúng lỗi mà
   * §0.2 mục 6 vừa gỡ. Kiểu bắt buộc là chỗ rẻ nhất để lỗi ấy không quay lại.
   */
  inScope: readonly boolean[];
  n: number;
}

/**
 * Giá trị của `station:occ` cho trạm `s` tại giờ `t` — **đường vào duy nhất**.
 *
 * `occ / n_ports` tại `(dow, hour) = t`. Trả `null` ở đúng ba đường "không biết", và cả ba
 * vẽ chung MỘT ký hiệu (chấm rỗng viền xám) vì cả ba là cùng một câu:
 *
 *   1. trạm không có hồ sơ 168h nào (236/939) — ô giờ mang `NaN`;
 *   2. `observed_h` dưới ngưỡng (§4d-3b) — "chưa quan sát đủ" ≠ "vắng khách";
 *   3. `n_ports` khuyết (26/939) — không có mẫu số thì không có tỉ số. KHÔNG mượn
 *      `util_denominator_ports` thay vào: đó là mẫu số của tầng LIVE, và §13c-1 chọn
 *      `n_ports` (ASSET) có lý do.
 */
export function stationOccAt(p: OccProfiles, s: number, t: number): number | null {
  const ports = p.nPorts[s];
  if (ports === undefined || !Number.isFinite(ports) || ports <= 0) return null;
  const i = s * HOURS_IN_WEEK + t;
  const obs = p.observed[i];
  const occ = p.occ[i];
  if (obs === undefined || !Number.isFinite(obs) || obs < OBSERVED_H_MIN) return null;
  if (occ === undefined || !Number.isFinite(occ)) return null;
  return occ / ports;
}

/**
 * MỌI giá trị hợp lệ trên cả 168 giờ — đầu vào chia bậc của `station:occ`.
 *
 * **Chia bậc phải tính MỘT LẦN trên toàn bộ tuần, không phải theo từng giờ.** Đây là điểm
 * quyết định của cả trường này: chia bậc theo giờ thì cùng một tỉ lệ 0,42 rơi vào bậc c3
 * lúc 3h sáng và bậc c6 lúc 22h, tức **màu đổi nghĩa 4 lần mỗi giây** khi scrubber chạy và
 * không so được hai giờ với nhau. Đó đúng là lý do §1b loại `HeatmapLayer`, chỉ khác trục:
 * ở đó cường độ đổi theo zoom, ở đây nó đổi theo giờ.
 *
 * Đổi lại: ngưỡng legend đứng yên suốt lượt xem, và cái chuyển động trên bản đồ là **dữ
 * liệu**, không phải thang đo.
 */
export function allOccValues(p: OccProfiles): number[] {
  const out: number[] = [];
  for (let s = 0; s < p.n; s++) {
    if (!p.inScope[s]) continue;
    for (let t = 0; t < HOURS_IN_WEEK; t++) {
      const v = stationOccAt(p, s, t);
      if (v !== null) out.push(v);
    }
  }
  return out;
}

/**
 * Phủ của `station:occ` cho badge ⚠ (ràng buộc 4) — số **ổn định**, không phải số theo giờ.
 *
 * Hai câu hỏi khác nhau và chúng phải có hai con số khác nhau:
 *   · badge trong rail hỏi *"trường này phủ tới đâu"* — người ta đọc nó **trước khi bấm**,
 *     nên nó không được nhảy 4 lần mỗi giây khi scrubber chạy;
 *   · swatch chấm rỗng ở legend hỏi *"bao nhiêu chấm đang rỗng"* — nó nói về giờ trên màn
 *     hình, và nó PHẢI đổi theo giờ, nếu không nó nói dối về thứ đang vẽ (`occCountAt`).
 *
 * Ở đây chọn *"trạm có ít nhất một giờ đọc được trong tuần"*: nó đo đúng thứ badge hỏi —
 * trạm này có nhịp để xem hay không — và nó không đổi khi `t` đổi.
 */
export function occCoverage(p: OccProfiles): { present: number; total: number } {
  let present = 0;
  let total = 0;
  for (let s = 0; s < p.n; s++) {
    if (!p.inScope[s]) continue;
    total++;
    for (let t = 0; t < HOURS_IN_WEEK; t++) {
      if (stationOccAt(p, s, t) !== null) {
        present++;
        break;
      }
    }
  }
  return { present, total };
}

/**
 * Cả 168 giờ của MỘT trạm — mini-heatmap của panel TRẠM (§8a-3), M4.1.
 *
 * Đi qua đúng `stationOccAt`, không tính lại: panel và bản đồ phải cho **cùng một giá trị
 * ở cùng một giờ**, và cách duy nhất bảo đảm điều đó là cùng một hàm. `null` giữ nguyên ba
 * nghĩa của nó — mini-heatmap vẽ vân xám, không vẽ bậc nhạt (§4d-3b).
 */
export function stationSeries(p: OccProfiles, s: number): (number | null)[] {
  const out: (number | null)[] = new Array(HOURS_IN_WEEK);
  for (let t = 0; t < HOURS_IN_WEEK; t++) out[t] = stationOccAt(p, s, t);
  return out;
}

/** Đếm trạm tô được / tổng trạm tại giờ `t` — số của legend là số của GIỜ ĐANG XEM. */
export function occCountAt(p: OccProfiles, t: number): { present: number; missing: number } {
  let present = 0;
  let total = 0;
  for (let s = 0; s < p.n; s++) {
    if (!p.inScope[s]) continue;
    total++;
    if (stationOccAt(p, s, t) !== null) present++;
  }
  return { present, missing: total - present };
}

/**
 * Một ô của heatmap 168h toàn thành phố.
 *
 * `observedH` là `observed_h` trung bình có trọng số cổng trên **toàn bộ cổng lắp đặt**,
 * kể cả cổng của trạm chưa từng báo cáo (chúng đóng góp 0 giờ). Đó là cùng một đại lượng,
 * cùng đơn vị và cùng ngưỡng với tầng trạm — một khái niệm, một ngưỡng.
 */
export interface CityHour {
  t: number;
  /** `Σ occ / Σ n_ports` trên các trạm ĐỦ quan sát; `null` khi không trạm nào đủ */
  value: number | null;
  observedH: number;
  /** số trạm đóng góp vào ô này */
  nStations: number;
}

/**
 * Hồ sơ 168h của CẢ THÀNH PHỐ — trung bình có trọng số cổng (§3d).
 *
 * Tử số và mẫu số chỉ cộng trên **trạm đủ quan sát**: gộp một trạm chưa báo cáo vào với
 * `occ = 0` là khẳng định "trạm đó rảnh", đúng cái ràng buộc 1 cấm. Hệ quả trung thực là
 * mẫu số đổi theo giờ — và `observedH` chính là chỗ nói ra điều đó, nên nó được tính trên
 * **toàn bộ** cổng chứ không chỉ cổng đã quan sát.
 */
export function cityProfile(p: OccProfiles): CityHour[] {
  let portsAll = 0;
  for (let s = 0; s < p.n; s++) {
    if (!p.inScope[s]) continue;
    const v = p.nPorts[s]!;
    if (Number.isFinite(v)) portsAll += v;
  }

  const out: CityHour[] = new Array(HOURS_IN_WEEK);
  for (let t = 0; t < HOURS_IN_WEEK; t++) {
    let occSum = 0;
    let portSum = 0;
    let obsSum = 0;
    let nStations = 0;
    for (let s = 0; s < p.n; s++) {
      if (!p.inScope[s]) continue;
      const ports = p.nPorts[s]!;
      if (!Number.isFinite(ports) || ports <= 0) continue;
      const i = s * HOURS_IN_WEEK + t;
      const obs = p.observed[i]!;
      if (!Number.isFinite(obs)) continue;
      obsSum += obs * ports;
      if (obs < OBSERVED_H_MIN) continue;
      const occ = p.occ[i]!;
      if (!Number.isFinite(occ)) continue;
      occSum += occ;
      portSum += ports;
      nStations++;
    }
    out[t] = {
      t,
      value: portSum > 0 ? occSum / portSum : null,
      observedH: portsAll > 0 ? obsSum / portsAll : 0,
      nStations,
    };
  }
  return out;
}

/**
 * Câu đơn vị của heatmap — §4d-3b đòi ngưỡng phải IN RA.
 *
 * Nó cũng nói ra khi luật vân xám **không nổ trên dữ liệu này**: ở tầng thành phố
 * `observed_h` có trọng số chạy 2,04–3,89 h, luôn trên ngưỡng. Im lặng ở đó thì một ô vân
 * không bao giờ xuất hiện trở thành một lời hứa suông trong chú giải.
 */
export function heatmapUnitSentence(cells: CityHour[]): string {
  const thin = cells.filter((c) => c.observedH < OBSERVED_H_MIN).length;
  const base =
    `nhịp trạm toàn thành phố · cổng bận ÷ cổng lắp đặt, trọng số cổng · ` +
    `ô dưới ${OBSERVED_H_MIN} h quan sát vẽ vân xám`;
  const head =
    thin > 0 ? `${base} (${thin} ô)` : `${base} — không ô nào ở tầng thành phố rơi vào đó`;

  // Dải giá trị THẬT của tầng thành phố, in ra vì heatmap dùng CHUNG thang với chấm trạm
  // và vì thế chỉ tiêu vài bậc trong 7. Không nói ra thì một hình gần như đồng màu đọc
  // thành "biểu đồ hỏng"; nói ra thì nó đọc thành đúng thứ nó là — gộp 939 trạm lại thì
  // thành phố không bao giờ đầy, dù từng trạm thì có. Đổi thang riêng cho nó sẽ rẻ hơn về
  // tương phản nhưng đắt hơn nhiều về nghĩa: cùng một màu cam sẽ nói hai điều khác nhau ở
  // hai chỗ trên cùng một màn hình.
  const vals = cells.map((c) => c.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return head;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return `${head}. Cả thành phố chỉ chạy ${pctShort(lo)}–${pctShort(hi)} — cùng thang với chấm trạm trên bản đồ, nên nó tiêu ít bậc.`;
}

const pctShort = (v: number) =>
  `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;

// ── Hồ sơ ngày theo `shape_class` — small multiples của §3f-5, M4.2 ───────────

export interface ShapeProfile {
  /** hằng thô của dữ liệu, ví dụ `HAI_DINH`. Dịch sang tiếng Việt ở tầng UI (§8). */
  cls: string;
  /** 24 giá trị `Σocc / Σn_ports`; `null` ở giờ không trạm nào của dạng này đủ quan sát */
  hours: (number | null)[];
  nStations: number;
}

/**
 * Hồ sơ NGÀY (24 giờ) của từng `shape_class` — §3f-5.
 *
 * **Trọng số theo cổng, không phải trung bình các tỉ lệ trạm.** `Σocc / Σn_ports` là cùng
 * một đại lượng mà `cityProfile` và chấm trạm dùng, nên năm đường này so được với heatmap
 * thành phố ngay trên cùng màn hình. Trung bình các tỉ lệ thì một trạm 2 cổng nặng bằng
 * một trạm 30 cổng, và `DEM_TROI` (34 trạm) sẽ bị vài trạm nhỏ lái đi.
 *
 * `null` khi không trạm nào của dạng đó đủ quan sát ở giờ đó — KHÔNG phải 0. Sparkline vẽ
 * đứt đoạn ở đó; nối liền qua nó là bịa một giá trị (ràng buộc 1 trên chiều thời gian).
 */
export function shapeDayProfiles(
  p: OccProfiles,
  classOfStation: (s: number) => string | null,
): ShapeProfile[] {
  const acc = new Map<string, { occ: Float64Array; ports: Float64Array; n: number }>();
  for (let s = 0; s < p.n; s++) {
    const cls = classOfStation(s);
    if (cls === null) continue;
    const ports = p.nPorts[s]!;
    if (!Number.isFinite(ports) || ports <= 0) continue;
    let a = acc.get(cls);
    if (!a) {
      a = { occ: new Float64Array(24), ports: new Float64Array(24), n: 0 };
      acc.set(cls, a);
    }
    a.n++;
    for (let t = 0; t < HOURS_IN_WEEK; t++) {
      // Đi qua đúng `stationOccAt` để ba đường "không biết" và ngưỡng `observed_h` giống
      // hệt bản đồ. Nhân lại `ports` để về `occ` thô — mẫu số phải cộng được.
      const v = stationOccAt(p, s, t);
      if (v === null) continue;
      const h = t % 24;
      a.occ[h]! += v * ports;
      a.ports[h]! += ports;
    }
  }

  return [...acc.entries()]
    .map(([cls, a]) => ({
      cls,
      hours: Array.from({ length: 24 }, (_, h) => (a.ports[h]! > 0 ? a.occ[h]! / a.ports[h]! : null)),
      nStations: a.n,
    }))
    // Sắp theo SỐ TRẠM giảm dần, không theo bảng chữ cái: thứ tự dọc của small multiples là
    // một kênh vị trí, và cho nó mang "dạng nào phổ biến hơn" rẻ hơn là cho nó mang chữ cái
    // đầu của một hằng số tiếng Việt không dấu.
    .sort((x, y) => y.nStations - x.nStations);
}

// ── Hồ sơ biên 24 giờ — mục 10 của nghiệm thu, dựng cùng M4.1/M4.2 ────────────

/**
 * Một giờ trong ngày, gộp trên cả 7 thứ — §3d, khối "hồ sơ biên" thêm sau M4.
 *
 * ── Bài toán mà cái này giải, và vì sao nó KHÔNG phải "đổi thang cho heatmap" ─────────
 *
 * Heatmap 168h dùng **chung phép chia bậc** với chấm trạm (§8a) để một ô heatmap và một
 * chấm trên bản đồ cùng màu thì cùng nghĩa. Nhưng tầng thành phố chỉ chạy 11%–36% của thang
 * ấy — gộp 939 trạm lại thì thành phố không bao giờ đầy, dù từng trạm thì có — nên heatmap
 * tiêu 2–3 bậc trong 7 và trông gần như đồng màu.
 *
 * Hai cách sửa, và một cách sai:
 *   · **SAI:** cấp cho heatmap một thang riêng. Rẻ về tương phản, đắt về nghĩa — cùng một
 *     màu cam sẽ nói hai điều khác nhau ở hai chỗ trên cùng một màn hình.
 *   · **ĐÚNG:** giữ nguyên màu, chuyển biến thiên sang một **kênh khác đang trống**. Kênh
 *     VỊ TRÍ chưa dùng, và nó là kênh mạnh nhất trong bảng xếp hạng của Cleveland–McGill —
 *     một chênh lệch 11%→36% không đọc nổi bằng độ đậm thì đọc rất rõ bằng độ cao.
 *
 * Đây là **cùng một lập luận** mà cả app đã dùng cho danh tính overlay (§4d: hình học và
 * chất liệu, không phải hue) và cho trạng thái trạm (§4d-3a: nét, không phải màu) — khi một
 * kênh đã bị trưng dụng cho một nghĩa, thứ cần nói thêm phải tìm kênh khác, không được
 * giành lại kênh cũ.
 */
export interface HourBand {
  hour: number;
  /** trung bình của 7 giá trị thứ tại giờ này; `null` khi không thứ nào đo được */
  mid: number | null;
  /** thấp nhất / cao nhất trong 7 thứ — dải này chính là "cuối tuần khác ngày thường" */
  lo: number | null;
  hi: number | null;
  /** số thứ có giá trị — dưới 7 thì dải hẹp lại vì THIẾU, không phải vì đều */
  n: number;
}

/**
 * Gộp 168 ô giờ thành 24 cột — trung bình + dải min–max trên 7 thứ.
 *
 * Trung bình **không có trọng số**: bảy giá trị đầu vào đều đã là `Σocc / Σn_ports` trên
 * cùng một tập trạm, nên chúng cùng đơn vị và cùng mẫu số về mặt khái niệm. Trọng số theo
 * số trạm đóng góp sẽ làm giờ đêm (ít trạm đủ quan sát) nhẹ đi — tức làm hình đẹp lên bằng
 * cách giấu đúng phần dữ liệu mỏng.
 *
 * Ô `value === null` **không vào trung bình và không kéo dải xuống**: "không đo được" khác
 * "bằng 0" — ràng buộc 1, y như trên bản đồ. `n` là chỗ nói ra điều đó.
 */
export function hourProfile(cells: readonly { t: number; value: number | null }[]): HourBand[] {
  const out: HourBand[] = new Array(24);
  for (let h = 0; h < 24; h++) out[h] = { hour: h, mid: null, lo: null, hi: null, n: 0 };
  const sum = new Float64Array(24);
  for (const c of cells) {
    if (c.value === null) continue;
    const h = c.t % 24;
    const b = out[h]!;
    sum[h]! += c.value;
    b.n++;
    if (b.lo === null || c.value < b.lo) b.lo = c.value;
    if (b.hi === null || c.value > b.hi) b.hi = c.value;
  }
  for (let h = 0; h < 24; h++) {
    const b = out[h]!;
    if (b.n > 0) b.mid = sum[h]! / b.n;
  }
  return out;
}

/**
 * Câu đơn vị của hồ sơ biên — nói ra CHÍNH cái mà hình này thêm vào so với heatmap.
 *
 * Nó phải nói ra tỉ số đỉnh/đáy: đó là con số mà mắt vừa đọc được từ độ cao và **không**
 * đọc được từ màu, tức là lý do tồn tại của hình này ở dạng một câu.
 */
export function hourProfileSentence(bands: HourBand[]): string {
  const mids = bands.filter((b) => b.mid !== null);
  if (mids.length === 0) return "chưa đủ dữ liệu để dựng hồ sơ 24 giờ.";
  const peak = mids.reduce((a, b) => (b.mid! > a.mid! ? b : a));
  const trough = mids.reduce((a, b) => (b.mid! < a.mid! ? b : a));
  const ratio = trough.mid! > 0 ? peak.mid! / trough.mid! : null;
  const spread = bands.reduce((m, b) => Math.max(m, b.hi !== null && b.lo !== null ? b.hi - b.lo : 0), 0);
  return (
    `trung bình 7 thứ theo giờ, dải là thấp nhất–cao nhất trong tuần · ` +
    `đỉnh ${peak.hour}h ${pctShort(peak.mid!)} ↔ đáy ${trough.hour}h ${pctShort(trough.mid!)}` +
    (ratio ? ` (${ratio.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}×)` : "") +
    `. Cùng thang màu ⇒ heatmap trên tiêu ít bậc; nhịp ngày đọc ở đây bằng ĐỘ CAO, ` +
    `không bằng độ đậm. Chênh lệch giữa các thứ tại một giờ tối đa ${pctShort(spread)}.`
  );
}
