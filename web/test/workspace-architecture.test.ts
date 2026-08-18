import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ReadColumn là composition layer, container mới sở hữu store và dữ liệu", () => {
  const column = source("../src/components/atlas/ReadColumn.tsx");
  const container = source("../src/components/atlas/AtlasReadColumn.tsx");
  assert.doesNotMatch(column, /useStore|Manifest|DockData|FieldMeta/);
  assert.match(column, /interface ReadColumnSlots/);
  for (const slot of ["search", "topMetrics", "lensSelector", "legend", "contextualChart", "overlayControls"]) {
    assert.match(column, new RegExp(`${slot}:`), slot);
  }
  assert.match(container, /useStore/);
  assert.match(container, /<ReadColumn/);
});

test("NavRail là controlled component và MapWorkspace giữ map là flex item trội", () => {
  const nav = source("../src/components/atlas/NavRail.tsx");
  const workspace = source("../src/components/atlas/Workspace.tsx");
  assert.doesNotMatch(nav, /from "\.\.\/\.\.\/state\/store"/);
  assert.match(nav, /overlayControls: React\.ReactNode/);
  assert.match(workspace, /<main className="relative min-w-0 flex-1"/);
});

test("MapView tự resize theo container của workspace", () => {
  const map = source("../src/map/MapView.tsx");
  assert.match(map, /new ResizeObserver\(\(\) => m\.resize\(\)\)/);
  assert.match(map, /observer\.observe\(el\)/);
});
