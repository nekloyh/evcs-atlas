import test from "node:test";
import assert from "node:assert/strict";

import {
  powerTierOf,
  POWER_TIER_ORDER,
  canonicalFilter,
  filterEquals,
  applyFilterIntent,
  isFilterCompatible,
  serializeFilter,
  parseFilter,
  INITIAL_FILTER_STATE,
  type AnalysisFilter,
} from "../src/state/filter";
import { DEFAULT_DATASET_ID } from "../src/state/selection";

test("powerTierOf maps port kW thresholds accurately", () => {
  assert.equal(powerTierOf(null), "unknown");
  assert.equal(powerTierOf(undefined), "unknown");
  assert.equal(powerTierOf(NaN), "unknown");
  assert.equal(powerTierOf(-5), "unknown");

  assert.equal(powerTierOf(0), "le-22");
  assert.equal(powerTierOf(11), "le-22");
  assert.equal(powerTierOf(22), "le-22");

  assert.equal(powerTierOf(22.1), "23-60");
  assert.equal(powerTierOf(30), "23-60");
  assert.equal(powerTierOf(60), "23-60");

  assert.equal(powerTierOf(60.5), "61-120");
  assert.equal(powerTierOf(120), "61-120");

  assert.equal(powerTierOf(120.1), "121-180");
  assert.equal(powerTierOf(180), "121-180");

  assert.equal(powerTierOf(180.1), "gt-180");
  assert.equal(powerTierOf(250), "gt-180");
  assert.equal(powerTierOf(360), "gt-180");
});

test("canonicalFilter standardizes ranges and categorical sets", () => {
  assert.equal(canonicalFilter(null), null);

  // Inverted range gets corrected
  const inverted: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 500,
    hi: 100,
    missing: "exclude",
    source: "demand-population-histogram",
  };
  const canonicalInverted = canonicalFilter(inverted);
  assert.ok(canonicalInverted && canonicalInverted.entity === "h3-cell" && canonicalInverted.op === "between");
  assert.equal(canonicalInverted.lo, 100);
  assert.equal(canonicalInverted.hi, 500);

  // Power tier deduplication and ordering
  const messyTiers: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: ["gt-180", "le-22", "gt-180", "23-60"],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  const canonicalTiers = canonicalFilter(messyTiers);
  assert.ok(canonicalTiers && canonicalTiers.entity === "station" && canonicalTiers.op === "in");
  assert.deepEqual(canonicalTiers.values, ["le-22", "23-60", "gt-180"]);

  // Selecting all tiers means no filter (canonical null)
  const allTiers: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: [...POWER_TIER_ORDER],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  assert.equal(canonicalFilter(allTiers), null);

  // Selecting 0 tiers means no filter (canonical null)
  const emptyTiers: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: [],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  assert.equal(canonicalFilter(emptyTiers), null);
});

test("serializeFilter and parseFilter round-trip canonical filters", () => {
  const demandFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 0,
    hi: 1250,
    missing: "exclude",
    source: "demand-population-histogram",
  };
  const serializedDemand = serializeFilter(demandFilter);
  assert.equal(serializedDemand, "f1~h3-cell~population~between~0..1250");
  const parsedDemand = parseFilter(serializedDemand);
  assert.deepEqual(parsedDemand, canonicalFilter(demandFilter));

  const supplyFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: ["61-120", "gt-180"],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };
  const serializedSupply = serializeFilter(supplyFilter);
  assert.equal(serializedSupply, "f1~station~power-tier~in~61-120.gt-180");
  const parsedSupply = parseFilter(serializedSupply);
  assert.deepEqual(parsedSupply, canonicalFilter(supplyFilter));

  // Corrupted string returns null
  assert.equal(parseFilter("gibberish"), null);
  assert.equal(parseFilter("f1~invalid~format"), null);
  assert.equal(parseFilter("f1~invalid~format"), null);
});

test("applyFilterIntent manages revisions and reference equality", () => {
  const state0 = INITIAL_FILTER_STATE;
  assert.equal(state0.active, null);
  assert.equal(state0.revision, 0);

  const filter1: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 0,
    hi: 500,
    missing: "exclude",
    source: "demand-population-histogram",
  };

  const state1 = applyFilterIntent(state0, filter1);
  assert.equal(state1.revision, 1);
  assert.deepEqual(state1.active, canonicalFilter(filter1));

  // Applying equivalent filter should not increment revision
  const filter1Copy = { ...filter1 };
  assert.equal(filterEquals(filter1, filter1Copy), true);
  assert.equal(filterEquals(filter1, null), false);
  const state1Same = applyFilterIntent(state1, filter1Copy);
  assert.equal(state1Same.revision, 1);
  assert.equal(state1Same, state1);

  // Clearing filter increments revision
  const state2 = applyFilterIntent(state1, null);
  assert.equal(state2.revision, 2);
  assert.equal(state2.active, null);
});

test("isFilterCompatible checks lens and geometry compatibility", () => {
  const cellFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 0,
    hi: 500,
    missing: "exclude",
    source: "demand-population-histogram",
  };

  const stationFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "station",
    field: "power-tier",
    op: "in",
    values: ["le-22"],
    missing: "explicit-category",
    source: "supply-power-tier-breakdown",
  };

  assert.equal(isFilterCompatible(cellFilter, "demand", "cell"), true);
  assert.equal(isFilterCompatible(cellFilter, "demand", "commune"), false);
  assert.equal(isFilterCompatible(cellFilter, "supply"), false);
  assert.equal(isFilterCompatible(cellFilter, "access"), false);

  assert.equal(isFilterCompatible(stationFilter, "supply", "station"), true);
  assert.equal(isFilterCompatible(stationFilter, "supply", "cell"), false);
  assert.equal(isFilterCompatible(stationFilter, "demand"), false);
  assert.equal(isFilterCompatible(stationFilter, "opportunity"), false);

  assert.equal(isFilterCompatible(null, "demand"), true);
  assert.equal(isFilterCompatible(null, "supply"), true);
});

