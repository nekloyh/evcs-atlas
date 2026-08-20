/**
 * CO-1 · CO-2 — hai lỗi tồn đọng phát hiện trong đợt hồi quy Phase 5 (20/8/2026).
 *
 * CO-1: mọi ký hiệu ĐANG CHỌN nằm ở cao độ 0 trong khi lớp dữ liệu đùn khối, nên khối của
 *       chính đối tượng được chọn nuốt luôn nét đánh dấu nó (đo được 87/626.735 pixel đổi
 *       giữa hai lượt render bật/tắt lựa chọn, tức không nét nào được vẽ).
 * CO-2: hash ghi `sc=g` trong lúc bản đồ vẽ BẬC, khi trường đang mở là `fixed-binned`.
 *
 * Đọc mã nguồn dạng văn bản, cùng lối với `subset-ownership.test.ts` và `plan-sync.test.ts`:
 * dựng `buildLayers` thật cần WebGL, mà thứ cần khoá lại ở đây là "có đúng một luật và mọi
 * hình học đều đi qua nó" chứ không phải pixel. Bằng chứng pixel nằm ở `docs/qa/`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { elevationFor, ELEVATION_FLOOR, MAX_ELEV_R8_M } from "../src/national/elevation.ts";
import { buildScale } from "../src/viz/palette.ts";
import { FIELD_BY_ID, scaleContractOf } from "../src/fields.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const code = (rel: string) =>
  readFileSync(`${SRC}${rel}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── CO-1 ────────────────────────────────────────────────────────────────────

test("CO-1 ký hiệu đang chọn khai tham số vẽ ở ĐÚNG MỘT chỗ", () => {
  const src = code("map/MapView.tsx");
  assert.match(src, /const SELECT_PARAMS_3D = \{/, "hằng dùng chung phải tồn tại");
  assert.match(src, /depthCompare:\s*"always"/, "deck.gl 9 tắt phép thử độ sâu bằng depthCompare");
  assert.match(src, /depthWriteEnabled:\s*false/, "nét chọn không được ghi bộ đệm độ sâu");

  // `depthTest` là từ vựng deck.gl 8. Nó không nổ, nó bị BỎ QUA — đúng kiểu hỏng im lặng.
  assert.doesNotMatch(src, /depthTest/, "`depthTest` của deck 8 không có tác dụng ở deck 9");
});

test("CO-1 cả năm hình học đều đi qua cùng một luật — không hình nào bị bỏ quên", () => {
  const src = code("map/MapView.tsx");
  // Bốn hình học trong `buildLayers` dùng biến dẫn xuất; POI sống trong `poiLayers` nên nó
  // đọc thẳng `is3d`. Cộng lại phải phủ hết SELECT_PASSES.
  const viaSelectParams = src.match(/\.\.\.selectParams,/g) ?? [];
  assert.equal(viaSelectParams.length, 4, "ô · xã · trạm · đường — đủ bốn, không thừa không thiếu");
  assert.match(src, /\.\.\.\(is3d \? \{ parameters: SELECT_PARAMS_3D \} : \{\}\),/, "POI dùng cùng hằng");
  assert.match(
    src,
    /const selectParams = mode === "3d" \? \{ parameters: SELECT_PARAMS_3D \} : \{\};/,
    "2D phải nhận đúng một object rỗng — không đổi một byte nào của hành vi đã QA",
  );
});

test("CO-1 nét chọn của Ô leo lên mặt trên khối, dùng CHUNG hàm cao độ với lớp giá trị", () => {
  const src = code("map/MapView.tsx");
  // Không có công thức riêng nào: cùng `elevationFor`, cùng trần, cùng `scale`.
  assert.match(src, /const z = row \? elevationFor\(row\.value, scale, MAX_ELEV_R8_M\) : 0;/);
  // `hexExtruded` phải là điều kiện DẪN XUẤT, không phải một phép thử chép lại.
  assert.match(src, /const hexExtruded =/);
  assert.match(src, /const row = hexExtruded \? analyticalCells\.find/,
    "ô ngoài tập lọc không có khối, nên nó phải ở cao độ 0");
  // Vòng phải đóng: PathLayer vẽ đường MỞ.
  assert.match(src, /if \(ring\.length > 0\) ring\.push\(ring\[0\]!\);/);
  // Lớp cũ không được sống lại — nó không nhận toạ độ có cao độ.
  assert.doesNotMatch(src, /id: `grid-selected-\$\{suffix\}`,\s*\n\s*data: \[\{ h3:/);
});

test("CO-1 cao độ nét chọn TRÙNG cao độ khối, theo cấu tạo", () => {
  const meta = FIELD_BY_ID.get("population")!;
  const values = [0, 10, 500, 5_000, 46_232];
  const scale = buildScale(meta.kind, values, meta.diverge, meta.categorical, {
    contract: scaleContractOf(meta),
  });
  // Cùng lời gọi mà `getElevation` của lớp giá trị dùng ⇒ cùng số, không có đường nào khác.
  for (const v of values) {
    const z = elevationFor(v, scale, MAX_ELEV_R8_M);
    assert.ok(Number.isFinite(z) && z >= 0);
    // Giá trị ĐO ĐƯỢC luôn có bệ: nét chọn không bao giờ tụt xuống 0 trong khi khối thì không.
    assert.ok(z >= ELEVATION_FLOOR * MAX_ELEV_R8_M - 1e-9, `v=${v} phải có bệ tối thiểu`);
  }
  // Ô không đo được: không khối, nên nét nằm ở mặt đất.
  assert.equal(elevationFor(null, scale, MAX_ELEV_R8_M), 0);
});

// ── CO-2 ────────────────────────────────────────────────────────────────────

test("CO-2 hash ghi chế độ thang THỰC SỰ vẽ, không phải chế độ được yêu cầu", () => {
  const src = code("App.tsx");
  assert.match(src, /scaleMode: effectiveScaleModeRef\.current,/,
    "bộ dựng HashState phải đọc chế độ đã chốt");
  assert.match(
    src,
    /effectiveScaleModeRef\.current =\s*\n?\s*scale && scale\.kind === "numeric" \? scale\.mode : requestedScaleMode;/,
    "chế độ đã chốt = `scale.mode` (kết quả của applyScaleMode), rơi về yêu cầu khi thang chưa dựng",
  );
  // Sở thích của người dùng KHÔNG được đặt lại — bấm Cầu→Cung→Cầu phải trả lại gradient.
  const store = code("state/store.ts");
  assert.doesNotMatch(store, /scaleMode: "binned"[\s\S]{0,80}field-incompatible/,
    "setField không được nuốt lựa chọn thang của người dùng");
});
