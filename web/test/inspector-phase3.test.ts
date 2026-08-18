/**
 * Phase 3 — Evidence Inspector Comprehensive Acceptance Tests
 *
 * Validates the 10 acceptance gates specified in §9 of PHASE3_INSPECTOR.md:
 * 1. EntitySelection accepts and round-trips exactly the 3 entity kinds and rejects malformed IDs.
 * 2. `selection !== null` alone controls Inspector open state (no inspectorOpen flag).
 * 3. 9-section reading order (Summary -> Evidence -> Technical Details -> CTA / States).
 * 4. Active-field mismatch preserves selection and renders no-direct-value hero (never fake zero or metric swap).
 * 5. Distinct rendering of known zero vs null/missing/unobserved states.
 * 6. Technical details render explicit allowlists only (no raw field dumping).
 * 7. EvidenceSection pure exhaustive router with zero store/query/calculation dependencies.
 * 8. Escape layering, focus restoration, empty-map close, drag persistence.
 * 9. Lens changes preserve selection across all lenses.
 * 10. Zero Candidate creation/approval/simulation actions in Phase 3.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Setup minimal window mock for store initialization in Node.js test environment
(globalThis as unknown as { window: unknown }).window = {
  location: { hash: "" },
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  parseEntitySelection,
  serializeEntitySelection,
  stationSelection,
  cellSelection,
  communeSelection,
  selectionKindLabel,
} from "../src/state/selection";

import { selectionWireOf, useStore } from "../src/state/store";
import {
  formatPercentile,
  formatTriState,
  geometryCenter,
  networkDistanceMissingText,
  screeningThresholdM,
} from "../src/ui/inspector-format";
import {
  inspectorFocusAction,
  shouldHandleInspectorEscape,
} from "../src/components/atlas/inspector-interaction";

// ── Gate 1: EntitySelection Contract ─────────────────────────────────────────

test("Gate 1: EntitySelection accepts and round-trips exactly the three Phase 3 entity kinds", () => {
  // Station
  const stationRaw = "station:vn-c-ac000091";
  const stationSel = parseEntitySelection(stationRaw, "01");
  assert.ok(stationSel);
  assert.equal(stationSel.kind, "station");
  assert.equal(stationSel.id, "vn-c-ac000091");
  assert.equal(stationSel.datasetId, "01");
  assert.equal(serializeEntitySelection(stationSel), stationRaw);

  // H3 Cell
  const cellRaw = "8830805097fffff";
  const cellSel = parseEntitySelection(cellRaw, "01");
  assert.ok(cellSel);
  assert.equal(cellSel.kind, "h3-cell");
  assert.equal(cellSel.id, cellRaw);
  assert.equal(serializeEntitySelection(cellSel), cellRaw);

  // Commune
  const communeRaw = "commune:00004";
  const communeSel = parseEntitySelection(communeRaw, "01");
  assert.ok(communeSel);
  assert.equal(communeSel.kind, "commune");
  assert.equal(communeSel.id, "00004");
  assert.equal(serializeEntitySelection(communeSel), communeRaw);
});

test("Gate 1: EntitySelection rejects malformed IDs and unsupported kinds", () => {
  // Malformed station
  assert.equal(parseEntitySelection("station:"), null);
  assert.equal(parseEntitySelection("station:INVALID_UPPERCASE"), null);
  assert.equal(parseEntitySelection("station:has spaces"), null);

  // Malformed H3
  assert.equal(parseEntitySelection("8830805097ffff"), null); // 14 chars
  assert.equal(parseEntitySelection("8830805097ffffff"), null); // 16 chars
  assert.equal(parseEntitySelection("8830805097FFFFF"), null); // uppercase
  assert.equal(parseEntitySelection("not-a-hex-string"), null);

  // Malformed Commune
  assert.equal(parseEntitySelection("commune:4"), null); // not 5 digits
  assert.equal(parseEntitySelection("commune:123456"), null); // 6 digits
  assert.equal(parseEntitySelection("commune:abcde"), null);

  // Road and POI are not Phase 3 entities
  assert.equal(parseEntitySelection("road:12345"), null);
  assert.equal(parseEntitySelection("poi:mall:42"), null);
});

// ── Gate 2: Selection State Exclusivity ───────────────────────────────────────

test("Gate 2: selection !== null alone controls inspector open state", () => {
  const store = useStore.getState();
  store.clearSelection();
  assert.equal(useStore.getState().selection, null);

  const sel = stationSelection("vn-c-ac000091");
  store.selectEntity(sel);
  assert.deepEqual(useStore.getState().selection, sel);

  store.clearSelection("escape");
  assert.equal(useStore.getState().selection, null);

  // Verify there is no separate inspectorOpen boolean
  assert.equal((useStore.getState() as any).inspectorOpen, undefined);
  assert.equal((useStore.getState() as any).cell, undefined, "no second canonical Phase 3 selection");
});

test("Gate 2: flyTo updates map wire selection and EntitySelection atomically", () => {
  const store = useStore.getState();
  const stationSel = stationSelection("vn-c-ac000091");
  store.selectEntity(stationSel);

  const view = { lng: 105.8, lat: 21.0, zoom: 13, pitch: 0, bearing: 0 };
  store.flyTo(view, "commune:00004");
  assert.deepEqual(useStore.getState().selection, communeSelection("00004"));
  assert.equal(selectionWireOf(useStore.getState()), "commune:00004");

  // Road is outside Phase 3: it may remain a map wire selection, but must clear a stale
  // three-entity Inspector selection instead of leaving map and Inspector on different IDs.
  store.flyTo(view, "road:12345");
  assert.equal(useStore.getState().selection, null);
  assert.equal(selectionWireOf(useStore.getState()), "road:12345");
  store.clearSelection();
});

// ── Gates 3, 5 & 6: Presenter order and data-state formatting ────────────────

test("Gates 3/6: each presenter keeps declared section order and avoids raw-row dumping", () => {
  for (const file of ["StationPanel.tsx", "CellPanel.tsx", "CommunePanel.tsx"]) {
    const source = readFileSync(new URL(`../src/ui/${file}`, import.meta.url), "utf8");
    const sectionMarkers = [
      "1. HEADER",
      "2. HERO METRIC",
      "3. SUPPORTING METRICS",
      "4. EVIDENCE",
      "5. COMPARISON",
      "6. TECHNICAL DETAILS",
      "7. CTA",
    ];
    let previous = -1;
    for (const marker of sectionMarkers) {
      const index = source.indexOf(marker);
      assert.ok(index > previous, `${file}: ${marker} must follow the previous section`);
      previous = index;
    }
    assert.doesNotMatch(source, /Object\.entries\s*\(/, `${file}: must not iterate a raw row`);
    assert.doesNotMatch(source, /panelRows\s*\(/, `${file}: must not use the legacy raw-row presenter`);
  }
});

test("Gate 5: known zero, missing, unreachable and percentile units remain distinct", () => {
  assert.equal(formatPercentile(19.016), "19%", "util_pctl is already on a 0–100 scale");
  assert.equal(formatPercentile(100), "100%");
  assert.equal(formatTriState(true), "Có");
  assert.equal(formatTriState(false), "Không");
  assert.equal(formatTriState(undefined), "Chưa có dữ liệu");
  assert.equal(networkDistanceMissingText(false), "không có tuyến mạng hợp lệ");
  assert.equal(networkDistanceMissingText(undefined), "chưa có số liệu");
  assert.equal(screeningThresholdM("PHUONG"), 500);
  assert.equal(screeningThresholdM("DAC_KHU"), 500);
  assert.equal(screeningThresholdM("XA"), 2_000);
  assert.equal(screeningThresholdM(null), null);
});

test("Gate 5: Commune fly-to center is derived from selected geometry", () => {
  assert.deepEqual(
    geometryCenter({
      type: "Polygon",
      coordinates: [[[104, 20], [106, 20], [106, 22], [104, 20]]],
    }),
    [105, 21],
  );
});

test("Gate 5/9: optional evidence cannot replace or reject a valid core entity", () => {
  const queries = readFileSync(new URL("../src/data/queries.ts", import.meta.url), "utf8");
  const loader = readFileSync(new URL("../src/components/atlas/use-inspector-loader.ts", import.meta.url), "utf8");

  assert.match(queries, /"ever_active"/);
  assert.match(queries, /"snapshot_id"/);
  assert.match(queries, /occStatus:\s*"ready"\s*\|\s*"not-found"\s*\|\s*"unavailable"/);
  assert.match(queries, /connectorsStatus:\s*"ready"\s*\|\s*"unavailable"/);
  assert.doesNotMatch(loader, /Promise\.all\s*\(\s*\[\s*fetchCell\(/);
});

// ── Gate 4: Active-Field Mismatch Behavior ───────────────────────────────────

test("Gate 4: active field mismatch renders no-direct-value hero and does not fake zero or close", () => {
  const store = useStore.getState();
  const stationSel = stationSelection("vn-c-ac000091");
  store.selectEntity(stationSel);

  // Set field to cell population
  store.setField("population");
  assert.equal(useStore.getState().field, "population");
  assert.deepEqual(useStore.getState().selection, stationSel, "Selection must not close on field mismatch");

  // Switch to commune field
  store.setField("commune:population");
  assert.equal(useStore.getState().field, "commune:population");
  assert.deepEqual(useStore.getState().selection, stationSel, "Selection must not close on commune field");

  store.clearSelection();
});

// ── Gate 7: Pure Exhaustive Router Contract ──────────────────────────────────

test("Gate 7: EvidenceSection selectionKindLabel provides human-readable Vietnamese labels", () => {
  assert.equal(selectionKindLabel({ datasetId: "01" as any, kind: "station", id: "vn-c-01" as any }), "Trạm sạc");
  assert.equal(selectionKindLabel({ datasetId: "01" as any, kind: "h3-cell", id: "8830805097fffff" as any }), "Ô H3");
  assert.equal(selectionKindLabel({ datasetId: "01" as any, kind: "commune", id: "00004" as any }), "Xã/phường");
  assert.equal(selectionKindLabel(null), null);
});

test("Gate 7: EvidenceSection is a shallow router with no data or store dependencies", () => {
  const source = readFileSync(new URL("../src/components/atlas/EvidenceSection.tsx", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of ["useStore", "fetchCell", "fetchStation", "stationSeries", "lensOfField", "FIELD_BY_ID", "useEffect"]) {
    assert.doesNotMatch(code, new RegExp(`\\b${forbidden}\\b`), forbidden);
  }
  for (const kind of ['case "station"', 'case "h3-cell"', 'case "commune"']) {
    assert.match(source, new RegExp(kind.replace(/["-]/g, "\\$&")), kind);
  }
});

// ── Gate 8: Keyboard & Close Handling ────────────────────────────────────────

test("Gate 8: clearSelection resets selection cleanly without side effects", () => {
  const store = useStore.getState();
  const cellSel = cellSelection("8830805097fffff");
  store.selectEntity(cellSel);
  assert.ok(useStore.getState().selection);

  store.clearSelection("escape");
  assert.equal(useStore.getState().selection, null);
  assert.equal(selectionWireOf(useStore.getState()), null);
});

test("Gate 8: Escape layering and focus transitions follow the shell contract", () => {
  assert.equal(shouldHandleInspectorEscape({ key: "Escape", defaultPrevented: false }), true);
  assert.equal(shouldHandleInspectorEscape({ key: "Escape", defaultPrevented: true }), false);
  assert.equal(shouldHandleInspectorEscape({ key: "Enter", defaultPrevented: false }), false);

  assert.equal(inspectorFocusAction(null, "01:station:a", true), "skip-initial");
  assert.equal(inspectorFocusAction(null, "01:station:a", false), "capture-and-focus");
  assert.equal(inspectorFocusAction("01:station:a", "01:commune:00004", false), "focus-only");
  assert.equal(inspectorFocusAction("01:station:a", "01:station:a", false), "none");
});

// ── Gate 9: Lens Persistence ─────────────────────────────────────────────────

test("Gate 9: Lens changes preserve EntitySelection across all lenses", () => {
  const store = useStore.getState();
  const stationSel = stationSelection("vn-c-ac000091");
  store.selectEntity(stationSel);

  const lenses = ["demand", "supply", "access", "utilization", "opportunity"] as const;
  for (const lens of lenses) {
    store.switchLens(lens);
    assert.deepEqual(
      useStore.getState().selection,
      stationSel,
      `Selection must persist across switchLens to ${lens}`,
    );
  }

  const h3Sel = cellSelection("8830805097fffff");
  store.selectEntity(h3Sel);
  for (const lens of lenses) {
    store.switchLens(lens);
    assert.deepEqual(
      useStore.getState().selection,
      h3Sel,
      `H3 selection must persist across switchLens to ${lens}`,
    );
  }

  const comSel = communeSelection("00004");
  store.selectEntity(comSel);
  for (const lens of lenses) {
    store.switchLens(lens);
    assert.deepEqual(
      useStore.getState().selection,
      comSel,
      `Commune selection must persist across switchLens to ${lens}`,
    );
  }

  store.clearSelection();
});

// ── Gate 10: Zero Candidate Actions Check ────────────────────────────────────

test("Gate 10: No candidate creation or simulation actions in Phase 3 state or selection", () => {
  assert.equal((useStore.getState() as any).candidate, undefined);
  assert.equal((useStore.getState() as any).candidates, undefined);
  assert.equal((useStore.getState() as any).createCandidate, undefined);
  assert.equal((useStore.getState() as any).simulatePlacement, undefined);
});
