import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LENS_IDS,
  LENSES,
  isLensId,
  lensMeta,
  lensOfField,
  defaultFieldOfLens,
  mapFieldsOfLens,
  evidenceIdsForLens,
  communeEvidenceForLens,
  FIELD_BY_ID,
  type LensId,
} from "../src/fields.ts";

test("LENS_IDS lists exactly the 5 analytical lenses in canonical order", () => {
  assert.deepEqual(LENS_IDS, [
    "demand",
    "supply",
    "access",
    "utilization",
    "opportunity",
  ]);
  assert.equal(new Set(LENS_IDS).size, 5);
  assert.equal(LENSES.length, 5);
});


test("isLensId correctly validates lens identifiers", () => {
  for (const id of LENS_IDS) {
    assert.ok(isLensId(id));
  }
  assert.equal(isLensId("invalid"), false);
  assert.equal(isLensId(null), false);
  assert.equal(isLensId(undefined), false);
  assert.equal(isLensId(123), false);
});

test("lensMeta returns complete structured metadata for every lens", () => {
  for (const id of LENS_IDS) {
    const meta = lensMeta(id);
    assert.ok(meta, `Metadata missing for lens ${id}`);
    assert.equal(meta.id, id);
    assert.ok(meta.label.length > 0);
    assert.ok(meta.hint.length > 0);
    assert.ok(meta.defaultField.length > 0);
    assert.ok(meta.fieldKeys.length > 0);
    assert.equal(meta.cellEvidence.length, 3);
    assert.equal(meta.communeEvidence.length, 3);
  }
});

test("defaultFieldOfLens resolves to a valid, map-renderable FieldMeta for each lens", () => {
  for (const id of LENS_IDS) {
    const defField = defaultFieldOfLens(id);
    assert.ok(defField, `No default field for lens ${id}`);
    assert.equal(defField.lens, id);
    assert.notEqual(defField.map, false);
  }
});

test("five primary fields use the verified physical units", () => {
  assert.equal(defaultFieldOfLens("demand")?.unit?.kind, "person");
  assert.equal(defaultFieldOfLens("supply")?.unit?.kind, "port");
  assert.equal(defaultFieldOfLens("access")?.unit?.kind, "m");
  assert.equal(defaultFieldOfLens("utilization")?.unit?.kind, "ratio");
  assert.equal(defaultFieldOfLens("opportunity")?.unit?.kind, "m");
});

test("mapFieldsOfLens returns only fields belonging to that lens and marked map !== false", () => {
  for (const id of LENS_IDS) {
    const fields = mapFieldsOfLens(id);
    assert.ok(fields.length > 0, `No map fields for lens ${id}`);
    for (const f of fields) {
      assert.equal(f.lens, id);
      assert.notEqual(f.map, false);
    }
  }
});

test("evidenceIdsForLens returns 3 valid grid field IDs for inspection across all lenses", () => {
  const lensesWithUndefined: (LensId | undefined)[] = [...LENS_IDS, undefined];
  for (const lens of lensesWithUndefined) {
    const ids = evidenceIdsForLens(lens);
    assert.equal(ids.length, 3, `Expected 3 facts for lens ${lens}`);
    for (const id of ids) {
      const f = FIELD_BY_ID.get(id);
      assert.ok(f, `Evidence field ${id} must exist in FIELD_BY_ID`);
    }
  }
});

test("communeEvidenceForLens returns 3 valid commune field IDs for inspection across all lenses", () => {
  const lensesWithUndefined: (LensId | undefined)[] = [...LENS_IDS, undefined];
  for (const lens of lensesWithUndefined) {
    const ids = communeEvidenceForLens(lens);
    assert.equal(ids.length, 3, `Expected 3 commune facts for lens ${lens}`);
    for (const id of ids) {
      const f = FIELD_BY_ID.get(id);
      assert.ok(f, `Commune evidence field ${id} must exist in FIELD_BY_ID`);
      assert.equal(f.readAs, "commune");
    }
  }
});

test("lensOfField derives lens directly without duplicate state", () => {
  assert.equal(lensOfField("population"), "demand");
  assert.equal(lensOfField("station:ports"), "supply");
  assert.equal(lensOfField("road:dist_station_m"), "access");
  assert.equal(lensOfField("dist_station_network_m"), "access");
  assert.equal(lensOfField("station:occ"), "utilization");
  assert.equal(lensOfField("commune:ports_per_10k_pop"), "supply");
  assert.equal(lensOfField("screen_margin_m"), "opportunity");
  assert.equal(lensOfField("pop_beyond_2km"), "opportunity");
  assert.equal(lensOfField("built_frac"), null);
});
