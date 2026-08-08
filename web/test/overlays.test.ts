/**
 * Test cho hai cổng "bộ dữ liệu này không có thứ đó" — DESIGN.md §3a, §9.
 *
 * Vì sao có file này: cả hai lỗi nó khoá đều **vỡ im lặng**. Một công tắc overlay bật lên
 * mà bản đồ không đổi gì trông y hệt "vùng đó rỗng thật"; một cảnh CÂU CHUYỆN viết cho Hà
 * Nội mở trên Cao Bằng trông y hệt một cảnh chạy đúng. Ảnh chụp bắt được chúng đúng MỘT
 * lần, trên đúng một tỉnh — nó không chứng minh được rằng luật đúng cho cả 33 tỉnh, cũng
 * không giữ được luật khi exporter đổi tên một khoá.
 *
 * Nên hai test dưới đây đọc **manifest THẬT** trong repo thay vì fixture: thứ chúng khoá
 * chính là *hợp đồng giữa exporter và web* (`files`, `available_columns`, `story_enabled`).
 * Một fixture chép tay sẽ vẫn xanh sau khi exporter đổi tên khoá — tức nó khoá đúng cái
 * không cần khoá.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  overlayUnavailableIn,
  overlayUnavailable,
  setUnavailableOverlays,
  unavailableOverlayPairs,
} from "../src/data/overlays.ts";
import { parseHash } from "../src/state/hash.ts";
import { parseScene, setStoryEnabled } from "../src/story/scenes.ts";
import type { Manifest } from "../src/data/manifest.ts";

const read = (p: string): Manifest => JSON.parse(readFileSync(p, "utf8")) as Manifest;
const HANOI = read("public/data/manifest.json");
// 04 = Cao Bằng — tỉnh đầu tiên sau Hà Nội trong store, và là bộ đã lộ cả bốn lỗi ở M4.2.
const TINH = read("public/data/p/04/manifest.json");

// ── Vị từ vắng ────────────────────────────────────────────────────────────────

test("bộ Hà Nội dựng được cả hai lớp — không cổng nào chặn nhầm bộ gốc", () => {
  assert.equal(overlayUnavailableIn("beyond2km", HANOI), null);
  assert.equal(overlayUnavailableIn("substations", HANOI), null);
  assert.deepEqual(unavailableOverlayPairs(HANOI), []);
});

test("bộ tỉnh vắng lớp trạm biến áp — hỏi FILE, không hỏi cột", () => {
  assert.ok(!TINH.files["substations.geojson"]);
  const why = overlayUnavailableIn("substations", TINH);
  assert.ok(why && why.includes("trạm biến áp"));
  assert.deepEqual(unavailableOverlayPairs(TINH).map(([id]) => id), ["substations"]);
});

test("`beyond2km` theo CỘT, và nó đang có ở cả hai bộ — cổng phải im khi cột có mặt", () => {
  // Lớp TÍNH TOÁN của store toàn quốc đã chạy (`dist_station_network_m` có trong 57 cột
  // của tỉnh), nên hôm nay lớp này dựng được ở cả hai bộ. Test vẫn giữ vì thứ nó khoá là
  // LUẬT, không phải trạng thái dữ liệu hôm nay: cổng phải im khi cột có, và phải nói khi
  // cột vắng. Nhánh thứ hai đo trên chính manifest tỉnh, bỏ đúng một cột đi.
  assert.ok(TINH.available_columns!.includes("dist_station_network_m"));
  assert.equal(overlayUnavailableIn("beyond2km", TINH), null);

  const truoc = {
    ...TINH,
    available_columns: TINH.available_columns!.filter((c) => c !== "dist_station_network_m"),
  };
  const why = overlayUnavailableIn("beyond2km", truoc);
  assert.ok(why && why.includes("mạng đường"));
});

test("lớp không có vị từ thì luôn dựng được — cổng là danh sách chọn, không phải danh sách cấm", () => {
  for (const m of [HANOI, TINH]) {
    assert.equal(overlayUnavailableIn("stations", m), null);
    assert.equal(overlayUnavailableIn("communes", m), null);
    assert.equal(overlayUnavailableIn("poi_mall", m), null);
  }
});

// ── Khoá `l` bỏ overlay vắng ──────────────────────────────────────────────────

test("khoá `l` bỏ RIÊNG overlay vắng, giữ các overlay còn lại", () => {
  setUnavailableOverlays(unavailableOverlayPairs(TINH));
  assert.ok(overlayUnavailable("substations"));
  assert.equal(overlayUnavailable("stations"), null);

  // Cùng luật với ID lạ ở §9: bỏ từng cái một, không bỏ cả khoá.
  const out = parseHash("#l=stations,substations,khongcothat,communes");
  assert.deepEqual(out.layers, ["stations", "communes"]);

  setUnavailableOverlays([]);
  assert.deepEqual(parseHash("#l=stations,substations").layers, ["stations", "substations"]);
});

// ── Cổng `story_enabled` ──────────────────────────────────────────────────────

test("story tắt thì khoá `s` biến mất y như một slug lạ", () => {
  setStoryEnabled(false);
  assert.equal(parseScene("von-cuc"), null);
  assert.equal(parseHash("#s=von-cuc").scene, undefined);

  // Và bỏ `s` CHÍNH LÀ về BẢN ĐỒ — `f`/`v`/`l` lại được đọc, vì chúng chỉ bị `s` nuốt khi
  // có cảnh thật (§9a). Một hash tỉnh gõ tay không được mất luôn trường đang xem.
  const out = parseHash("#s=von-cuc&f=n_stations&l=stations");
  assert.equal(out.scene, undefined);
  assert.equal(out.field, "n_stations");
  assert.deepEqual(out.layers, ["stations"]);

  setStoryEnabled(true);
  assert.equal(parseHash("#s=von-cuc").scene, "von-cuc");
});

test("story tắt thì `#s=…&d=1` rơi về chế độ DỮ LIỆU, không rơi vào khoảng không", () => {
  // `d` chỉ được đọc khi KHÔNG có cảnh (§9). Cảnh bị cổng bỏ ⇒ `d` sống lại. Đó là hành vi
  // đúng chứ không phải phụ phẩm: hai chế độ loại trừ nhau, và khi một cái không tồn tại
  // trên bộ này thì link phải mở ra cái còn lại chứ không mở ra BẢN ĐỒ trắng.
  setStoryEnabled(false);
  assert.equal(parseHash("#s=von-cuc&d=1").dataMode, true);

  setStoryEnabled(true);
  assert.equal(parseHash("#s=von-cuc&d=1").dataMode, undefined);
});
