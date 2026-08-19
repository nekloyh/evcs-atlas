/**
 * Phase 5 §7.6 — Quick Preset.
 *
 * Số liệu đo trên gói `p/01` đọc từ hai fixture SINH RA TỪ CHÍNH parquet, kèm dấu
 * `exported_utc`. Dấu ấy được đối chiếu với `manifest.json` ở phép kiểm đầu tiên: gói đổi mà
 * fixture chưa sinh lại thì suite này ĐỎ, chứ không xanh trên một corpus đã lỗi thời.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  EMPTY_PRESET_STATS,
  PRESETS,
  availablePresets,
  isPresetActive,
  presetBoundLabel,
  presetSelfCheck,
  presetStatsFrom,
  quantileOf,
  resolvePreset,
  type PresetStats,
} from "../src/state/presets.ts";
import {
  filterEquals,
  filterKeepsCell,
  filterKeepsStation,
  parseFilter,
  powerTierOf,
  serializeFilter,
} from "../src/state/filter.ts";
import type { Manifest } from "../src/data/manifest.ts";

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel: string) => readFileSync(root(rel), "utf8");

const MANIFEST = JSON.parse(read("public/data/p/01/manifest.json")) as Manifest;
const POP = JSON.parse(read("test/fixtures/p01-population.json")) as {
  exported_utc: string; n: number; values: number[];
};
const STA = JSON.parse(read("test/fixtures/p01-stations.json")) as {
  exported_utc: string; n: number; rows: { scope: string; powerKwMaxPort: number | null }[];
};

const CELLS = POP.values.map((pop, i) => ({ h3: String(i), pop }));
const STATIONS = STA.rows.map((r) => ({
  inScope: r.scope === "IN",
  powerKwMaxPort: r.powerKwMaxPort,
  powerTier: powerTierOf(r.powerKwMaxPort),
}));

const P01: PresetStats = presetStatsFrom({ cells: CELLS, stations: STATIONS, manifest: MANIFEST });

test("fixture còn khớp gói đang mở", () => {
  assert.equal(POP.exported_utc, MANIFEST.exported_utc, "fixture dân số đã lỗi thời — sinh lại");
  assert.equal(STA.exported_utc, MANIFEST.exported_utc, "fixture trạm đã lỗi thời — sinh lại");
  assert.equal(POP.n, 4400);
  assert.equal(STA.n, 939);
  assert.equal(STATIONS.filter((s) => s.inScope).length, 710);
});

// ── §7.6-30 · §7.6-31 ───────────────────────────────────────────────────────

test("§7.6-30 mọi preset thoả `isFilterCompatible` với lens và trường của chính nó", () => {
  for (const p of PRESETS) {
    const resolved = resolvePreset(p, P01);
    assert.ok(resolved, `${p.id} không giải được trên p/01`);
    assert.ok(presetSelfCheck(p, resolved), `${p.id}: filter không sống được ở ${p.lens}/${p.field}`);
  }
});

test("§7.6-31 thiếu cột ⇒ `null` ⇒ ẨN, không phải hiện mà trơ", () => {
  const noPop: PresetStats = { ...P01, columns: new Set([...P01.columns].filter((c) => c !== "grid:population")) };
  assert.equal(resolvePreset(PRESETS.find((p) => p.id === "demand-top-decile")!, noPop), null);
  const ids = availablePresets(noPop).map((e) => e.preset.id);
  assert.ok(!ids.includes("demand-top-decile"));
  assert.ok(!ids.includes("demand-zero-population"));
  assert.ok(ids.includes("supply-ge-61kw"), "preset Cung không được rụng theo");

  const noStationPower: PresetStats = {
    ...P01,
    columns: new Set([...P01.columns].filter((c) => c !== "station:power_kw_max_port")),
  };
  for (const id of ["supply-ge-61kw", "supply-le-22kw", "supply-power-unknown"]) {
    assert.equal(resolvePreset(PRESETS.find((p) => p.id === id)!, noStationPower), null, id);
  }

  // Manifest chưa nạp ⇒ chưa hiện gì. Đoán "chắc là có" sẽ cho một nút bấm ra tập rỗng.
  assert.equal(availablePresets(EMPTY_PRESET_STATS).length, 0);
});

// ── §7.6-32 · §7.6-33 · §7.6-34 — số đo trên p/01 ───────────────────────────

test("§7.6-32 `demand-top-decile` giải đúng phân vị 0,90 và chọn ĐÚNG 440/4.400 ô", () => {
  const f = resolvePreset(PRESETS.find((p) => p.id === "demand-top-decile")!, P01)!;
  assert.equal(f.entity, "h3-cell");
  if (f.entity !== "h3-cell") return;
  // Cùng con số `quantile_cont(population, 0.9)` của DuckDB trên chính cột này.
  assert.equal(f.lo, 4450.090733270904);
  assert.equal(f.hi, 46232.44099893726);
  const kept = CELLS.filter((c) => filterKeepsCell(f, c)).length;
  assert.equal(kept, 440, "10,00% của 4.400 ô");
  const pop = CELLS.filter((c) => filterKeepsCell(f, c)).reduce((a, c) => a + (c.pop ?? 0), 0);
  // 4.846.303 / 8.831.126 người = 54,88%.
  assert.equal(Math.round(pop), 4846303);
});

test("§7.6-33 `demand-zero-population` chọn ĐÚNG 135 ô, 0 người", () => {
  const f = resolvePreset(PRESETS.find((p) => p.id === "demand-zero-population")!, P01)!;
  const kept = CELLS.filter((c) => filterKeepsCell(f, c));
  assert.equal(kept.length, 135);
  assert.equal(kept.reduce((a, c) => a + (c.pop ?? 0), 0), 0);
});

test("§7.6-34 ba preset Cung chọn đúng 257 · 173 · 19 trong 710 trạm IN", () => {
  const inScope = STATIONS.filter((s) => s.inScope);
  assert.equal(inScope.length, 710);
  const counts: Record<string, number> = {};
  for (const id of ["supply-ge-61kw", "supply-le-22kw", "supply-power-unknown"]) {
    const f = resolvePreset(PRESETS.find((p) => p.id === id)!, P01)!;
    counts[id] = inScope.filter((s) => filterKeepsStation(f, s)).length;
  }
  assert.equal(counts["supply-ge-61kw"], 257);
  assert.equal(counts["supply-le-22kw"], 173);
  assert.equal(counts["supply-power-unknown"], 19);

  // Ba preset RỜI NHAU và cùng với `23-60` (261) phủ kín 710 — nếu một bậc bị đếm hai lần
  // thì tổng sẽ vượt, và đó là cách phép kiểm này bắt được một `values` chồng nhau.
  assert.equal(257 + 173 + 19 + 261, 710);
});

// ── §7.6-35 ─────────────────────────────────────────────────────────────────

test("§7.6-35 phân vị chỉ tính trên giá trị `isKnownPopulation`", () => {
  const dirty = [
    { h3: "a", pop: 10 }, { h3: "b", pop: null }, { h3: "c", pop: -5 },
    { h3: "d", pop: Number.NaN }, { h3: "e", pop: 20 }, { h3: "f", pop: 30 },
    { h3: "g", pop: undefined },
  ];
  const stats = presetStatsFrom({ cells: dirty, manifest: MANIFEST });
  assert.deepEqual([...stats.populations], [10, 20, 30], "null/âm/NaN phải bị loại");

  // Nếu số âm lọt vào, phân vị 0,90 sẽ tụt xuống và tập con phình ra một cách im lặng.
  const f = resolvePreset(PRESETS.find((p) => p.id === "demand-top-decile")!, stats)!;
  if (f.entity !== "h3-cell") throw new Error("sai nhánh");
  assert.equal(f.lo, quantileOf([10, 20, 30], 0.9));
  assert.equal(f.hi, 30);
  // Và vị từ áp lên cũng loại đúng những dòng đó — biên và vị từ khớp nhau theo cấu tạo.
  assert.deepEqual(dirty.filter((c) => filterKeepsCell(f, c)).map((c) => c.h3), ["f"]);
});

test("§2.3 phân vị nội suy TUYẾN TÍNH giữa hai thống kê thứ tự", () => {
  assert.equal(quantileOf([], 0.5), null);
  assert.equal(quantileOf([7], 0.9), 7);
  assert.equal(quantileOf([0, 10], 0.5), 5);
  assert.equal(quantileOf([0, 1, 2, 3], 0.5), 1.5);
  assert.equal(quantileOf([0, 1, 2, 3], 1), 3);
  assert.equal(quantileOf([0, 1, 2, 3], 0), 0);
});

// ── §7.6-38 · §7.6-39 ───────────────────────────────────────────────────────

test("§7.6-38 trạng thái BẬT suy ra từ `filterEquals` + `field`, không lưu", () => {
  const preset = PRESETS.find((p) => p.id === "demand-top-decile")!;
  const resolved = resolvePreset(preset, P01)!;
  assert.equal(isPresetActive(preset, resolved, resolved, preset.field), true);
  // Đúng trường, sai khoảng ⇒ tắt.
  assert.equal(isPresetActive(preset, resolved, null, preset.field), false);
  // Đúng khoảng, sai trường ⇒ tắt.
  assert.equal(isPresetActive(preset, resolved, resolved, "pop_density_ppkm2"), false);

  // Một khoảng KÉO TAY trùng đúng biên của preset thì preset SÁNG — đó là hệ quả cố ý của
  // việc suy ra thay vì lưu: tập con là state, còn đường đi tới nó thì không.
  if (resolved.entity !== "h3-cell") throw new Error("sai nhánh");
  const brushed = { ...resolved, source: resolved.source } as typeof resolved;
  assert.equal(isPresetActive(preset, resolved, brushed, preset.field), true);
});

test("§7.6-39 preset đi trọn vòng qua hash và không đổi tập con", () => {
  for (const p of PRESETS) {
    const resolved = resolvePreset(p, P01)!;
    const back = parseFilter(serializeFilter(resolved));
    assert.ok(back, `${p.id} không đọc lại được`);
    assert.ok(filterEquals(resolved, back), `${p.id} lệch sau vòng ghi↔đọc`);
    if (resolved.entity === "h3-cell") {
      assert.equal(
        CELLS.filter((c) => filterKeepsCell(resolved, c)).length,
        CELLS.filter((c) => filterKeepsCell(back!, c)).length,
        `${p.id}: số ô đổi sau khi qua URL`,
      );
    } else {
      assert.equal(
        STATIONS.filter((s) => s.inScope && filterKeepsStation(resolved, s)).length,
        STATIONS.filter((s) => s.inScope && filterKeepsStation(back!, s)).length,
        `${p.id}: số trạm đổi sau khi qua URL`,
      );
    }
  }
});

// ── §7.6-41 · §7.6-42 ───────────────────────────────────────────────────────

test("§7.6-41 không nhãn nào mang tính từ đánh giá", () => {
  const banned = /nhanh|chậm|cham\b|siêu nhanh|fast|rapid|slow|ultra/i;
  for (const p of PRESETS) {
    assert.doesNotMatch(p.label, banned, `nhãn ${p.id}`);
    assert.doesNotMatch(p.question, banned, `câu hỏi ${p.id}`);
  }
});

test("§7.6-42 `QuickPresets.tsx` không chứa literal số nào ở vị trí MÃ", () => {
  const src = read("src/ui/QuickPresets.tsx");
  // Bỏ chú thích và mọi chuỗi (class Tailwind như `px-1.5` sống trong chuỗi, không phải
  // trong mã), rồi mới tìm số.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/`[^`]*`/g, "``");
  assert.doesNotMatch(code, /(?<![\w$])\d/, `còn literal số:\n${code}`);
  // Và không bậc công suất nào bị gõ tay vào component.
  assert.doesNotMatch(src, /le-22|23-60|61-120|121-180|gt-180/);
});

test("§2.4 nhãn preset khoảng in kèm BIÊN đã giải", () => {
  const f = resolvePreset(PRESETS.find((p) => p.id === "demand-top-decile")!, P01)!;
  const label = presetBoundLabel(f)!;
  assert.match(label, /\d/, "biên phải in ra số");
  assert.match(label, /người/);
  // Preset bậc công suất không in thêm gì: nhãn của nó đã nói đủ khoảng.
  assert.equal(presetBoundLabel(resolvePreset(PRESETS.find((p) => p.id === "supply-le-22kw")!, P01)), null);
  assert.equal(presetBoundLabel(null), null);
});

test("§2.4 không literal ngưỡng nào được gõ tay vào bảng PRESETS", () => {
  const src = read("src/state/presets.ts");
  const table = src.slice(src.indexOf("export const PRESETS"), src.indexOf("export const PRESET_BY_ID"));
  for (const forbidden of ["4450", "46232", "8831126", "440", "135", "257", "173"]) {
    assert.ok(!table.includes(forbidden), `bảng PRESETS gõ cứng ${forbidden}`);
  }
});
