/**
 * Test cho ma trận bivariate CẦU × CUNG — `src/viz/demand.ts`.
 *
 * Lỗi nó vá, đo trên dữ liệu thật: `n_ports` có **90,0%** ô đúng bằng 0, nên phân vị 1/3 và
 * 2/3 **đều bằng 0**. `tertileClass` phân `value <= breaks[0]` về nhóm 0, nên **nhóm giữa
 * của trục cung không một ô nào rơi vào được**:
 *
 * ```
 *   1452      0     15
 *   1344      0    122
 *   1166      0    301      ⇒ 6/9 ô màu dùng được
 * ```
 *
 * Chú giải thì vẽ một lưới 3×3 cứng — tức hứa ba ô màu bản đồ **không thể** vẽ.
 *
 * Cách vá dùng lại §6a quy tắc 2 chứ không đẻ luật mới: ≥5% giá trị bằng 0 ⇒ {0} là nhóm
 * riêng, giá trị > 0 chia đôi ở trung vị của chính chúng. Test dưới đây kiểm **luật**, và
 * kiểm rằng chú giải không hứa quá.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  bivariateAxes,
  reachableClasses,
  tertileBreaks,
  tertileClass,
} from "../src/viz/demand.ts";

/** Hình dạng thật của `n_ports`: 3.962 ô bằng 0, 438 ô có cổng, cao nhất 374. */
const PORTS = [
  ...Array<number>(3962).fill(0),
  ...Array.from({ length: 438 }, (_, i) => 1 + Math.round((373 * i) / 437)),
];
/** `population`: chỉ 3,1% ô bằng 0 — dưới ngưỡng, nên trục này vẫn là phân vị ba. */
const POP = [
  ...Array<number>(136).fill(0),
  ...Array.from({ length: 4264 }, (_, i) => 1 + i * 3),
];

// ── Lỗi mà luật này sinh ra để vá ──────────────────────────────────────────────

test("trục cung 90% số 0: cả ba nhóm phải có ô, không nhóm nào rỗng", () => {
  const cuts = tertileBreaks(PORTS);
  const seen = reachableClasses(PORTS, cuts);
  assert.deepEqual(seen, [true, true, true], `nhóm rỗng với ngưỡng ${JSON.stringify(cuts)}`);
  assert.equal(cuts[0], 0, "nhóm 0 phải là tập {0}, không phải một phân vị tình cờ bằng 0");
  assert.ok(cuts[1] > 0, "ngưỡng trên phải nằm trong phần DƯƠNG");
});

test("cả chín ô màu đều tới được — trước đây chỉ 6/9", () => {
  const ax = bivariateAxes(PORTS.map((ports, i) => ({ pop: POP[i]!, ports })));
  const used = ax.pop.reachable.filter(Boolean).length * ax.ports.reachable.filter(Boolean).length;
  assert.equal(used, 9, `mới ${used}/9 ô màu dùng được`);
});

// ── Luật chia nhóm ─────────────────────────────────────────────────────────────

test("dưới ngưỡng 5% số 0 thì vẫn là phân vị ba", () => {
  const cuts = tertileBreaks(POP);
  assert.ok(cuts[0] > 0, "trục cầu không được rẽ sang nhánh {0}");
  assert.ok(cuts[0] < cuts[1]);
  assert.deepEqual(reachableClasses(POP, cuts), [true, true, true]);
});

test("từ ngưỡng 5% trở lên thì {0} thành nhóm riêng, phần dương chia đôi ở trung vị", () => {
  // 1/9 = 11,1% số 0 ⇒ rẽ nhánh. Dương là 1..8, trung vị 4.
  const cuts = tertileBreaks([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(cuts, [0, 4]);
  assert.equal(tertileClass(0, cuts), 0);
  assert.equal(tertileClass(4, cuts), 1);
  assert.equal(tertileClass(5, cuts), 2);
});

test("không có số 0 nào thì phân vị ba giữ nguyên như cũ", () => {
  const cuts = tertileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(cuts, [3, 6]);
  assert.equal(tertileClass(1, cuts), 0);
  assert.equal(tertileClass(4, cuts), 1);
  assert.equal(tertileClass(9, cuts), 2);
});

test("trục toàn số 0 không được bịa ra nhóm dương", () => {
  const cuts = tertileBreaks([0, 0, 0]);
  assert.deepEqual(cuts, [0, 0]);
  assert.equal(tertileClass(0, cuts), 0);
  assert.deepEqual(reachableClasses([0, 0, 0], cuts), [true, false, false]);
});

test("trục rỗng trả về ngưỡng trung tính, không ném lỗi", () => {
  assert.deepEqual(tertileBreaks([]), [0, 0]);
  assert.deepEqual(bivariateAxes([]).ports.reachable, [false, false, false]);
});

test("mọi giá trị dương bằng nhau ⇒ chỉ hai nhóm, và chú giải phải biết", () => {
  const v = [0, 0, 0, 5, 5, 5];
  const cuts = tertileBreaks(v);
  const seen = reachableClasses(v, cuts);
  assert.equal(seen.filter(Boolean).length, 2, "co lại còn hai nhóm là hợp lệ");
  assert.equal(seen[2], false, "nhóm rỗng phải khai là rỗng, không được vẽ swatch");
});
