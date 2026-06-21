import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FxQuote,
  FxRate,
  formatMoney,
  getCurrency,
  InvalidAmountError,
  isCurrencyRegistered,
  Markup,
  Money,
  normalizeLocaleNumber,
  Quote,
  RoundingMode,
  registerCurrency,
} from "../src/index.js";

// --- format.ts: locale parsing rejects garbage instead of corrupting money ---

test("normalizeLocaleNumber rejects scientific notation and embedded garbage", () => {
  assert.throws(() => normalizeLocaleNumber("1e3", "en-US"), InvalidAmountError);
  assert.throws(() => normalizeLocaleNumber("1a2b3", "en-US"), InvalidAmountError);
  assert.throws(() => normalizeLocaleNumber("1.2.3", "en-US"), InvalidAmountError);
});

test("normalizeLocaleNumber still parses legitimate localized amounts", () => {
  assert.equal(normalizeLocaleNumber("$1,234.56", "en-US"), "1234.56");
  assert.equal(normalizeLocaleNumber("5 USD", "en-US"), "5");
  assert.equal(normalizeLocaleNumber("1.234,56", "de-DE"), "1234.56");
  assert.equal(normalizeLocaleNumber("(1.50)", "en-US"), "-1.50"); // accounting negative
});

// --- format.ts: formatMoney clamps min<=max fraction digits ---

test("formatMoney honours maximumFractionDigits below the minor unit", () => {
  assert.equal(
    formatMoney(Money.of("1234.5", "USD"), { locale: "en-US", maximumFractionDigits: 0 }),
    "$1,235",
  );
});

// --- money.ts: internal Scaled is frozen ---

test("the internal Scaled value is frozen", () => {
  const s = Money.of("1.00", "USD").unsafeScaled();
  assert.equal(Object.isFrozen(s), true);
  assert.throws(() => {
    (s as { units: bigint }).units = 999n;
  }, TypeError);
});

// --- money.ts: divide/round reject negative decimals with a clear error ---

test("divide and round reject negative decimals", () => {
  assert.throws(() => Money.of("1234", "USD").divide(1, RoundingMode.HALF_UP, -2), /non-negative/);
  assert.throws(() => Money.of("1234", "USD").round(RoundingMode.HALF_UP, -1), /non-negative/);
});

// --- decimal.ts: pathological exponent is rejected (DoS guard) ---

test("an out-of-range exponent is rejected rather than allocating", () => {
  assert.throws(() => Money.of("1e1000000000", "USD"), InvalidAmountError);
});

// --- currencies.ts: case-insensitive lookup + built-in override guard ---

test("currency lookups are case-insensitive", () => {
  assert.equal(getCurrency("usd").code, "USD");
  assert.equal(isCurrencyRegistered("jpy"), true);
  assert.equal(Money.of("1.00", "usd").code, "USD");
});

test("registerCurrency refuses to override a built-in without override flag", () => {
  assert.throws(() => registerCurrency({ code: "JPY", decimals: 5, name: "x" }), /override/);
  // Custom codes register fine and normalize to uppercase.
  const btc = registerCurrency({ code: "tbtc", decimals: 8, name: "Test Bitcoin" });
  assert.equal(btc.code, "TBTC");
  assert.equal(getCurrency("TBTC").decimals, 8);
});

// --- quote.ts: degenerate zero-leg quotes are rejected ---

test("a quote whose leg rounds to zero is rejected", () => {
  const cost = FxRate.of("AUD", "USD", "1000000");
  assert.throws(() => Quote.forBuyAmount(Money.of("0.01", "USD"), "AUD", cost), RangeError);
});

// --- quote.ts: forBuyAmount reverse-pair pricing (previously untested path) ---

test("forBuyAmount prices the reverse pair (sell currency = rate quote currency)", () => {
  // Cost rate AUD/USD; customer buys AUD, pays in USD → reverse direction.
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forBuyAmount(Money.of("100.00", "AUD"), "USD", cost);
  assert.equal(q.buy.toString(), "100.00 AUD");
  // No markup: sell = 100 AUD × 0.6543 = 65.43 USD, margin 0.
  assert.equal(q.sell.toString(), "65.43 USD");
  assert.ok(q.margin.isZero());
});

test("forBuyAmount reverse pair with markup books non-negative margin in sell currency", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forBuyAmount(Money.of("100.00", "AUD"), "USD", cost, { markup: Markup.bps(50) });
  assert.equal(q.sell.code, "USD");
  assert.equal(q.margin.code, "USD");
  assert.ok(!q.margin.isNegative());
});

// --- quote/fx: expiry & staleness exact-boundary behaviour ---

test("isExpired is false exactly at the expiry instant, true one ms later", () => {
  const created = new Date("2026-01-01T00:00:00.000Z");
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forSellAmount(Money.of("100.00", "AUD"), "USD", cost, {
    createdAt: created,
    ttl: "30s",
  });
  const expiresAt = new Date(created.getTime() + 30_000);
  assert.equal(q.isExpired(expiresAt), false); // now === expiresAt: not yet expired
  assert.equal(q.isExpired(new Date(expiresAt.getTime() + 1)), true);
});

test("isStale is false exactly at the max age, true one ms past", () => {
  const asOf = new Date("2026-01-01T00:00:00.000Z");
  const rate = FxRate.of("AUD", "USD", "0.6543", { asOf });
  assert.equal(rate.isStale("1s", new Date(asOf.getTime() + 1000)), false); // age === maxAge
  assert.equal(rate.isStale("1s", new Date(asOf.getTime() + 1001)), true);
});

// --- FxQuote: zero-spread (locked market), JPY pips, raw spread() ---

test("FxQuote allows a zero spread (bid == ask)", () => {
  const q = FxQuote.of("EUR", "USD", "1.1000", "1.1000");
  assert.equal(q.spread(), "0");
  assert.equal(q.spreadPips(), 0);
  assert.equal(q.spreadBps(), 0);
});

test("FxQuote.fromMid pips on a JPY-quoted pair uses 2-dp pips", () => {
  const mid = FxRate.of("USD", "JPY", "157.00");
  const q = FxQuote.fromMid(mid, { pips: 4 }); // 4 pips × 0.01 = 0.04 total
  assert.equal(q.bid, "156.98");
  assert.equal(q.ask, "157.02");
  assert.equal(q.spread(), "0.04");
  assert.ok(Math.abs(q.spreadPips() - 4) < 1e-9);
});
