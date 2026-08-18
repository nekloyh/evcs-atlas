import { test } from "node:test";
import assert from "node:assert/strict";

// Setup minimal window mock for store initialization in Node.js test environment
(globalThis as unknown as { window: unknown }).window = {
  location: { hash: "" },
  addEventListener() {},
  removeEventListener() {},
  history: { replaceState() {} },
};

import {
  lensMeta,
  defaultFieldOfLens,
  defaultOverlaysOfLens,
  FIELD_BY_ID,
  type LensId,
} from "../src/fields.ts";
import { getMapTooltip } from "../src/map/tooltip.ts";
import type { Scale } from "../src/viz/palette.ts";
const { selectionWireOf, useStore } = await import("../src/state/store.ts");

const dummyScale: Scale = {
  kind: "numeric",
  breaks: [10, 50, 100],
  counts: [5, 5, 5],
  n: 15,
  nNull: 0,
  max: 120,
  zeroClass: false,
  diverge: null,
};

test("Lens Registry declares exactly the 5 approved business lenses", () => {
  const approved5: LensId[] = ["demand", "supply", "access", "utilization", "opportunity"];
  for (const id of approved5) {
    const meta = lensMeta(id);
    assert.ok(meta, `Lens ${id} must exist in Lens Registry`);
    assert.ok(meta.label.length > 0, `Lens ${id} must have a non-empty label`);
    assert.ok(meta.hint.length > 0, `Lens ${id} must have a non-empty hint`);
    assert.ok(meta.businessQuestion.length > 0, `Lens ${id} must have a business question`);
    assert.ok(meta.defaultField.length > 0, `Lens ${id} must declare a defaultField`);
    assert.ok(meta.fieldKeys.length > 0, `Lens ${id} must declare fieldKeys`);
    assert.ok(meta.defaultOverlays.length > 0, `Lens ${id} must declare defaultOverlays`);
    assert.equal(meta.cellEvidence.length, 3, `Lens ${id} must have 3 cell facts`);
    assert.equal(meta.communeEvidence.length, 3, `Lens ${id} must have 3 commune facts`);
    assert.equal(meta.stationEvidence.length, 3, `Lens ${id} must have 3 station facts`);
  }
});

test("Default fields for each of the 5 approved lenses resolve to valid analytical fields", () => {
  const demandDef = defaultFieldOfLens("demand");
  assert.equal(demandDef?.id, "population");
  assert.equal(demandDef?.readAs, "cell");

  const supplyDef = defaultFieldOfLens("supply");
  assert.equal(supplyDef?.id, "station:ports");
  assert.equal(supplyDef?.readAs, "station");

  const accessDef = defaultFieldOfLens("access");
  assert.equal(accessDef?.id, "road:dist_station_m");
  assert.equal(accessDef?.readAs, "road");

  const utilDef = defaultFieldOfLens("utilization");
  assert.equal(utilDef?.id, "station:occ");
  assert.equal(utilDef?.readAs, "station");

  const opportunityDef = defaultFieldOfLens("opportunity");
  assert.equal(opportunityDef?.id, "screen_margin_m");
  assert.equal(opportunityDef?.readAs, "cell");
});

test("defaultOverlaysOfLens returns expected overlay configurations per lens", () => {
  assert.deepEqual(defaultOverlaysOfLens("demand"), ["stations"]);
  assert.deepEqual(defaultOverlaysOfLens("supply"), ["stations", "station_status"]);
  assert.deepEqual(defaultOverlaysOfLens("access"), ["stations", "beyond2km"]);
  assert.deepEqual(defaultOverlaysOfLens("utilization"), ["stations", "station_status"]);
  assert.deepEqual(defaultOverlaysOfLens("opportunity"), ["stations", "beyond2km"]);
});

