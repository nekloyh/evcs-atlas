/**
 * Hạt nhân của chiều tỉnh — trước đây có 0 test.
 *
 * `PROVINCE` là một `const` đọc `window.location.hash` lúc nạp module, nên không có cách
 * nào gọi nó với một đầu vào khác. `parseDataset` và `pathIn` tách ra để đúng cái đó thành
 * assert được: ba bộ dữ liệu loại trừ nhau, và một mã hỏng rơi về mặc định chứ không nổ.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { NATIONAL, parseDataset, pathIn } from "../src/data/province";

test("vắng khoá `tinh` là bộ Hà Nội gốc, đường dẫn không tiền tố", () => {
  assert.deepEqual(parseDataset(""), { province: null, national: false });
  assert.deepEqual(parseDataset("#f=population&m=3d"), { province: null, national: false });
  assert.equal(pathIn(null, "grid_h3_r8.parquet"), "grid_h3_r8.parquet");
});

test("hai chữ số là một tỉnh", () => {
  assert.deepEqual(parseDataset("#tinh=79"), { province: "79", national: false });
  assert.equal(pathIn("79", "grid_h3_r8.parquet"), "p/79/grid_h3_r8.parquet");
});

test("`tinh=vn` là lớp gộp toàn quốc, KHÔNG phải một tỉnh", () => {
  const d = parseDataset(`#tinh=${NATIONAL}`);
  assert.deepEqual(d, { province: null, national: true });
  // Mấu chốt: `dataPath` không được sinh tiền tố `p/vn/`.
  assert.equal(pathIn(d.province, "grid_h3_r8.parquet"), "grid_h3_r8.parquet");
});

test("ba bộ loại trừ nhau — không trạng thái nào vừa tỉnh vừa toàn quốc", () => {
  for (const h of ["", "#tinh=01", "#tinh=vn", "#tinh=xx", "#tinh=999"]) {
    const d = parseDataset(h);
    assert.ok(!(d.province !== null && d.national), h);
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
