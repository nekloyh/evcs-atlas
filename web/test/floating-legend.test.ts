import assert from "node:assert/strict";
import test from "node:test";
import { FIELD_BY_ID, STATION_OCC_FIELD, unitSentence, polarityNote } from "../src/fields.ts";
import { buildScale } from "../src/viz/palette.ts";
import { themeFor } from "../src/viz/theme.ts";

test("analytical legend contract: numeric scale has valid breaks & units", () => {
  const field = FIELD_BY_ID.get("population")!;
  assert.equal(field.readAs, "cell");
  assert.ok(unitSentence(field).length > 0);

  const scale = buildScale("numeric", [10, 50, 100, 250, 500, 1000]);
  assert.equal(scale.kind, "numeric");
  assert.ok("breaks" in scale && scale.breaks.length > 0);
});

test("analytical legend contract: categorical / bool scale", () => {
  const field = FIELD_BY_ID.get("network_reachable")!;
  assert.equal(field.kind, "bool");

  const scale = buildScale("bool", [0, 1, 1, 0, 1]);
  assert.equal(scale.kind, "bool");
});

test("analytical legend contract: null split field detour_ratio", () => {
  const field = FIELD_BY_ID.get("detour_ratio")!;
  assert.ok(field.nullSplit);
  assert.equal(field.nullSplit.by, "network_reachable");
  assert.ok(field.nullSplit.label.length > 0);
});

test("analytical legend contract: station occupancy field", () => {
  const field = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  assert.equal(field.id, STATION_OCC_FIELD);
  assert.equal(field.readAs, "station");
});

test("analytical legend contract: polarity note for high-good fields", () => {
  const field = FIELD_BY_ID.get("commune:ports_per_10k_pop")!;
  const note = polarityNote(field);
  assert.ok(note !== null);
  assert.equal(themeFor(field, "hex"), "exploration");
});
