import { test } from "node:test";
import assert from "node:assert/strict";
import { Money, formatMoney, registerCurrency } from "../src/index.js";

test("formats with locale and currency symbol", () => {
  // Use explicit locale so the assertion is deterministic across environments.
  assert.equal(Money.of("1234.5", "AUD").format({ locale: "en-AU" }), "$1,234.50");
  assert.equal(Money.of("1234.5", "USD").format({ locale: "en-US" }), "$1,234.50");
});

test("currencyDisplay variants", () => {
  assert.equal(
    Money.of("5", "USD").format({ locale: "en-US", currencyDisplay: "code" }),
    "USD 5.00",
  );
});

test("formatting preserves precision for large amounts", () => {
  // Beyond Number.MAX_SAFE_INTEGER: must not lose digits.
  const big = Money.of("9007199254740993.01", "USD");
  const out = big.format({ locale: "en-US" });
  assert.ok(out.includes("9,007,199,254,740,993.01"), out);
});

test("negative amounts and signDisplay", () => {
  assert.equal(Money.of("-5", "USD").format({ locale: "en-US" }), "-$5.00");
  assert.equal(
    Money.of("5", "USD").format({ locale: "en-US", signDisplay: "always" }),
    "+$5.00",
  );
});

test("fallback formatting for unknown-to-Intl currencies", () => {
  // A non-ISO code (not 3 letters) makes Intl throw, exercising the fallback.
  registerCurrency({ code: "WDGT", decimals: 4, name: "Widget Token" });
  const out = formatMoney(Money.of("12.5", "WDGT"), { locale: "en-US" });
  assert.ok(out.includes("12.5000"), out);
  assert.ok(out.includes("WDGT"), out);
});

test("custom 3-letter currencies still render at their own precision", () => {
  registerCurrency({ code: "BTC", decimals: 8, name: "Bitcoin" });
  const out = formatMoney(Money.of("1.5", "BTC"), { locale: "en-US" });
  assert.ok(out.includes("1.50000000"), out);
});
