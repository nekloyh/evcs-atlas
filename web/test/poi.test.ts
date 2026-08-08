/**
 * Test cho lớp POI 4 nhóm — M3.5 (§12: logic thuần thì có test, không verify bằng mắt).
 *
 * Hai quy tắc đề bài gọi đích danh:
 *   · "POI này có polygon hay không" — `hasShape`, quyết định đặc/rỗng và có/không khối 3D;
 *   · phân loại tag OSM → 4 nhóm — luật đó sống ở PYTHON (`s03b_osm_poi_visual.py`,
 *     nơi duy nhất chạm tag OSM thô) và có self-test chạy mỗi lần bước đó chạy; phía web
 *     chỉ nhận `group` đã phân loại, nên test ở đây kiểm registry nhóm + các quy tắc
 *     web-side, không chép lại luật tag để rồi hai bản trôi khỏi nhau.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  POI_BLOCK_HEIGHT_M,
  POI_GROUPS,
  POI_GROUP_BY_ID,
  hasShape,
  poiAreaM2,
  poiGroupsOn,
  poiRef,
  type PoiGeometry,
} from "../src/data/poi.ts";
import { parseSelection, serializeSelection, poiRefOf } from "../src/data/h3.ts";
import { parseHash } from "../src/state/hash.ts";
import { OVERLAY_IDS, type OverlayId } from "../src/state/types.ts";

// ── Registry 4 nhóm — §4d-4 ────────────────────────────────────────────────────

test("đúng 4 nhóm, mỗi nhóm một HÌNH DẠNG riêng — danh tính từ hình dạng, không từ hue", () => {
  assert.equal(POI_GROUPS.length, 4);
  const shapes = new Set(POI_GROUPS.map((g) => g.shape));
  assert.equal(shapes.size, 4, "hai nhóm chung một hình là hai nhóm không phân biệt được");
  const keys = new Set(POI_GROUPS.map((g) => g.group));
  assert.equal(keys.size, 4);
});

test("mọi ID nhóm nằm trong OVERLAY_IDS — POI là overlay, dùng lại khoá `l` (§9)", () => {
  for (const g of POI_GROUPS) {
    assert.ok((OVERLAY_IDS as readonly string[]).includes(g.id), g.id);
  }
});

test("poiGroupsOn lọc theo layer đang bật, giữ thứ tự registry", () => {
  const on = new Set<OverlayId>(["poi_edu_health", "poi_apartment"]);
  assert.deepEqual(
    poiGroupsOn(on).map((g) => g.id),
    ["poi_apartment", "poi_edu_health"],
  );
  assert.deepEqual(poiGroupsOn(new Set<OverlayId>(["stations"])), []);
});

// ── Quy tắc "có polygon hay không" — P4 ────────────────────────────────────────

test("hasShape: Polygon/MultiPolygon là có cạnh; Point là chỉ-điểm", () => {
  assert.equal(hasShape({ type: "Polygon" }), true);
  assert.equal(hasShape({ type: "MultiPolygon" }), true);
  assert.equal(hasShape({ type: "Point" }), false);
  // Loại hình lạ KHÔNG được lặng lẽ thành "có cạnh".
  assert.equal(hasShape({ type: "LineString" }), false);
});

// ── Tham chiếu poi trong khoá `c` — §9 ─────────────────────────────────────────

test("poiRef ghép loại đối tượng + osm_id — node/way/relation không giẫm nhau", () => {
  assert.equal(poiRef({ osm_type: "node", osm_id: 123 }), "n123");
  assert.equal(poiRef({ osm_type: "way", osm_id: 123 }), "w123");
  assert.equal(poiRef({ osm_type: "relation", osm_id: 9 }), "r9");
});

test("parseSelection nhận `poi:` đúng hình dạng, bỏ sai hình dạng", () => {
  assert.deepEqual(parseSelection("poi:w123456"), { kind: "poi", ref: "w123456" });
  assert.deepEqual(parseSelection("poi:n8"), { kind: "poi", ref: "n8" });
  assert.equal(parseSelection("poi:x123"), null, "loại đối tượng lạ");
  assert.equal(parseSelection("poi:123"), null, "thiếu loại đối tượng");
  assert.equal(parseSelection("poi:w"), null, "thiếu osm_id");
  // Nghịch đảo đúng.
  assert.equal(serializeSelection({ kind: "poi", ref: "w123456" }), "poi:w123456");
  assert.equal(poiRefOf("poi:r77"), "r77");
  assert.equal(poiRefOf("88415cb637fffff"), null);
});

test("khoá `l` nhận ID nhóm POI, vẫn bỏ riêng ID lạ và chuẩn hoá thứ tự", () => {
  assert.deepEqual(parseHash("#l=poi_mall,khongcothat,poi_apartment").layers, [
    "poi_mall",
    "poi_apartment",
  ]);
});

test("khoá `c=poi:` đọc được từ hash", () => {
  assert.equal(parseHash("#c=poi:w123456").cell, "poi:w123456");
  assert.equal(parseHash("#c=poi:xxx").cell, undefined);
});

// ── Diện tích polygon — panel POI (P6) ─────────────────────────────────────────

test("poiAreaM2: hình vuông ~110,6×110,6 m ở xích đạo ra ~12.227 m²; Point ra null", () => {
  // 0,001° × 0,001° tại lat 0: mỗi cạnh 110.574 × 0,001 = 110,574 m ⇒ ~12.227 m².
  const sq: PoiGeometry = {
    type: "Polygon",
    coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
  };
  const a = poiAreaM2(sq)!;
  assert.ok(Math.abs(a - 110.574 ** 2) < 1, String(a));
  assert.equal(poiAreaM2({ type: "Point", coordinates: [0, 0] }), null);
});

test("poiAreaM2 trừ lỗ (vành trong)", () => {
  const withHole: PoiGeometry = {
    type: "Polygon",
    coordinates: [
      [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]],
      [[0.0002, 0.0002], [0.0008, 0.0002], [0.0008, 0.0008], [0.0002, 0.0008], [0.0002, 0.0002]],
    ],
  };
  const full = poiAreaM2({
    type: "Polygon",
    coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
  })!;
  const holed = poiAreaM2(withHole)!;
  assert.ok(holed < full);
  assert.ok(Math.abs(holed - full * (1 - 0.36)) / full < 0.01, "lỗ 0,6×0,6 = 36% diện tích");
});

// ── Hằng số 3D — P5 ────────────────────────────────────────────────────────────

test("chiều cao khối là HẰNG SỐ dương — không mã hoá giá trị nào (§4d-1)", () => {
  assert.equal(typeof POI_BLOCK_HEIGHT_M, "number");
  assert.ok(POI_BLOCK_HEIGHT_M > 0);
});

test("POI_GROUP_BY_ID tra được cả 4 ID", () => {
  for (const g of POI_GROUPS) assert.equal(POI_GROUP_BY_ID.get(g.id), g);
});