// ── Biên khoảng lọc phải SỐNG SÓT qua URL — hồi quy P4-SER ─────────────────────
//
// `serializeFilter` từng ghi biên qua `Number(v.toFixed(4))`. Phép đó **hạ** giá trị ở
// 2.140/4.400 ô của bộ `p/01`, và vì `filterKeepsCell` đóng hai đầu, ô nằm đúng trên biên
// rơi khỏi tập con sau một vòng ghi↔đọc — im lặng, không lỗi, chỉ ít đi một ô. Đo được:
// brush `[0, v]` mất một ô ở 2.140 giá trị, brush `[v, max]` mất một ô ở 2.125 giá trị, và
// KHÔNG lần nào thêm ô. Lỗi chỉ đi một chiều: tập con teo lại.
//
// Các hằng dưới đây là giá trị THẬT của cột `population` trong `p/01`, chọn đúng những chỗ
// phép làm tròn cũ trượt.

const POP_SAMPLES = [
  0, // ô rỗng — 135 ô, phải ghi ra đúng "0"
  0.05847174167616089, // dân số dương nhỏ nhất của bộ
  0.35600780910965735, // toFixed(4) hạ xuống 0.356
  254.85259244882218,
  726.7280286311009,
  1016.7027003103981, // toFixed(4) hạ xuống 1016.7027
  1597.5331855475758,
  4450.090733270904, // phân vị 0,90 — toFixed(4) nâng lên
  46232.44099893726, // max của bộ — toFixed(4) nâng lên
];

/** Biên tổng hợp có nhiều hơn 4 chữ số thập phân. TẤT ĐỊNH, không random. */
function syntheticBounds(): number[] {
  const out: number[] = [];
  for (let i = 1; i <= 2000; i++) {
    out.push(i * Math.PI, i / 7, i * Math.E * 1000);
  }
  return out;
}

const rangeFilter = (lo: number, hi: number): AnalysisFilter => ({
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

test("P4-SER: bộ lọc [v, v] vẫn giữ chính ô của nó sau vòng ghi↔đọc", () => {
  for (const v of [...POP_SAMPLES, ...syntheticBounds()]) {
    const parsed = parseFilter(serializeFilter(rangeFilter(v, v)));
    assert.ok(parsed, `biên ${v} không đọc lại được`);
    if (parsed.op !== "between") throw new Error("sai nhánh op");
    // Viết thẳng phép thử của `filterKeepsCell` ra đây để phép hồi quy không đổi nghĩa
    // nếu hàm đó được sửa.
    assert.ok(
      v >= parsed.lo && v <= parsed.hi,
      `ô có population=${v} rơi khỏi bộ lọc [${parsed.lo}, ${parsed.hi}] của chính nó`,
    );
  }
});

test("P4-SER: biên đọc lại ĐÚNG BẰNG biên đã ghi", () => {
  for (const v of [...POP_SAMPLES, ...syntheticBounds()]) {
    const parsed = parseFilter(serializeFilter(rangeFilter(0, v)));
    assert.ok(parsed);
    if (parsed.op !== "between") throw new Error("sai nhánh op");
    assert.equal(parsed.hi, v, `biên trên ${v} đọc lại thành ${parsed.hi}`);
    assert.equal(parsed.lo, 0);
  }
});

test("P4-SER: vòng ghi→đọc→ghi hội tụ ngay lần đầu (§9a)", () => {
  // Lý do phép làm tròn cũ tồn tại: listener `hashchange` phải hội tụ, nếu không nó lặp
  // vô hạn. Ghi KHÔNG MẤT MÁT hội tụ ở lần thứ nhất, tức mạnh hơn điều kiện cũ.
  for (const v of [...POP_SAMPLES, ...syntheticBounds()]) {
    const once = serializeFilter(rangeFilter(v, v * 2 + 1));
    const twice = serializeFilter(parseFilter(once));
    assert.equal(twice, once, `chuỗi không hội tụ ở biên ${v}`);
  }
});

test("P4-SER: miền dân số không sinh ký hiệu mũ trong hash", () => {
  // `String(v)` chuyển sang dạng mũ khi số mũ < -6 hoặc >= 21. Dân số nhỏ nhất của bộ là
  // 0,0585 và lớn nhất 46.232, nên cả hai đầu cách xa ngưỡng đó. Kiểm ở đây để một bộ sau
  // này phá giả định ấy thì phép kiểm nói ra, chứ không phải người dùng gặp một khoá bị bỏ.
  for (const v of POP_SAMPLES) {
    const s = serializeFilter(rangeFilter(v, v));
    assert.doesNotMatch(s, /e[+-]/i, `biên ${v} ghi ra dạng mũ: ${s}`);
    // Đúng MỘT dấu phân cách `..` trong cả mệnh đề — một biên tự chứa `..` sẽ cắt sai.
    assert.equal(s.split("..").length, 2, `mệnh đề có nhiều hơn một dấu phân cách: ${s}`);
  }
});
