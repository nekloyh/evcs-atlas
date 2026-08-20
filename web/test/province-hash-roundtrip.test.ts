import assert from "node:assert/strict";
import test from "node:test";

test("deep-link tỉnh khác Hà Nội sống qua serializeHash đầu tiên", async () => {
  Object.defineProperty(globalThis, "window", {
    value: { location: { hash: "#tinh=19" } },
    configurable: true,
  });
  const { serializeHash } = await import("../src/state/hash.ts");
  const out = serializeHash({
    field: "population", scaleMode: "binned", mode: "2d",
    view: { lng: 105.839, lat: 21.0, zoom: 9.3, pitch: 0, bearing: 0 },
    layers: [], cell: null, scene: null, paintOn: true, dataMode: false,
    nationalMode: false, t: 0, filter: null,
  });
  assert.match(out, /(?:^|&)tinh=19(?:&|$)/);
});
