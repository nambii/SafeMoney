// Micro-benchmarks for SafeMoney's hot paths. Zero-dependency: times each
// operation with a fixed iteration budget and reports ops/sec.
//
// Run with:  npm run bench
import { FxQuote, FxRate, Markup, Money, RoundingMode } from "@nambii/safemoney";

const ITERATIONS = 200_000;
const WARMUP = 20_000;

// A running checksum keeps the optimiser from eliminating the measured work.
let sink = 0n;
function keep(value) {
  if (typeof value === "bigint") sink ^= value;
  else if (typeof value === "string") sink ^= BigInt(value.length);
  else if (value && typeof value === "object") sink ^= 1n;
}

function bench(name, fn) {
  for (let i = 0; i < WARMUP; i++) keep(fn(i));
  const start = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) keep(fn(i));
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const opsPerSec = (ITERATIONS / elapsedNs) * 1e9;
  const nsPerOp = elapsedNs / ITERATIONS;
  console.log(
    `${name.padEnd(28)} ${formatOps(opsPerSec).padStart(14)} ops/s   ${nsPerOp.toFixed(1).padStart(8)} ns/op`,
  );
}

function formatOps(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

// --- Fixtures (built once, outside the timed loops) --------------------------
const a = Money.of("1234.56", "USD");
const b = Money.of("0.44", "USD");
const big = Money.of("100000.00", "USD");
const rate = FxRate.of("AUD", "USD", "0.6543", { source: "JPM", asOf: new Date() });
const audAmount = Money.of("1000.00", "AUD");
const mid = FxRate.of("EUR", "USD", "1.1000");
const twoWay = FxQuote.fromMid(mid, { pips: 2 });
const eurAmount = Money.of("100.00", "EUR");
const markup = Markup.bps(50);

console.log(`SafeMoney benchmarks — ${ITERATIONS.toLocaleString("en-US")} iterations each\n`);

// --- Money core --------------------------------------------------------------
bench("Money.of (parse)", (i) => Money.of(`${i % 1000}.99`, "USD"));
bench("Money.add", () => a.add(b));
bench("Money.multiply", () => a.multiply("1.5"));
bench("Money.divide", () => a.divide("3", RoundingMode.HALF_EVEN));
bench("Money.allocate([3])", () => big.allocate([1, 1, 1]));
bench("Money.round", () => a.round(RoundingMode.HALF_UP));
bench("Money.compare", () => a.greaterThan(b));
bench("Money.format (Intl)", () => a.format({ locale: "en-US" }));
bench("Money.toMinor", () => a.toMinor());

// --- FX ----------------------------------------------------------------------
bench("FxRate.convert (forward)", () => rate.convert(audAmount));
bench("FxRate.inverse", () => rate.inverse());
bench("Markup.bps", (i) => Markup.bps(i % 100));
bench("FxQuote.fromMid (pips)", () => FxQuote.fromMid(mid, { pips: 2 }));
bench("FxQuote.convert (bid)", () => twoWay.convert(eurAmount));

// Keep the checksum observable so nothing above is dead-code-eliminated.
if (sink === 42n) console.log("(unreachable)", markup.toString());
