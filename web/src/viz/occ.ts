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
 * Một station-hour ĐỦ ĐIỀU KIỆN gộp — cửa DUY NHẤT của mọi phép gộp lens Sử dụng.
 *
 * Trước bản này ba chỗ chép lại cùng bộ điều kiện (`observed_h`, `n_ports`, finite, IN):
 * `cityProfile` ở đây, `buildUtilizationWeekHeatmap` ở `chart-models.ts`, và vòng lặp
 * trong `shapeDayProfiles`. Ba bản chép của một luật là ba chỗ để chúng trôi khỏi nhau —
 * và một trong ba đã trôi thật: `shapeDayProfiles` **không** kiểm `inScope`, nên trạm
 * BUFFER lọt vào mẫu số của small multiples (UX_UTILIZATION_VISUALIZATION_SPEC §22.5).
 *
 * Nay chỉ còn một cửa. Nó trả `null` ở đúng những chỗ `stationOccAt` trả `null`, cộng
 * thêm một chỗ: trạm ngoài phạm vi IN. Cả hai thành phần thô — `occ` (tử số cộng được)
 * và `ports` (mẫu số cộng được) — đi kèm, vì **ratio-of-sums cần hai số hạng, không cần
 * tỉ lệ đã chia**. Trả về tỉ lệ rồi nhân ngược lại mẫu số là đường đi vòng qua một phép
 * chia không cần thiết, và nó chỉ đúng khi mẫu số không đổi.
 */
export interface EligibleStationHour {
  /** `stationOccAt` = `occ / n_ports`. Có mặt cho tầng TRẠM; tầng gộp không dùng nó. */
  rate: number;
  /** `occ` — số cổng bận trung bình. Tử số THÔ, cộng được. */
  occ: number;
  /** `n_ports` — số cổng lắp đặt. Mẫu số THÔ, cộng được. */
  ports: number;
  observedH: number;
}

export function eligibleStationHour(
  p: OccProfiles,
  s: number,
  t: number,
): EligibleStationHour | null {
  if (!p.inScope[s]) return null;
  const rate = stationOccAt(p, s, t);
  if (rate === null) return null;
  const i = s * HOURS_IN_WEEK + t;
  return { rate, occ: p.occ[i]!, ports: p.nPorts[s]!, observedH: p.observed[i]! };
}

/**
 * Tổng bất biến theo giờ của MỘT nhóm trạm — mẫu số của coverage (spec §7.3).
 *
 * `installedPorts` cộng trên MỌI trạm IN có `n_ports` hữu hạn dương, kể cả trạm chưa từng
 * báo cáo giờ nào. Đó là chủ ý: coverage hỏi *"bao nhiêu phần của cái đã lắp đang được
 * quan sát"*, nên mẫu số phải là cái đã lắp, không phải cái đang quan sát. Dùng mẫu số
 * theo giờ ở cả hai vế sẽ cho coverage 100% ở mọi giờ và không nói gì.
 */
export interface OccGroupTotals {
  /** `all_installed_ports` — cổng lắp đặt biết được của cả nhóm. */
  installedPorts: number;
  /** `all_stations` — số trạm IN trong nhóm, kể cả trạm khuyết `n_ports`. */
  stations: number;
  /** Trạm IN khuyết/không dương `n_ports` — không vào mẫu số cổng, vẫn vào mẫu số trạm. */
  stationsWithoutPorts: number;
}

/**
 * Thống kê ĐỦ của một nhóm tại một giờ — spec §7.2.
 *
 * "Đủ" theo nghĩa thống kê: bốn số này đủ để dựng lại utilization, coverage cổng, coverage
 * trạm và giờ quan sát/cổng mà không cần quay lại từng station-hour. Đó là điều kiện để
 * scrub 4 lần/giây chỉ là một phép tra mảng.
 */
export interface OccSufficientStats {
  /** `Σ occ` trên các trạm đủ gate — số cổng bận TRUNG BÌNH QUAN SÁT, cộng được. */
  busyPortsAvg: number;
  /** `Σ n_ports` trên **chính** các trạm ấy. Mẫu số của utilization. */
  observedPorts: number;
  /** `|E(g,t)|` — số trạm đóng góp. */
  contributingStations: number;
  /** `Σ observed_h × n_ports` trên mọi trạm IN có `n_ports` hữu hạn dương của nhóm. */
  observedHourPorts: number;
}

export function emptyOccStats(): OccSufficientStats {
  return { busyPortsAvg: 0, observedPorts: 0, contributingStations: 0, observedHourPorts: 0 };
}

/**
 * `utilization(g,t) = Σocc / Σn_ports`, hoặc `null` khi mẫu số bằng 0.
 *
 * `null` chứ KHÔNG phải 0, và đây là chỗ duy nhất phép chia ấy được viết. "Không trạm nào
 * đủ quan sát" và "mọi trạm đều rảnh" là hai câu khác nhau; trả 0 cho câu thứ nhất là nói
 * câu thứ hai.
 */
export function utilizationOf(stats: OccSufficientStats): number | null {
  return stats.observedPorts > 0 ? stats.busyPortsAvg / stats.observedPorts : null;
}

/** Chỉ số của mọi trạm IN — tập nền của mọi phép gộp toàn tỉnh. */
export function inScopeIndices(p: OccProfiles): number[] {
  const out: number[] = [];
  for (let s = 0; s < p.n; s++) if (p.inScope[s]) out.push(s);
  return out;
}

