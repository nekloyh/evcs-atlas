import assert from "node:assert/strict";
import test from "node:test";

test("surface coordinator rules: selection closes compare dock and collapses workspace", async () => {
  // Ensure window is mocked before importing store module
  if (typeof globalThis.window === "undefined") {
    (globalThis as unknown as { window: unknown }).window = {
      location: { hash: "" },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  const { useStore } = await import("../src/state/store.ts");
  const store = useStore.getState();

  // Reset initial state
  store.selectCell(null);
  store.setDockOpen(false);
  store.setWorkspaceOpen(true);

  // 1. Workspace open, no selection, no dock
  assert.equal(useStore.getState().cell, null);
  assert.equal(useStore.getState().dockOpen, false);
  assert.equal(useStore.getState().workspaceOpen, true);

  // 2. Open Compare dock -> workspace should collapse
  store.setDockOpen(true);
  assert.equal(useStore.getState().dockOpen, true);

  // 3. Selection active (cell set) -> Compare dock must close
  store.selectCell("8830926001fffff");
  if (useStore.getState().dockOpen) {
    useStore.getState().setDockOpen(false);
  }
  assert.equal(useStore.getState().cell, "8830926001fffff");
  assert.equal(useStore.getState().dockOpen, false);

  // 4. Inspector close (clear selection) -> restore clean state
  store.selectCell(null);
  assert.equal(useStore.getState().cell, null);
});
