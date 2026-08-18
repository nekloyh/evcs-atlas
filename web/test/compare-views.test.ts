/**
 * Test cho ba câu hỏi SO SÁNH thêm ngày 15/8/2026 — DESIGN.md §3d-2, §3d-3, §3d-4.
 *
 * Cùng lý do đã ghi ở đầu `story.test.ts`: đây là **phép tính**, và ảnh chụp chứng minh
 * được phân bố của Hà Nội hôm nay chứ không chứng minh được phép tính. Cả ba đều sai được
 * theo kiểu im lặng — kết quả vẫn *trông hợp lý*:
 *
 *   · đường tiếp cận: quên bỏ ô không người ⇒ đường có bậc phẳng giả; tra bậc thang nhầm
 *     đầu ⇒ báo phủ được nhiều dân hơn sự thật, tức phóng đại đúng thứ đang muốn chứng minh;
 *   · Lorenz cung↔cầu: cổng ở ô KHÔNG dân bị `lorenz()` bỏ lặng lẽ ⇒ tổng cổng trên hình
 *     nhỏ hơn tổng thật mà không có gì nói ra;
 *   · xếp hạng: với ít xã, `slice` từ hai phía kể **cùng một xã** ở cả hai đầu.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { accessCurve, distForShare, shareWithin, thinAccess } from "../src/viz/access.ts";
import { supplyEquity } from "../src/viz/equity.ts";
import { rankCommunes } from "../src/viz/rank.ts";
import { compareViewsFor, DEFAULT_FIELD, FIELD_BY_ID } from "../src/fields.ts";

// ══ Đường TIẾP CẬN theo dân — §3d-2 ═══════════════════════════════════════════

test("đường tiếp cận đơn điệu, kết thúc ở 100% và chỉ đếm NGƯỜI", () => {
  const c = accessCurve([
    { pop: 100, dist: 300 },
    { pop: 300, dist: 900 },
    { pop: 600, dist: 1500 },
  ]);
  assert.equal(c.popMeasured, 1000);
  assert.equal(c.popUnmeasured, 0);
  assert.equal(c.maxD, 1500);
  for (let i = 1; i < c.curve.length; i++) {
    assert.ok(c.curve[i]!.d >= c.curve[i - 1]!.d, "hoành độ phải không giảm");
    assert.ok(c.curve[i]!.share >= c.curve[i - 1]!.share, "tung độ phải không giảm");
  }
  assert.equal(c.curve[c.curve.length - 1]!.share, 1);
});

test("ô KHÔNG có người không tạo bậc — chúng không dịch `share` một chút nào", () => {
  const withEmpty = accessCurve([
    { pop: 0, dist: 100 },
    { pop: 0, dist: 200 },
    { pop: 50, dist: 300 },
  ]);
  // Chỉ hai điểm: gốc và ô có người. Ba bậc là dấu hiệu ô rỗng đã lọt vào đường cong.
  assert.equal(withEmpty.curve.length, 2);
  assert.equal(withEmpty.popMeasured, 50);
});

test("dân ở ô KHÔNG đo được khoảng cách bị tách ra, không cộng vào bán kính nào", () => {
  const c = accessCurve([
    { pop: 400, dist: 500 },
    { pop: 600, dist: null },
    { pop: 100, dist: Number.NaN },
  ]);
  assert.equal(c.popMeasured, 400);
  assert.equal(c.popUnmeasured, 700);
  // Mẫu số là dân ĐO ĐƯỢC. Trộn 700 người kia vào sẽ kéo mọi tỉ lệ xuống một cách âm thầm.
  assert.equal(shareWithin(c, 500), 1);
});

test("`shareWithin` lấy bậc ĐÃ đạt, `distForShare` lấy điểm ĐẦU TIÊN đạt ngưỡng", () => {
  const c = accessCurve([
    { pop: 1, dist: 100 },
    { pop: 1, dist: 200 },
    { pop: 2, dist: 400 },
  ]);
  assert.equal(shareWithin(c, 99), 0);
  assert.equal(shareWithin(c, 100), 0.25);
  // 150 m: bậc 200 m CHƯA đạt. Lấy bậc kế tiếp là báo phủ nhiều dân hơn sự thật.
  assert.equal(shareWithin(c, 150), 0.25);
  assert.equal(shareWithin(c, 400), 1);
  assert.equal(shareWithin(c, 10_000), 1);

  assert.equal(distForShare(c, 0.5), 200);
  assert.equal(distForShare(c, 0.4), 200);
  assert.equal(distForShare(c, 1), 400);
  assert.equal(distForShare(c, 1.5), null);
});

test("ô cùng khoảng cách gộp vào MỘT điểm — đường tích luỹ không có đoạn thẳng đứng", () => {
  const c = accessCurve([
    { pop: 10, dist: 500 },
    { pop: 30, dist: 500 },
  ]);
  assert.equal(c.curve.length, 2);
  assert.equal(c.curve[1]!.share, 1);
});

test("`thinAccess` giữ nguyên hai đầu", () => {
  const long = Array.from({ length: 5_000 }, (_, i) => ({ d: i, share: i / 4_999 }));
  const t = thinAccess(long, 400);
  assert.equal(t.length, 400);
  assert.deepEqual(t[0], long[0]);
  assert.deepEqual(t[t.length - 1], long[long.length - 1]);
});

// ══ Lorenz CUNG ↔ CẦU — §3d-3 ═════════════════════════════════════════════════

test("cung rải đúng theo cầu ⇒ Gini 0", () => {
  const even = Array.from({ length: 50 }, () => ({ pop: 200, ports: 4 }));
  const e = supplyEquity(even);
  assert.ok(Math.abs(e.l.gini) < 1e-12, `gini = ${e.l.gini}`);
  assert.equal(e.portsNoPop, 0);
  assert.equal(e.popAll, 10_000);
});

test("cổng ở ô KHÔNG dân bị đếm riêng, không lặng lẽ rơi khỏi tổng", () => {
  const e = supplyEquity([
    { pop: 100, ports: 2 },
    { pop: 0, ports: 8 },
    { pop: 0, ports: 0 },
  ]);
  assert.equal(e.portsAll, 10);
  // 8 cổng này KHÔNG thuộc về phần dân nào; nếu chúng lặng lẽ biến mất thì hình nói về 2
  // cổng trong khi thành phố có 10.
  assert.equal(e.portsNoPop, 8);
  assert.equal(e.l.nCells, 1);
});

test("cung dồn vào một chỗ ⇒ đường vồng lên và Gini tiến tới 1", () => {
  const skewed = [
    { pop: 100, ports: 100 },
    ...Array.from({ length: 99 }, () => ({ pop: 100, ports: 0 })),
  ];
  const e = supplyEquity(skewed);
  assert.ok(e.l.gini > 0.9, `gini = ${e.l.gini}`);
  // 1% dân dày cổng nhất nắm TOÀN BỘ số cổng.
  assert.ok(e.l.curve.some((p) => p.a <= 0.02 && p.p >= 0.999));
});

// ══ Xếp hạng gọi tên — §3d-4 ══════════════════════════════════════════════════

const row = (code: string, value: number | null) => ({ code, name: `Xã ${code}`, value });

test("hai đầu KHÔNG được trùng nhau khi ít xã hơn 2n", () => {
  const r = rankCommunes([row("a", 1), row("b", 2), row("c", 3)], 8);
  assert.equal(r.top.length, 1);
  assert.equal(r.bottom.length, 1);
  const codes = new Set([...r.top, ...r.bottom].map((x) => x.code));
  assert.equal(codes.size, 2, "một xã lọt vào cả hai đầu");
  assert.equal(r.top[0]!.code, "c");
  assert.equal(r.bottom[0]!.code, "a");
});

test("thang lo/hi lấy trên TOÀN BỘ xã có giá trị, không chỉ trên xã lọt bảng", () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(String(i), i));
  const r = rankCommunes(rows, 3);
  assert.equal(r.hi, 39);
  assert.equal(r.lo, 0);
  assert.equal(r.nWithValue, 40);
  assert.deepEqual(r.top.map((x) => x.value), [39, 38, 37]);
  // `bottom` TĂNG dần: xã thấp nhất đứng ĐẦU nhóm "THẤP NHẤT". Mỗi nhóm mở đầu bằng cái
  // cực đoan nhất của nó — nếu xếp ngược, hàng đầu tiên mắt chạm tới lại là hàng ít đáng
  // nhìn nhất của cả bảng.
  assert.deepEqual(r.bottom.map((x) => x.value), [0, 1, 2]);
});

test("nhóm HOÀ được đếm — 8 tên rút từ 40 xã cùng bằng 0 không phải một thứ hạng", () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => row(`z${i}`, 0)),
    ...Array.from({ length: 10 }, (_, i) => row(`h${i}`, i + 1)),
  ];
  const r = rankCommunes(rows, 8);
  assert.equal(r.nAtLo, 40, "40 xã cùng đáy");
  assert.equal(r.nAtHi, 1);
  assert.ok(r.bottom.every((x) => x.value === 0));
  // Chính vì nAtLo (40) > bottom.length (8) mà bảng phải in dòng "cùng bằng".
  assert.ok(r.nAtLo > r.bottom.length);
});

test("xã không có giá trị được ĐẾM chứ không xếp ở 0", () => {
  const r = rankCommunes([row("a", 5), row("b", null), row("c", Number.NaN), row("d", 1)], 2);
  assert.equal(r.nNull, 2);
  assert.equal(r.nWithValue, 2);
  assert.ok(![...r.top, ...r.bottom].some((x) => x.value === 0));
});

test("không xã nào có giá trị ⇒ bảng rỗng, không nổ", () => {
  const r = rankCommunes([row("a", null)], 5);
  assert.deepEqual(r.top, []);
  assert.deepEqual(r.bottom, []);
  assert.equal(r.nNull, 1);
});

// ══ Câu nào dựng được trên measure nào — §3d ══════════════════════════════════

test("`compareViewsFor` là chỗ DUY NHẤT biết luật, và measure mặc định có ba câu", () => {
  const def = FIELD_BY_ID.get(DEFAULT_FIELD)!;
  const views = compareViewsFor(def);
  assert.ok(views.includes("distribution"));
  assert.ok(views.includes("rank-communes"), "trường của XÃ phải gọi được tên");
  assert.ok(views.includes("supply-equity"), "lens CUNG hỏi đúng câu cung↔cầu");
  // Câu ĐẦU là câu chốt lại khi measure đổi làm câu đang mở hết nghĩa.
  assert.equal(views[0], "distribution");
});

test("xếp hạng chỉ dựng ở đơn vị đọc XÃ; ô H3 không có tên để gọi", () => {
  const cellField = FIELD_BY_ID.get("population")!;
  assert.equal(cellField.readAs, "cell");
  assert.ok(!compareViewsFor(cellField).includes("rank-communes"));
  assert.ok(compareViewsFor(cellField).includes("demand-access"));
});

test("đường tiếp cận gắn với LENS Tiếp cận, không với một id cụ thể", () => {
  const access = FIELD_BY_ID.get("dist_station_network_m")!;
  assert.equal(access.lens, "access");
  assert.ok(compareViewsFor(access).includes("access-curve"));
  // Trường của lens khác thì KHÔNG — nếu không, mọi measure đều kèm cùng một biểu đồ và
  // tiết SO SÁNH thành dashboard (§0 cấm).
  assert.ok(!compareViewsFor(FIELD_BY_ID.get("population")!).includes("access-curve"));
});
