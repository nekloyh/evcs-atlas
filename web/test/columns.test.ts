/**
 * Cổng ETL→viz: đẩy một cột vào dữ liệu thì giao diện phải biết về nó.
 *
 * Trước khi có test này, bốn cột đã nằm trong parquet của **cả 34 tỉnh** mà không hiện lên
 * đâu cả — `population_wp`, `snow_frac`, `mangrove_frac`, `moss_frac`. Không có gì hỏng,
 * không có gì báo; chúng chỉ đơn giản vô hình. Đó là cái giá của việc danh mục trường và
 * schema dữ liệu là hai danh sách viết tay không nói chuyện với nhau.
 *
 * Test này bắt cả hai chiều:
 *   · trường trỏ tới một cột KHÔNG tồn tại  ⇒ SQL sẽ nổ lúc chạy, bắt ở đây lúc test
 *   · cột tô màu được mà KHÔNG có trường    ⇒ dữ liệu vô hình, bắt ở đây lúc test
 *
 * Cột chưa có trường thì khai vào `CHUA_CO_TRUONG` kèm lý do. Danh sách ấy là NỢ ĐÃ GHI
 * NHẬN, không phải chỗ giấu rác: nó hiện ra mỗi lần ai đó mở file này.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { GRID_COLUMNS, GRID_COLUMN_NAMES, MAPPABLE_COLUMNS } from "../src/data/columns.generated";
import { CELL_SPECS_COLUMNS } from "../src/fields";

/**
 * Cột đo được nhưng CHƯA có mục trong danh mục trường, kèm lý do.
 *
 * Mỗi dòng ở đây là một quyết định, không phải một chỗ quên.
 */
const CHUA_CO_TRUONG: Record<string, string> = {
  population_wp:
    "WorldPop THÔ chưa neo. Bày cạnh `population` mà không nói rõ khác nhau chỗ nào sẽ đọc như hai ước lượng cạnh tranh — cần câu chữ trước, không phải một ô màu trước.",
  snow_frac: "Toàn quốc bằng 0 ở mọi ô. Phát cột để schema ổn định giữa 34 phân mảnh; tô màu một hằng số là vô nghĩa.",
  mangrove_frac: "Cần câu chữ riêng: rừng ngập mặn là ràng buộc PHÁP LÝ về xây dựng, không phải một loại lớp phủ như các loại khác.",
  moss_frac: "Gần như bằng 0 ngoài vài đỉnh núi cao. Cùng lý do với `snow_frac`.",
};

/**
 * Cột CHỈ tồn tại ở bộ Hà Nội cũ (`data/processed/`), không có trong store toàn quốc.
 *
 * `road_len_in_hanoi_m` và `road_len_in_province_m` là **cùng một khái niệm, khác tên cột**.
 * Đổi tên ở bộ cũ sẽ dựng lại mọi con số đã công bố của Hà Nội, nên hai tên sống cạnh nhau
 * và `fieldAvailable` cho đúng một trong hai hiện lên tuỳ bộ dữ liệu đang mở.
 *
 * Dòng này biến mất khi bộ Hà Nội thành tỉnh 01 của store chung.
 */
const CHI_CO_O_BO_HA_NOI = new Set(["road_len_in_hanoi_m"]);

test("mọi trường của ô đều trỏ tới một cột CÓ THẬT", () => {
  const la = CELL_SPECS_COLUMNS.filter(
    (c) => !GRID_COLUMN_NAMES.includes(c as never) && !CHI_CO_O_BO_HA_NOI.has(c),
  );
  assert.deepEqual(la, [], `trường trỏ tới cột không có trong schema: ${la.join(", ")}`);
});

test("mọi cột tô màu được đều có trường, hoặc có lý do đã ghi", () => {
  const thieu = MAPPABLE_COLUMNS.filter(
    (c) => !CELL_SPECS_COLUMNS.includes(c) && !(c in CHUA_CO_TRUONG),
  );
  assert.deepEqual(
    thieu,
    [],
    `cột có dữ liệu nhưng vô hình trên giao diện: ${thieu.join(", ")}\n` +
      "Thêm một mục vào CELL_SPECS, hoặc khai vào CHUA_CO_TRUONG kèm lý do.",
  );
});

test("CHUA_CO_TRUONG không giữ cột đã có trường", () => {
  const thua = Object.keys(CHUA_CO_TRUONG).filter((c) => CELL_SPECS_COLUMNS.includes(c));
  assert.deepEqual(thua, [], `đã có trường rồi, bỏ khỏi CHUA_CO_TRUONG: ${thua.join(", ")}`);
});

test("CHUA_CO_TRUONG không giữ cột đã biến mất khỏi schema", () => {
  const ma = Object.keys(CHUA_CO_TRUONG).filter((c) => !GRID_COLUMN_NAMES.includes(c as never));
  assert.deepEqual(ma, [], `cột không còn trong schema: ${ma.join(", ")}`);
});

test("cột ĐỊNH DANH cố ý không có trường", () => {
  const identity = GRID_COLUMN_NAMES.filter((c) => GRID_COLUMNS[c].role !== "measure");
  const lot = identity.filter((c) => CELL_SPECS_COLUMNS.includes(c));
  assert.deepEqual(lot, [], `cột định danh không được tô màu: ${lot.join(", ")}`);
});

test("cột có nghĩa null riêng thì giao diện phải nói ra được", () => {
  // Không kiểm câu chữ — chỉ kiểm rằng thông tin ấy ĐẾN ĐƯỢC web, tức có mặt trong file sinh.
  assert.ok(GRID_COLUMNS["util_cell"].nullMeans);
  assert.ok(GRID_COLUMNS["screen_decision"].nullMeans);
  assert.ok(GRID_COLUMNS["dist_station_network_m"].nullMeans);
});

test("cực tính chỉ nhận ba giá trị", () => {
  for (const c of GRID_COLUMN_NAMES) {
    const p = GRID_COLUMNS[c].polarity;
    assert.ok(p === null || p === "high-bad" || p === "high-good", `${c}: ${p}`);
  }
});
