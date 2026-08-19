/**
 * Trường ảo `station:occ` — DESIGN.md §13c-1, §4d-3b, §6b.
 *
 * Vì sao có file này: đây là chỗ **ràng buộc 1 sống trên chiều thời gian**, và một ràng
 * buộc là quy tắc chứ không phải phân bố (§12). Ảnh chụp chứng minh được rằng ở giờ 75 có
 * 417 chấm rỗng; nó không chứng minh được rằng mẫu số luôn là `n_ports`, rằng ô dưới
 * ngưỡng KHÔNG BAO GIỜ rơi vào một bậc ramp, hay rằng ba đường "không biết" đều ra cùng
 * một ký hiệu.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { HOURS_IN_WEEK, tOf } from "../src/state/types.ts";
import {
  OBSERVED_H_MIN,
  allOccValues,
  cityProfile,
  occCountAt,
  occCoverage,
  stationOccAt,
  type OccProfiles,
} from "../src/viz/occ.ts";

/**
 * Dựng một bộ hồ sơ nhỏ. Mọi ô mặc định là `NaN` — đúng như bộ nạp thật, và đúng như dữ
 * liệu thật (1.319 ô giờ không có dòng nào, 236 trạm không có hồ sơ nào).
 */
function make(nStations: number, ports: number[]): OccProfiles {
  const size = nStations * HOURS_IN_WEEK;
  return {
    occ: new Float32Array(size).fill(NaN),
    observed: new Float32Array(size).fill(NaN),
    nPorts: Float32Array.from(ports),
    // Mọi trạm của fixture đều IN: các test này đo phép gộp, không đo luật IN/BUFFER.
    inScope: Array.from({ length: nStations }, () => true),
    n: nStations,
  };
}

function put(p: OccProfiles, s: number, t: number, occ: number, observed: number) {
  p.occ[s * HOURS_IN_WEEK + t] = occ;
  p.observed[s * HOURS_IN_WEEK + t] = observed;
}

// ══ Công thức: mẫu số là n_ports (ASSET) ═════════════════════════════════════

test("giá trị là `occ / n_ports`, KHÔNG phải occ trần", () => {
  const p = make(1, [8]);
  put(p, 0, 46, 2, 5);
  assert.equal(stationOccAt(p, 0, 46), 2 / 8);
});

test("mẫu số là số cổng LẮP ĐẶT, nên cùng `occ` mà khác cổng thì khác giá trị", () => {
  // §13c-1: dùng mẫu số LIVE (`util_denominator_ports`) là trộn hai tầng mà
  // DECISIONS §5 cấm trộn. Test này ghim mẫu số lại.
  const p = make(2, [4, 20]);
  put(p, 0, 10, 2, 5);
  put(p, 1, 10, 2, 5);
  assert.equal(stationOccAt(p, 0, 10), 0.5);
  assert.equal(stationOccAt(p, 1, 10), 0.1);
});

// ══ Ràng buộc 1 trên chiều thời gian — ba đường vào MỘT ký hiệu ══════════════

test("`observed_h` DƯỚI ngưỡng ⇒ null, không phải một bậc nhạt", () => {
  const p = make(1, [8]);
  put(p, 0, 46, 4, OBSERVED_H_MIN - 0.01);
  assert.equal(stationOccAt(p, 0, 46), null, "chưa quan sát đủ ≠ vắng khách");
});

test("`observed_h` ĐÚNG BẰNG ngưỡng thì tô — ngưỡng là biên ĐÓNG dưới", () => {
  const p = make(1, [8]);
  put(p, 0, 46, 4, OBSERVED_H_MIN);
  assert.equal(stationOccAt(p, 0, 46), 0.5);
});

test("`occ = 0` với quan sát ĐỦ vẫn là 0 thật, không phải null", () => {
  // Đây là mặt kia của ràng buộc 1: "biết là không" phải khác "không biết" (§7a). Một trạm
  // rảnh thật ở 3h sáng là một giá trị, và nó phải tô được.
  const p = make(1, [8]);
  put(p, 0, 3, 0, 5);
  assert.equal(stationOccAt(p, 0, 3), 0);
});

test("trạm không có hồ sơ nào ⇒ null ở MỌI giờ", () => {
  const p = make(1, [8]);
  for (let t = 0; t < HOURS_IN_WEEK; t++) assert.equal(stationOccAt(p, 0, t), null);
});

