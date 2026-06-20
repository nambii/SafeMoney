import { test } from "node:test";
import assert from "node:assert/strict";
import { Money, Portfolio, FxRate, FxBoard } from "../src/index.js";

test("sums same-currency balances and exposes them sorted", () => {
  const p = Portfolio.of(Money.of("100.00", "AUD"), Money.of("50.00", "USD")).add(
    Money.of("25.00", "AUD"),
  );
  assert.equal(p.balance("AUD").toString(), "125.00 AUD");
  assert.equal(p.balance("USD").toString(), "50.00 USD");
  assert.deepEqual(p.currencies(), ["AUD", "USD"]);
});

test("missing balance reads as zero", () => {
  const p = Portfolio.of(Money.of("100.00", "AUD"));
  assert.equal(p.balance("USD").toString(), "0.00 USD");
  assert.equal(p.has("USD"), false);
});

test("subtract, isZero and compact", () => {
  const p = Portfolio.of(Money.of("100.00", "AUD")).subtract(Money.of("100.00", "AUD"));
  assert.equal(p.balance("AUD").toString(), "0.00 AUD");
  assert.equal(p.isZero(), true);
  assert.equal(p.compact().isEmpty(), true);
});

test("immutability: operations return new portfolios", () => {
  const a = Portfolio.of(Money.of("100.00", "AUD"));
  const b = a.add(Money.of("1.00", "AUD"));
  assert.notEqual(a, b);
  assert.equal(a.balance("AUD").toString(), "100.00 AUD");
  assert.ok(Object.isFrozen(a));
});

test("valuate converts every balance to a base currency via the board", () => {
  const board = new FxBoard([FxRate.of("AUD", "USD", "0.6543")]);
  const p = Portfolio.of(Money.of("100.00", "AUD"), Money.of("50.00", "USD"));
  // 100 AUD -> 65.43 USD, plus 50.00 USD = 115.43 USD
  assert.equal(p.valuate("USD", board).toString(), "115.43 USD");
});

test("empty portfolio valuates to zero of the base", () => {
  const board = new FxBoard([FxRate.of("AUD", "USD", "0.6543")]);
  assert.equal(Portfolio.from().valuate("USD", board).toString(), "0.00 USD");
});

test("JSON round-trips", () => {
  const p = Portfolio.of(Money.of("100.00", "AUD"), Money.of("50.00", "USD"));
  const json = JSON.parse(JSON.stringify(p));
  assert.deepEqual(json, [
    { amount: "100.00", currency: "AUD" },
    { amount: "50.00", currency: "USD" },
  ]);
  const restored = Portfolio.fromJSON(json);
  assert.ok(restored.balance("AUD").equals(Money.of("100.00", "AUD")));
  assert.ok(restored.balance("USD").equals(Money.of("50.00", "USD")));
});
