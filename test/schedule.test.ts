import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Money,
  FxRate,
  Markup,
  MarkupSchedule,
  FxRateMismatchError,
} from "../src/index.js";

function schedule(mode?: "progressive" | "flat") {
  return MarkupSchedule.of(
    "AUD",
    [
      { upTo: "10000", markup: Markup.bps(50) }, // 0 – 10k @ 50bps
      { upTo: "50000", markup: Markup.bps(30) }, // 10k – 50k @ 30bps
      { markup: Markup.bps(20) }, // 50k+ @ 20bps (open)
    ],
    mode ? { mode } : {},
  );
}

test("progressive blends margins tax-bracket style", () => {
  // 70k: 10k@50 + 40k@30 + 20k@20 = (50+120+40)/70000 = 0.003 = 30 bps
  assert.equal(schedule().effectiveMarkup(Money.of("70000", "AUD")).asBps(), 30);
  // within the first tier → just that tier's margin
  assert.equal(schedule().effectiveMarkup(Money.of("5000", "AUD")).asBps(), 50);
  // 30k: 10k@50 + 20k@30 = (50+60)/30000 = 36.6667 bps
  assert.ok(Math.abs(schedule().effectiveMarkup(Money.of("30000", "AUD")).asBps() - 36.6667) < 0.001);
});

test("flat mode uses the single tier the amount falls into", () => {
  assert.equal(schedule("flat").effectiveMarkup(Money.of("70000", "AUD")).asBps(), 20);
  assert.equal(schedule("flat").effectiveMarkup(Money.of("30000", "AUD")).asBps(), 30);
  assert.equal(schedule("flat").effectiveMarkup(Money.of("5000", "AUD")).asBps(), 50);
  // exactly on a boundary belongs to that tier
  assert.equal(schedule("flat").effectiveMarkup(Money.of("10000", "AUD")).asBps(), 50);
});

test("price returns resultant rate, amount and margin", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543", { source: "JPM" });
  const priced = schedule().price(cost, Money.of("70000", "AUD"));
  // effective 30 bps → 70000 × 0.6543 × 0.997 = 45663.597 → 45663.60 USD
  assert.equal(priced.markup.asBps(), 30);
  assert.equal(priced.amount.toString(), "45663.60 USD");
  assert.equal(priced.margin.toString(), "137.40 USD"); // 45801.00 − 45663.60
  assert.equal(priced.rate.from.code, "AUD");
  assert.equal(priced.rate.to.code, "USD");
  assert.ok(priced.rate.rate.startsWith("0.65233"), priced.rate.rate);
});

test("resultant rate can be reused as an FxRate", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const rate = schedule().rateFor(cost, Money.of("70000", "AUD"));
  // re-converting a different amount at the locked client rate
  assert.equal(rate.convert(Money.of("100.00", "AUD")).code, "USD");
});

test("validates construction and inputs", () => {
  assert.throws(() => MarkupSchedule.of("AUD", []), RangeError);
  assert.throws(
    () =>
      MarkupSchedule.of("AUD", [
        { upTo: "50000", markup: Markup.bps(30) },
        { upTo: "10000", markup: Markup.bps(20) }, // not increasing
      ]),
    RangeError,
  );
  assert.throws(
    () =>
      MarkupSchedule.of("AUD", [
        { markup: Markup.bps(30) }, // open tier not last
        { upTo: "10000", markup: Markup.bps(20) },
      ]),
    RangeError,
  );
  // wrong-currency amount
  assert.throws(() => schedule().effectiveMarkup(Money.of("100", "USD")), FxRateMismatchError);
  // cost rate not involving base
  assert.throws(
    () => schedule().price(FxRate.of("EUR", "USD", "1.08"), Money.of("100", "AUD")),
    FxRateMismatchError,
  );
});
