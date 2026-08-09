/**
 * Phần THUẦN của chế độ PROXY POI (§12).
 *
 * Ba hàm, và cả ba đều là loại "sai mà không nổ": một bbox rỗng trả về khung mặc định thì
 * camera bay tới một chỗ trống mà người xem tưởng mình đang nhìn đúng; một bộ lọc bỏ sót
 * cột thì "không có dòng nào khớp" đọc thành "luật đã sạch"; một thứ tự khoá do
 * `Object.keys` quyết định thì dòng đầu panel luôn là `osm_type`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { bboxOf, boDau, chiMuc, inGiaTri, khop, sapKhoa } from "../src/proxy/data";

const f = (props: Record<string, unknown>) => ({ properties: props });

test("bboxOf ôm mọi điểm có toạ độ", () => {
  const b = bboxOf([
    f({ lat: 21.0, lng: 105.8 }),
    f({ lat: 10.8, lng: 106.7 }),
    f({ lat: 16.0, lng: 108.2 }),
  ]);
  assert.deepEqual(b, [105.8, 10.8, 108.2, 21.0]);
});

test("bboxOf trả null cho tập rỗng — KHÔNG bịa một khung mặc định", () => {
  assert.equal(bboxOf([]), null);
  // Dòng không có toạ độ cũng không được đẩy bbox ra Đại Tây Dương.
  assert.equal(bboxOf([f({ name: "x" })]), null);
  assert.deepEqual(bboxOf([f({ name: "x" }), f({ lat: 21, lng: 105 })]), [105, 21, 105, 21]);
});

test("chiMuc gom MỌI cột, không riêng name", () => {
  const doc = chiMuc(f({ name: "Chung cư Ngô Gia Tự", highway: "bus_stop", lop: "CHUNG_CU" }));
  assert.ok(khop(doc, "bus_stop"));
  assert.ok(khop(doc, "CHUNG_CU"));
  assert.ok(!khop(doc, "vinhomes"));
});

test("gõ KHÔNG DẤU vẫn khớp dữ liệu CÓ DẤU — nếu không, 0 dòng đọc thành 'luật đã sạch'", () => {
  const doc = chiMuc(f({ name: "Chung cư Ngô Gia Tự" }));
  assert.ok(khop(doc, "ngo gia tu"));
  assert.ok(khop(doc, "chung cu"));
  // và chiều ngược lại: gõ có dấu vẫn phải khớp
  assert.ok(khop(doc, "Ngô Gia"));
});

test("boDau xử lý cả `đ` — NFD không tách được gạch ngang của nó", () => {
  assert.equal(boDau("Khu đô thị Đặng Xá"), "khu do thi dang xa");
  assert.equal(boDau("VINHOMES Ocean Park"), "vinhomes ocean park");
});

test("chuỗi rỗng giữ lại mọi dòng", () => {
  assert.ok(khop(chiMuc(f({ name: "A" })), ""));
  assert.ok(khop(chiMuc(f({ name: "A" })), "   "));
  assert.ok(khop(chiMuc(f({})), ""));
});

test("chiMuc bỏ qua cờ nội bộ `co_hinh` — gõ 'true' không được quét cả tập", () => {
  assert.ok(!khop(chiMuc(f({ co_hinh: true })), "true"));
  assert.ok(khop(chiMuc(f({ co_hinh: true, is_area: true })), "true"));
});

test("sapKhoa đưa bốn câu hỏi đầu lên trước, giữ nguyên thứ tự phần còn lại", () => {
  const k = sapKhoa({
    osm_type: "way",
    osm_id: 1,
    area_m2: 900,
    name: "A",
    province_name: "Hà Nội",
    lop: "CHUNG_CU",
  });
  assert.deepEqual(k.slice(0, 4), ["name", "lop", "province_name", "area_m2"]);
  assert.deepEqual(k.slice(4), ["osm_type", "osm_id"]);
});

test("sapKhoa giấu khoá nội bộ, và không nổ khi bảng thiếu khoá ưu tiên", () => {
  const k = sapKhoa({ co_hinh: true, lat: 21, lng: 105, ten_chuan: "a", osm_id: 7, name: "A" });
  assert.deepEqual(k, ["name", "osm_id"]);
  assert.deepEqual(sapKhoa({}), []);
});

test("inGiaTri: số nguyên nguyên văn (copy được), số thực làm tròn 2 chữ số", () => {
  // `osm_id` phải copy đi tra cứu được — phân nhóm hàng nghìn là làm hỏng một khoá.
  assert.equal(inGiaTri(1503681357), "1503681357");
  assert.equal(inGiaTri(104567.05876407165), "104.567,06");
  assert.equal(inGiaTri(true), "true");
  assert.equal(inGiaTri("CHUNG_CU"), "CHUNG_CU");
});