test("thiếu `n_ports` ⇒ null, KHÔNG chia cho 0 và KHÔNG mượn mẫu số khác", () => {
  // 26/939 trạm thật rơi vào đây. `?? 0` ở chỗ này cho `Infinity`, và `Infinity` sẽ rơi
  // vào bậc đậm nhất của ramp — tức vẽ "trạm kín cứng" ở đúng nơi ta không biết gì.
  const p = make(2, [NaN, 0]);
  put(p, 0, 46, 4, 5);
  put(p, 1, 46, 4, 5);
  assert.equal(stationOccAt(p, 0, 46), null);
  assert.equal(stationOccAt(p, 1, 46), null);
});

test("cùng một trạm có thể tô ở giờ này và rỗng ở giờ kia — ký hiệu theo GIỜ", () => {
  const p = make(1, [10]);
  put(p, 0, tOf(1, 22), 5, 5);
  put(p, 0, tOf(3, 3), 1, 0.25);
  assert.equal(stationOccAt(p, 0, tOf(1, 22)), 0.5);
  assert.equal(stationOccAt(p, 0, tOf(3, 3)), null);
});

// ══ Chia bậc tính trên CẢ TUẦN, đếm tính theo GIỜ ════════════════════════════

test("`allOccValues` gom mọi giờ — thang đo không được đổi nghĩa khi scrubber chạy", () => {
  const p = make(2, [10, 10]);
  put(p, 0, 0, 1, 5);
  put(p, 0, 1, 9, 5);
  put(p, 1, 0, 5, 5);
  put(p, 1, 1, 2, 0.1); // dưới ngưỡng, không vào phân bố
  assert.deepEqual(allOccValues(p).sort(), [0.1, 0.5, 0.9]);
});

test("`occCountAt` đếm theo GIỜ, `occCoverage` đếm theo TUẦN — hai câu hỏi khác nhau", () => {
  const p = make(3, [10, 10, 10]);
  put(p, 0, 5, 1, 5);
  put(p, 1, 9, 1, 5); // đọc được, nhưng ở giờ KHÁC
  // trạm 2 không có gì cả
  assert.deepEqual(occCountAt(p, 5), { present: 1, missing: 2 });
  assert.deepEqual(occCoverage(p), { present: 2, total: 3 }, "hai trạm có ít nhất một giờ");
});

// ══ Heatmap toàn thành phố ═══════════════════════════════════════════════════

test("thành phố cộng theo TRỌNG SỐ CỔNG, không phải trung bình các tỉ lệ", () => {
  // Một trạm 100 cổng nói nhiều hơn một trạm 2 cổng về nhịp của cả thành phố.
  const p = make(2, [100, 2]);
  put(p, 0, 0, 50, 5); // 0,5
  put(p, 1, 0, 2, 5); // 1,0
  const c = cityProfile(p)[0]!;
  assert.equal(c.value, 52 / 102, "Σocc / Σports, không phải (0,5 + 1,0)/2");
  assert.equal(c.nStations, 2);
});

test("trạm dưới ngưỡng KHÔNG vào tử số lẫn mẫu số — gộp nó với occ=0 là nói dối", () => {
  const p = make(2, [10, 10]);
  put(p, 0, 0, 5, 5);
  put(p, 1, 0, 0, 0.1); // chưa quan sát đủ
  const c = cityProfile(p)[0]!;
  assert.equal(c.value, 0.5, "mẫu số chỉ gồm cổng ĐÃ quan sát đủ");
  assert.equal(c.nStations, 1);
});

test("không trạm nào đủ quan sát ⇒ ô thành phố là null, không phải 0", () => {
  const p = make(1, [10]);
  put(p, 0, 0, 3, 0.2);
  assert.equal(cityProfile(p)[0]!.value, null);
});

test("`observedH` của ô thành phố tính trên TOÀN BỘ cổng lắp đặt", () => {
  // Kể cả cổng của trạm chưa từng báo cáo (chúng đóng góp 0 giờ) — đó chính là chỗ nói ra
  // rằng mẫu số của ô này nhỏ hơn cả thành phố.
  const p = make(2, [10, 30]);
  put(p, 0, 0, 5, 4); // chỉ trạm 10 cổng có quan sát
  const c = cityProfile(p)[0]!;
  assert.equal(c.observedH, (4 * 10) / 40, "1 h — dưới ngưỡng thì ô này vẽ vân xám");
});

test("hồ sơ thành phố luôn đủ 168 ô, kể cả khi không có dữ liệu", () => {
  assert.equal(cityProfile(make(1, [10])).length, HOURS_IN_WEEK);
});