test("switchLens changes only the analytical field and preserves selection plus overlays", () => {
  const store = useStore.getState();
  
  // Set an initial selection
  const testCell = "8830805097fffff";
  store.selectCell(testCell);
  store.toggleLayer("communes");
  const layersBefore = useStore.getState().layers;
  assert.equal(selectionWireOf(useStore.getState()), testCell);

  // Switch to Demand lens
  store.switchLens("demand");
  let s = useStore.getState();
  assert.equal(s.field, "population");
  assert.deepEqual(s.layers, layersBefore);
  assert.equal(selectionWireOf(s), testCell, "Selected cell must persist when switching to Demand");

  // Switch to Supply lens
  store.switchLens("supply");
  s = useStore.getState();
  assert.equal(s.field, "station:ports");
  assert.deepEqual(s.layers, layersBefore);
  assert.equal(selectionWireOf(s), testCell, "Selected cell must persist when switching to Supply");

  // Switch to Access lens
  store.switchLens("access");
  s = useStore.getState();
  assert.equal(s.field, "road:dist_station_m");
  assert.deepEqual(s.layers, layersBefore);
  assert.equal(selectionWireOf(s), testCell, "Selected cell must persist when switching to Access");

  // Switch to Utilization lens
  store.switchLens("utilization");
  s = useStore.getState();
  assert.equal(s.field, "station:occ");
  assert.deepEqual(s.layers, layersBefore);
  assert.equal(selectionWireOf(s), testCell, "Selected cell must persist when switching to Utilization");

  // Switch to Opportunity lens
  store.switchLens("opportunity");
  s = useStore.getState();
  assert.equal(s.field, "screen_margin_m");
  assert.deepEqual(s.layers, layersBefore);
  assert.equal(selectionWireOf(s), testCell, "Selected cell must persist when switching to Opportunity");

  // Clean up
  store.selectCell(null);
  store.toggleLayer("communes");
});

test("lens switching preserves every supported selection kind", () => {
  const selections = [
    "8830805097fffff",
    "commune:00004",
    "station:vn-c-ac000091",
    "road:12345",
    "poi:w42",
  ];
  for (const selection of selections) {
    useStore.getState().selectCell(selection);
    useStore.getState().switchLens("demand");
    useStore.getState().switchLens("opportunity");
    assert.equal(selectionWireOf(useStore.getState()), selection);
  }
  useStore.getState().selectCell(null);
});

