import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Money,
  FxRate,
  Markup,
  Quote,
  Trade,
  RateBook,
  Portfolio,
  FxRateMismatchError,
  QuoteExpiredError,
} from "../src/index.js";

test("Markup constructors agree and validate", () => {
  assert.equal(Markup.bps(50).asBps(), 50);
  assert.equal(Markup.percent("0.5").asBps(), 50);
  assert.equal(Markup.ratio("0.005").asBps(), 50);
  assert.equal(Markup.bps(25).toString(), "25bps");
  assert.throws(() => Markup.bps(10000), RangeError); // f = 1 not allowed
  assert.throws(() => Markup.ratio("1"), RangeError);
  assert.throws(() => Markup.bps(-1), RangeError);
});

test("forSellAmount: forward pair, with margin", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543", { source: "JPM" });
  const q = Quote.forSellAmount(Money.of("1000.00", "AUD"), "USD", cost, { markup: Markup.bps(50) });
  // 1000 × 0.6543 = 654.30 cost; × 0.995 = 651.0285 → 651.03 client
  assert.equal(q.sell.toString(), "1000.00 AUD");
  assert.equal(q.buy.toString(), "651.03 USD");
  assert.equal(q.margin.toString(), "3.27 USD"); // 654.30 − 651.03
  assert.equal(q.fixed, "sell");
  assert.equal(q.provider, "JPM");
});

test("forSellAmount: zero markup matches the cost conversion", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forSellAmount(Money.of("1000.00", "AUD"), "USD", cost);
  assert.equal(q.buy.toString(), "654.30 USD");
  assert.equal(q.margin.toString(), "0.00 USD");
});

test("forBuyAmount: forward pair, margin booked in sell currency", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forBuyAmount(Money.of("1000.00", "USD"), "AUD", cost, { markup: Markup.bps(50) });
  // sell = 1000 / (0.6543 × 0.995) = 1536.027… → 1536.03
  // sellAtCost = 1000 / 0.6543 = 1528.3509… → 1528.35 ; margin = 7.68 AUD
  assert.equal(q.buy.toString(), "1000.00 USD");
  assert.equal(q.sell.toString(), "1536.03 AUD");
  assert.equal(q.margin.toString(), "7.68 AUD");
  assert.equal(q.fixed, "buy");
});

test("reverse pair (customer sells the quote currency)", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forSellAmount(Money.of("100.00", "USD"), "AUD", cost);
  // 100 / 0.6543 = 152.835… → 152.84 (matches FxRate reverse convert)
  assert.equal(q.buy.toString(), "152.84 AUD");
  assert.equal(q.margin.toString(), "0.00 AUD");
});

test("quote rejects a currency outside the cost-rate pair", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  assert.throws(() => Quote.forSellAmount(Money.of("100", "EUR"), "USD", cost), FxRateMismatchError);
});

const createdAt = new Date("2026-06-20T00:00:00Z");
const at = (secs: number) => new Date(createdAt.getTime() + secs * 1000);

test("expiry and accept → Trade", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543", { source: "JPM" });
  const q = Quote.forSellAmount(Money.of("1000.00", "AUD"), "USD", cost, {
    markup: Markup.bps(50),
    createdAt,
    ttl: "30s",
    id: "Q1",
  });
  assert.equal(q.isExpired(at(10)), false);
  assert.equal(q.isExpired(at(40)), true);

  const trade = q.accept({ executedAt: at(10), id: "T1" });
  assert.ok(trade instanceof Trade);
  assert.equal(trade.payIn.toString(), "1000.00 AUD");
  assert.equal(trade.payOut.toString(), "651.03 USD");
  assert.equal(trade.margin.toString(), "3.27 USD");
  assert.equal(trade.provider, "JPM");
  assert.equal(trade.quoteId, "Q1");
  assert.equal(trade.id, "T1");

  assert.throws(() => q.accept({ executedAt: at(40) }), QuoteExpiredError);
});

test("Trade.totalMargin aggregates revenue into a Portfolio", () => {
  const rate = FxRate.of("AUD", "USD", "0.6543");
  const t1 = Trade.of({ payIn: Money.of("1", "AUD"), payOut: Money.of("1", "USD"), margin: Money.of("3.32", "USD"), rate });
  const t2 = Trade.of({ payIn: Money.of("1", "AUD"), payOut: Money.of("1", "USD"), margin: Money.of("1.68", "USD"), rate });
  const t3 = Trade.of({ payIn: Money.of("1", "USD"), payOut: Money.of("1", "AUD"), margin: Money.of("2.00", "AUD"), rate });

  const revenue: Portfolio = Trade.totalMargin([t1, t2, t3]);
  assert.equal(revenue.balance("USD").toString(), "5.00 USD");
  assert.equal(revenue.balance("AUD").toString(), "2.00 AUD");
});

test("RateBook picks the best execution across providers", () => {
  const book = new RateBook([
    FxRate.of("AUD", "USD", "0.6543", { source: "JPM" }),
    FxRate.of("AUD", "USD", "0.6545", { source: "CurrencyCloud" }),
  ]);
  assert.deepEqual(book.providers(), ["CurrencyCloud", "JPM"]);
  assert.equal(book.ratesFor("USD", "AUD").length, 2);

  // Selling AUD → want the most USD per AUD → 0.6545 (CurrencyCloud).
  assert.equal(book.best("AUD", "USD").provider, "CurrencyCloud");
  // Selling USD → want the most AUD per USD → 1/rate largest → 0.6543 (JPM).
  assert.equal(book.best("USD", "AUD").provider, "JPM");

  const q = book.quoteSell(Money.of("1000.00", "AUD"), "USD", { markup: Markup.bps(50) });
  // 1000 × 0.6545 × 0.995 = 651.2275 → 651.23 USD ; margin 654.50 − 651.23 = 3.27
  assert.equal(q.buy.toString(), "651.23 USD");
  assert.equal(q.margin.toString(), "3.27 USD");
  assert.equal(q.provider, "CurrencyCloud");
});

test("RateBook throws when the pair is unavailable", () => {
  const book = new RateBook([FxRate.of("AUD", "USD", "0.6543")]);
  assert.throws(() => book.best("EUR", "JPY"), FxRateMismatchError);
});
