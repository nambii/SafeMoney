# CLAUDE.md

Guidance for AI agents (Claude Code and others) working in this repo. SafeMoney is correctness-critical financial code — favour exactness and explicit tests over speed.

## What this is

A zero-dependency TypeScript library with two layers:
- **Money core** — exact decimal money (`bigint units × 10^-scale`), typed ISO 4217 currencies, explicit rounding policies, Intl formatting, locale-aware parsing.
- **FX dealing** — `FxRate` (mid) and `FxQuote` (two-way bid/ask), `Markup`/`MarkupSchedule` (margins, tiers, attribution), `Quote` → `Trade`, `RateBook` (multi-LP best execution), `FxBoard` (triangulation), `Portfolio` valuation.

## Architecture (`src/`)

`decimal.ts` is the exact-arithmetic core (`Scaled`, `parseScaled`, `rescale`, add/sub/mul/compare). `rounding.ts` has the 8 `RoundingMode`s and the `divideRound` primitive everything rounds through. `money.ts` is the `Money` value object. `currencies.ts` is the ISO registry. `fx.ts`, `markup.ts`, `schedule.ts`, `quote.ts`, `trade.ts`, `ratebook.ts`, `portfolio.ts`, `format.ts`, `errors.ts` build on those. `index.ts` is the barrel; each module is also a tree-shakeable subpath export (`@nambii/safemoney/fx`, `@nambii/safemoney/money`, …).

## Invariants you must preserve

1. **No floats in the value path** — all amount math is `bigint`. `number` only for non-monetary display (pip counts, bps), and opt-in. Prefer decimal strings for inputs.
2. **Inexact ops take an explicit `RoundingMode`** — division, rounding, conversion. Verify both signs and the `.5` tie.
3. **Conservation** — `allocate`/`split`/`attribute` lose no minor unit; prove it with a test.
4. **Currency safety** — reject cross-currency binary ops; never guess a currency's `decimals`.
5. **Immutability** — value objects are frozen; methods return new instances; don't leak a mutable internal `Scaled`.
6. **Validate untrusted input** — reject ambiguous/garbage with a typed error; never produce a wrong-but-plausible amount.

## Commands

```
npm run typecheck   # strict tsc, no emit
npm run build       # dual ESM + CJS into dist/
npm test            # node:test unit + fast-check property suite
npm run check       # Biome lint + format (fix: npm run format)
npm run coverage    # c8 thresholds (lines 85 / fns 90 / branches 80)
npm run mutation    # Stryker (break 75) — the real signal for exact-math changes; slow
npm run reconcile   # price against recorded deals in reconciliation/
npm run bench       # micro-benchmarks for hot paths
npm run docs        # TypeDoc API site → docs/api
```

Skills in `.claude/skills/`: `quality-gate`, `release`, `add-currency`.

## Working style here

- Match surrounding code; don't reformat unrelated lines. Biome owns formatting.
- Every money-touching change needs a test — extend `test/properties.test.ts` for invariants, add unit tests for new branches/guards/errors.
- For exact-math changes, run mutation on at least the changed file; coverage % alone doesn't prove the suite catches bugs.
- Public API changes need a doc comment + README update. Package is pre-1.0; note breaking changes.
- Don't add runtime dependencies — the zero-dep core is a feature. Provider adapters, if any, stay out of it.
- Commit/push only when asked; branch off `main` for changes.
