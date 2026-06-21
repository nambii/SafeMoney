import assert from "node:assert/strict";
import { test } from "node:test";
import { FxQuote, FxRate, FxRateMismatchError, Money, MoneyError } from "../src/index.js";

test("of builds a two-way price and exposes both sides", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001", { source: "JPM" });
  assert.equal(q.bid, "1.0999");
  assert.equal(q.ask, "1.1001");
  assert.equal(q.provider, "JPM");
  assert.equal(q.toString(), "EUR/USD 1.0999/1.1001");
});

test("fromMid widens a mid symmetrically by pips", () => {
  const mid = FxRate.of("EUR", "USD", "1.1000");
  const q = FxQuote.fromMid(mid, { pips: 2 });
  assert.equal(q.bid, "1.0999");
  assert.equal(q.ask, "1.1001");
  assert.equal(q.spreadPips(), 2);
  assert.equal(q.mid().rate, "1.1"); // (bid+ask)/2, exact
});

test("fromMid widens by bps relative to the mid", () => {
  const mid = FxRate.of("EUR", "USD", "1.0000");
  const q = FxQuote.fromMid(mid, { bps: 20 }); // 20 bps total → ±10 bps
  assert.equal(q.bid, "0.999");
  assert.equal(q.ask, "1.001");
  assert.ok(Math.abs(q.spreadBps() - 20) < 1e-9);
});

test("fromMid widens by an absolute amount and carries metadata", () => {
  const mid = FxRate.of("USD", "JPY", "157.00", { source: "ECB" });
  const q = FxQuote.fromMid(mid, { absolute: "0.10" });
  assert.equal(q.bid, "156.95");
  assert.equal(q.ask, "157.05");
  assert.equal(q.provider, "ECB");
  // JPY-quoted: pip is 0.01, so a 0.10 spread is 10 pips.
  assert.ok(Math.abs(q.spreadPips() - 10) < 1e-9);
});

test("convert sells the base at the bid", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001");
  // 100 EUR → 100 × 1.0999 = 109.99 USD
  assert.equal(q.convert(Money.of("100.00", "EUR")).toString(), "109.99 USD");
});

test("convert buys the base at the ask", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001");
  // 110 USD → 110 / 1.1001 = 99.99 EUR (dealer pays the ask)
  assert.equal(q.convert(Money.of("110.00", "USD")).toString(), "99.99 EUR");
});

test("the dealer earns the spread on a round trip", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001");
  const startEur = Money.of("100.00", "EUR");
  const usd = q.convert(startEur); // sell EUR at bid
  const backEur = q.convert(usd); // buy EUR at ask
  // Round-tripping must lose money for the customer (never gain).
  assert.ok(backEur.lessThanOrEqual(startEur));
});

test("convertWithDetails reports the side used", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001");
  const sell = q.convertWithDetails(Money.of("100.00", "EUR"));
  assert.equal(sell.side, "bid");
  assert.equal(sell.direction, "forward");
  const buy = q.convertWithDetails(Money.of("110.00", "USD"));
  assert.equal(buy.side, "ask");
  assert.equal(buy.direction, "reverse");
});

test("bidRate and askRate are one-way FxRates tagged with their side", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001");
  assert.equal(q.bidRate().rate, "1.0999");
  assert.equal(q.bidRate().metadata.side, "bid");
  assert.equal(q.askRate().metadata.side, "ask");
});

test("convert rejects a currency outside the pair", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001");
  assert.throws(() => q.convert(Money.of("100.00", "GBP")), FxRateMismatchError);
});

test("rejects a crossed or non-positive market", () => {
  assert.throws(() => FxQuote.of("EUR", "USD", "1.1001", "1.0999"), MoneyError); // bid > ask
  assert.throws(() => FxQuote.of("EUR", "USD", "0", "1.1001"), MoneyError); // bid <= 0
});

test("toJSON is round-trippable through of()", () => {
  const q = FxQuote.of("EUR", "USD", "1.0999", "1.1001", { source: "JPM" });
  const json = q.toJSON();
  assert.deepEqual(json, {
    from: "EUR",
    to: "USD",
    bid: "1.0999",
    ask: "1.1001",
    mid: "1.1",
    provider: "JPM",
  });
  const round = FxQuote.of(json.from, json.to, json.bid, json.ask);
  assert.equal(round.bid, q.bid);
  assert.equal(round.ask, q.ask);
});
