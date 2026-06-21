# AGENTS.md

Cross-tool instructions for AI coding agents. SafeMoney is a zero-dependency, correctness-critical money + FX library. Full guidance lives in [CLAUDE.md](./CLAUDE.md) and, for PR review, [.github/copilot-instructions.md](./.github/copilot-instructions.md) — this file is the short version.

## Core rules

- **No binary floating-point in any amount calculation.** Money is `bigint units × 10^-scale`. Never use `number` math, `parseFloat`, or `Number()` to compute/round money. `number` is for non-monetary display only.
- **Every inexact operation (divide, round, FX convert) takes an explicit `RoundingMode`.** Check both signs and the `.5` tie.
- **Conserve money** — `allocate`/`split`/`attribute` lose no minor unit; prove it with a test.
- **Currency-safe** — reject mismatched-currency operations; never guess ISO `decimals` (JPY=0, BHD/KWD=3, most=2).
- **Immutable, frozen value objects** — return new instances; don't mutate or leak internals.
- **Validate untrusted input** — reject ambiguous/garbage with a typed error; never return a plausible-but-wrong number.

## Before you finish

Run the gates and keep them green:
```
npm run typecheck && npm run build && npm test && npm run check && npm run coverage && npm run reconcile
```
For exact-math changes, also run `npm run mutation` on the changed file (break threshold 75). Add a test for every money-touching change. Don't add runtime dependencies. Don't ship `test/`, `bench/`, or `docs/` in the package.
