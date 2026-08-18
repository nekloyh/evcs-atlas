/**
 * Test cho việc chia bậc — DESIGN.md §6a và ràng buộc 1 (§10).
 *
 * Vì sao có file này: §6a là **quy tắc**, không phải một phân bố. Ảnh chụp `n_mall` chứng
 * minh được rằng quy tắc gộp bậc chạy đúng TRÊN `n_mall`; nó không chứng minh được rằng
 * quy tắc đúng. Đây là logic thuần, nhiều nhánh, không cần DOM — chỗ điển hình để test
 * bằng assert chứ không bằng mắt.
 *
 * Chạy: `pnpm test` (node:test + node:assert, không thêm dependency — DESIGN §1, §12).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COLD_RGB,
  RAMP_RGB,
  buildScale,
  classCount,
  classOf,
  colorFor,
  computeClassing,
  computeClassingByWeight,
  rampFor,
  scaleColors,
  scaleInks,
  type NumericScale,
} from "../src/viz/palette.ts";

const numeric = (v: (number | null)[]) => computeClassing(v);
const rep = <T,>(v: T, n: number): T[] => Array.from({ length: n }, () => v);

// ── §6a quy tắc 1 — mặc định 7 bậc phân vị trên giá trị KHÔNG NULL ─────────────

test("mặc định: 7 bậc, ngưỡng tăng dần nghiêm ngặt", () => {
  const s = numeric(Array.from({ length: 100 }, (_, i) => i + 1));
  assert.equal(s.kind, "numeric");
  assert.equal(s.breaks.length, 7);
  assert.equal(s.zeroClass, false);
  for (let i = 1; i < s.breaks.length; i++) {
    assert.ok(s.breaks[i]! > s.breaks[i - 1]!, `bậc ${i} phải lớn hơn bậc trước`);
  }
});

test("null / NaN / undefined bị đếm riêng, không lọt vào phân vị", () => {
  const s = computeClassing([10, 20, null, Number.NaN, undefined, 30]);
  assert.equal(s.n, 3);
  assert.equal(s.nNull, 3);
  // ngưỡng thấp nhất là min của giá trị THẬT, không bị 0 giả kéo xuống
  assert.equal(s.breaks[0], 10);
});

test("phân vị tính trên giá trị không null, không phải trên toàn mảng", () => {
  const withNulls = computeClassing([...rep(null, 500), ...Array.from({ length: 100 }, (_, i) => i + 1)]);
  const withoutNulls = numeric(Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual(withNulls.breaks, withoutNulls.breaks);
});

// ── §6a quy tắc 2 — ≥5% giá trị đúng 0 ⇒ bậc 1 là tập {0} riêng ───────────────

test("≥5% số 0 ⇒ bậc {0} riêng, 6 bậc còn lại chia trên giá trị > 0", () => {
  const s = numeric([...rep(0, 20), ...Array.from({ length: 80 }, (_, i) => i + 1)]);
  assert.equal(s.zeroClass, true);
  assert.equal(s.breaks[0], 0);
  assert.ok(s.breaks.length <= 7);
  // ngưỡng thứ hai phải > 0: nếu bằng 0 thì "0" và "ít" đã bị gộp — đúng thứ §6a cấm
  assert.ok(s.breaks[1]! > 0);
});

test("dưới ngưỡng 5% thì KHÔNG tách bậc {0}", () => {
  const s = numeric([...rep(0, 4), ...Array.from({ length: 96 }, (_, i) => i + 1)]);
  assert.equal(s.zeroClass, false);
});

test("đúng 5% là tách (ngưỡng bao gồm chính nó)", () => {
  const s = numeric([...rep(0, 5), ...Array.from({ length: 95 }, (_, i) => i + 1)]);
  assert.equal(s.zeroClass, true);
});

test("0 không bao giờ rơi cùng bậc với giá trị dương nhỏ nhất", () => {
  const s = numeric([...rep(0, 50), ...rep(1, 30), ...rep(2, 20)]);
  assert.equal(classOf(0, s), 0);
  assert.notEqual(classOf(1, s), 0);
});

// ── §6a quy tắc 3 — ngưỡng trùng thì GỘP, hiện đúng số bậc còn lại ────────────

test("phân bố lệch nặng: gộp bậc trùng, KHÔNG độn cho đủ 7", () => {
  // hình dạng của n_mall: 99,3% ô là 0, phần còn lại chỉ nhận 1 hoặc 2
  const s = numeric([...rep(0, 993), ...rep(1, 5), ...rep(2, 2)]);
  assert.deepEqual(s.breaks, [0, 1, 2]);
  assert.equal(classCount(s), 3, "legend phải hiện 3 swatch, không phải 7");
});

test("mọi giá trị bằng nhau ⇒ đúng 1 bậc", () => {
  const s = numeric(rep(5, 50));
  assert.equal(s.breaks.length, 1);
  assert.equal(classOf(5, s), 0);
});

test("không có bậc trùng nào lọt ra ngoài ở bất kỳ phân bố lệch nào", () => {
  for (const zeros of [0, 100, 500, 900, 990]) {
    const s = numeric([...rep(0, zeros), ...rep(1, 1000 - zeros)]);
    const uniq = new Set(s.breaks);
    assert.equal(uniq.size, s.breaks.length, `zeros=${zeros}: có ngưỡng trùng lọt ra`);
  }
});

test("số màu LUÔN bằng số bậc thật — bản đồ và legend không thể lệch nhau", () => {
  for (const s of [
    numeric([...rep(0, 993), ...rep(1, 5), ...rep(2, 2)]),
    numeric(Array.from({ length: 100 }, (_, i) => i + 1)),
    numeric(rep(5, 10)),
    buildScale("bool", [true, false, null]),
    buildScale("categorical", ["A", "A", "B", null]),
  ]) {
    assert.equal(scaleColors(s).length, classCount(s));
    assert.equal(scaleInks(s).length, classCount(s));
  }
});

test("ít bậc thì vẫn trải hết biên độ nhạt→đậm của ramp", () => {
  const s = numeric([...rep(0, 993), ...rep(1, 5), ...rep(2, 2)]);
  const colors = scaleColors(s);
  assert.deepEqual(colors[0], RAMP_RGB[0], "bậc thấp nhất = c1");
  assert.deepEqual(colors[colors.length - 1], RAMP_RGB[6], "bậc cao nhất = c7");
});

// ── §6a quy tắc 4 — bool: 2 bậc, c2 và c6 ────────────────────────────────────

test("bool: đúng 2 bậc, dùng c2 và c6", () => {
  const s = buildScale("bool", [true, true, false, null]);
  assert.equal(s.kind, "bool");
  assert.equal(classCount(s), 2);
  assert.deepEqual(scaleColors(s), [RAMP_RGB[1], RAMP_RGB[5]]);
  assert.equal(classOf(false, s), 0);
  assert.equal(classOf(true, s), 1);
  if (s.kind === "bool") {
    assert.deepEqual(s.counts, [1, 2]);
    assert.equal(s.nNull, 1);
  }
});

// ── §6a quy tắc 5 — hạng mục: bậc LẠNH, không phải ramp tuần tự ───────────────

test("hạng mục: dùng bậc lạnh, xếp theo số ô giảm dần", () => {
  const s = buildScale("categorical", ["B", "A", "A", "A", "B", "C", null]);
  assert.equal(s.kind, "categorical");
  if (s.kind !== "categorical") return;
  assert.deepEqual(s.categories, ["A", "B", "C"]);
  assert.deepEqual(s.counts, [3, 2, 1]);
  assert.equal(s.nNull, 1);
  assert.deepEqual(scaleColors(s), [COLD_RGB[0], COLD_RGB[1], COLD_RGB[2]]);
  // KHÔNG được chạm vào ramp cam: thứ tự ở hạng mục không có nghĩa
  for (const c of scaleColors(s)) {
    assert.ok(!RAMP_RGB.some((r) => r[0] === c[0] && r[1] === c[1] && r[2] === c[2]));
  }
});

test("hạng mục lạ (không có trong dữ liệu) không có bậc", () => {
  const s = buildScale("categorical", ["A", "B"]);
  assert.equal(classOf("KHONG_TON_TAI", s), null);
});

// ── Ràng buộc 1 — null KHÔNG BAO GIỜ rơi vào ramp ────────────────────────────

test("ràng buộc 1: null trả về null màu ở MỌI kiểu scale", () => {
  const scales = [
    numeric([1, 2, 3]),
    numeric([...rep(0, 50), ...rep(1, 50)]),
    buildScale("bool", [true, false]),
    buildScale("categorical", ["A", "B"]),
  ];
  for (const s of scales) {
    assert.equal(classOf(null, s), null);
    assert.equal(colorFor(null, s), null, "null phải ra gạch chéo, không ra màu");
    assert.equal(colorFor(undefined, s), null);
  }
});

test("ràng buộc 1: 0 và null là HAI thứ khác nhau", () => {
  const s = numeric([...rep(0, 50), ...rep(1, 50)]);
  assert.notEqual(colorFor(0, s), null, "0 là một giá trị, phải được tô");
  assert.equal(colorFor(null, s), null, "null không phải giá trị, không được tô");
});

test("ràng buộc 1: mảng toàn null cho ra scale rỗng, không cho ra bậc giả", () => {
  const s = numeric(rep(null, 100));
  assert.equal(s.breaks.length, 0);
  assert.equal(s.n, 0);
  assert.equal(s.nNull, 100);
  assert.equal(colorFor(null, s), null);
});

test("kiểu sai không được lẻn vào ramp số", () => {
  const s: NumericScale = numeric([1, 2, 3]);
  assert.equal(classOf("1" as never, s), null);
  assert.equal(classOf(true as never, s), null);
});

// ── Giá trị biên ─────────────────────────────────────────────────────────────

test("mảng rỗng không làm nổ", () => {
  const s = numeric([]);
  assert.deepEqual(s.breaks, []);
  assert.equal(s.n, 0);
  assert.equal(s.nNull, 0);
});

test("giá trị trên ngưỡng cao nhất vào bậc cuối, dưới ngưỡng thấp nhất vào bậc đầu", () => {
  const s = numeric(Array.from({ length: 100 }, (_, i) => i + 1));
  assert.equal(classOf(1e9, s), s.breaks.length - 1);
  assert.equal(classOf(-1e9, s), 0);
});

test("số âm vẫn chia bậc bình thường (không giả định dữ liệu không âm)", () => {
  const s = numeric(Array.from({ length: 100 }, (_, i) => i - 50));
  assert.equal(s.breaks.length, 7);
  assert.ok(s.breaks[0]! < 0);
  assert.notEqual(colorFor(-50, s), null);
});

// ── M2.1 (B): cực tính — đảo ánh xạ, KHÔNG đảo ramp ────────────────────────────

test("trung tính và `high-bad` cho cùng thứ tự màu — 40+ trường không đổi gì", () => {
  const s = numeric([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(rampFor(s).colors, rampFor(s, "high-bad").colors);
  assert.deepEqual(rampFor(s).colors, scaleColors(s));
});

test("`high-good` không đảo nghĩa độ đậm", () => {
  const s = numeric([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const base = rampFor(s).colors;
  const flipped = rampFor(s, "high-good").colors;
  assert.deepEqual(flipped, base);
  assert.deepEqual(flipped[0], base[0]);
});

test("mực chữ vẫn đi cùng swatch khi field có polarity", () => {
  const s = numeric([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const { colors, inks } = rampFor(s, "high-good");
  const { colors: c0, inks: i0 } = rampFor(s);
  for (let k = 0; k < colors.length; k++) {
    const j = c0.findIndex((c) => c[0] === colors[k]![0] && c[1] === colors[k]![1]);
    assert.equal(inks[k], i0[j], `bậc ${k}: mực không đi theo swatch`);
  }
});

test("cực tính KHÔNG áp cho bool/hạng mục — ở đó không có nhiều/ít để đảo", () => {
  const b = buildScale("bool", [true, false, true]);
  assert.deepEqual(rampFor(b, "high-good").colors, rampFor(b).colors);
  const c = buildScale("categorical", ["A", "B", "A"]);
  assert.deepEqual(rampFor(c, "high-good").colors, rampFor(c).colors);
});

test("số bậc không đổi khi đảo — đảo là hoán vị, không phải thêm/bớt", () => {
  for (const vals of [[1, 1, 1], [1, 2], Array.from({ length: 50 }, (_, i) => i)]) {
    const s = numeric(vals);
    assert.equal(rampFor(s, "high-good").colors.length, rampFor(s).colors.length);
  }
});

// ── M2.1 (F8): chia bậc đều theo TRỌNG SỐ ──────────────────────────────────────

test("mỗi dải chứa xấp xỉ cùng một lượng trọng số, không cùng số phần tử", () => {
  // 100 ô nhỏ (1 người) + 1 ô khổng lồ (1000 người). Chia đều theo Ô sẽ dồn 6/7 dải vào
  // đám ô 1 người; chia đều theo NGƯỜI phải kéo ngưỡng lên tới ô lớn.
  const vals = [...rep(1, 100), 1000];
  const byCell = computeClassing(vals).breaks;
  const byWeight = computeClassingByWeight(vals).breaks;
  assert.ok(
    byWeight[byWeight.length - 1]! > byCell[byCell.length - 1]!,
    "ngưỡng cao nhất phải vươn tới chỗ có người",
  );
});

test("ngưỡng tăng dần nghiêm ngặt, không có bậc trùng (§6a-3)", () => {
  const s = computeClassingByWeight(Array.from({ length: 400 }, (_, i) => i + 1));
  for (let i = 1; i < s.breaks.length; i++) {
    assert.ok(s.breaks[i]! > s.breaks[i - 1]!, `bậc ${i} không lớn hơn bậc trước`);
  }
  assert.ok(s.breaks.length <= 7);
});

test("giá trị ≤ 0 và không hữu hạn bị loại — mặt độ không có ô âm", () => {
  const s = computeClassingByWeight([0, -5, Number.NaN, Number.POSITIVE_INFINITY, 10, 20, 30]);
  assert.equal(s.n, 3);
  assert.ok(s.breaks.every((b) => b > 0));
});

test("mảng rỗng / toàn 0 cho scale rỗng, không cho bậc giả", () => {
  assert.deepEqual(computeClassingByWeight([]).breaks, []);
  assert.deepEqual(computeClassingByWeight([0, 0, 0]).breaks, []);
});

test("mọi giá trị bằng nhau ⇒ đúng 1 bậc, không độn 7", () => {
  assert.equal(computeClassingByWeight(rep(5, 50)).breaks.length, 1);
});
