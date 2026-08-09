/**
 * Hạt nhân của chiều tỉnh — trước đây có 0 test.
 *
 * `PROVINCE` là một `const` đọc `window.location.hash` lúc nạp module, nên không có cách
 * nào gọi nó với một đầu vào khác. `parseDataset` và `pathIn` tách ra để đúng cái đó thành
 * assert được: ba bộ dữ liệu loại trừ nhau, và một mã hỏng rơi về mặc định chứ không nổ.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { NATIONAL, PROXY, currentDataset, parseDataset, pathIn } from "../src/data/province";

test("vắng khoá `tinh` là bộ Hà Nội gốc, đường dẫn không tiền tố", () => {
  assert.deepEqual(parseDataset(""), { province: null, national: false, proxy: false });
  assert.deepEqual(parseDataset("#f=population&m=3d"), {
    province: null,
    national: false,
    proxy: false,
  });
  assert.equal(pathIn(null, "grid_h3_r8.parquet"), "grid_h3_r8.parquet");
});

test("hai chữ số là một tỉnh", () => {
  assert.deepEqual(parseDataset("#tinh=79"), { province: "79", national: false, proxy: false });
  assert.equal(pathIn("79", "grid_h3_r8.parquet"), "p/79/grid_h3_r8.parquet");
});

test("`tinh=vn` là lớp gộp toàn quốc, KHÔNG phải một tỉnh", () => {
  const d = parseDataset(`#tinh=${NATIONAL}`);
  assert.deepEqual(d, { province: null, national: true, proxy: false });
  // Mấu chốt: `dataPath` không được sinh tiền tố `p/vn/`.
  assert.equal(pathIn(d.province, "grid_h3_r8.parquet"), "grid_h3_r8.parquet");
});

test("`tinh=poi` là chế độ PROXY — không phải một tỉnh, không sinh tiền tố `p/poi/`", () => {
  const d = parseDataset(`#tinh=${PROXY}`);
  assert.deepEqual(d, { province: null, national: false, proxy: true });
  assert.equal(pathIn(d.province, "grid_h3_r8.parquet"), "grid_h3_r8.parquet");
});

test("bốn bộ loại trừ nhau — không trạng thái nào vừa tỉnh vừa toàn quốc vừa proxy", () => {
  for (const h of ["", "#tinh=01", "#tinh=vn", "#tinh=poi", "#tinh=xx", "#tinh=999"]) {
    const d = parseDataset(h);
    const n = [d.province !== null, d.national, d.proxy].filter(Boolean).length;
    assert.ok(n <= 1, h);
  }
});

test("mã hỏng rơi về mặc định, KHÔNG nổ", () => {
  for (const xau of ["xx", "1", "999", "0a", "", "01;drop", "p/01", "-1"]) {
    assert.equal(parseDataset(`#tinh=${encodeURIComponent(xau)}`).province, null, xau);
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

test("khoá khác trong hash không ảnh hưởng việc chọn bộ dữ liệu", () => {
  assert.equal(parseDataset("#f=population&tinh=48&c=8a65&m=3d").province, "48");
  assert.equal(parseDataset("#tinh=48&f=population").province, "48");
});

// ── currentDataset: hàm nghịch của `switchDataset`, và là `value` của bộ chọn ──────────
//
// Nó có test riêng vì lỗi ở đây KHÔNG nổ: bộ chọn chỉ đứng sai chỗ. Một ô ghi "Hà Nội"
// trong khi màn hình là POI thì thứ duy nhất nói ta đang ở đâu lại đang nói sai.

test("currentDataset phân biệt được cả bốn bộ", () => {
  assert.equal(currentDataset(""), "");
  assert.equal(currentDataset("#f=population&m=3d"), "");
  assert.equal(currentDataset("#tinh=79"), "79");
  assert.equal(currentDataset(`#tinh=${NATIONAL}`), NATIONAL);
  assert.equal(currentDataset(`#tinh=${PROXY}&tap=poi_chungcu`), PROXY);
});

test("currentDataset KHÔNG gộp ba bộ có PROVINCE === null thành một", () => {
  // Đây là chính lỗi mà nó sinh ra để chặn: `parseDataset(...).province` là `null` ở cả
  // Hà Nội gốc, toàn quốc và proxy.
  const ba = ["", `#tinh=${NATIONAL}`, `#tinh=${PROXY}`].map(currentDataset);
  assert.equal(new Set(ba).size, 3);
  for (const h of ["", `#tinh=${NATIONAL}`, `#tinh=${PROXY}`]) {
    assert.equal(parseDataset(h).province, null, h);
  }
});

test("mã hỏng cho cùng một giá trị với bộ mặc định — bộ chọn không được đứng ở một dòng ma", () => {
  for (const xau of ["xx", "999", "0a", "vn2", "poi!", "p/01"]) {
    assert.equal(currentDataset(`#tinh=${encodeURIComponent(xau)}`), "", xau);
  }
});
