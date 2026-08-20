import assert from "node:assert/strict";
import test from "node:test";

import { HATCH_HEX, RAMP_HEX, hexToRgb, oklabDeltaE, type RGB } from "../src/viz/palette";
import {
  MISSING_HATCH_CSS,
  NOT_COMPARABLE_HEX,
} from "../src/national/visual-states";

const over = (foreground: RGB, alpha: number, background: RGB): RGB =>
  foreground.map((value, index) =>
    Math.round(value * alpha + background[index]! * (1 - alpha)),
  ) as RGB;

test("NOT COMPARABLE, missing hatch và bậc nhạt nhất tách nhau ở light/future-dark", () => {
  for (const [theme, backgroundHex] of [["light", "#f2f3f0"], ["future-dark", "#171715"]] as const) {
    const background = hexToRgb(backgroundHex);
    const notComparable = over(hexToRgb(NOT_COMPARABLE_HEX), 230 / 255, background);
    // Vân 1 px mỗi chu kỳ 6 px: màu trung bình hợp thành là 1/6 mực + 5/6 nền.
    const missing = over(hexToRgb(HATCH_HEX), 1 / 6, background);
    const lightestBin = over(hexToRgb(RAMP_HEX[0]!), 220 / 255, background);
    for (const [pair, delta] of [
      ["solid↔hatch", oklabDeltaE(notComparable, missing)],
      ["solid↔bin-1", oklabDeltaE(notComparable, lightestBin)],
      ["hatch↔bin-1", oklabDeltaE(missing, lightestBin)],
    ] as const) {
      assert.ok(delta >= 8, `${theme} ${pair}: ΔE ${delta.toFixed(1)} < 8`);
    }
  }
  assert.match(MISSING_HATCH_CSS, /repeating-linear-gradient/);
  assert.doesNotMatch(NOT_COMPARABLE_HEX, /gradient/);
});
