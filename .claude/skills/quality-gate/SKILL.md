---
name: quality-gate
description: Run SafeMoney's full correctness gate (typecheck, build, tests, Biome, coverage, reconcile, and optionally mutation) and report a concise pass/fail summary. Use before committing money-touching changes, before opening a PR, or when asked to "check everything", "run the gates", or "is this ready".
---

# Quality gate

SafeMoney is correctness-critical financial code. This skill runs the project's quality gates in the cheap-to-expensive order and stops you shipping a regression.

## Steps

Run these from the repo root and collect results. Run the fast ones first; only run mutation when explicitly asked (it is slow — recompiles per mutant).

1. **Typecheck** — `npm run typecheck` (strict; must be clean).
2. **Build** — `npm run build` (dual ESM + CJS into `dist/`).
3. **Tests** — `npm test` (node:test unit + fast-check property suite). Report `# pass` / `# fail`.
4. **Lint + format** — `npm run check` (Biome). If it only flags formatting, offer `npm run format`.
5. **Coverage** — `npm run coverage` (c8 thresholds in `.c8rc.json`: lines ≥85, functions ≥90, branches ≥80). Report the summary line.
6. **Reconcile** — `npm run reconcile` (prices against recorded deals in `reconciliation/sample-cases.json`). Must be N/N passed.
7. **Mutation (only on request or for release)** — `npm run mutation` (Stryker, `break: 75`). For a quick signal, scope it: `npx stryker run --mutate 'src/<file>.ts'`. Report the mutation score and any survived mutants in changed files.

## Reporting

Give a tight table: each gate, pass/fail, and the key number (test counts, coverage %, mutation score). If anything fails, quote the actual failing output and name the `file:line` — never paper over a red gate. If you changed exact-math code (`decimal.ts`, `rounding.ts`, `money.ts`, `fx.ts`, `markup.ts`), recommend running mutation on at least that file, since coverage % alone does not prove the suite catches bugs.

## Notes
- Node ≥20 is required (`engines`). CI runs the matrix on 20/22/24.
- If `npm run check` fails purely on formatting, that is not a correctness failure — fix with `npm run format` and re-run.
