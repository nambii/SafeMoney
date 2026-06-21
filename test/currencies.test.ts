import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCurrency,
  isCurrencyRegistered,
  listCurrencies,
  Money,
  registerCurrency,
  UnknownCurrencyError,
} from "../src/index.js";

test("known currencies expose correct minor units", () => {
  assert.equal(getCurrency("USD").decimals, 2);
  assert.equal(getCurrency("JPY").decimals, 0);
  assert.equal(getCurrency("BHD").decimals, 3);
  assert.equal(getCurrency("KWD").decimals, 3);
  assert.equal(getCurrency("CLP").decimals, 0);
});

test("unknown currency throws", () => {
  assert.throws(() => getCurrency("ZZZ"), UnknownCurrencyError);
  assert.throws(() => Money.of("1", "ZZZ"), UnknownCurrencyError);
});

test("listCurrencies returns a sorted snapshot", () => {
  const list = listCurrencies();
  assert.ok(list.length > 100);
  const codes = list.map((c) => c.code);
  assert.deepEqual(codes, [...codes].sort());
});

test("custom currency registration (e.g. crypto)", () => {
  registerCurrency({ code: "BTC", decimals: 8, name: "Bitcoin" });
  assert.ok(isCurrencyRegistered("BTC"));
  const sats = Money.ofMinor(150000000n, "BTC");
  assert.equal(sats.getAmount(), "1.50000000");
  assert.equal(sats.toMinor(), 150000000n);
});

test("registration validates code and decimals", () => {
  assert.throws(() => registerCurrency({ code: "!!", decimals: 2, name: "Bad" }), RangeError);
  assert.throws(() => registerCurrency({ code: "ABC", decimals: -1, name: "Bad" }), RangeError);
  assert.throws(() => registerCurrency({ code: "ABC", decimals: 99, name: "Bad" }), RangeError);
});
