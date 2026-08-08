/**
 * Test cho nhãn ĐẶC KHU — Hoàng Sa, Trường Sa và 11 đặc khu hải đảo khác.
 *
 * Vì sao có file này: thứ nó khoá là **chủ quyền hiện trên bản đồ**, và cách nó hỏng là im
 * lặng. Hình học của hai quần đảo đã có trong `commune.geojson` từ đầu và vẫn được vẽ đúng
 * — nhưng ở mức phóng vừa khít một tỉnh, mỗi đảo là 1–3 pixel vân xám trên nền biển xám.
 * Một ảnh chụp "trông có vẻ đủ" không phân biệt được "có vẽ" với "vẽ mà không ai thấy",
 * nên cái phải khoá là: **có neo nhãn, neo đúng cụm, và đọc từ dữ liệu chứ không từ một
 * danh sách tên gõ tay**.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { dacKhuLabels } from "../src/data/dackhu.ts";
import type { CommuneCollection } from "../src/data/queries.ts";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as CommuneCollection;

test("Hoàng Sa có nhãn, và nhãn neo giữa cụm 39 mảnh chứ không lên một hòn đảo", () => {
  const dn = dacKhuLabels(read("public/data/p/48/commune.geojson"));
  assert.equal(dn.length, 1);
  const hs = dn[0]!;
  assert.equal(hs.name, "Đặc khu Hoàng Sa");
  assert.equal(hs.parts, 39);

  // Nằm trong vùng Hoàng Sa (khoảng 111–113°E, 15,5–17°N) — kiểm khoảng, không kiểm một
  // toạ độ cứng: neo là tâm bbox của dữ liệu, nên nó phải đổi khi niên bản địa giới đổi.
  const [lng, lat] = hs.at;
  assert.ok(lng > 111 && lng < 113, `lng ${lng}`);
  assert.ok(lat > 15.5 && lat < 17.5, `lat ${lat}`);
});

test("Trường Sa có nhãn và neo trong vùng quần đảo", () => {
  const kh = dacKhuLabels(read("public/data/p/56/commune.geojson"));
  assert.equal(kh.length, 1);
  const ts = kh[0]!;
  assert.equal(ts.name, "Đặc khu Trường Sa");
  assert.ok(ts.parts > 1);
  const [lng, lat] = ts.at;
  assert.ok(lng > 111 && lng < 118, `lng ${lng}`);
  assert.ok(lat > 7 && lat < 13, `lat ${lat}`);
});

test("bộ Hà Nội không có đặc khu nào ⇒ không nhãn nào, không nhánh riêng nào", () => {
  // `commune_kind` không tồn tại trong bộ gốc. Luật phải tự im, chứ không phải được một
  // câu `if (PROVINCE)` ở chỗ gọi tắt đi — nếu không thì thêm một bộ dữ liệu thứ ba là
  // thêm một chỗ phải nhớ.
  assert.deepEqual(dacKhuLabels(read("public/data/commune.geojson")), []);
});

test("nhãn đọc từ `commune_kind`, không từ tên — đổi kind thì nhãn biến mất", () => {
  const fc = read("public/data/p/48/commune.geojson");
  const gia = {
    ...fc,
    features: fc.features.map((f) =>
      f.properties["commune_kind"] === "DAC_KHU"
        ? { ...f, properties: { ...f.properties, commune_kind: "XA" } }
        : f,
    ),
  };
  assert.deepEqual(dacKhuLabels(gia), []);
});
