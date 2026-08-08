/**
 * Hợp đồng khởi tạo: mọi trạng thái phụ thuộc bộ dữ liệu đặt xong TRƯỚC khi `App` nạp.
 *
 * Trước đây hợp đồng ấy chỉ là một comment trong `main.tsx`, và nó chi phối năm biến
 * module-level ở năm file khác nhau. Một comment không chạy. Test này khoá lại ba điều:
 *
 *   · `factsFrom` là hàm THUẦN — đọc manifest, không ghi biến nào
 *   · `apply` ghi ĐỦ năm chỗ, và `UNKNOWN` đưa mọi thứ về "không lọc gì"
 *   · manifest hỏng ⇒ thoái lui về bộ đầy đủ, KHÔNG phải màn hình trống
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { UNKNOWN, apply, factsFrom, storyDataReady } from "../src/data/bootstrap";
import type { Manifest } from "../src/data/manifest";
import { overlayUnavailable } from "../src/data/overlays";
import { FIELDS, fieldAvailable, gridColumnAvailable, layerUsable } from "../src/fields";
import { INITIAL_VIEW } from "../src/map/positron";
import { storyEnabled } from "../src/story/scenes";

afterEach(() => apply(UNKNOWN));

const MANIFEST = {
  available_columns: ["h3_r8", "n_stations"],
  available_commune_columns: ["population"],
  unusable_layers: [{ layer: "occupancy", reason: "dưới 50% số trạm đo được" }],
  story_enabled: false,
  files: {},
  province: { province_code: "96", province_name: "Tỉnh Cà Mau", bbox: [104.7, 8.4, 105.5, 9.6] },
} as unknown as Manifest;

test("factsFrom là hàm THUẦN — đọc manifest, không ghi gì", () => {
  apply(UNKNOWN);
  const truoc = FIELDS.filter(fieldAvailable).length;
  const f = factsFrom(MANIFEST);
  assert.equal(FIELDS.filter(fieldAvailable).length, truoc, "gọi factsFrom đã đổi trạng thái");
  assert.deepEqual(f.columns.cell, ["h3_r8", "n_stations"]);
  assert.deepEqual(f.unusableLayers, ["occupancy"]);
  assert.equal(f.storyEnabled, false);
  assert.equal(f.title, "EVCS · Tỉnh Cà Mau");
});

test("apply ghi ĐỦ năm chỗ, không sót chỗ nào", () => {
  apply(factsFrom(MANIFEST));
  assert.ok(gridColumnAvailable("n_stations"), "1. cột có mặt");
  assert.ok(!gridColumnAvailable("population"), "1. cột vắng");
  assert.ok(!layerUsable("occupancy"), "2. lớp không đọc được");
  assert.equal(storyEnabled(), false, "3. chế độ câu chuyện tắt");
  const [lng] = INITIAL_VIEW.center;
  assert.ok(lng > 104 && lng < 106, `5. khung nhìn theo bbox, được ${lng}`);
});

test("`story_enabled` vắng khoá nghĩa là CHƯA AI TẮT, không phải đã tắt", () => {
  // Chỉ kiểm CỔNG BIÊN TẬP, nên phải cho cổng dữ liệu mở sẵn — `storyEnabled` giờ là
  // tích của hai cổng, và trộn chúng vào một assert là không kiểm được cái nào.
  const du = {
    ...MANIFEST,
    story_enabled: undefined,
    available_road_columns: ["dist_station_m"],
    files: { "routes_showcase.geojson": {} },
  } as unknown as Manifest;
  assert.equal(storyDataReady(du), true, "tiền đề: cổng dữ liệu mở");
  assert.equal(factsFrom(du).storyEnabled, true);
});

test("UNKNOWN đưa mọi thứ về không-lọc-gì", () => {
  apply(factsFrom(MANIFEST));
  apply(UNKNOWN);
  assert.ok(FIELDS.every(fieldAvailable), "mọi trường hiện lại");
  assert.ok(gridColumnAvailable("cot_bat_ky"));
  assert.ok(layerUsable("occupancy"));
  assert.equal(storyEnabled(), true);
  assert.ok(!overlayUnavailable("beyond2km"));
});

test("manifest hỏng thoái lui về bộ ĐẦY ĐỦ, không phải màn hình trống", () => {
  // Đây là nhánh `catch` của `main.tsx`. Một tỉnh không có manifest phải hiện được mọi
  // trường mà bộ Hà Nội hiện — "chưa biết thiếu gì" khác hẳn "biết là thiếu".
  apply(factsFrom(MANIFEST));
  apply(UNKNOWN);
  assert.ok(FIELDS.filter(fieldAvailable).length === FIELDS.length);
});

test("manifest không có `province` thì KHÔNG đụng khung nhìn", () => {
  apply(UNKNOWN);
  const truoc = { ...INITIAL_VIEW };
  apply(factsFrom({ ...MANIFEST, province: undefined } as never));
  assert.deepEqual(INITIAL_VIEW.center, truoc.center);
  assert.equal(INITIAL_VIEW.zoom, truoc.zoom);
});

test("main.tsx không còn tự gọi setter nào — chỉ đi qua apply()", () => {
  const src = readSrc("main.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const setter of [
    "setAvailableColumns",
    "setUnusableLayers",
    "setStoryEnabled",
    "setUnavailableOverlays",
    "setInitialViewFromBbox",
  ]) {
    assert.doesNotMatch(src, new RegExp(`\\b${setter}\\s*\\(`), `main.tsx còn gọi ${setter}`);
  }
});

function readSrc(rel: string): string {
  return readFileSync(new URL(`../src/${rel}`, import.meta.url).pathname, "utf8");
}


// ── HAI cổng của chế độ CÂU CHUYỆN ───────────────────────────────────────
//
// Cổng biên tập ở `n11` hỏi "văn cảnh có viết cho tỉnh này không"; cổng dữ liệu ở đây hỏi
// "dữ liệu có đỡ nổi không". Hôm nay hai cổng ĐANG lệch: `story_enabled` bật ở `#tinh=01`
// nhưng bộ p/01 thiếu `dist_station_m` và thiếu `routes_showcase.geojson`.
test("cổng dữ liệu chặn khi thiếu cột đường mà cảnh C cần", () => {
  const m = {
    ...MANIFEST,
    story_enabled: true,
    available_road_columns: ["osm_id", "road_class", "bridge", "coords"],
    files: { "roads.parquet": {} },
  } as unknown as Manifest;
  assert.equal(storyDataReady(m), false);
  assert.equal(factsFrom(m).storyEnabled, false, "hai cổng phải nhân với nhau");
});

test("cổng dữ liệu chặn khi thiếu file cặp tuyến", () => {
  const m = {
    ...MANIFEST,
    story_enabled: true,
    available_road_columns: ["dist_station_m"],
    files: { "roads.parquet": {} },
  } as unknown as Manifest;
  assert.equal(storyDataReady(m), false);
});

test("đủ dữ liệu thì cổng dữ liệu mở", () => {
  const m = {
    ...MANIFEST,
    story_enabled: true,
    available_road_columns: ["dist_station_m"],
    files: { "routes_showcase.geojson": {} },
  } as unknown as Manifest;
  assert.equal(storyDataReady(m), true);
  assert.equal(factsFrom(m).storyEnabled, true);
});

test("bộ Hà Nội gốc KHÔNG khai available_road_columns ⇒ không bị chặn", () => {
  // Vắng khoá = CHƯA BIẾT, và "chưa biết" không được biến thành "biết là thiếu".
  const m = { story_enabled: true, files: { "routes_showcase.geojson": {} } } as unknown as Manifest;
  assert.equal(storyDataReady(m), true);
});

test("cổng biên tập vẫn thắng: story_enabled=false thì dữ liệu đủ cũng không mở", () => {
  const m = {
    ...MANIFEST,
    story_enabled: false,
    available_road_columns: ["dist_station_m"],
    files: { "routes_showcase.geojson": {} },
  } as unknown as Manifest;
  assert.equal(storyDataReady(m), true, "dữ liệu thì đủ");
  assert.equal(factsFrom(m).storyEnabled, false, "nhưng văn cảnh không viết cho tỉnh này");
});
