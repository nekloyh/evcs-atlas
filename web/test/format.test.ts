/**
 * `formatNumber` phải làm cho "thiếu" NHÌN THẤY được, không được thành sự cố.
 *
 * Đây từng là một crash thật, và đường tới nó mở sẵn: `manifest.roads` của store toàn quốc
 * có 4 khoá (`ways_in_shard` · `ways_shipped` · `ways_dropped_buffer_copy` ·
 * `ways_dropped_service`), còn `story/bodies.tsx:301,305` đọc `bridge_ways_shipped` và
 * `ways_unreachable_null_dist` — hai khoá chỉ bộ Hà Nội có. `undefined.toLocaleString()`
 * ném TypeError, và `story_enabled` đang BẬT ở `#tinh=01`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatNumber } from "../src/ui/format";

test("thiếu số thì hiện gạch, KHÔNG nổ", () => {
  assert.equal(formatNumber(undefined), "—");
  assert.equal(formatNumber(null), "—");
  assert.equal(formatNumber(NaN), "—");
  assert.equal(formatNumber(Infinity), "—");
});

test("0 vẫn là 0, không phải thiếu", () => {
  // Ranh giới quan trọng nhất: `0` là một SỐ ĐO, `undefined` là KHÔNG BIẾT.
  assert.equal(formatNumber(0), "0");
  assert.notEqual(formatNumber(0), formatNumber(undefined));
});

test("số nguyên và số lẻ giữ nguyên cách hiển thị cũ", () => {
  assert.equal(formatNumber(1234), (1234).toLocaleString("vi-VN"));
  assert.equal(formatNumber(-5), (-5).toLocaleString("vi-VN"));
  assert.ok(formatNumber(0.00123).length > 0);
  assert.ok(formatNumber(1234.567).length > 0);
});

test("mọi khoá manifest.roads của store toàn quốc đều hiển thị được", () => {
  // Đúng bộ khoá mà `n11_web_export` phát, cộng hai khoá chỉ Hà Nội có.
  const roads: Record<string, number | undefined> = {
    ways_in_shard: 1000,
    ways_shipped: 900,
    ways_dropped_buffer_copy: 50,
    ways_dropped_service: 50,
    bridge_ways_shipped: undefined,
    ways_unreachable_null_dist: undefined,
  };
  for (const [k, v] of Object.entries(roads)) {
    assert.doesNotThrow(() => formatNumber(v), k);
  }
});
