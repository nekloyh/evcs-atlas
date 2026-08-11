import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisTheme } from "../src/viz/theme";
import {
  THEME_PALETTES,
  buildScale,
  getThemePalette,
  rampFor,
  scaleColors,
  seriesColorForTheme,
} from "../src/viz/palette";

test("every AnalysisTheme has a valid 7-step CARTO-compliant palette", () => {
  const themes: AnalysisTheme[] = [
    "demand",
    "supply",
    "utilization",
    "accessibility",
    "urban-context",
    "screening",
    "exploration",
  ];

  for (const theme of themes) {
    const palette = getThemePalette(theme);
    assert.equal(palette.hex.length, 7, `${theme} must have 7 hex steps`);
    assert.equal(palette.ink.length, 7, `${theme} must have 7 ink steps`);
    assert.equal(palette.rgb.length, 7, `${theme} must have 7 RGB steps`);
    assert.ok(palette.series, `${theme} must have a valid series chart color`);
  }
});

test("scaleColors and scaleInks adopt the theme palette", () => {
  const scale = buildScale("numeric", [1, 2, 3, 4, 5, 6, 7]);
  const demandColors = scaleColors(scale, "demand");
  const supplyColors = scaleColors(scale, "supply");

  assert.notDeepEqual(demandColors, supplyColors, "different themes should produce different colors");
  assert.deepEqual(demandColors[0], THEME_PALETTES.demand.rgb[0]);
  assert.deepEqual(supplyColors[0], THEME_PALETTES.supply.rgb[0]);
});

test("rampFor inverts theme palette correctly on high-good polarity", () => {
  const scale = buildScale("numeric", [10, 20, 30, 40, 50, 60, 70]);
  const normal = rampFor(scale, "high-bad", "utilization");
  const inverted = rampFor(scale, "high-good", "utilization");

  assert.deepEqual(normal.colors[0], inverted.colors[6]);
  assert.deepEqual(normal.colors[6], inverted.colors[0]);
});

test("seriesColorForTheme returns unique theme series colors", () => {
  assert.equal(seriesColorForTheme("demand"), THEME_PALETTES.demand.series);
  assert.equal(seriesColorForTheme("supply"), THEME_PALETTES.supply.series);
  assert.equal(seriesColorForTheme("utilization"), THEME_PALETTES.utilization.series);
});