test("getMapTooltip formats metrics correctly according to the active Lens", () => {
  // 1. Demand Lens - H3 Cell Tooltip
  const popField = FIELD_BY_ID.get("population")!;
  const demandCellTooltip = getMapTooltip({
    object: { h3: "8830805097fffff", pop: 1542, pop_density_ppkm2: 2083, n_apartment: 4, commune_name: "Phường Dịch Vọng Hậu" },
    layerId: "grid-value",
    field: popField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(demandCellTooltip?.text.includes("Phường Dịch Vọng Hậu"));
  assert.ok(demandCellTooltip?.text.includes("1.542 người"));
  assert.ok(demandCellTooltip?.text.includes("2.083 người/km²"));

  // 2. Supply Lens - Station Tooltip
  const portsField = FIELD_BY_ID.get("station:ports")!;
  const supplyStationTooltip = getMapTooltip({
    object: { id: "ST101", name: "Trạm VinFast Thăng Long", nPorts: 12, powerKwSite: 250, operator: "VinFast", opStatus: "OPERATIONAL", currentType: "DC" },
    layerId: "station-ports-value",
    field: portsField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(supplyStationTooltip?.text.includes("Trạm VinFast Thăng Long"));
  assert.ok(supplyStationTooltip?.text.includes("12 cổng · 250 kW"));
  assert.ok(supplyStationTooltip?.text.includes("VinFast"));

  // 3. Access Lens - Road and Cell Tooltip
  const roadDistField = FIELD_BY_ID.get("road:dist_station_m")!;
  const roadTooltip = getMapTooltip({
    object: { id: "RD_4091", dist: 1450, highway: "primary" },
    layerId: "road-value",
    field: roadDistField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(roadTooltip?.text.includes("1,45 km") || roadTooltip?.text.includes("1.45 km") || roadTooltip?.text.includes("1,5 km") || roadTooltip?.text.includes("1.450 m"));
  assert.ok(roadTooltip?.text.includes("primary"));

  // 4. Utilization Lens - Station Occupancy at hour t
  const occField = FIELD_BY_ID.get("station:occ")!;
  const occTooltip = getMapTooltip({
    object: { id: "ST202", name: "Trạm Lotte Tây Hồ", nPorts: 8, powerKwSite: 120, value: 0.75, opStatus: "OPERATIONAL" },
    layerId: "station-value",
    field: occField,
    t: 38, // t = 1 * 24 + 14 -> Thứ Ba 14h
    scale: dummyScale,
  });
  assert.ok(occTooltip?.text.includes("Trạm Lotte Tây Hồ"));
  assert.ok(occTooltip?.text.includes("75,0%"));
  assert.ok(occTooltip?.text.includes("Thứ Ba 14h"));

  // 5. Opportunity Lens - base-rule margin keeps its signed distance unit
  const opportunityField = FIELD_BY_ID.get("screen_margin_m")!;
  const opportunityTooltip = getMapTooltip({
    object: { h3: "8830805097fffff", screen_margin_m: -350, value: -350, pop: 1200 },
    layerId: "grid-value",
    field: opportunityField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(opportunityTooltip?.text.includes("-350 m"));
  assert.ok(opportunityTooltip?.text.includes("ngưỡng cơ sở"));
});

test("getMapTooltip explicitly describes null, missing, unreachable and abnormal operational states", () => {
  // Unreachable cell in Access lens
  const accessField = FIELD_BY_ID.get("dist_station_network_m")!;
  const unreachableCellTooltip = getMapTooltip({
    object: { h3: "8830805097fffff", reachable: false, dist: null, pop: 320 },
    layerId: "grid-null",
    field: accessField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(unreachableCellTooltip?.text.includes("UNREACHABLE"));

  // Unreachable road segment in Access lens
  const roadField = FIELD_BY_ID.get("road:dist_station_m")!;
  const unreachableRoadTooltip = getMapTooltip({
    object: { id: "RD_ISOLATED", dist: null },
    layerId: "road-null",
    field: roadField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(unreachableRoadTooltip?.text.includes("UNREACHABLE"));

  // Station under maintenance
  const supplyField = FIELD_BY_ID.get("station:ports")!;
  const maintenanceStationTooltip = getMapTooltip({
    object: { id: "ST_MAINT", name: "Trạm Cầu Giấy", nPorts: 6, opStatus: "MAINTENANCE" },
    layerId: "station-ports-value",
    field: supplyField,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(maintenanceStationTooltip?.text.includes("BẢO TRÌ"));

  // Station with missing telemetry at hour t
  const occField = FIELD_BY_ID.get("station:occ")!;
  const missingOccTooltip = getMapTooltip({
    object: { id: "ST_NO_DATA", name: "Trạm Chưa Đo", nPorts: 4, value: null },
    layerId: "station-null",
    field: occField,
    t: 10,
    scale: dummyScale,
  });
  assert.ok(missingOccTooltip?.text.includes("Chưa đủ quan sát"));
});

test("cell tooltip formats the active field unit instead of guessing from its lens", () => {
  const cases = [
    ["pop_density_ppkm2", 2083, "người/km²"],
    ["n_stations", 3, "3 trạm"],
    ["power_kw_site", 250, "250 kW"],
    ["detour_ratio", 1.5, "1,5 lần"],
    ["pop_beyond_2km", 1200, "1.200 người"],
  ] as const;
  for (const [fieldId, value, expected] of cases) {
    const field = FIELD_BY_ID.get(fieldId)!;
    const tooltip = getMapTooltip({
      object: { h3: "8830805097fffff", value, pop: 1000, ports: 12, dist: 1500, reachable: true },
      layerId: "grid-value",
      field,
      t: 0,
      scale: dummyScale,
    });
    assert.ok(tooltip?.text.includes(expected), `${fieldId}: ${tooltip?.text}`);
  }
});

test("commune supply equity keeps its per-10,000-person denominator", () => {
  const field = FIELD_BY_ID.get("commune:ports_per_10k_pop")!;
  const tooltip = getMapTooltip({
    object: { properties: { commune_name: "Xã Tiền Phong", ports_per_10k_pop: 2.4, n_ports: 6, population: 25000 } },
    layerId: "commune-value",
    field,
    t: 0,
    scale: dummyScale,
  });
  assert.ok(tooltip?.text.includes("2,4 cổng, trên 10.000 dân"), tooltip?.text);
});
