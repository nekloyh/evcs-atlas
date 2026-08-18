import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHART_W,
  COLD_HEX,
  COLOR_BASEMAP,
  COLOR_HAIRLINE,
  COLOR_INK,
  COLOR_INK_2,
  COLOR_INK_MUTED,
  COLOR_PANEL,
  COLOR_SELECT,
  COLOR_SELECT_CASING,
  DEFAULT_RAMP_HEX,
  PANEL_PAD_X,
  READ_COL_W,
} from "../src/design-tokens.ts";
import { COLD_HEX as PALETTE_COLD, RAMP_HEX } from "../src/viz/palette.ts";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function cssToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `missing CSS token --${name}`);
  return match[1]!.trim();
}

test("runtime layout tokens keep the read-column geometry invariant", () => {
  assert.equal(READ_COL_W, CHART_W + 2 * PANEL_PAD_X);
  assert.equal(READ_COL_W, 320);
});

test("runtime colors and Tailwind theme colors stay identical", () => {
  const pairs = [
    ["color-ink", COLOR_INK],
    ["color-ink-2", COLOR_INK_2],
    ["color-ink-muted", COLOR_INK_MUTED],
    ["color-panel", COLOR_PANEL],
    ["color-basemap", COLOR_BASEMAP],
    ["color-hairline", COLOR_HAIRLINE],
    ["color-select", COLOR_SELECT],
    ["color-select-casing", COLOR_SELECT_CASING],
  ] as const;

  for (const [name, value] of pairs) assert.equal(cssToken(name), value, name);
  for (const [index, value] of COLD_HEX.entries()) assert.equal(cssToken(`color-cold-${index + 1}`), value);
  for (const [index, value] of DEFAULT_RAMP_HEX.entries()) assert.equal(cssToken(`color-c${index + 1}`), value);
});

test("palette compatibility exports use the design-token arrays", () => {
  assert.strictEqual(RAMP_HEX, DEFAULT_RAMP_HEX);
  assert.strictEqual(PALETTE_COLD, COLD_HEX);
});
