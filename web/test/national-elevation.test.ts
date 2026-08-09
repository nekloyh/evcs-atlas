/**
 * Chiều cao khối của chế độ 3D ở bậc TOÀN QUỐC (§12).
 *
 * Mọi phép kiểm ở đây đều nhắm vào một dạng hỏng **không nổ**: một chiều cao sai vẫn render
 * ra một bản đồ đẹp, và không có gì trên màn hình nói rằng nó sai. Bốn dạng đó là:
 *
 *   · ô không đo được nhô lên  ⇒ "chưa ai đo" đọc thành một giá trị
 *   · bậc thấp nhất cao 0 m    ⇒ nó trông y hệt ô không đo được
 *   · chiều cao không đơn điệu ⇒ mắt đọc "cao hơn = lớn hơn" và đọc sai
 *   · một tham số thứ hai lọt vào ⇒ hai ô cùng giá trị cao khác nhau
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_ELEV_M, can3D, elevationFor, maxElevFor } from "../src/national/elevation";
import { buildScale, classCount, classOf, computeClassing } from "../src/viz/palette";

/** Một thang thật, dựng từ số liệu chứ không bịa `breaks` bằng tay. */
const VALUES = [0, 0, 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
const SCALE = computeClassing(VALUES);

test("ô KHÔNG ĐO ĐƯỢC nằm phẳng — null, undefined và NaN đều là 0 m", () => {
  assert.equal(elevationFor(null, SCALE), 0);
  assert.equal(elevationFor(undefined, SCALE), 0);
  assert.equal(elevationFor(NaN, SCALE), 0);
});

test("chưa có thang (dữ liệu chưa về) ⇒ 0, không đoán", () => {
  assert.equal(elevationFor(100, null), 0);
});

test("bậc THẤP NHẤT vẫn nhô lên — sàn của quyết định 4", () => {
  // Đây là phép kiểm quan trọng nhất của file: nếu bậc 1 cao 0 m thì nó không phân biệt
  // được với ô không đo được, và cả hai kênh (màu vân + cao 0) cùng nói sai một câu.
  const thap = Math.min(...VALUES.filter((v) => v > 0));
  assert.ok(elevationFor(0, SCALE) > 0, "bậc {0} phải nhô");
  assert.ok(elevationFor(thap, SCALE) > 0, "giá trị nhỏ nhất > 0 phải nhô");
  assert.equal(elevationFor(0, SCALE), MAX_ELEV_M / classCount(SCALE));
});

test("đơn điệu KHÔNG GIẢM theo bậc, và bị chặn trên bởi MAX_ELEV_M", () => {
  const sorted = [...VALUES].sort((a, b) => a - b);
  let prev = -1;
  for (const v of sorted) {
    const e = elevationFor(v, SCALE);
    assert.ok(e >= prev, `${v}: ${e} < ${prev}`);
    assert.ok(e <= MAX_ELEV_M, `${v}: ${e} > MAX_ELEV_M`);
    prev = e;
  }
  assert.equal(elevationFor(Math.max(...VALUES), SCALE), MAX_ELEV_M);
});

test("chiều cao đọc từ BẬC, không từ giá trị thô — hai ô cùng bậc cao bằng nhau", () => {
  // Mấu chốt của quyết định 3. Bậc cuối là một khoảng MỞ: 610 và 987 chung một bậc, nên
  // chúng phải chung một chiều cao. Nếu lấy giá trị thô thì 987 vọt lên trong khi vẫn mang
  // đúng màu của 610 — bản đồ có hai thang mà legend chỉ in một.
  assert.equal(classOf(610, SCALE), classOf(987, SCALE));
  assert.equal(elevationFor(610, SCALE), elevationFor(987, SCALE));
  // và một giá trị NGOÀI dải dữ liệu cũng không vượt trần
  assert.equal(elevationFor(1e9, SCALE), MAX_ELEV_M);
});

test("cùng giá trị + cùng thang ⇒ cùng chiều cao, không tham số thứ hai nào lọt vào", () => {
  for (const v of VALUES) assert.equal(elevationFor(v, SCALE), elevationFor(v, SCALE));
  // Cực tính KHÔNG phải tham số: `elevationFor` chỉ nhận hai thứ, nên không có đường nào
  // để một trường `high-good` cho ra một chiều cao khác với `high-bad` cùng giá trị.
  assert.equal(elevationFor.length, 2);
});

test("thang BOOL và HẠNG MỤC cũng dựng được — hai bậc, cả hai đều nhô", () => {
  const b = buildScale("bool", [true, false, true, null]);
  assert.equal(elevationFor(false, b), MAX_ELEV_M / 2);
  assert.equal(elevationFor(true, b), MAX_ELEV_M);
  assert.equal(elevationFor(null, b), 0);
});

test("thang RỖNG (không giá trị nào) ⇒ mọi ô phẳng, không chia cho 0", () => {
  const trong = computeClassing([null, null]);
  assert.equal(classCount(trong), 0);
  assert.equal(elevationFor(5, trong), 0);
  assert.ok(Number.isFinite(elevationFor(5, trong)));
});

test("can3D: chỉ Ô GỘP, không bao giờ 34 khối tỉnh", () => {
  assert.equal(can3D("cell"), true);
  assert.equal(can3D("province"), false);
});

test("trần chiều cao CO theo bậc lưới — giữ tỉ lệ nhìn thấy qua cú nhảy LOD", () => {
  // Mỗi bậc H3 chia ô thành 7 phần ⇒ bề ngang co √7. Trần phải co đúng bằng chừng đó,
  // nếu không thì phóng vào là biến bản đồ thành rừng cột mà không ai đổi hằng số nào.
  assert.equal(maxElevFor(6), MAX_ELEV_M);
  assert.ok(Math.abs(maxElevFor(7) - MAX_ELEV_M / Math.sqrt(7)) < 1e-9);
  assert.ok(maxElevFor(7) < maxElevFor(6));
  assert.ok(maxElevFor(8) < maxElevFor(7));
  // …và bậc thô hơn thì cao hơn, cùng một luật, không phải một nhánh riêng
  assert.ok(maxElevFor(5) > maxElevFor(6));
});

test("`max` chỉ đổi ĐƠN VỊ, không đổi thứ tự — và không lọt vào chữ ký như một tham số thật", () => {
  const a = VALUES.map((v) => elevationFor(v, SCALE, maxElevFor(7)));
  const b = VALUES.map((v) => elevationFor(v, SCALE, maxElevFor(6)));
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length; j++) {
      assert.equal(a[i]! <= a[j]!, b[i]! <= b[j]!, `thứ tự đổi ở ${VALUES[i]} vs ${VALUES[j]}`);
    }
  }
  assert.equal(elevationFor(null, SCALE, maxElevFor(7)), 0);
  assert.equal(elevationFor.length, 2, "max phải có mặc định — không phải tham số bắt buộc");
});
