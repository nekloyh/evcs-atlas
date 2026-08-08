/**
 * Test cho "vẽ gì ở mức zoom này" — DESIGN.md §6b (ràng buộc 2 mở rộng) và §13b-1.
 *
 * Vì sao có file này: ảnh chụp chứng minh được rằng ở zoom 9,3 hex không vẽ. Nó KHÔNG
 * chứng minh được rằng đúng một mặt được tô ở mọi tổ hợp (đơn vị × zoom × có mặt liên tục
 * hay không) — mà "đúng một" chính là ràng buộc 2. Đây là logic thuần, nhiều nhánh (§12).
 *
 * Chạy: `pnpm test` (node:test + node:assert, không thêm dependency — DESIGN §1).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { HEX_MIN_ZOOM, hexPixelWidth, renderPlan } from "../src/viz/render-plan.ts";

// ── Ràng buộc 2 mở rộng: ĐÚNG MỘT mặt được tô, ở mọi tổ hợp ────────────────────

test("mọi tổ hợp đơn vị × zoom × mặt liên tục cho đúng MỘT mặt tô", () => {
  const units = ["cell", "commune"] as const;
  const zooms = [0, 5, 9.3, 10.99, 11, 11.01, 14, 24];
  for (const unit of units) {
    for (const zoom of zooms) {
      for (const hasSurface of [true, false]) {
        const p = renderPlan({ unit, zoom, hasSurface, inStory: zoom < 6 });
        // `paint` là MỘT chuỗi, không phải mảng — không có đường nào trả về hai mặt.
        assert.equal(typeof p.paint, "string", `${unit}/${zoom}/${hasSurface}`);
        assert.ok(
          ["hex", "commune", "surface", "none"].includes(p.paint),
          `giá trị lạ: ${p.paint}`,
        );
      }
    }
  }
});

test("không vẽ gì thì PHẢI kèm lý do — bản đồ trống mà im lặng là nói dối về phủ", () => {
  const p = renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false, inStory: true });
  assert.equal(p.paint, "none");
  assert.equal(p.reason, "zoom");
});

test("vẽ được thì KHÔNG kèm lý do — không có gì để giải thích", () => {
  for (const p of [
    renderPlan({ unit: "commune", zoom: 9.3, hasSurface: false }),
    renderPlan({ unit: "cell", zoom: 14, hasSurface: false }),
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false }),
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true }),
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true, inStory: true }),
  ]) {
    assert.equal(p.reason, undefined);
  }
});

// ── §13b-1: ngưỡng zoom chỉ áp cho đơn vị Ô ────────────────────────────────────

test("đơn vị XÃ không có ngưỡng zoom — 126 đa giác đọc được ở mọi mức", () => {
  for (const zoom of [0, 3, 9.3, 11, 20]) {
    assert.equal(renderPlan({ unit: "commune", zoom, hasSurface: false }).paint, "commune");
    // Xã có cờ `surface` cũng không đổi: mặt liên tục là cách vẽ của trường Ô (§1b).
    assert.equal(renderPlan({ unit: "commune", zoom, hasSurface: true }).paint, "commune");
  }
});

test("ngưỡng HEX_MIN_ZOOM là biên ĐÓNG dưới — nó chia THÔ/MỊN, không còn chia VẼ/KHÔNG", () => {
  const trên = renderPlan({ unit: "cell", zoom: HEX_MIN_ZOOM, hasSurface: false });
  const dưới = renderPlan({ unit: "cell", zoom: HEX_MIN_ZOOM - 0.01, hasSurface: false });
  assert.equal(trên.paint, "hex");
  assert.equal(trên.coarse, undefined);
  // M5.1: dưới ngưỡng vẫn VẼ. Ngưỡng giờ quyết định `coarse` — tức legend nói gì — chứ
  // không quyết định bản đồ có nội dung hay không.
  assert.equal(dưới.paint, "hex");
  assert.equal(dưới.coarse, true);
});

test("dưới ngưỡng, trên BẢN ĐỒ: MỌI trường của ô đều vẽ, không riêng trường có mặt liên tục", () => {
  // Đây là lỗi mà M5.1 sửa: `surface: true` chỉ có ở đúng MỘT trường trong 45 trường
  // (`population`), nên ở khung nhìn mặc định z9,3 bản đồ hiện dân số mà trắng trơn ở chung
  // cư / POI / trạm trong ô. `hasSurface` trả lời "gộp mượt được không", không trả lời
  // "được vẽ ở zoom thấp không".
  for (const zoom of [5, 8, 9.3, 10.99]) {
    for (const hasSurface of [true, false]) {
      const p = renderPlan({ unit: "cell", zoom, hasSurface });
      assert.equal(p.paint, "hex", `z${zoom}/surface=${hasSurface}`);
      assert.equal(p.reason, undefined);
      assert.equal(p.coarse, true);
    }
  }
});

test("dưới ngưỡng, TRONG CẢNH: trường cộng được vẽ mặt liên tục", () => {
  assert.equal(
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true, inStory: true }).paint,
    "surface",
  );
  assert.equal(
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false, inStory: true }).paint,
    "none",
  );
});

test("dưới ngưỡng, trên BẢN ĐỒ: trường cộng được vẽ Ô H3, không vẽ mặt", () => {
  // Đổi ở M4.5 theo quyết định của chủ dự án: ở z9,3 mặt gộp 3 km phủ kín thành phố thành
  // một khối cam, nuốt đường và **lấp mất những lỗ hổng** — mà lỗ hổng là một nửa nội dung
  // của trường dân số. Cái giá (§13a-1 vẫn đúng): 4.400 ô ở 9 px thì không đọc nổi từng
  // bậc màu. Mặt Ở LẠI trong cảnh A, nơi nó là luận điểm chứ không phải một cách tô.
  assert.equal(renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true }).paint, "hex");
  assert.equal(
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true, inStory: false }).paint,
    "hex",
  );
  // M5.1: trường KHÔNG cộng được cũng vẽ hex — xem test ngay trên.
  assert.equal(renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false }).paint, "hex");
});

test("TRONG CẢNH thì luật cũ giữ nguyên — cảnh chốt khung nhìn của chính nó", () => {
  // Cảnh không phải chỗ người xem tình cờ dừng lại: nó chọn trường + khung nhìn + tập ô
  // (L3). "Quá xa để đọc" ở đó là lựa chọn của người viết cảnh, nên hình phạt cũ vẫn đúng.
  const p = renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false, inStory: true });
  assert.equal(p.paint, "none");
  assert.equal(p.reason, "zoom");
  assert.equal(
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true, inStory: true }).paint,
    "surface",
  );
});

test("TRÊN ngưỡng thì hex thắng mặt liên tục — hex là số liệu thật, mặt là phép gộp", () => {
  assert.equal(renderPlan({ unit: "cell", zoom: 12, hasSurface: true }).paint, "hex");
});

// ── Ngưỡng 11 không phải con số cảm tính ───────────────────────────────────────

test("hexPixelWidth neo đúng vào phép đo của §13a-1: ~9 px tại zoom 9,3", () => {
  assert.ok(Math.abs(hexPixelWidth(9.3) - 9) < 1e-9);
});

test("mỗi bậc zoom nhân đôi bề rộng ô", () => {
  for (const z of [8, 9.3, 11, 13]) {
    assert.ok(Math.abs(hexPixelWidth(z + 1) / hexPixelWidth(z) - 2) < 1e-9);
  }
});

test("ngưỡng đặt ở chỗ ô vượt 25 px — dưới nó là texture, không phải bản đồ", () => {
  // Lý lẽ của §13b-1: ~29 px tại z11 là chỗ ô lục giác thôi là hạt.
  assert.ok(hexPixelWidth(HEX_MIN_ZOOM) > 25, `${hexPixelWidth(HEX_MIN_ZOOM)} px`);
  assert.ok(hexPixelWidth(HEX_MIN_ZOOM - 1) < 25, "ngưỡng thấp hơn một bậc thì chưa đọc được");
});
