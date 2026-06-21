import assert from "node:assert/strict";
import { test } from "node:test";
import { FxBoard, FxRate, FxRateMismatchError, Money, RoundingMode } from "../src/index.js";

test("convert applies a directed rate and rounds to target minor units", () => {
  const rate = FxRate.of("AUD", "USD", "0.6543", { source: "ECB" });
  const out = rate.convert(Money.of("100.00", "AUD"));
  assert.equal(out.code, "USD");
  assert.equal(out.getAmount(), "65.43");
});

test("convert rounds with chosen mode", () => {
  const rate = FxRate.of("AUD", "USD", "0.66666");
  assert.equal(
    rate.convert(Money.of("10.00", "AUD"), { mode: RoundingMode.DOWN }).getAmount(),
    "6.66",
  );
  assert.equal(
    rate.convert(Money.of("10.00", "AUD"), { mode: RoundingMode.UP }).getAmount(),
    "6.67",
  );
});

test("convert into a 0-dp currency (JPY) uses banker's rounding by default", () => {
  const rate = FxRate.of("USD", "JPY", "157.85");
  // 10.00 * 157.85 = 1578.5 → HALF_EVEN rounds to the even neighbour, 1578.
  assert.equal(rate.convert(Money.of("10.00", "USD")).getAmount(), "1578");
  assert.equal(
    rate.convert(Money.of("10.00", "USD"), { mode: RoundingMode.HALF_UP }).getAmount(),
    "1579",
  );
});

test("convert is bidirectional within the pair", () => {
  const rate = FxRate.of("AUD", "USD", "0.6543");
  // forward: AUD -> USD
  assert.equal(rate.convert(Money.of("100.00", "AUD")).toString(), "65.43 USD");
  // reverse: USD -> AUD using the exact inverse (100 / 0.6543 = 152.835...)
  assert.equal(rate.convert(Money.of("100.00", "USD")).toString(), "152.84 AUD");
});

test("reverse conversion agrees with inverse().convert()", () => {
  const rate = FxRate.of("AUD", "USD", "0.6543");
  const viaReverse = rate.convert(Money.of("250.00", "USD"));
  const viaInverse = rate.inverse().convert(Money.of("250.00", "USD"));
  assert.ok(viaReverse.equals(viaInverse), `${viaReverse} vs ${viaInverse}`);
});

test("convert rejects any currency outside the pair", () => {
  const rate = FxRate.of("AUD", "USD", "0.65");
  assert.throws(() => rate.convert(Money.of("100", "EUR")), FxRateMismatchError);
  assert.throws(() => rate.convert(Money.of("100", "JPY")), FxRateMismatchError);
});

test("rate metadata is preserved and frozen", () => {
  const asOf = new Date("2026-06-20T00:00:00Z");
  const rate = FxRate.of("AUD", "USD", "0.65", { source: "desk", asOf, tier: "retail" });
  assert.equal(rate.metadata.source, "desk");
  assert.equal(rate.metadata.tier, "retail");
  assert.equal(rate.metadata.asOf, asOf);
  assert.ok(Object.isFrozen(rate.metadata));
});

test("convertWithDetails returns audit trail with direction", () => {
  const rate = FxRate.of("AUD", "USD", "0.6543");
  const fwd = rate.convertWithDetails(Money.of("100.00", "AUD"));
  assert.equal(fwd.from.getAmount(), "100.00");
  assert.equal(fwd.to.getAmount(), "65.43");
  assert.equal(fwd.rate, rate);
  assert.equal(fwd.direction, "forward");

  const rev = rate.convertWithDetails(Money.of("100.00", "USD"));
  assert.equal(rev.to.code, "AUD");
  assert.equal(rev.direction, "reverse");
});

test("inverse rate round-trips approximately and carries provenance", () => {
  const rate = FxRate.of("AUD", "USD", "0.6543");
  const inv = rate.inverse();
  assert.equal(inv.from.code, "USD");
  assert.equal(inv.to.code, "AUD");
  assert.equal(inv.metadata.derivedFrom, "AUD/USD");
  // 1 / 0.6543 ≈ 1.528351...
  assert.ok(inv.rate.startsWith("1.52835"));
});

test("rejects non-positive rates", () => {
  assert.throws(() => FxRate.of("AUD", "USD", "0"));
  assert.throws(() => FxRate.of("AUD", "USD", "-1"));
});

test("FxBoard finds direct, inverse, and triangulated rates", () => {
  const board = new FxBoard([FxRate.of("AUD", "USD", "0.6543"), FxRate.of("EUR", "USD", "1.0800")]);

  // direct
  assert.equal(board.getRate("AUD", "USD").rate, "0.6543");
  // identity
  assert.equal(board.getRate("USD", "USD").rate, "1");
  // inverse
  assert.ok(board.getRate("USD", "AUD").rate.startsWith("1.528"));
  // triangulated AUD -> USD -> EUR
  const audEur = board.convert(Money.of("100.00", "AUD"), "EUR");
  assert.equal(audEur.code, "EUR");
  assert.ok(Number(audEur.getAmount()) > 0);
});

test("FxBoard throws when no path exists", () => {
  const board = new FxBoard([FxRate.of("AUD", "USD", "0.65")]);
  assert.throws(() => board.getRate("JPY", "GBP"), FxRateMismatchError);
});
