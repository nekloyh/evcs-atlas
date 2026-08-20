import assert from "node:assert/strict";
import { test } from "node:test";

import { FIELDS, FIELD_BY_ID, scaleControlFor, scaleContractOf } from "../src/fields.ts";
import {
  ELEVATION_FLOOR,
  elevationDisclosure,
  elevationButtonNote,
  elevationFor,
} from "../src/national/elevation.ts";
import {
  DIVERGE_NEUTRAL_HEX,
  PIVOT_MIN_DELTA_E,
  SEQUENTIAL_GRADIENT_ANCHORS,
  THEME_LUTS,
  THEME_PALETTES,
  applyScaleMode,
  buildScale,
  colorFor,
  colorPosition,
  contrastAgainstBasemap,
  elevationPosition,
  gradientAvailability,
  hexToRgb,
  oklabDeltaE,
  simulateCvd,
  type RGB,
} from "../src/viz/palette.ts";
import type { AnalysisTheme } from "../src/viz/theme.ts";

function lab([r0, g0, b0]: RGB): [number, number, number] {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(r0), g = linear(g0), b = linear(b0);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function delta(a: RGB, b: RGB): number {
  const x = lab(a), y = lab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

test("mọi field map-hoá khai scale contract; fixed-binned luôn có lý do", () => {
  for (const field of FIELDS.filter((candidate) => candidate.map !== false)) {
    const contract = scaleContractOf(field);
    if (contract.color === "fixed-binned") assert.ok(contract.reason.trim(), field.id);
  }
});

test("field fixed-binned từ chối gradient ở cả scale và control model", () => {
  const field = FIELD_BY_ID.get("station:ports")!;
  const contract = scaleContractOf(field);
  const base = buildScale("numeric", [0, 0, 1, 3, 12], null, undefined, {
    contract,
    requestedMode: "gradient",
  });
  assert.equal(base.mode, "binned");
  assert.equal(applyScaleMode(base, contract, "gradient", true).mode, "binned");
  assert.deepEqual(scaleControlFor(field), { gradientDisabled: true, reason: contract.color === "fixed-binned" ? contract.reason : null });
});

test("cổng đầu sáng đo trên ANCHOR NGUỒN; LUT giữ endpoint identity và đi qua đủ anchor khai báo", () => {
  const themes = Object.keys(THEME_LUTS) as AnalysisTheme[];
  for (const theme of themes) {
    const anchors = SEQUENTIAL_GRADIENT_ANCHORS[theme];
    const gate = gradientAvailability(theme, false);
    if (!anchors) {
      // Theme không có anchor tái neo ⇒ gradient tuần tự bị CHẶN và không có LUT nào để lộ.
      assert.equal(gate.allowed, false, theme);
      assert.equal(THEME_LUTS[theme].sequential, null, theme);
      continue;
    }
    // Cổng 2,0:1 chạy trên anchor NGUỒN đã khai — không phải trên một output đã cắt sửa.
    assert.ok(contrastAgainstBasemap(hexToRgb(anchors[0]!)) >= 2, `${theme}: light anchor < 2:1`);
    assert.equal(gate.allowed, true, theme);
    const lut = THEME_LUTS[theme].sequential!;
    assert.equal(lut.length, 256, theme);
    // Endpoint identity: LUT[0] LÀ anchor đầu, LUT[255] LÀ anchor cuối (sai số roundtrip
    // OKLCH dưới nửa mức lượng tử 8-bit).
    const first = hexToRgb(anchors[0]!);
    const last = hexToRgb(anchors[anchors.length - 1]!);
    for (let c = 0; c < 3; c++) {
      assert.ok(Math.abs(lut[0]![c]! - first[c]!) < 0.75, `${theme}: LUT[0] ≠ anchor[0]`);
      assert.ok(Math.abs(lut[255]![c]! - last[c]!) < 0.75, `${theme}: LUT[255] ≠ anchor cuối`);
    }
    // Mọi anchor khai báo đều nằm TRÊN đường LUT — nội suy đi qua anchor, không đi tắt.
    for (const anchor of anchors) {
      const rgb = hexToRgb(anchor);
      const nearest = Math.min(...lut.map((c) => delta(c, rgb)));
      assert.ok(nearest < 0.01, `${theme}: anchor ${anchor} lệch khỏi LUT ${nearest}`);
    }
    const lightness = lut.map((color) => lab(color)[0]);
    for (let i = 1; i < lightness.length; i++) assert.ok(lightness[i]! < lightness[i - 1]!, `${theme}:${i}`);
    const samples = Array.from({ length: 7 }, (_, i) => lut[Math.round((i * 255) / 6)]!);
    const steps = samples.slice(1).map((color, i) => delta(samples[i]!, color));
    const mean = steps.reduce((sum, value) => sum + value, 0) / steps.length;
    for (const step of steps) assert.ok(step >= mean * 0.75 && step <= mean * 1.25, `${theme}:${step}/${mean}`);
  }
  // Kỳ vọng của spec §8-3, mã hoá chứ không skip: screening tuần tự bị chặn tới khi tái neo;
  // cánh phân kỳ của nó thì qua.
  assert.equal(gradientAvailability("screening", false).allowed, false);
  assert.ok(gradientAvailability("screening", false).reason);
  assert.equal(gradientAvailability("screening", true).allowed, true);
});

test("cặp giáp mốc phân kỳ giữ ΔE ≥ 15 dưới thường/deutan/protan, và cổng chặn theme rớt", () => {
  const themes = Object.keys(THEME_LUTS) as AnalysisTheme[];
  const neutral = hexToRgb(DIVERGE_NEUTRAL_HEX[0]);
  for (const theme of themes) {
    const arm = THEME_PALETTES[theme].diverge;
    const gate = gradientAvailability(theme, true);
    if (!arm) {
      assert.equal(gate.allowed, false, theme);
      continue;
    }
    const nearPivot = hexToRgb(arm.hex[0]);
    const deltas = {
      normal: oklabDeltaE(nearPivot, neutral),
      deutan: oklabDeltaE(simulateCvd(nearPivot, "deutan"), simulateCvd(neutral, "deutan")),
      protan: oklabDeltaE(simulateCvd(nearPivot, "protan"), simulateCvd(neutral, "protan")),
    };
    const passes = Object.values(deltas).every((d) => d >= PIVOT_MIN_DELTA_E);
    assert.equal(gate.allowed, passes, `${theme}: ${JSON.stringify(deltas)}`);
    // Endpoint identity làm phép đo trên anchor trùng phép đo trên LUT sample giáp mốc.
    if (passes) {
      const lutPivot = THEME_LUTS[theme].intervention![0]!;
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(lutPivot[c]! - nearPivot[c]!) < 0.75, theme);
    }
  }
  // Số đo cụ thể đã chốt: demand/urban-context/screening qua; exploration rớt protan (13,9).
  assert.equal(gradientAvailability("demand", true).allowed, true);
  assert.equal(gradientAvailability("urban-context", true).allowed, true);
  assert.equal(gradientAvailability("exploration", true).allowed, false);
});

test("tập rỗng hoặc toàn-null KHÔNG được lên gradient: miền 0→0 là sentinel, không phải số đo", () => {
  const contract = scaleContractOf(FIELD_BY_ID.get("population")!);
  for (const values of [[], [null, undefined, NaN], ["x" as never, true as never, null]]) {
    const base = buildScale("numeric", values, null, undefined, {
      contract,
      requestedMode: "gradient",
      gradientAllowed: true,
    });
    assert.ok(base.kind === "numeric");
    assert.equal(base.n, 0);
    assert.equal(base.mode, "binned", `n=0 nhưng mode=${base.mode}`);
    const forced = applyScaleMode(base, contract, "gradient", true);
    assert.ok(forced.kind === "numeric");
    assert.equal(forced.mode, "binned");
    assert.equal(colorFor(0, forced, "demand"), null);
    assert.equal(colorFor(null, forced, "demand"), null);
    assert.equal(elevationFor(0, forced, 1_800), 0);
  }
});

test("legend 3D toàn quốc mô tả cao độ LIÊN TỤC theo {transform, clip}, không còn 'N bậc'", () => {
  const sqrtP99 = { color: "fixed-binned", transform: "sqrt", clip: { lo: 0, hi: "p99" }, reason: "x" } as const;
  const domain = { lo: 0, hi: 90, median: 40, min: 0, max: 200, nClippedLow: 0, nClippedHigh: 98 };
  const line = elevationDisclosure(sqrtP99, domain);
  assert.match(line, /liên tục/);
  assert.match(line, /căn bậc hai/);
  assert.match(line, /trần p99/);
  assert.match(line, /98 ô vượt trần/);
  assert.match(line, /giữ phẳng/);
  assert.doesNotMatch(line, /\d+\s*bậc/);
  const clean = elevationDisclosure(sqrtP99, { ...domain, nClippedHigh: 0 });
  assert.doesNotMatch(clean, /vượt trần/);
  const note = elevationButtonNote(sqrtP99);
  assert.match(note, /liên tục/);
  assert.doesNotMatch(note, /BẬC/);
});

test("gradient giữ null purity, kẹp ngoại lai, và dùng chung vị trí màu/cao độ", () => {
  const contract = scaleContractOf(FIELD_BY_ID.get("population")!);
  const scale0 = buildScale("numeric", [0, 1, 4, 9, 16, 25, 36, 49, 10_000], null, undefined, { contract });
  const scale = applyScaleMode(scale0, contract, "gradient", true);
  assert.ok(scale.kind === "numeric" && scale.mode === "gradient");
  assert.equal(colorFor(null, scale, "demand"), null);
  assert.equal(colorFor(undefined, scale, "demand"), null);
  assert.equal(colorFor(NaN, scale, "demand"), null);
  assert.deepEqual(colorFor(scale.domain.hi, scale, "demand"), colorFor(scale.domain.hi + 1_000_000, scale, "demand"));
  assert.equal(colorPosition(scale.domain.hi, scale), elevationPosition(scale.domain.hi, scale));
  for (const value of [scale.domain.lo, scale.domain.median, scale.domain.hi]) {
    assert.equal(elevationFor(value, scale, 1), Math.max(ELEVATION_FLOOR, elevationPosition(value, scale)));
  }
  assert.equal(elevationFor(scale.domain.hi * 100, scale, 1), 1);
});

test("cao độ liên tục: null=0, lo có plinth, tăng trong miền, plateau sau hi", () => {
  const contract = scaleContractOf(FIELD_BY_ID.get("dist_station_network_m")!);
  const scale = buildScale("numeric", [100, 200, 300, 400, 500, 600, 20_000], null, undefined, { contract });
  assert.ok(scale.kind === "numeric");
  assert.equal(elevationFor(null, scale, 1_800), 0);
  assert.equal(elevationFor(scale.domain.lo, scale, 1_800), ELEVATION_FLOOR * 1_800);
  assert.ok(elevationFor(300, scale, 1_800) < elevationFor(500, scale, 1_800));
  assert.equal(elevationFor(scale.domain.hi, scale, 1_800), elevationFor(scale.domain.max, scale, 1_800));
  assert.equal(elevationFor.length, 2);
});

test("phân kỳ giữ pivot và cao bằng nhau cho khoảng cách bằng nhau ở hai phía", () => {
  const field = FIELD_BY_ID.get("screen_margin_m")!;
  const contract = scaleContractOf(field);
  const scale0 = buildScale("numeric", [-2_000, -1_000, -400, -100, 0, 100, 400, 1_000, 20_000], field.diverge, undefined, { contract });
  const scale = applyScaleMode(scale0, contract, "gradient", true);
  assert.ok(scale.kind === "numeric" && scale.diverge);
  assert.ok(scale.domain.lo <= scale.diverge.at && scale.domain.hi >= scale.diverge.at);
  assert.equal(colorPosition(scale.diverge.at, scale), 0.5);
  assert.equal(elevationFor(-400, scale, 1_800), elevationFor(400, scale, 1_800));
});
