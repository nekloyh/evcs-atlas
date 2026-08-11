/**
 * Hạt nhân của chiều tỉnh — trước đây có 0 test.
 *
 * `PROVINCE` là một `const` đọc `window.location.hash` lúc nạp module, nên không có cách
 * nào gọi nó với một đầu vào khác. `parseDataset` và `pathIn` tách ra để đúng cái đó thành
 * assert được: ba bộ dữ liệu loại trừ nhau, và một mã hỏng rơi về mặc định chứ không nổ.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { currentDataset, parseDataset, pathIn } from "../src/data/province";

test("vắng khoá `tinh` là bộ Hà Nội gốc, đường dẫn không tiền tố", () => {
  assert.deepEqual(parseDataset(""), { province: null, national: false, proxy: false });
  assert.deepEqual(parseDataset("#f=population&m=3d"), {
    province: null,
    national: false,
    proxy: false,
  });
  assert.equal(pathIn(null, "grid_h3_r8.parquet"), "grid_h3_r8.parquet");
});

test("mọi hash `tinh` đều quay về Hà Nội", () => {
  for (const value of ["01", "79", "vn", "poi", "xx", "999", "01;drop"]) {
    assert.deepEqual(parseDataset(`#tinh=${encodeURIComponent(value)}`), {
      province: null,
      national: false,
      proxy: false,
    });
  }
});

test("mọi mã hợp lệ đều cho một đường dẫn khác nhau", () => {
  const codes = ["01", "04", "79", "96"];
  const paths = codes.map((c) => pathIn(c, "grid_h3_r8.parquet"));
  assert.equal(new Set(paths).size, codes.length);
});

test("đổi tỉnh là đổi ĐƯỜNG DẪN, không phải đổi tên file", () => {
  // Đây là bất biến giữ cho `queries.ts` không phải đổi một chữ ký nào: tên file giống hệt
  // bộ Hà Nội, thứ duy nhất đổi là tiền tố.
  for (const name of ["grid_h3_r8.parquet", "stations.parquet", "commune.geojson"]) {
    assert.ok(pathIn("79", name).endsWith(`/${name}`));
    assert.equal(pathIn(null, name), name);
  }
});

test("khoá khác trong hash không làm thay đổi bộ Hà Nội", () => {
  assert.deepEqual(parseDataset("#f=population&tinh=48&c=8a65&m=3d"), {
    province: null,
    national: false,
    proxy: false,
  });
});

// ── currentDataset: hàm nghịch của `switchDataset`, và là `value` của bộ chọn ──────────
//
// Nó có test riêng vì lỗi ở đây KHÔNG nổ: bộ chọn chỉ đứng sai chỗ. Một ô ghi "Hà Nội"
// trong khi màn hình là POI thì thứ duy nhất nói ta đang ở đâu lại đang nói sai.

test("currentDataset luôn là bộ Hà Nội", () => {
  assert.equal(currentDataset(""), "");
  assert.equal(currentDataset("#f=population&m=3d"), "");
  assert.equal(currentDataset("#tinh=79"), "");
  assert.equal(currentDataset("#tinh=vn"), "");
  assert.equal(currentDataset("#tinh=poi&tap=poi_chungcu"), "");
});

test("mã hỏng cho cùng một giá trị với bộ mặc định — bộ chọn không được đứng ở một dòng ma", () => {
  for (const xau of ["xx", "999", "0a", "vn2", "poi!", "p/01"]) {
    assert.equal(currentDataset(`#tinh=${encodeURIComponent(xau)}`), "", xau);
  }
});
