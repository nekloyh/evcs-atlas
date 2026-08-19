/**
 * Phase 4 — §6.3/§6.4 ở tầng STORE: một hành động đổi đúng thứ nó được phép đổi.
 *
 * Các test này gọi thẳng `useStore.getState()`, không dựng React: thứ đang kiểm là reducer,
 * và §2.4 nói rõ mọi quyết định về bộ lọc phải nằm trong reducer chứ không trong effect của
 * component. Nếu một ngày nào đó chúng phải mount component mới kiểm được, thì chính điều
 * đó đã là hồi quy.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { useStore } from "../src/state/store";
import { DEFAULT_DATASET_ID } from "../src/state/selection";
import type { AnalysisFilter } from "../src/state/filter";
import { parseEntitySelection } from "../src/state/selection";

const demandRange: AnalysisFilter = {
  version: 1,
  mode: "subset",
  datasetId: DEFAULT_DATASET_ID,
  entity: "h3-cell",
  field: "population",
  op: "between",
  lo: 0,
  hi: 500,
  missing: "exclude",
  source: "demand-population-histogram",
};

/** Đưa store về Lens Nhu cầu với đúng một bộ lọc dân số đang bật. */
function withDemandFilter() {
  const s = useStore.getState();
  s.enterScene(null);
  s.switchLens("demand");
  s.setField("population");
  s.setFilter(demandRange);
  const after = useStore.getState();
  assert.ok(after.filter.active, "tiền đề: bộ lọc phải đang bật");
  return after;
}

test("FilterReplace đổi ĐÚNG filter — không t, không selection, không view", () => {
  const s0 = useStore.getState();
  s0.enterScene(null);
  s0.switchLens("demand");
  s0.setField("population");
  s0.setT(42);
  s0.selectEntity(parseEntitySelection("station:ST-1"));
  const before = useStore.getState();
  const viewBefore = before.view;
  const selectionBefore = before.selection;

  before.setFilter(demandRange);
  const after = useStore.getState();

  assert.ok(after.filter.active, "bộ lọc đã bật");
  assert.equal(after.t, 42, "giờ scrubber KHÔNG đổi");
  assert.equal(after.selection, selectionBefore, "lựa chọn KHÔNG đổi");
  assert.equal(after.view, viewBefore, "camera KHÔNG đổi");
  assert.equal(after.field, before.field, "trường KHÔNG đổi");
});

test("đối tượng đang chọn SỐNG SÓT qua một bộ lọc loại nó (§6.3 mục 25)", () => {
  const s = useStore.getState();
  s.enterScene(null);
  s.switchLens("demand");
  s.setField("population");
  s.selectEntity(parseEntitySelection("8801f1d0d1fffff"));
  s.setFilter(demandRange);
  const after = useStore.getState();
  assert.equal(after.selection?.id, "8801f1d0d1fffff");
});

test("TimeCursorSet đổi ĐÚNG t — filter và selection đứng yên (§6.4 mục 30)", () => {
  const before = withDemandFilter();
  const filterBefore = before.filter;
  const selectionBefore = before.selection;

  before.setT(100);
  const after = useStore.getState();
  assert.equal(after.t, 100);
  assert.equal(after.filter, filterBefore, "filter giữ NGUYÊN tham chiếu");
  assert.equal(after.selection, selectionBefore);
});

test("đổi Lens sang hình học khác XOÁ bộ lọc đúng một lần, kèm lý do", () => {
  const before = withDemandFilter();
  const revBefore = before.filter.revision;

  before.switchLens("supply");
  const after = useStore.getState();
  assert.equal(after.filter.active, null, "bộ lọc Ô không sống sót sang Lens Trạm");
  assert.equal(after.filter.revision, revBefore + 1, "tăng ĐÚNG một lần");
  assert.equal(after.filter.clearedReason, "lens-incompatible", "phải nói được VÌ SAO");
});

test("đổi Lens KHÔNG đụng tới lựa chọn đang có (§6.4 mục 35)", () => {
  const s = useStore.getState();
  s.enterScene(null);
  s.switchLens("demand");
  s.selectEntity(parseEntitySelection("commune:00001"));
  s.switchLens("supply");
  assert.equal(useStore.getState().selection?.id, "00001");
});

test("quay lại Lens tương thích KHÔNG tự bật lại bộ lọc cũ", () => {
  withDemandFilter();
  useStore.getState().switchLens("supply");
  useStore.getState().switchLens("demand");
  assert.equal(useStore.getState().filter.active, null, "bộ lọc đã xoá là đã xoá");
});

test("vào CÂU CHUYỆN xoá bộ lọc mà KHÔNG đặt revision về 0", () => {
  const before = withDemandFilter();
  const revBefore = before.filter.revision;

  before.enterScene("von-cuc");
  const inScene = useStore.getState();
  assert.equal(inScene.filter.active, null, "cảnh không có bộ lọc (L3)");
  assert.ok(
    inScene.filter.revision > revBefore,
    "revision là số đếm TIẾN: đặt lại về 0 sẽ khiến memo khoá theo revision bỏ sót thay đổi",
  );

  useStore.getState().enterScene(null);
});

test("bộ lọc trùng nghĩa đặt lại lần hai là NO-OP ở tầng store (§6.3 mục 21)", () => {
  withDemandFilter();
  const first = useStore.getState().filter;
  useStore.getState().setFilter({ ...demandRange });
  const second = useStore.getState().filter;
  assert.equal(second, first, "cùng một object, revision không nhích");
});

test("clearFilter khi KHÔNG có bộ lọc là no-op, không nhích revision", () => {
  const s = useStore.getState();
  s.enterScene(null);
  s.switchLens("demand");
  s.clearFilter("user");
  const rev = useStore.getState().filter.revision;
  useStore.getState().clearFilter("user");
  assert.equal(useStore.getState().filter.revision, rev);
});
