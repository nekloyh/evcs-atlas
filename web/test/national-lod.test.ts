/**
 * Chọn bậc lưới theo mức phóng (§12).
 *
 * Hai dạng hỏng, cả hai đều KHÔNG nổ:
 *
 *   · thiếu trễ ⇒ lăn chuột đúng ranh giới làm bậc nhảy qua lại, mà đổi bậc là **đổi cả
 *     thang màu** (phân vị tính trên chính tập đang xem) — thảm ô nhấp nháy đổi màu
 *   · không kiểm `available` ⇒ đòi một file chưa xuất, và màn hình đứng ở "đang nạp" mãi
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RES_BASE,
  RES_ZOOM,
  ZOOM_DOWN,
  ZOOM_UP,
  resolutionForZoom,
} from "../src/national/lod";

const CO_DU = new Set([RES_BASE, RES_ZOOM]);
const CHI_R6 = new Set([RES_BASE]);

test("nhìn cả nước dùng bậc THÔ; phóng đủ sâu thì lên bậc mịn", () => {
  assert.equal(resolutionForZoom(4.6, RES_BASE, CO_DU), RES_BASE);
  assert.equal(resolutionForZoom(ZOOM_UP, RES_BASE, CO_DU), RES_ZOOM);
  assert.equal(resolutionForZoom(9, RES_BASE, CO_DU), RES_ZOOM);
});

test("TRỄ: ngưỡng lên cao hơn ngưỡng xuống, và khoảng chết giữ nguyên bậc", () => {
  assert.ok(ZOOM_DOWN < ZOOM_UP, "phải có khoảng chết");
  // Trong khoảng chết, bậc nào đang dùng thì giữ nguyên bậc đó — đây LÀ cái trễ.
  for (const z of [ZOOM_DOWN, 5.7, 5.9]) {
    assert.equal(resolutionForZoom(z, RES_BASE, CO_DU), RES_BASE, `lên tại ${z}`);
    assert.equal(resolutionForZoom(z, RES_ZOOM, CO_DU), RES_ZOOM, `xuống tại ${z}`);
  }
});

test("một cú lăn chuột quanh ngưỡng KHÔNG làm bậc nhấp nháy", () => {
  // Mô phỏng zoom dao động ±0,15 quanh `ZOOM_UP` (rộng hơn một nấc lăn thường thấy).
  let cur = RES_BASE;
  const doi: number[] = [];
  for (const z of [5.9, 6.05, 5.9, 6.05, 5.9, 6.05]) {
    const next = resolutionForZoom(z, cur, CO_DU);
    if (next !== cur) doi.push(next);
    cur = next;
  }
  // Đúng MỘT lần đổi (lên r7 rồi ở lại), không phải sáu lần qua lại.
  assert.deepEqual(doi, [RES_ZOOM]);
});

test("chưa xuất bậc mịn ⇒ luôn bậc thô, ở MỌI mức phóng", () => {
  for (const z of [4, 6, 9, 14]) {
    assert.equal(resolutionForZoom(z, RES_BASE, CHI_R6), RES_BASE, `z=${z}`);
    // kể cả khi state đang kẹt ở r7 (link cũ, build mới thiếu file)
    assert.equal(resolutionForZoom(z, RES_ZOOM, CHI_R6), RES_BASE, `z=${z} từ r7`);
  }
  assert.equal(resolutionForZoom(9, RES_BASE, new Set()), RES_BASE);
});

test("hàm THUẦN: cùng đầu vào cho cùng đầu ra, không đọc gì bên ngoài", () => {
  for (const z of [3, 5.6, 6, 7.2, 12]) {
    assert.equal(
      resolutionForZoom(z, RES_BASE, CO_DU),
      resolutionForZoom(z, RES_BASE, CO_DU),
    );
  }
});
