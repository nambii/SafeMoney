import assert from "node:assert/strict";
import { test } from "node:test";
import { divideRound, isRoundingMode, RoundingMode } from "../src/rounding.js";

// 2.5 -> rounded to integer, exercising each tie rule.
test("HALF rules at the exact midpoint", () => {
  assert.equal(divideRound(25n, 10n, RoundingMode.HALF_UP), 3n);
  assert.equal(divideRound(25n, 10n, RoundingMode.HALF_DOWN), 2n);
  assert.equal(divideRound(25n, 10n, RoundingMode.HALF_EVEN), 2n);
  assert.equal(divideRound(35n, 10n, RoundingMode.HALF_EVEN), 4n);
});

test("directional rules", () => {
  assert.equal(divideRound(23n, 10n, RoundingMode.DOWN), 2n);
  assert.equal(divideRound(23n, 10n, RoundingMode.UP), 3n);
  assert.equal(divideRound(23n, 10n, RoundingMode.CEIL), 3n);
  assert.equal(divideRound(23n, 10n, RoundingMode.FLOOR), 2n);
});

test("directional rules with negatives", () => {
  assert.equal(divideRound(-23n, 10n, RoundingMode.DOWN), -2n); // toward zero
  assert.equal(divideRound(-23n, 10n, RoundingMode.UP), -3n); // away from zero
  assert.equal(divideRound(-23n, 10n, RoundingMode.CEIL), -2n); // toward +inf
  assert.equal(divideRound(-23n, 10n, RoundingMode.FLOOR), -3n); // toward -inf
  assert.equal(divideRound(-25n, 10n, RoundingMode.HALF_UP), -3n);
  assert.equal(divideRound(-25n, 10n, RoundingMode.HALF_EVEN), -2n);
});

test("exact division needs no rounding", () => {
  assert.equal(divideRound(20n, 10n, RoundingMode.UNNECESSARY), 2n);
  assert.throws(() => divideRound(21n, 10n, RoundingMode.UNNECESSARY));
});

test("denominator must be positive", () => {
  assert.throws(() => divideRound(1n, 0n, RoundingMode.DOWN), RangeError);
  assert.throws(() => divideRound(1n, -10n, RoundingMode.DOWN), RangeError);
});

test("isRoundingMode type guard", () => {
  assert.ok(isRoundingMode("HALF_EVEN"));
  assert.equal(isRoundingMode("NOPE"), false);
  assert.equal(isRoundingMode(123), false);
});
