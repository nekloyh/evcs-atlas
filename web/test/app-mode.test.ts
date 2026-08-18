import { test } from "node:test";
import assert from "node:assert/strict";

Object.defineProperty(globalThis, "window", {
  value: {
    location: { hash: "" },
  },
  configurable: true,
});

const { useStore } = await import("../src/state/store.ts");
const { SCENES, sceneState } = await import("../src/story/scenes.ts");

test("primary modes loại trừ nhau và Story áp toàn bộ scene state", () => {
  useStore.setState({ field: "built_frac", dataMode: false, nationalMode: false, scene: null });
  useStore.getState().setAppNavMode("story");

  const first = SCENES[0];
  assert.ok(first);
  const expected = sceneState(first.id);
  const story = useStore.getState();
  assert.equal(story.scene, first.id);
  assert.equal(story.field, expected.field);
  assert.deepEqual(story.view, expected.view);
  assert.deepEqual([...story.layers], expected.layers);
  assert.equal(story.dataMode, false);
  assert.equal(story.nationalMode, false);

  story.setAppNavMode("national");
  const national = useStore.getState();
  assert.equal(national.nationalMode, true);
  assert.equal(national.dataMode, false);
  assert.equal(national.scene, null);

  national.setAppNavMode("data");
  const data = useStore.getState();
  assert.equal(data.dataMode, true);
  assert.equal(data.nationalMode, false);
  assert.equal(data.scene, null);

  data.setAppNavMode("map");
  const map = useStore.getState();
  assert.equal(map.dataMode, false);
  assert.equal(map.nationalMode, false);
  assert.equal(map.scene, null);
});

test("applyHash không tạo state lai giữa National và Data", () => {
  useStore.getState().applyHash({ nationalMode: true });
  assert.equal(useStore.getState().nationalMode, true);
  assert.equal(useStore.getState().dataMode, false);

  useStore.getState().applyHash({ dataMode: true });
  assert.equal(useStore.getState().nationalMode, false);
  assert.equal(useStore.getState().dataMode, true);
});
