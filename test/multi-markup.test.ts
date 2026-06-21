import assert from "node:assert/strict";
import { test } from "node:test";
import { FxRate, Markup, MarkupSchedule, Money, Quote } from "../src/index.js";

test("Markup.sum adds fractions (stacked fees)", () => {
  assert.equal(Markup.sum(Markup.bps(30), Markup.bps(20)).asBps(), 50);
  assert.equal(Markup.sum().asBps(), 0); // empty → zero
  // 110% total is impossible
  assert.throws(() => Markup.sum(Markup.bps(6000), Markup.bps(5000)), RangeError);
});

test("Markup.compound multiplies retentions", () => {
  // 1 − 0.997×0.998 = 0.004994 → 49.94 bps
  assert.ok(Math.abs(Markup.compound(Markup.bps(30), Markup.bps(20)).asBps() - 49.94) < 1e-9);
});

test("a schedule tier can carry multiple markups (combined additively)", () => {
  const schedule = MarkupSchedule.of(
    "AUD",
    [
      { upTo: "10000", markup: [Markup.bps(30), Markup.bps(20)] }, // house + partner = 50 bps
      { markup: Markup.bps(20) },
    ],
    { mode: "flat" },
  );
  assert.equal(schedule.effectiveMarkup(Money.of("5000", "AUD")).asBps(), 50);

  const progressive = MarkupSchedule.of("AUD", [
    { upTo: "10000", markup: [Markup.bps(30), Markup.bps(20)] }, // 50 bps
    { markup: Markup.bps(20) },
  ]);
  // 20k: 10k@50 + 10k@20 = (50+20)/20000 = 35 bps
  assert.equal(progressive.effectiveMarkup(Money.of("20000", "AUD")).asBps(), 35);
});

test("Quote accepts multiple markups", () => {
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const q = Quote.forSellAmount(Money.of("1000.00", "AUD"), "USD", cost, {
    markup: [Markup.bps(30), Markup.bps(20)], // 50 bps total
  });
  assert.equal(q.buy.toString(), "651.03 USD");
  assert.equal(q.margin.toString(), "3.27 USD");
});

test("Markup.attribute splits margin across components, no money lost", () => {
  const shares = Markup.attribute(Money.of("5.00", "USD"), [Markup.bps(30), Markup.bps(20)]);
  assert.deepEqual(
    shares.map((m) => m.toString()),
    ["3.00 USD", "2.00 USD"],
  );

  // Attribute a real quote's margin back to house vs partner.
  const cost = FxRate.of("AUD", "USD", "0.6543");
  const house = Markup.bps(30);
  const partner = Markup.bps(20);
  const q = Quote.forSellAmount(Money.of("1000.00", "AUD"), "USD", cost, {
    markup: [house, partner],
  });
  const [houseCut, partnerCut] = Markup.attribute(q.margin, [house, partner]);
  assert.equal(houseCut!.add(partnerCut!).toString(), q.margin.toString()); // 3.27 USD
  assert.deepEqual([houseCut!.toString(), partnerCut!.toString()], ["1.96 USD", "1.31 USD"]);
});
