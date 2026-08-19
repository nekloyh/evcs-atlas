import test from "node:test";
import assert from "node:assert/strict";

import { LENSES, type LensId } from "../src/fields";
import {
  PRIMARY_CHART_IDS,
  LENS_PRIMARY_CHARTS,
  PRIMARY_CHART_REGISTRY,
} from "../src/viz/chart-contracts";

test("Every lens declares exactly one primary chart in LENSES metadata", () => {
  for (const lens of LENSES) {
    assert.ok(lens.primaryChart, `Lens ${lens.id} must define a primaryChart`);
    assert.ok(
      PRIMARY_CHART_IDS.includes(lens.primaryChart),
      `Lens ${lens.id} primaryChart ${lens.primaryChart} must be in PRIMARY_CHART_IDS`,
    );
    assert.equal(
      lens.primaryChart,
      LENS_PRIMARY_CHARTS[lens.id as LensId],
      `Lens ${lens.id} primaryChart must match LENS_PRIMARY_CHARTS entry`,
    );
  }
});

test("Primary chart registry contains valid definitions for all 5 primary charts", () => {
  assert.equal(PRIMARY_CHART_IDS.length, 5);

  for (const chartId of PRIMARY_CHART_IDS) {
    const meta = PRIMARY_CHART_REGISTRY[chartId];
    assert.ok(meta, `Chart ${chartId} must be registered in PRIMARY_CHART_REGISTRY`);
    assert.equal(meta.id, chartId);
    assert.ok(meta.title.length > 0, `Chart ${chartId} must have a title`);
    assert.ok(meta.unitNoun.length > 0, `Chart ${chartId} must have a unitNoun`);
    assert.equal(typeof meta.emitsFilter, "boolean");
    assert.equal(typeof meta.emitsTime, "boolean");
    assert.equal(typeof meta.emitsEntity, "boolean");
  }
});
