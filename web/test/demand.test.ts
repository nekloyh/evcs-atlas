import assert from "node:assert/strict";
import test from "node:test";

import { tertileBreaks, tertileClass } from "../src/viz/demand.ts";

test("P1 bivariate uses stable ordered tertiles", () => {
  const cuts = tertileBreaks([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(cuts, [2, 5]);
  assert.equal(tertileClass(0, cuts), 0);
  assert.equal(tertileClass(3, cuts), 1);
  assert.equal(tertileClass(8, cuts), 2);
});

test("P1 bivariate handles an all-zero supply field without inventing a positive class", () => {
  const cuts = tertileBreaks([0, 0, 0]);
  assert.deepEqual(cuts, [0, 0]);
  assert.equal(tertileClass(0, cuts), 0);
});
