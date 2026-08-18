/**
 * Test cho luật ĐIỂM NHÌN SỞ HỮU REPRESENTATION — §15a.
 *
 * Lỗi nó vá: nút `3D` trong bộ chọn representation gọi thẳng `setMode("3d")`, còn lớp
 * `extrusion` ép cứng `is3d = true` bất kể `mode`. Hai chỗ ấy cộng lại cho phép một trạng
 * thái không đọc được: **`mode === "2d"` mà bản đồ đang dựng khối hex trên camera pitch 0**.
 *
 * Nên phần lớn test dưới đây kiểm QUAN HỆ MỘT CHIỀU, không kiểm hàm: chọn cách đọc không
 * bao giờ đổi điểm nhìn, còn đổi điểm nhìn thì luôn kéo cách đọc về nhóm hợp lệ.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEMAND_REPRESENTATIONS,
  REPRESENTATION_VIEWPOINT,
  defaultRepresentationFor,
  representationFits,
  representationsFor,
  type DemandRepresentation,
  type Mode,
} from "../src/state/types.ts";
import {
  COMMUNE_PREFIX,
  FIELDS,
  FIELD_BY_ID,
  hasDemandRepresentations,
} from "../src/fields.ts";
// `store.ts` đọc `window.location.hash` ngay lúc nạp module (§9: hash là nguồn khởi tạo).
// Dựng một `window` tối thiểu TRƯỚC khi import, thay vì gỡ lời gọi ấy ra khỏi store — nó
// đúng ở runtime, chỉ là không có DOM ở đây.
(globalThis as unknown as { window: unknown }).window = {
  location: { hash: "" },
  addEventListener() {},
  removeEventListener() {},
  history: { replaceState() {} },
};
const { useStore } = await import("../src/state/store.ts");

const MODES: Mode[] = ["2d", "3d"];

test("mọi representation đều khai điểm nhìn, và khai ít nhất một", () => {
  for (const r of DEMAND_REPRESENTATIONS) {
    const vp = REPRESENTATION_VIEWPOINT[r];
    assert.ok(vp && vp.length > 0, `${r} không khai điểm nhìn nào`);
    for (const m of vp) assert.ok(MODES.includes(m), `${r} khai điểm nhìn lạ: ${m}`);
  }
});

test("mỗi điểm nhìn có ít nhất một cách đọc, và mặc định của nó thuộc chính nó", () => {
  for (const m of MODES) {
    const list = representationsFor(m);
    assert.ok(list.length > 0, `điểm nhìn ${m} không có cách đọc nào`);
    assert.ok(representationFits(defaultRepresentationFor(m), m));
  }
});

test("`extrusion` đã bị xoá — nó trùng hệt `hex` ở 3D và đi vòng cổng zoom", () => {
  assert.ok(!(DEMAND_REPRESENTATIONS as readonly string[]).includes("extrusion"));
  assert.ok(!("extrusion" in REPRESENTATION_VIEWPOINT));
});

test("chọn cách đọc KHÔNG bao giờ đổi điểm nhìn", () => {
  for (const m of MODES) {
    for (const r of DEMAND_REPRESENTATIONS) {
      useStore.getState().setMode(m);
      useStore.getState().setDemandRepresentation(r);
      assert.equal(useStore.getState().mode, m, `chọn ${r} đã kéo điểm nhìn khỏi ${m}`);
    }
  }
});

test("cách đọc lạc nhóm bị chốt về mặc định, không được nhận âm thầm", () => {
  // Chỉ 2D mới có cách đọc riêng, nên phép thử chạy theo chiều 3D → chọn một cách đọc 2D.
  const only2d = representationsFor("2d").filter((r) => !representationFits(r, "3d"));
  assert.ok(only2d.length > 0, "không có cách đọc nào riêng của 2D để thử");
  for (const r of only2d) {
    useStore.getState().setMode("3d");
    useStore.getState().setDemandRepresentation(r);
    const s = useStore.getState();
    assert.equal(s.mode, "3d", "chọn cách đọc lạc nhóm không được kéo điểm nhìn theo");
    assert.notEqual(s.demandRepresentation, r);
    assert.ok(representationFits(s.demandRepresentation, "3d"));
  }
});

test("đổi điểm nhìn kéo cách đọc theo — không sống sót một giá trị lạc nhóm", () => {
  for (const from of MODES) {
    for (const r of representationsFor(from)) {
      useStore.getState().setMode(from);
      useStore.getState().setDemandRepresentation(r);
      for (const to of MODES) {
        useStore.getState().setMode(to);
        const s = useStore.getState();
        assert.ok(
          representationFits(s.demandRepresentation, to),
          `${r} sống sót từ ${from} sang ${to} thành ${s.demandRepresentation}`,
        );
      }
    }
  }
});

test("đổi trường cũng phải tôn trọng điểm nhìn đang mở", () => {
  for (const m of MODES) {
    useStore.getState().setMode(m);
    useStore.getState().setField("population");
    const s = useStore.getState();
    assert.equal(s.mode, m);
    assert.ok(representationFits(s.demandRepresentation, m));
  }
});

test("cách đọc giữ nguyên khi nó VẪN hợp lệ ở điểm nhìn mới", () => {
  // `hex` thuộc cả hai nên nó phải sống qua một lượt lật đi lật lại — nếu không, nút 2D/3D
  // sẽ âm thầm vứt lựa chọn của người xem mỗi lần nghiêng bản đồ.
  const both = DEMAND_REPRESENTATIONS.filter(
    (r: DemandRepresentation) => MODES.every((m) => representationFits(r, m)),
  );
  assert.ok(both.length > 0, "không cách đọc nào sống ở cả hai điểm nhìn");
  for (const r of both) {
    useStore.getState().setMode("2d");
    useStore.getState().setDemandRepresentation(r);
    useStore.getState().setMode("3d");
    assert.equal(useStore.getState().demandRepresentation, r);
    useStore.getState().setMode("2d");
    assert.equal(useStore.getState().demandRepresentation, r);
  }
});

// ══ Trường nào CÓ bộ đọc P1 — một luật, ba nơi gọi ════════════════════════════

test("`hasDemandRepresentations` khớp đúng `population` của Ô, không khớp của XÃ", () => {
  const cellPop = FIELD_BY_ID.get("population")!;
  assert.equal(cellPop.readAs, "cell");
  assert.ok(hasDemandRepresentations(cellPop));

  // `commune:population` cùng tên nhưng đã gộp lên xã rồi; gộp tiếp thành mặt liên tục là
  // gộp một con số đã gộp. Nó cũng không khai `surface`.
  const communePop = FIELD_BY_ID.get(`${COMMUNE_PREFIX}population`);
  if (communePop) assert.ok(!hasDemandRepresentations(communePop));
});

test("không trường nào KHÁC lọt vào bộ đọc P1 — nếu lọt thì chú giải sẽ mô tả một mặt tô không tồn tại", () => {
  const yes = FIELDS.filter(hasDemandRepresentations);
  assert.deepEqual(yes.map((f) => f.id + "/" + f.readAs), ["population/cell"]);
  // Điều kiện `surface` không thừa: nó là thứ `ContourLayer` dựa vào, và nó được khai từng
  // trường một chứ không suy ra được từ kiểu dữ liệu.
  for (const f of yes) assert.ok(f.surface, `${f.id} phải khai surface`);
});
