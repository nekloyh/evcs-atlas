import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIELD_BY_ID,
  NATIONAL_FIELDS,
  NORMALIZED_PROVINCE_FIELDS,
  OTHER_PROVINCE_FIELDS,
  PROVINCE_FIELDS,
} from "../src/national/fields";
import { comparableValues, provinceMetric, rankProvinces } from "../src/national/metrics";
import { validateProvinceRows, type ProvinceRow } from "../src/national/data";

const row = (code: string, value: number | null, extra: Record<string, unknown> = {}): ProvinceRow => ({
  province_code: code,
  province_name: `Tỉnh ${code}`,
  in_store: true,
  ports_per_10k_pop: value,
  n_ports: value === null ? null : value * 100,
  population: 100_000,
  ...extra,
});

test("selector chuẩn hoá chỉ chứa field có KPI đầy đủ và polarity", () => {
  assert.equal(NORMALIZED_PROVINCE_FIELDS.length, 3);
  for (const field of NORMALIZED_PROVINCE_FIELDS) {
    assert.ok(field.kpi);
    assert.ok(field.kpi.numerator.column);
    assert.ok(field.kpi.denominator.column);
    assert.equal(field.kpi.nullRule, "null-propagates");
    assert.ok(field.polarity);
    assert.equal(field.scaleContract.color, "fixed-binned");
    assert.ok(field.scaleContract.reason);
  }
  for (const field of [...PROVINCE_FIELDS]) assert.ok(field.scaleContract);
});

test("dataset tỉnh thiếu/zero mẫu số không bao giờ thành số hữu hạn", () => {
  const field = FIELD_BY_ID.get("p:ports_per_10k")!;
  for (const denominator of [0, null, undefined]) {
    const metric = provinceMetric(row("01", 99, { population: denominator }), field);
    assert.equal(metric.state, "not-comparable");
    assert.equal(metric.value, null);
  }
  assert.equal(provinceMetric(row("02", null), field).state, "missing");
});

test("ranking loại tỉnh không so được trước khi xếp và dùng competition ties", () => {
  const field = FIELD_BY_ID.get("p:ports_per_10k")!;
  const ranked = rankProvinces(
    [row("01", 5), row("02", 3), row("03", 3), row("04", 100, { population: 0 })],
    field,
  );
  assert.deepEqual(ranked.map((item) => [item.row.province_code, item.rank]), [
    ["01", 1], ["02", 2], ["03", 2], ["04", null],
  ]);
  assert.deepEqual(comparableValues(ranked.map((item) => item.row), field), [5, 3, 3, null]);
});

test("comparability utilization đọc cờ/layer, không có danh sách mã tỉnh", () => {
  const field = FIELD_BY_ID.get("p:utilization")!;
  const bad = row("77", null, {
    util_median: 0.2,
    quality_flags: "KHONG_DO_DUOC_SU_DUNG",
    unusable_layers: [{ layer: "occupancy" }],
  });
  assert.equal(provinceMetric(bad, field).state, "not-comparable");
  const source = readFileSync(new URL("../src/national/metrics.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:04|11|12|14)\b/);
});

test("KPI tiếp cận thiếu cột nguồn là không so sánh được, không phải missing", () => {
  const field = FIELD_BY_ID.get("p:access_within_2km")!;
  const missingDistance = row("77", null, {
    population_grid: 100,
    population_within_2km: null,
    population_access_within_2km: null,
  });
  assert.equal(provinceMetric(missingDistance, field).state, "not-comparable");
});

test("mọi field tỉnh có mặt trong một nhóm picker thật", () => {
  assert.deepEqual(
    new Set([...NORMALIZED_PROVINCE_FIELDS, ...OTHER_PROVINCE_FIELDS].map((field) => field.id)),
    new Set(PROVINCE_FIELDS.map((field) => field.id)),
  );
  const app = readFileSync(new URL("../src/national/NationalApp.tsx", import.meta.url), "utf8");
  assert.match(app, /NORMALIZED_PROVINCE_FIELDS\.map/);
  assert.match(app, /OTHER_PROVINCE_FIELDS\.map/);
});

test("runtime guard chặn suffix merge và cột field bị thiếu", () => {
  const complete = Object.fromEntries(PROVINCE_FIELDS.map((field) => [field.column, 1]));
  const valid = { "01": row("01", 1, complete) };
  assert.equal(validateProvinceRows(valid), valid);
  assert.throws(() => validateProvinceRows({ "01": { ...valid["01"], population_x: 1 } }), /merge/);
  const missing = { ...valid["01"] };
  delete missing[PROVINCE_FIELDS[0]!.column];
  assert.throws(() => validateProvinceRows({ "01": missing }), /thiếu cột/);
});

test("national parquet loader gọi instrumentation và chặn namespace ngoài vn", () => {
  const data = readFileSync(new URL("../src/national/data.ts", import.meta.url), "utf8");
  assert.match(data, /getRegisteredParquetNames\(\)/);
  assert.match(data, /!item\.startsWith\("vn\/"\)/);
  assert.doesNotMatch(data, /registerParquet\(`?p\//);
  assert.equal(NATIONAL_FIELDS.length, PROVINCE_FIELDS.length + 18);
});

test("đa giác chỉ drill-down khi province fixture có in_store", () => {
  const map = readFileSync(new URL("../src/national/NationalMap.tsx", import.meta.url), "utf8");
  assert.match(map, /if \(f\?\.properties\.in_store\) onPickProvince\(f\.properties\.province_code\)/);
});

test("route national là page boundary và cache đăng ký bị chặn ở vn/*", () => {
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /if \(isNationalMode\)/);
  assert.match(main, /import\("\.\/national\/NationalApp"\)/);
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /import NationalApp/);
  assert.match(app, /switchDataset\(NATIONAL\)/);
  const data = readFileSync(new URL("../src/national/data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(data, /registerParquet\(`?p\//);
  assert.match(data, /cellsCache/);
  assert.match(data, /stationsCache/);
  assert.match(data, /poiCache/);
});

// ══ QA-7 — tooltip ô gộp: đơn vị tỉ lệ và bậc H3 đang vẽ ═══════════════════════

test("QA-7 tooltip ô gộp in trường tỉ lệ qua formatValue — 0,27 phải thành 27%", async () => {
  const { tooltip } = await import("../src/national/tooltip.ts");
  const built = FIELD_BY_ID.get("c:built")!;
  const cell = { h3: "861", province_code: "01", built_frac: 0.27 };
  const tt = tooltip(cell, "vn-cells", built, { "01": row("01", 5) }, 6);
  assert.ok(tt);
  assert.match(tt.text, /27%/, `tooltip phải in phần trăm, đang in: ${tt.text}`);
  assert.doesNotMatch(tt.text, /0,27/, "giá trị thô 0,27 không được ra màn hình");
});

test("QA-7 tooltip ô gộp nói đúng BẬC đang vẽ — LOD lên r7 thì chuỗi phải là r7", async () => {
  const { tooltip } = await import("../src/national/tooltip.ts");
  const pop = FIELD_BY_ID.get("c:population")!;
  const cell = { h3: "871", province_code: "01", population: 1234 };
  const at6 = tooltip(cell, "vn-cells", pop, {}, 6)!;
  const at7 = tooltip(cell, "vn-cells", pop, {}, 7)!;
  assert.match(at6.text, /H3 r6/);
  assert.match(at7.text, /H3 r7/);
  assert.doesNotMatch(at7.text, /r6/, "chuỗi r6 ghi cứng sống sót qua LOD");
});
