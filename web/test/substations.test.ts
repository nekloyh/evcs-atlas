/**
 * Test cho lớp trạm biến áp OSM — M5 (§12: logic thuần thì có test, không verify bằng mắt).
 *
 * Ba quy tắc đề bài gọi đích danh, và chỗ mỗi cái được kiểm:
 *   · ID overlay mới thuộc `OVERLAY_IDS` — ở đây;
 *   · khoá `l` bỏ RIÊNG ID lạ và chuẩn hoá thứ tự khi có ID mới — ở đây;
 *   · phân loại tag OSM → trạm biến áp — luật đó sống ở PYTHON
 *     (`s03c_osm_substation.py`, nơi duy nhất chạm tag thô) và có **self-test chạy mỗi
 *     lần bước đó chạy** (`_selftest_is_substation`, 15 case). KHÔNG chép luật sang TS:
 *     hai bản của một luật sẽ trôi khỏi nhau, đúng lý do đã ghi cho `s03b` ở M3.5.
 *
 * Thêm một phép kiểm mà lớp này cần hơn mọi lớp khác: cỡ mark là hàm CHỈ của zoom. §12
 * cấm mã hoá công suất lưới điện dưới mọi hình thức, và kích thước là cửa sau dễ nhất.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { substationIconSize } from "../src/data/substations.ts";
import { parseHash, serializeHash } from "../src/state/hash.ts";
import { OVERLAY_IDS, type HashState, type OverlayId } from "../src/state/types.ts";

const BASE: HashState = {
  field: "population",
  mode: "2d",
  view: { lng: 105.84, lat: 21, zoom: 9.3, pitch: 0, bearing: 0 },
  layers: [],
  cell: null,
  scene: null,
  paintOn: true,
  dataMode: false,
  t: 0,
  brush: {},
};

// ── ID overlay — một khái niệm một khoá (§9) ───────────────────────────────────

test("`substations` là một overlay THẬT, nằm trong OVERLAY_IDS", () => {
  assert.ok((OVERLAY_IDS as readonly string[]).includes("substations"));
});

test("OVERLAY_IDS không có ID trùng — hai overlay cùng ID là một trạng thái không đọc được", () => {
  assert.equal(new Set(OVERLAY_IDS).size, OVERLAY_IDS.length);
});

// ── Khoá `l` — dùng lại, không đẻ khoá mới (§9) ────────────────────────────────

test("`l=substations` đọc được", () => {
  assert.deepEqual(parseHash("#l=substations").layers, ["substations"]);
});

test("ID lạ đứng cạnh `substations` bị bỏ RIÊNG NÓ, không kéo theo cái nào", () => {
  assert.deepEqual(parseHash("#l=substations,khongcothat,stations").layers, [
    "substations",
    "stations",
  ]);
  // và chiều ngược lại: ID lạ đứng trước cũng không nuốt mất `substations`
  assert.deepEqual(parseHash("#l=xyz,substations").layers, ["substations"]);
});

test("`substations` trùng lặp gộp lại — một overlay bật hai lần vẫn là bật", () => {
  assert.deepEqual(parseHash("#l=substations,substations").layers, ["substations"]);
});

test("thứ tự CHUẨN HOÁ theo OVERLAY_IDS — một trạng thái cho đúng một chuỗi", () => {
  const a = serializeHash({ ...BASE, layers: ["substations", "stations"] });
  const b = serializeHash({ ...BASE, layers: ["stations", "substations"] });
  assert.equal(a, b);
  // `stations` đứng trước `substations` trong OVERLAY_IDS, nên chuỗi phải theo thứ tự đó
  assert.match(a, /l=stations,substations/);
});

test("vòng ghi ↔ đọc giữ nguyên `substations`", () => {
  const state: HashState = { ...BASE, layers: ["substations"] as OverlayId[] };
  const parsed = parseHash(`#${serializeHash(state)}`);
  assert.deepEqual(parsed.layers, ["substations"]);
});

// ── Cỡ mark — chỉ zoom, không bao giờ giá trị (§4d-1, §12) ─────────────────────

test("cỡ mark là hàm CHỈ của zoom, đơn điệu không giảm, và bị chặn hai đầu", () => {
  // Chặn hai đầu: dưới z10 và trên z13 nó phẳng, nên không có mức phóng nào cho ra một
  // ngôi sao to bất thường đọc thành "trạm biến áp này lớn hơn".
  assert.equal(substationIconSize(5), substationIconSize(10));
  assert.equal(substationIconSize(13), substationIconSize(20));
  let prev = -Infinity;
  for (let z = 0; z <= 20; z += 0.1) {
    const s = substationIconSize(z);
    assert.ok(Number.isFinite(s) && s > 0, `z=${z}`);
    assert.ok(s >= prev - 1e-9, `giảm ở z=${z}`);
    prev = s;
  }
});

test("cùng một zoom cho cùng một cỡ — không tham số thứ hai nào lọt vào được", () => {
  // Chữ ký `(zoom: number) => number` là hàng rào KIỂU cho §12: không có chỗ nào để
  // truyền một giá trị công suất vào, kể cả do nhầm.
  assert.equal(substationIconSize(11.7), substationIconSize(11.7));
  assert.equal(substationIconSize.length, 1);
});
