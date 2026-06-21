// Reconciliation harness.
//
// Feeds recorded deals — a provider cost rate, a markup, a fixed leg, and what
// the provider/settlement *actually* returned — through SafeMoney and reports
// any discrepancy. Use it to confirm the library's pricing matches how your
// liquidity providers (e.g. JPM, Currency Cloud) actually quote and settle,
// before trusting it with real money.
//
// Usage:
//   npm run build && npm run reconcile [path/to/cases.json]
//
// Each case (see reconciliation/sample-cases.json for the schema):
//   { id, costRate:{from,to,rate}, markupBps|markups[], fix:"sell"|"buy",
//     amount:{currency,value}, expect:{ payin?, payout?, margin?, clientRate? },
//     toleranceMinor? }
//
// Exits non-zero if any case fails, so it can gate CI.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

let lib;
try {
  lib = await import(join(root, "dist/esm/index.js"));
} catch {
  console.error("Build the library first:  npm run build");
  process.exit(2);
}
const { Money, FxRate, Markup, Quote } = lib;

const file = process.argv[2] ?? join(root, "reconciliation/sample-cases.json");
const config = JSON.parse(readFileSync(file, "utf8"));
const defaultTol = config.tolerance?.minorUnits ?? 0;

function markupOf(c) {
  if (Array.isArray(c.markups)) return Markup.sum(...c.markups.map((b) => Markup.bps(b)));
  return Markup.bps(c.markupBps ?? 0);
}

// The currency that is NOT `code` in the pair.
function otherSide(pair, code) {
  return code === pair.from ? pair.to : pair.from;
}

function compareMoney(label, expected, actual, tol) {
  if (!expected) return null;
  if (expected.currency !== actual.currency.code) {
    return `${label}: currency ${actual.currency.code} ≠ expected ${expected.currency}`;
  }
  const exp = Money.of(expected.value, expected.currency).toMinor();
  const act = actual.toMinor();
  const diff = act - exp < 0n ? exp - act : act - exp;
  if (diff > BigInt(tol)) {
    return `${label}: got ${actual.getAmount()} ${actual.currency.code}, expected ${expected.value} (Δ ${diff} minor unit${diff === 1n ? "" : "s"} > tol ${tol})`;
  }
  return null;
}

let failed = 0;
console.log(`Reconciling ${config.cases.length} case(s) from ${file}\n`);

for (const c of config.cases) {
  const tol = c.toleranceMinor ?? defaultTol;
  const cost = FxRate.of(c.costRate.from, c.costRate.to, c.costRate.rate);
  const markup = markupOf(c);
  const amount = Money.of(c.amount.value, c.amount.currency);
  const problems = [];

  let quote;
  try {
    if (c.fix === "buy") {
      const sellCcy = otherSide(c.costRate, c.amount.currency);
      quote = Quote.forBuyAmount(amount, sellCcy, cost, { markup });
    } else {
      const buyCcy = otherSide(c.costRate, c.amount.currency);
      quote = Quote.forSellAmount(amount, buyCcy, cost, { markup });
    }
  } catch (err) {
    console.log(`✗ ${c.id}: threw ${err.constructor.name}: ${err.message}`);
    failed++;
    continue;
  }

  problems.push(compareMoney("payin", c.expect?.payin, quote.sell, tol));
  problems.push(compareMoney("payout", c.expect?.payout, quote.buy, tol));
  problems.push(compareMoney("margin", c.expect?.margin, quote.margin, tol));

  if (c.expect?.clientRate) {
    const decimals = (c.expect.clientRate.split(".")[1] ?? "").length;
    const got = quote.clientRate(decimals);
    if (got !== c.expect.clientRate) {
      problems.push(`clientRate: got ${got}, expected ${c.expect.clientRate}`);
    }
  }

  const issues = problems.filter(Boolean);
  if (issues.length === 0) {
    console.log(`✓ ${c.id}  (${markup.toString()}, eff ${markup.asBps()}bps)`);
  } else {
    failed++;
    console.log(`✗ ${c.id}`);
    for (const issue of issues) console.log(`    ${issue}`);
  }
}

console.log(`\n${config.cases.length - failed}/${config.cases.length} passed.`);
process.exit(failed > 0 ? 1 : 0);
