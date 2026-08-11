import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSelection, roadIdOf, serializeSelection } from "../src/data/h3.ts";
import { parseHash } from "../src/state/hash.ts";

test("road selection dùng OSM way id và round-trip qua hash", () => {
  const raw = "road:123456789";
  const selection = parseSelection(raw);
  assert.deepEqual(selection, { kind: "road", id: "123456789" });
  assert.equal(serializeSelection(selection!), raw);
  assert.equal(roadIdOf(raw), "123456789");
  assert.equal(parseHash(`#c=${raw}`).cell, raw);
});

test("road selection từ chối id rỗng, âm hoặc không phải số", () => {
  for (const raw of ["road:", "road:-1", "road:way-1", "road:1.5"]) assert.equal(parseSelection(raw), null, raw);
});
