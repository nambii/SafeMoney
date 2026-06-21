---
name: add-currency
description: Add or correct an ISO 4217 currency in SafeMoney's built-in registry, with the right minor-unit decimals and a test. Use when asked to "add a currency", "support <CODE>", "fix the decimals for <CODE>", or "register <CODE>".
---

# Add a currency

Currency minor-unit `decimals` are a correctness invariant — every `Money` of that code scales by `10^decimals`. Getting this wrong silently mis-scales money. Be precise.

## Steps

1. Open `src/currencies.ts` and find the `BUILT_IN` table (a `const` object keyed by uppercase alpha code). The `keyof typeof BUILT_IN` drives the `CurrencyCode` literal type, so adding here gives the code static typing for free.
2. Add the entry with the **canonical ISO 4217 minor units**:
   - Most currencies: `decimals: 2`.
   - Zero-decimal: JPY, KRW, VND, CLP, ISK, BIF, DJF, GNF, KMF, PYG, RWF, UGX, VUV, XAF, XOF, XPF, etc. → `decimals: 0`.
   - Three-decimal: BHD, IQD, JOD, KWD, LYD, OMR, TND → `decimals: 3`.
   - Verify against ISO 4217 — do not guess. If it is a crypto/non-ISO code, say so and pick decimals deliberately.
   - Keep entries in the same shape/order style as neighbours (code, decimals, name, numeric if present).
3. Keep the table internally consistent: no duplicate alpha or numeric codes, `decimals` an integer in `[0, 18]`.
4. Add a test in `test/currencies.test.ts` asserting `getCurrency("<CODE>").decimals` and that a `Money.of("…","<CODE>")` formats/scales correctly (especially for 0- and 3-dp currencies, where bugs hide).
5. Run the **quality-gate** skill (at minimum `npm run typecheck && npm test`).

## Runtime registration (alternative)
For non-built-in or app-specific currencies, `registerCurrency({ code, decimals, name })` adds to the process registry at runtime. Note: codes are stored/looked-up case-sensitively and registering an existing code replaces it — do not silently shadow a built-in ISO currency without flagging it to the user.

## Don't
- Don't invent decimals — wrong minor units corrupt every amount in that currency.
- Don't add a code that only differs by case from an existing one.
