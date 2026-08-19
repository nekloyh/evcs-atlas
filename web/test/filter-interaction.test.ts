/**
 * Phase 4 — hồi quy cho hợp đồng LỌC ở tầng reducer và predicate.
 *
 * Ba nhóm dưới đây là ba lỗi đã bắt được trong đợt QA Phase 4: mệnh đề `b` hỏng biến thành
 * bộ lọc thật, phép thử subset bị chép ra bốn bản lệch nhau, và lần xoá do đổi Lens không
 * nói được lý do. Chúng ở đây để không quay lại lần nữa.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { PowerTierId } from "../src/state/filter";
import {
  applyFilterIntent,
  canonicalFilter,
  filterKeepsCell,
  filterKeepsStation,
  isKnownPopulation,
  parseFilter,
  serializeFilter,
  INITIAL_FILTER_STATE,
  type AnalysisFilter,
} from "../src/state/filter";
import { DEFAULT_DATASET_ID } from "../src/state/selection";

const range = (lo: number, hi: number): AnalysisFilter => ({
  version: 1,
  mode: "subset",
  datasetId: DEFAULT_DATASET_ID,
  entity: "h3-cell",
  field: "population",
  op: "between",
  lo,
  hi,
  missing: "exclude",
  source: "demand-population-histogram",
});

const tiers = (values: readonly PowerTierId[]): AnalysisFilter => ({
  version: 1,
  mode: "subset",
  datasetId: DEFAULT_DATASET_ID,
  entity: "station",
  field: "power-tier",
  op: "in",
  values,
  missing: "explicit-category",
  source: "supply-power-tier-breakdown",
});

// ── 1. Mệnh đề `b` hỏng KHÔNG được biến thành bộ lọc thật ───────────────────

test("biên rỗng trong khoảng dân số bị BỎ, không đọc thành 0", () => {
  // `Number("")` là `0` và lọt qua `Number.isFinite`. Một link bị cắt cụt từng mở ra
  // khoảng `[0, 120]` — tập con khác hẳn thứ người gửi chọn, không dấu hiệu nào báo sai.
  assert.equal(parseFilter("f1~h3-cell~population~between~.."), null);
  assert.equal(parseFilter("f1~h3-cell~population~between~120.."), null);
  assert.equal(parseFilter("f1~h3-cell~population~between~..120"), null);
  assert.equal(parseFilter("f1~h3-cell~population~between~ .. "), null);

  // Mệnh đề legacy đi qua cùng một cổng.
  assert.equal(parseFilter("h:population:.."), null);
  assert.equal(parseFilter("h:population:120.."), null);

  // Khoảng ĐỦ hai biên vẫn đọc bình thường, kể cả biên 0 hợp lệ.
  const ok = parseFilter("f1~h3-cell~population~between~0..120");
  assert.ok(ok && ok.op === "between");
  assert.equal(ok.lo, 0);
  assert.equal(ok.hi, 120);
});

test("token bậc công suất lạ làm hỏng CẢ mệnh đề, không bị bỏ riêng", () => {
  // Bỏ riêng sẽ đổi `le-22.bogus` thành bộ lọc `{le-22}`: một tập con KHÁC, im lặng.
  assert.equal(parseFilter("f1~station~power-tier~in~le-22.bogus"), null);
  assert.equal(parseFilter("f1~station~power-tier~in~bogus"), null);

  const ok = parseFilter("f1~station~power-tier~in~le-22.gt-180");
  assert.ok(ok && ok.op === "in");
  assert.deepEqual(ok.values, ["le-22", "gt-180"]);
});

test("khoảng hợp lệ đi vòng hash vẫn là chính nó", () => {
  const f = canonicalFilter(range(10, 5000))!;
  assert.deepEqual(parseFilter(serializeFilter(f)), f);
});

// ── 2. MỘT predicate cho cả bản đồ, biểu đồ, readout và Inspector ────────────

test("dân số ÂM và không hữu hạn đều là KHUYẾT, không phải giá trị nhỏ", () => {
  assert.equal(isKnownPopulation(0), true);
  assert.equal(isKnownPopulation(12.5), true);
  assert.equal(isKnownPopulation(-1), false);
  assert.equal(isKnownPopulation(NaN), false);
  assert.equal(isKnownPopulation(null), false);
  assert.equal(isKnownPopulation(undefined), false);
});

test("filterKeepsCell bao gồm cả hai biên và loại mọi hàng khuyết", () => {
  const f = range(10, 100);
  assert.equal(filterKeepsCell(f, { pop: 10 }), true, "biên dưới nằm TRONG khoảng");
  assert.equal(filterKeepsCell(f, { pop: 100 }), true, "biên trên nằm TRONG khoảng");
  assert.equal(filterKeepsCell(f, { pop: 9.99 }), false);
  assert.equal(filterKeepsCell(f, { pop: 100.01 }), false);
  assert.equal(filterKeepsCell(f, { pop: null }), false);
  assert.equal(filterKeepsCell(f, { pop: NaN }), false);

  // Ô dân số ÂM từng vừa được bản đồ vẽ vừa bị model đếm là khuyết — hai bản sao lệch nhau.
  assert.equal(filterKeepsCell(range(-5, 5), { pop: -1 }), false);

  // Không có bộ lọc ⇒ giữ tất, kể cả hàng khuyết: đó là việc của bộ lọc, không phải của null.
  assert.equal(filterKeepsCell(null, { pop: null }), true);
});

test("filterKeepsStation chỉ xét BẬC, không gánh luật IN-only", () => {
  const f = tiers(["le-22", "gt-180"]);
  assert.equal(filterKeepsStation(f, { inScope: true, powerTier: "le-22" }), true);
  assert.equal(filterKeepsStation(f, { inScope: true, powerTier: "23-60" }), false);

  // Trạm BUFFER vẫn "qua" bộ lọc: nó bị loại khỏi tập phân tích bởi luật IN-only (§1.3),
  // và trộn hai thứ lại sẽ đọc thành "bộ lọc đang loại trạm này".
  assert.equal(filterKeepsStation(f, { inScope: false, powerTier: "le-22" }), true);
  assert.equal(filterKeepsStation(null, { inScope: false, powerTier: "unknown" }), true);

  // Thiếu `powerTier` thì phân loại lại từ công suất cổng lớn nhất — vẫn đúng một luật.
  assert.equal(filterKeepsStation(f, { inScope: true, powerKwMaxPort: 11 }), true);
  assert.equal(filterKeepsStation(f, { inScope: true, powerKwMaxPort: 60 }), false);
  assert.equal(filterKeepsStation(tiers(["unknown"]), { inScope: true, powerKwMaxPort: null }), true);
});

// ── 3. Revision, tham chiếu, và lý do xoá ───────────────────────────────────

test("filter trùng nghĩa là NO-OP: giữ nguyên tham chiếu và revision", () => {
  const s1 = applyFilterIntent(INITIAL_FILTER_STATE, range(0, 500));
  assert.equal(s1.revision, 1);
  const s2 = applyFilterIntent(s1, range(0, 500));
  assert.equal(s2, s1, "state phải là CÙNG một object");
  assert.equal(s2.revision, 1);
});

test("xoá vì đổi Lens ghi lại LÝ DO, và revision không lùi", () => {
  const active = applyFilterIntent(INITIAL_FILTER_STATE, range(0, 500));
  const cleared = applyFilterIntent(active, null, undefined, "lens-incompatible");
  assert.equal(cleared.active, null);
  assert.equal(cleared.revision, 2, "revision là số đếm TIẾN, không đặt lại về 0");
  assert.equal(cleared.clearedReason, "lens-incompatible");

  // Đặt bộ lọc mới thì thông báo cũ phải tắt.
  const next = applyFilterIntent(cleared, range(1, 2));
  assert.equal(next.clearedReason, null);
  assert.equal(next.revision, 3);
});
