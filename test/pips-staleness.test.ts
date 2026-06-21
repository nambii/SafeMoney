import assert from "node:assert/strict";
import { test } from "node:test";
import { FxRate, FxRateMismatchError, Money, StaleRateError, toMillis } from "../src/index.js";

test("pip size follows the JPY convention", () => {
  assert.equal(FxRate.of("AUD", "USD", "0.6543").pipExponent(), 4);
  assert.equal(FxRate.of("AUD", "USD", "0.6543").pipSize(), "0.0001");
  assert.equal(FxRate.of("USD", "JPY", "157.85").pipExponent(), 2);
  assert.equal(FxRate.of("USD", "JPY", "157.85").pipSize(), "0.01");
});

test("pipsTo measures signed pip distance", () => {
  const a = FxRate.of("AUD", "USD", "0.6543");
  const b = FxRate.of("AUD", "USD", "0.6553");
  assert.equal(a.pipsTo(b), 10);
  assert.equal(b.pipsTo(a), -10);
  assert.throws(() => a.pipsTo(FxRate.of("EUR", "USD", "1.08")), FxRateMismatchError);
});

test("addPips shifts the rate, fractional pips allowed", () => {
  const r = FxRate.of("AUD", "USD", "0.6543");
  assert.equal(r.addPips(10).rate, "0.6553");
  assert.equal(r.addPips(-3).rate, "0.6540");
  assert.equal(r.addPips("0.5").rate, "0.65435");
});

test("pipValue of a base notional, in the quote currency", () => {
  const r = FxRate.of("AUD", "USD", "0.6543");
  assert.equal(r.pipValue(Money.of("100000", "AUD")).toString(), "10.00 USD");
  assert.throws(() => r.pipValue(Money.of("100", "USD")), FxRateMismatchError);
});

const asOf = new Date("2026-06-20T00:00:00Z");
const at = (mins: number) => new Date(asOf.getTime() + mins * 60_000);

test("age / isStale / assertFresh", () => {
  const r = FxRate.of("AUD", "USD", "0.6543", { asOf });
  assert.equal(r.age(at(3)), 180_000);
  assert.equal(r.isStale("5m", at(3)), false);
  assert.equal(r.isStale("5m", at(10)), true);
  assert.doesNotThrow(() => r.assertFresh("5m", at(3)));
  assert.throws(() => r.assertFresh("5m", at(10)), StaleRateError);
});

test("convert enforces maxAge when requested", () => {
  const r = FxRate.of("AUD", "USD", "0.6543", { asOf });
  assert.equal(
    r.convert(Money.of("100.00", "AUD"), { maxAge: "5m", now: at(3) }).toString(),
    "65.43 USD",
  );
  assert.throws(
    () => r.convert(Money.of("100.00", "AUD"), { maxAge: "5m", now: at(10) }),
    StaleRateError,
  );
});

test("a rate without asOf is always stale under maxAge", () => {
  const r = FxRate.of("AUD", "USD", "0.6543");
  assert.equal(r.isStale("1d"), true);
  assert.throws(() => r.convert(Money.of("100.00", "AUD"), { maxAge: "5m" }), StaleRateError);
  // ...but converts fine when freshness is not requested.
  assert.doesNotThrow(() => r.convert(Money.of("100.00", "AUD")));
});

test("toMillis parses durations", () => {
  assert.equal(toMillis(1000), 1000);
  assert.equal(toMillis("500ms"), 500);
  assert.equal(toMillis("30s"), 30_000);
  assert.equal(toMillis("5m"), 300_000);
  assert.equal(toMillis("2h"), 7_200_000);
  assert.equal(toMillis("1d"), 86_400_000);
  assert.throws(() => toMillis("soon"), RangeError);
  assert.throws(() => toMillis(-1), RangeError);
});
