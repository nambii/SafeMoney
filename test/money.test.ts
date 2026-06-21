import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Money,
  RoundingMode,
  CurrencyMismatchError,
  RoundingNecessaryError,
  AllocationError,
} from "../src/index.js";

test("Money.of parses decimal strings exactly", () => {
  assert.equal(Money.of("12.34", "AUD").getAmount(), "12.34");
  assert.equal(Money.of("-0.005", "BHD").getAmount(), "-0.005");
  assert.equal(Money.of("1_000.50", "USD").getAmount(), "1000.50");
  assert.equal(Money.of(1000n, "JPY").getAmount(), "1000");
});

test("no floating point error on classic 0.1 + 0.2", () => {
  const sum = Money.of("0.1", "USD").add(Money.of("0.2", "USD"));
  assert.equal(sum.getAmount(), "0.3");
  assert.equal(sum.toMinor(), 30n);
});

test("number input routes through shortest round-trip string", () => {
  assert.equal(Money.of(12.34, "USD").getAmount(), "12.34");
  assert.throws(() => Money.of(Number.NaN, "USD"));
  assert.throws(() => Money.of(Infinity, "USD"));
});

test("ofMinor and toMinor round-trip minor units", () => {
  assert.equal(Money.ofMinor(1234, "USD").getAmount(), "12.34");
  assert.equal(Money.ofMinor(1234n, "JPY").getAmount(), "1234");
  assert.equal(Money.of("12.34", "USD").toMinor(), 1234n);
  assert.equal(Money.ofMinor("5", "BHD").getAmount(), "0.005");
});

test("toMinor rejects silent rounding but allows explicit mode", () => {
  const m = Money.of("12.349", "USD");
  assert.throws(() => m.toMinor(), RoundingNecessaryError);
  assert.equal(m.toMinor(RoundingMode.HALF_UP), 1235n);
  assert.equal(m.toMinor(RoundingMode.DOWN), 1234n);
});

test("add and subtract require matching currencies", () => {
  assert.throws(
    () => Money.of("1", "USD").add(Money.of("1", "EUR")),
    CurrencyMismatchError,
  );
});

test("multiply is exact and grows scale", () => {
  const taxed = Money.of("19.99", "USD").multiply("1.1");
  assert.equal(taxed.getAmount(), "21.989");
  assert.equal(taxed.round(RoundingMode.HALF_UP).getAmount(), "21.99");
});

test("divide rounds to currency minor units by default", () => {
  assert.equal(Money.of("10.00", "USD").divide(3, RoundingMode.HALF_EVEN).getAmount(), "3.33");
  assert.equal(Money.of("10.00", "USD").divide(3, RoundingMode.UP).getAmount(), "3.34");
  assert.equal(
    Money.of("10.00", "USD").divide(3, RoundingMode.HALF_EVEN, 6).getAmount(),
    "3.333333",
  );
});

test("divide by negative and by zero", () => {
  assert.equal(Money.of("10.00", "USD").divide(-4, RoundingMode.HALF_UP).getAmount(), "-2.50");
  assert.throws(() => Money.of("1", "USD").divide(0, RoundingMode.DOWN), RangeError);
});

test("negate and abs", () => {
  assert.equal(Money.of("12.34", "USD").negate().getAmount(), "-12.34");
  assert.equal(Money.of("-12.34", "USD").abs().getAmount(), "12.34");
});

test("comparison helpers", () => {
  const a = Money.of("10.00", "USD");
  const b = Money.of("10.000", "USD");
  const c = Money.of("12.00", "USD");
  assert.ok(a.equals(b)); // different scale, equal value
  assert.equal(a.compare(c), -1);
  assert.ok(c.greaterThan(a));
  assert.ok(a.lessThanOrEqual(b));
  assert.ok(a.min(c).equals(a));
  assert.ok(a.max(c).equals(c));
  assert.ok(Money.zero("USD").isZero());
  assert.ok(c.isPositive());
  assert.ok(c.negate().isNegative());
});

test("equals across currencies is false, compare throws", () => {
  assert.equal(Money.of("1", "USD").equals(Money.of("1", "EUR")), false);
  assert.throws(() => Money.of("1", "USD").compare(Money.of("1", "EUR")));
});

test("immutability: operations return new frozen instances", () => {
  const a = Money.of("10.00", "USD");
  const b = a.add(Money.of("1.00", "USD"));
  assert.notEqual(a, b);
  assert.equal(a.getAmount(), "10.00");
  assert.ok(Object.isFrozen(a));
});

test("JSON round-trips losslessly", () => {
  const a = Money.of("12.30", "USD");
  const json = JSON.parse(JSON.stringify(a));
  assert.deepEqual(json, { amount: "12.30", currency: "USD" });
  assert.ok(Money.fromJSON(json).equals(a));
});

test("toString is unambiguous and non-localized", () => {
  assert.equal(Money.of("12.34", "AUD").toString(), "12.34 AUD");
});

test("allocate distributes every minor unit (no money lost)", () => {
  const parts = Money.of("0.05", "USD").allocate([1, 1, 1]);
  assert.deepEqual(parts.map((p) => p.getAmount()), ["0.02", "0.02", "0.01"]);
  const total = parts.reduce((sum, p) => sum.add(p), Money.zero("USD"));
  assert.ok(total.equals(Money.of("0.05", "USD")));
});

test("allocate respects weights and fractional weights", () => {
  const rent = Money.of("100.00", "USD").allocate([70, 30]);
  assert.deepEqual(rent.map((p) => p.getAmount()), ["70.00", "30.00"]);
  const odd = Money.of("100.00", "USD").allocate([1, 1, 1]);
  assert.deepEqual(odd.map((p) => p.getAmount()), ["33.34", "33.33", "33.33"]);
});

test("allocate handles negative totals symmetrically", () => {
  const parts = Money.of("-0.05", "USD").allocate([1, 1, 1]);
  const total = parts.reduce((sum, p) => sum.add(p), Money.zero("USD"));
  assert.ok(total.equals(Money.of("-0.05", "USD")));
});

test("allocate validates weights", () => {
  assert.throws(() => Money.of("1", "USD").allocate([]), AllocationError);
  assert.throws(() => Money.of("1", "USD").allocate([0, 0]), AllocationError);
  assert.throws(() => Money.of("1", "USD").allocate([-1, 2]), AllocationError);
});

test("split into equal parts", () => {
  const parts = Money.of("10.00", "USD").split(3);
  assert.deepEqual(parts.map((p) => p.getAmount()), ["3.34", "3.33", "3.33"]);
  assert.throws(() => Money.of("1", "USD").split(0), AllocationError);
});

test("exact option rejects over-precise amounts", () => {
  assert.throws(() => Money.of("12.345", "USD", { exact: true }), RoundingNecessaryError);
  assert.doesNotThrow(() => Money.of("12.34", "USD", { exact: true }));
});
