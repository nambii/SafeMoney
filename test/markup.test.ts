import assert from "node:assert/strict";
import { test } from "node:test";
import { Markup, Money } from "../src/index.js";

test("constructors carry exact bps and labels", () => {
  assert.equal(Markup.bps(25).asBps(), 25);
  assert.equal(Markup.bps(25).toString(), "25bps");
  assert.equal(Markup.bps("2.5").asBps(), 2.5);
  assert.equal(Markup.bps("2.5").toString(), "2.5bps");
  assert.equal(Markup.percent("1").asBps(), 100);
  assert.equal(Markup.percent("1").toString(), "1%");
  assert.equal(Markup.ratio("0.0025").asBps(), 25);
  assert.equal(Markup.ratio("0.0025").toString(), "0.0025");
  assert.equal(Markup.zero().asBps(), 0);
  assert.equal(Markup.zero().toString(), "0bps");
});

test("fromFraction reduces and normalizes sign", () => {
  assert.equal(Markup.fromFraction(50n, 10000n).asBps(), 50);
  assert.deepEqual(Markup.fromFraction(50n, 10000n).fraction(), { num: 1n, den: 200n });
  // negative/negative normalizes to positive
  assert.equal(Markup.fromFraction(-50n, -10000n).asBps(), 50);
  assert.equal(Markup.fromFraction(0n, 1n).asBps(), 0);
  assert.throws(() => Markup.fromFraction(1n, 0n), RangeError); // zero denominator
  assert.throws(() => Markup.fromFraction(3n, 2n), RangeError); // f >= 1
});

test("retention is exactly 1 - fraction", () => {
  assert.deepEqual(Markup.bps(50).retention(), { num: 9950n, den: 10000n });
  assert.deepEqual(Markup.zero().retention(), { num: 1n, den: 1n });
});

test("sum and compound produce exact fractions", () => {
  assert.deepEqual(Markup.sum(Markup.bps(30), Markup.bps(20)).fraction(), { num: 1n, den: 200n });
  // compound: 1 - (9970/10000)(9980/10000) = 499400/100000000 = 2497/500000
  assert.deepEqual(Markup.compound(Markup.bps(30), Markup.bps(20)).fraction(), {
    num: 2497n,
    den: 500000n,
  });
  assert.equal(Markup.compound().asBps(), 0);
});

test("attribute handles all-zero components", () => {
  const shares = Markup.attribute(Money.of("5.00", "USD"), [Markup.zero(), Markup.zero()]);
  assert.deepEqual(
    shares.map((m) => m.toString()),
    ["0.00 USD", "0.00 USD"],
  );
  assert.throws(() => Markup.attribute(Money.of("5.00", "USD"), []), RangeError);
});