/** Tổng bất biến của một nhóm trạm (mặc định: cả tỉnh). */
export function occGroupTotals(p: OccProfiles, members?: readonly number[]): OccGroupTotals {
  const list = members ?? inScopeIndices(p);
  let installedPorts = 0;
  let stations = 0;
  let stationsWithoutPorts = 0;
  for (const s of list) {
    if (!p.inScope[s]) continue;
    stations++;
    const ports = p.nPorts[s];
    if (ports !== undefined && Number.isFinite(ports) && ports > 0) installedPorts += ports;
    else stationsWithoutPorts++;
  }
  return { installedPorts, stations, stationsWithoutPorts };
}

/**
 * Cộng thống kê đủ của một nhóm tại giờ `t`.
 *
 * `observedHourPorts` cộng trên tập RỘNG HƠN tập đóng góp: một trạm có `observed_h = 0,3`
 * không vào tử/mẫu số utilization nhưng vẫn kéo giờ-quan-sát-trung-bình của nhóm xuống,
 * và đó chính là thứ con số ấy tồn tại để nói. Trạm không có dòng nào (`NaN`) đóng góp 0
 * giờ — vẫn ở mẫu số, đúng như spec §7.3 nói.
 */
export function occStatsAt(
  p: OccProfiles,
  members: readonly number[],
  t: number,
): OccSufficientStats {
  let busyPortsAvg = 0;
  let observedPorts = 0;
  let contributingStations = 0;
  let observedHourPorts = 0;
  for (const s of members) {
    if (!p.inScope[s]) continue;
    const ports = p.nPorts[s];
    if (ports === undefined || !Number.isFinite(ports) || ports <= 0) continue;
    const obs = p.observed[s * HOURS_IN_WEEK + t];
    if (obs !== undefined && Number.isFinite(obs)) observedHourPorts += obs * ports;
    const e = eligibleStationHour(p, s, t);
    if (!e) continue;
    busyPortsAvg += e.occ;
    observedPorts += e.ports;
    contributingStations++;
  }
  return { busyPortsAvg, observedPorts, contributingStations, observedHourPorts };
}

/**
 * Coverage TOÀN TỈNH tại một giờ — dòng bắt buộc của chú giải (spec §12.3).
 *
 * Tách khỏi `occCountAt` chứ không mở rộng nó, và vì một lý do đã được §4.6 của spec chốt:
 * **coverage theo TRẠM và coverage theo CỔNG trả lời hai câu khác nhau**, và ở Hà Nội
 * chúng lệch nhau thật — trung vị 96,48% theo trạm nhưng 99,74% theo cổng, vì trạm khuyết
 * quan sát nghiêng về phía trạm nhỏ. In một con số rồi gọi nó là "coverage" là chọn hộ
 * người đọc câu hỏi nào đáng quan tâm.
 *
 * `occCountAt` vẫn ở lại: nó đếm CHẤM ĐANG VẼ cho swatch chấm rỗng, một câu thứ ba.
 */
export interface OccProvinceCoverage {
  observedPorts: number;
  installedPorts: number;
  contributingStations: number;
  allStations: number;
}

export function occProvinceCoverageAt(p: OccProfiles, t: number): OccProvinceCoverage {
  const members = inScopeIndices(p);
  const totals = occGroupTotals(p, members);
  const stats = occStatsAt(p, members, t);
  return {
    observedPorts: stats.observedPorts,
    installedPorts: totals.installedPorts,
    contributingStations: stats.contributingStations,
    allStations: totals.stations,
  };
}

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
 * một đại lượng mà biểu đồ chính và chấm trạm dùng, nên năm đường này so được với hồ sơ
 * ngày ngay trên cùng màn hình. Trung bình các tỉ lệ thì một trạm 2 cổng nặng bằng một
 * trạm 30 cổng, và `DEM_TROI` (34 trạm) sẽ bị vài trạm nhỏ lái đi.
 *
 * `null` khi không trạm nào của dạng đó đủ quan sát ở giờ đó — KHÔNG phải 0. Sparkline vẽ
 * đứt đoạn ở đó; nối liền qua nó là bịa một giá trị (ràng buộc 1 trên chiều thời gian).
 *
 * **IN-only từ bản redesign 21/8/2026.** Vòng lặp cũ gọi thẳng `stationOccAt`, thứ KHÔNG
 * kiểm `inScope` — nên một trạm BUFFER có `shape_class` vẫn vào cả tử số lẫn mẫu số của
 * small multiples. Nay nó đi qua `eligibleStationHour`, cửa duy nhất, và cửa ấy kiểm.
 */
export function shapeDayProfiles(
  p: OccProfiles,
  classOfStation: (s: number) => string | null,
): ShapeProfile[] {
  const acc = new Map<string, { occ: Float64Array; ports: Float64Array; n: number }>();
  for (let s = 0; s < p.n; s++) {
    if (!p.inScope[s]) continue;
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
      // Cùng cửa với bản đồ và biểu đồ chính. Cộng `e.occ` THÔ, không nhân ngược tỉ lệ:
      // tử số và mẫu số phải là hai số hạng cộng được, không phải một tỉ số đã chia rồi
      // khôi phục.
      const e = eligibleStationHour(p, s, t);
      if (!e) continue;
      const h = t % 24;
      a.occ[h]! += e.occ;
      a.ports[h]! += e.ports;
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
