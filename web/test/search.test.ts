import { test } from "node:test";
import assert from "node:assert/strict";

import { filterSearchResults, normalizeSearchText } from "../src/ui/search.ts";
import { APP_NAV_MODES, type AppNavMode } from "../src/state/types.ts";
import type { CommuneCollection, GridCell, StationPoint } from "../src/data/queries.ts";

test("normalizeSearchText removes accents, lowercases, and trims", () => {
  assert.equal(normalizeSearchText("Dịch Vọng Hậu"), "dich vong hau");
  assert.equal(normalizeSearchText("  Hoàng Mai  "), "hoang mai");
  assert.equal(normalizeSearchText("Đống Đa"), "dong da");
  assert.equal(normalizeSearchText("Hà Đông"), "ha dong");
  assert.equal(normalizeSearchText("Vincom Mega Mall"), "vincom mega mall");
  assert.equal(normalizeSearchText(""), "");
  assert.equal(normalizeSearchText(null), "");
  assert.equal(normalizeSearchText(undefined), "");
});

test("4 primary navigation modes are strictly defined", () => {
  assert.deepEqual(APP_NAV_MODES, ["map", "story", "data", "national"]);
  assert.equal(APP_NAV_MODES.length, 4);

  const isValidMode = (mode: string): mode is AppNavMode =>
    (APP_NAV_MODES as readonly string[]).includes(mode);

  assert.ok(isValidMode("map"));
  assert.ok(isValidMode("story"));
  assert.ok(isValidMode("data"));
  assert.ok(isValidMode("national"));
  assert.equal(isValidMode("invalid"), false);
});

test("filterSearchResults filters communes, stations, and cells accurately", () => {
  const mockCommunes: CommuneCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [105.78, 21.03],
              [105.80, 21.03],
              [105.80, 21.05],
              [105.78, 21.05],
              [105.78, 21.03],
            ],
          ],
        },
        properties: {
          commune_code: "00004",
          commune_name: "Phường Dịch Vọng Hậu",
          district_name: "Cầu Giấy",
        },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [105.84, 20.97],
              [105.86, 20.97],
              [105.86, 20.99],
              [105.84, 20.99],
              [105.84, 20.97],
            ],
          ],
        },
        properties: {
          commune_code: "00028",
          commune_name: "Phường Hoàng Liệt",
          district_name: "Hoàng Mai",
        },
      },
    ],
  };

  const mockStations: StationPoint[] = [
    {
      id: "vn-c-ac000091",
      lat: 21.03,
      lng: 105.78,
      inScope: true,
      opStatus: "OPERATIONAL",
      nPorts: 8,
    },
    {
      id: "vn-c-dc000102",
      lat: 20.98,
      lng: 105.85,
      inScope: true,
      opStatus: "MAINTENANCE",
      nPorts: 4,
    },
  ];

  const mockCells: GridCell[] = [
    {
      h3: "8865352601fffff",
      value: 1200,
      pop: 1200,
      ports: 2,
      lat: 21.03,
      lng: 105.79,
      beyond2km: false,
      dist: 500,
      reachable: true,
    },
  ];

  // Search by unaccented commune name
  const res1 = filterSearchResults("dich vong", mockCommunes, mockStations, mockCells);
  assert.equal(res1.length, 1);
  assert.equal(res1[0]!.category, "commune");
  assert.equal(res1[0]!.id, "commune:00004");
  assert.equal(res1[0]!.title, "Phường Dịch Vọng Hậu");

  // Search by district name
  const res2 = filterSearchResults("hoang mai", mockCommunes, mockStations, mockCells);
  assert.equal(res2.length, 1);
  assert.equal(res2[0]!.category, "commune");
  assert.equal(res2[0]!.id, "commune:00028");

  // Search by station id
  const res3 = filterSearchResults("ac000091", mockCommunes, mockStations, mockCells);
  assert.equal(res3.length, 1);
  assert.equal(res3[0]!.category, "station");
  assert.equal(res3[0]!.id, "station:vn-c-ac000091");

  // Search by H3 prefix
  const res4 = filterSearchResults("8865352", mockCommunes, mockStations, mockCells);
  assert.equal(res4.length, 1);
  assert.equal(res4[0]!.category, "cell");
  assert.equal(res4[0]!.id, "8865352601fffff");

  // Empty or non-matching queries
  assert.equal(filterSearchResults("", mockCommunes, mockStations, mockCells).length, 0);
  assert.equal(filterSearchResults("xyznonexistent", mockCommunes, mockStations, mockCells).length, 0);
});

