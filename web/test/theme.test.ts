import assert from "node:assert/strict";
import test from "node:test";

import { FIELD_BY_ID } from "../src/fields.ts";
import { themeFor } from "../src/viz/theme.ts";

test("theme follows analytical semantics, not a display label", () => {
  assert.equal(themeFor(FIELD_BY_ID.get("population")!, "density"), "demand");
  assert.equal(themeFor(FIELD_BY_ID.get("detour_ratio")!, "hex"), "accessibility");
  assert.equal(themeFor(FIELD_BY_ID.get("screen_margin_m")!, "hex"), "screening");
});
