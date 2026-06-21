# Copilot instructions — SafeMoney

SafeMoney is a zero-dependency TypeScript library of **money-safe primitives** and an **FX dealing layer** (rates, two-way quotes, markups, trades). It is correctness-critical financial code. Apply these rules when generating code, answering Copilot Chat, and **reviewing pull requests**.

## Non-negotiable invariants (flag any violation in review)

1. **No binary floating-point in the value path.** Money is stored as `bigint units × 10^-scale` (`Scaled` in `src/decimal.ts`). Never use JS `number` arithmetic, `parseFloat`, `Math.*`, or `Number()` to compute or round an amount. `number` is acceptable only for non-monetary display values (pip counts, bps shown in UI) and is explicitly opt-in.
2. **Every inexact operation takes an explicit `RoundingMode`.** Division, rounding, and FX conversion must never silently pick a default that hides rounding. Check the rounding direction is correct for **both signs** and at the exact `.5` tie.
3. **Conservation: no money is created or lost.** `allocate`/`split`/`attribute` must distribute every minor unit. Any change here needs a test proving the parts sum back to the whole, including negative and zero amounts.
4. **Currency safety.** Binary ops (`add`, `subtract`, compare, `min`/`max`) must reject mismatched currencies. Currency `decimals` (JPY=0, most=2, BHD/KWD=3) are an ISO 4217 correctness invariant — never guess them.
5. **Immutability.** `Money`, `FxRate`, `FxQuote`, `Markup`, `Quote`, `Trade` are frozen value objects. Methods return new instances; nothing mutates `this` or a shared internal `Scaled`.
6. **Untrusted input is validated, not silently coerced.** Parsers (`parseScaled`, `normalizeLocaleNumber`) must reject ambiguous/garbage input with a typed error (`InvalidAmountError` etc.), never produce a plausible-but-wrong number.

## Review focus, in priority order

- **Correctness of the math first** — rounding, sign handling, scale growth, exact bigint formulas (especially `decimal.ts`, `rounding.ts`, `money.ts`, `fx.ts`, `markup.ts`). Construct a numeric counterexample when you suspect a bug.
- **FX dealing semantics** — `FxQuote.convert` must hit the house-favouring side (base→bid, quote→ask); margins must be non-negative and in the correct currency; staleness/expiry boundaries use the documented comparison.
- **Edge cases** — negative and zero amounts, sub-minor-unit "dust", currency mismatch, expiry/staleness exactly at the boundary, very large notionals, 0- and 3-decimal currencies.
- **Tests** — any money-touching change needs a unit test; prefer adding/extending the fast-check property tests for invariants. New error paths and guards must be exercised.
- **Packaging** — `exports` subpaths must keep per-condition `types` (ESM and CJS); don't break tree-shaking (`sideEffects: false`) or ship `test/`, `bench/`, `docs/`.

## Conventions

- TypeScript strict mode; ESM source with `.js` import specifiers; dual ESM/CJS build.
- Formatting/lint via **Biome** (`npm run check`). Match surrounding style; don't reformat unrelated code.
- Public API changes need a doc comment and a README update. The package is pre-1.0.
- Prefer decimal **strings** over `number` for amounts and rates everywhere.

## Gates (CI must stay green)

`npm run typecheck` · `npm run build` · `npm test` · `npm run check` · `npm run coverage` (lines ≥85, fns ≥90, branches ≥80) · `npm run reconcile`. Mutation testing (`npm run mutation`, Stryker, break 75) is the real trust signal for the exact-math core — for money changes, coverage % alone is not enough.
