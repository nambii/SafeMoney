import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AllocationError,
  CurrencyMismatchError,
  InvalidAmountError,
  Money,
  RoundingMode,
} from "../src/index.js";

test("Money.sum over a same-currency list", () => {
  const total = Money.sum([
    Money.of("10.00", "USD"),
    Money.of("0.50", "USD"),
    Money.of("-2.25", "USD"),
  ]);
  assert.equal(total.toString(), "8.25 USD");
});

test("Money.sum empty needs a currency, mixed currencies throw", () => {
  assert.equal(Money.sum([], "USD").toString(), "0.00 USD");
  assert.throws(() => Money.sum([]), CurrencyMismatchError);
  assert.throws(
    () => Money.sum([Money.of("1", "USD"), Money.of("1", "EUR")]),
    CurrencyMismatchError,
  );
});

test("Money.min / Money.max over a list", () => {
  const list = [Money.of("5.00", "USD"), Money.of("2.00", "USD"), Money.of("9.00", "USD")];
  assert.equal(Money.min(list).toString(), "2.00 USD");
  assert.equal(Money.max(list).toString(), "9.00 USD");
  assert.throws(() => Money.min([]), AllocationError);
});

test("Money.parse is the inverse of format (en-US)", () => {
  assert.equal(Money.parse("$1,234.56", "USD").toString(), "1234.56 USD");
  assert.equal(Money.parse("USD 5.00", "USD").toString(), "5.00 USD");
  assert.equal(Money.parse("(5.00)", "USD").toString(), "-5.00 USD"); // accounting negative
  assert.equal(Money.parse("-12.5", "USD").toString(), "-12.5 USD");
});

test("Money.parse round-trips a formatted value across locales", () => {
  const m = Money.of("1234.56", "EUR");
  const formatted = m.format({ locale: "de-DE" }); // "1.234,56 €"
  assert.ok(Money.parse(formatted, "EUR", { locale: "de-DE" }).equals(m), formatted);
});

test("Money.parse rejects junk", () => {
  assert.throws(() => Money.parse("not a number", "USD"), InvalidAmountError);
});

test("roundToIncrement performs cash rounding", () => {
  assert.equal(Money.of("12.37", "CHF").roundToIncrement("0.05").toString(), "12.35 CHF");
  assert.equal(Money.of("12.38", "CHF").roundToIncrement("0.05").toString(), "12.40 CHF");
  assert.equal(
    Money.of("12.38", "CHF").roundToIncrement("0.05", RoundingMode.DOWN).toString(),
    "12.35 CHF",
  );
  assert.equal(Money.of("1.07", "USD").roundToIncrement("0.25").toString(), "1.00 USD");
  assert.equal(Money.of("1.13", "USD").roundToIncrement("0.25").toString(), "1.25 USD");
  assert.throws(() => Money.of("1", "USD").roundToIncrement("0"), RangeError);
});
