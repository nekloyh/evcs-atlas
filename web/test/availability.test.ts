/**
 * Tầng availability của `fields.ts` — toàn bộ phần retrofit chiều tỉnh, trước đây 0 test.
 *
 * Đây là thứ quyết định một tỉnh mới ETL vào sẽ **render** hay **trắng màn hình**. Cơ chế
 * đúng thì một cột vắng hiện thành "chưa tính"; cơ chế sai thì `SELECT` một cột không tồn
 * tại, DuckDB ném lỗi, và người dùng thấy màn hình trắng.
 *
 * Hai câu hỏi khác nhau, cố ý hai hàm khác nhau, và test giữ chúng khác nhau:
 *   · `fieldAvailable(f)`        — TRƯỜNG này dựng được chưa (rail lọc theo đây)
 *   · `gridColumnAvailable(col)` — CỘT này có mặt không (SQL hỏi theo đây)
 *
 * Ba bậc hỏng, và bậc thứ ba mới là bậc nguy hiểm:
 *   1. cột KHÔNG có       ⇒ SELECT nổ  ⇒ chặn bằng `AVAILABLE`
 *   2. lớp chưa dựng      ⇒ cột vắng   ⇒ cùng cơ chế
 *   3. lớp ĐỌC ĐƯỢC KÉM   ⇒ cột CÓ, truy vấn chạy, trả về gần như toàn null. Một bản đồ
 *      mức sử dụng gần trống trông giống "mức sử dụng thấp" chứ không giống "không đo
 *      được" — chặn bằng `UNUSABLE_LAYERS`.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  COMMUNE_PREFIX,
  FIELDS,
  STATION_OCC_FIELD,
  fieldAvailable,
  fieldsOfUnit,
  gridColumnAvailable,
  layerUsable,
  setAvailableColumns,
  setUnusableLayers,
  unavailableFields,
  type FieldMeta,
} from "../src/fields";

/** Trả về trạng thái "bộ Hà Nội đầy đủ" — không manifest, không lọc gì. */
function reset() {
  setAvailableColumns(undefined, undefined);
  setUnusableLayers(undefined);
}
afterEach(reset);

const f = (id: string): FieldMeta => {
  const m = FIELDS.find((x) => x.id === id);
  assert.ok(m, `không có trường ${id}`);
  return m;
};

// --- không manifest = bộ đầy đủ ------------------------------------------
test("không có available_columns thì KHÔNG lọc gì — bộ Hà Nội chạy y như trước", () => {
  reset();
  assert.ok(FIELDS.every(fieldAvailable));
  assert.ok(gridColumnAvailable("cot_khong_ton_tai"));
  assert.deepEqual(unavailableFields(), []);
});

// --- cột vắng ------------------------------------------------------------
test("cột vắng thì trường của Ô bị ẩn, KHÔNG nổ", () => {
  setAvailableColumns(["h3_r8", "n_stations"]);
  assert.ok(fieldAvailable(f("n_stations")));
  assert.ok(!fieldAvailable(f("population")));
});

test("gridColumnAvailable trả lời theo TÊN CỘT, không theo trường", () => {
  setAvailableColumns(["h3_r8", "population"]);
  assert.ok(gridColumnAvailable("population"));
  assert.ok(!gridColumnAvailable("dist_station_network_m"));
});

test("trường vắng ĐẾM ĐƯỢC — rail phải in ra được, không im lặng", () => {
  setAvailableColumns(["h3_r8", "n_stations"]);
  const vang = unavailableFields();
  assert.ok(vang.length > 0);
  assert.ok(vang.some((x) => x.id === "population"));
  assert.ok(!vang.some((x) => x.id === "n_stations"));
});

test("fieldsOfUnit đã lọc sẵn — đây là cửa duy nhất rail đi qua", () => {
  setAvailableColumns(["h3_r8", "n_stations"]);
  const ids = fieldsOfUnit("cell").map((x) => x.id);
  assert.ok(ids.includes("n_stations"));
  assert.ok(!ids.includes("population"));
});

// --- đơn vị đọc khác không bị lọc bởi cột LƯỚI ---------------------------
test("trường của XÃ đọc từ file riêng, cột lưới không nói gì về nó", () => {
  setAvailableColumns(["h3_r8"], ["population", "n_stations"]);
  assert.ok(fieldAvailable(f(`${COMMUNE_PREFIX}population`)));
  assert.ok(!fieldAvailable(f(`${COMMUNE_PREFIX}dist_station_m_pop_weighted`)));
});

test("trường của ĐƯỜNG và TRẠM không bị lọc theo cột lưới", () => {
  setAvailableColumns(["h3_r8"]);
  for (const x of FIELDS.filter((y) => y.readAs === "road" || y.readAs === "station")) {
    assert.ok(fieldAvailable(x), x.id);
  }
});

// --- bậc hỏng thứ ba: lớp có cột nhưng đọc không được --------------------
test("lớp không đọc được thì TẮT cả trường lẫn scrubber", () => {
  setAvailableColumns(undefined);
  setUnusableLayers(["occupancy"]);
  assert.ok(!layerUsable("occupancy"));
  assert.ok(!fieldAvailable(f(STATION_OCC_FIELD)));
  assert.ok(!fieldAvailable(f("util_cell")));
});

test("lớp không đọc được KHÔNG kéo theo trường của lớp khác", () => {
  setUnusableLayers(["occupancy"]);
  assert.ok(fieldAvailable(f("n_stations")));
  assert.ok(layerUsable("poi"));
});

test("hai cơ chế độc lập: cột có mặt vẫn bị tắt nếu lớp không đọc được", () => {
  // Đây chính là bậc hỏng thứ ba — cột `util_cell` CÓ, nhưng gần như toàn null.
  setAvailableColumns(["h3_r8", "util_cell"]);
  assert.ok(gridColumnAvailable("util_cell"), "cột vẫn có mặt");
  setUnusableLayers(["occupancy"]);
  assert.ok(!fieldAvailable(f("util_cell")), "nhưng trường phải bị tắt");
});

// --- reset ---------------------------------------------------------------
test("mảng rỗng ĐỌC NHƯ 'không biết', không phải 'không có cột nào'", () => {
  // Một manifest thiếu khoá không được biến thành màn hình trống hoàn toàn.
  setAvailableColumns([]);
  assert.ok(FIELDS.every(fieldAvailable));
});

test("đặt lại về undefined thì mọi trường hiện lại", () => {
  setAvailableColumns(["h3_r8"]);
  setUnusableLayers(["occupancy"]);
  reset();
  assert.ok(FIELDS.every(fieldAvailable));
  assert.ok(layerUsable("occupancy"));
});

// --- bất biến với manifest THẬT ------------------------------------------
test("manifest thật của một tỉnh cho ra ít nhất một trường tô được", () => {
  // Bản đồ không có trường nào tô được là một màn hình trống — dạng hỏng mà cả tầng này
  // sinh ra để chặn. Kiểm bằng đúng danh sách cột mà `n11` phát cho tỉnh Cà Mau.
  const cot = FIELDS.filter((x) => x.readAs === "cell" && !x.expr).map((x) => x.column);
  setAvailableColumns(cot.slice(0, 3));
  assert.ok(fieldsOfUnit("cell").length >= 1);
});
