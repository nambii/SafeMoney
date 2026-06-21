import { test } from "node:test";
import fc from "fast-check";
import {
  FxRate,
  isRoundingMode,
  Markup,
  MarkupSchedule,
  Money,
  Quote,
  RoundingMode,
} from "../src/index.js";
import { divideRound } from "../src/rounding.js";

// A few currencies with different minor-unit exponents (0, 2, 3 dp).
const CODES = ["USD", "EUR", "JPY", "BHD", "AUD"] as const;
const arbCode = fc.constantFrom(...CODES);
const arbUnits = fc.bigInt({ min: -(10n ** 14n), max: 10n ** 14n });

// A Money of a given currency from random minor units.
const arbMoney = fc.tuple(arbCode, arbUnits).map(([code, units]) => Money.ofMinor(units, code));
// Two amounts in the *same* currency (for arithmetic laws).
const arbSameCcy = fc
  .tuple(arbCode, arbUnits, arbUnits)
  .map(([code, a, b]) => [Money.ofMinor(a, code), Money.ofMinor(b, code)] as const);

const arbMode = fc.constantFrom(...Object.values(RoundingMode).filter(isRoundingMode));

function decimal(units: bigint, scale: number): string {
  const neg = units < 0n;
  const s = (neg ? -units : units).toString().padStart(scale + 1, "0");
  const body = scale === 0 ? s : `${s.slice(0, -scale)}.${s.slice(-scale)}`;
  return (neg ? "-" : "") + body;
}
// A positive FX rate string with 6 dp.
const arbRate = fc.bigInt({ min: 1n, max: 9_999_999n }).map((u) => decimal(u, 6));

// Build a quote, returning undefined when the amount is dust (a leg rounds to
// zero) — those inputs are unpriceable and out of scope for pricing invariants.
function tryQuote<T>(make: () => T): T | undefined {
  try {
    return make();
  } catch (e) {
    if (e instanceof RangeError) return undefined;
    throw e;
  }
}

test("property: add is commutative and associative", () => {
  fc.assert(
    fc.property(arbCode, arbUnits, arbUnits, arbUnits, (code, a, b, c) => {
      const [x, y, z] = [Money.ofMinor(a, code), Money.ofMinor(b, code), Money.ofMinor(c, code)];
      return (
        x.add(y).equals(y.add(x)) &&
        x
          .add(y)
          .add(z)
          .equals(x.add(y.add(z)))
      );
    }),
  );
});

test("property: subtract inverts add; negate is an involution", () => {
  fc.assert(
    fc.property(
      arbSameCcy,
      ([a, b]) => a.add(b).subtract(b).equals(a) && a.negate().negate().equals(a),
    ),
  );
});

test("property: getAmount and JSON round-trip exactly", () => {
  fc.assert(
    fc.property(arbMoney, (m) => {
      const viaString = Money.of(m.getAmount(), m.currency.code).equals(m);
      const viaJson = Money.fromJSON(m.toJSON()).equals(m);
      return viaString && viaJson;
    }),
  );
});

test("property: abs is never negative; |x| ≥ 0", () => {
  fc.assert(fc.property(arbMoney, (m) => !m.abs().isNegative()));
});

test("property: allocate and split conserve the total exactly", () => {
  const arbWeights = fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 8 });
  fc.assert(
    fc.property(arbMoney, arbWeights, (m, weights) => {
      fc.pre(weights.some((w) => w > 0));
      const parts = m.allocate(weights);
      const total = parts.reduce((s, p) => s.add(p), Money.zero(m.currency.code));
      return total.equals(m);
    }),
  );
  fc.assert(
    fc.property(arbMoney, fc.integer({ min: 1, max: 12 }), (m, n) => {
      const total = m.split(n).reduce((s, p) => s.add(p), Money.zero(m.currency.code));
      return total.equals(m);
    }),
  );
});

test("property: roundToIncrement is idempotent and within one increment", () => {
  const arbInc = fc.constantFrom("0.05", "0.25", "0.10", "1", "0.5");
  fc.assert(
    fc.property(arbMoney, arbInc, (m, inc) => {
      const r = m.roundToIncrement(inc);
      const idempotent = r.roundToIncrement(inc).equals(r);
      const within = r.subtract(m).abs().lessThanOrEqual(Money.of(inc, m.currency.code));
      return idempotent && within;
    }),
  );
});

test("property: divideRound stays within one unit of the true quotient", () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
      fc.bigInt({ min: 1n, max: 10n ** 12n }),
      arbMode,
      (num, den, mode) => {
        if (mode === RoundingMode.UNNECESSARY) {
          if (num % den !== 0n) return true; // throws — covered elsewhere
          return divideRound(num, den, mode) * den === num;
        }
        const q = divideRound(num, den, mode);
        const residual = q * den - num; // distance from exact, scaled by den
        return residual > -den && residual < den;
      },
    ),
  );
});

test("property: Markup.sum/compound stay in [0, 100%); attribute conserves margin", () => {
  const arbMarkup = fc.integer({ min: 0, max: 1000 }).map((bps) => Markup.bps(bps));
  const arbComponents = fc.array(arbMarkup, { minLength: 1, maxLength: 5 });
  fc.assert(
    fc.property(arbComponents, (components) => {
      const sum = Markup.sum(...components);
      const compound = Markup.compound(...components);
      return (
        sum.asBps() >= 0 && sum.asBps() < 10000 && compound.asBps() >= 0 && compound.asBps() < 10000
      );
    }),
  );
  fc.assert(
    fc.property(
      arbCode,
      fc.bigInt({ min: 1n, max: 10n ** 12n }),
      arbComponents,
      (code, units, components) => {
        fc.pre(components.some((c) => c.asBps() > 0));
        const margin = Money.ofMinor(units, code);
        const shares = Markup.attribute(margin, components);
        const total = shares.reduce((s, p) => s.add(p), Money.zero(code));
        return total.equals(margin);
      },
    ),
  );
});

test("property: a quote never has negative margin and conserves at zero markup", () => {
  fc.assert(
    fc.property(
      arbRate,
      fc.bigInt({ min: 1n, max: 10n ** 10n }),
      fc.integer({ min: 0, max: 500 }),
      (rate, baseUnits, bps) => {
        const cost = FxRate.of("AUD", "USD", rate);
        const sell = Money.ofMinor(baseUnits, "AUD");
        const q = tryQuote(() =>
          Quote.forSellAmount(sell, "USD", cost, { markup: Markup.bps(bps) }),
        );
        if (q === undefined) return true; // dust: leg rounds to zero, unpriceable — out of scope
        return !q.margin.isNegative() && q.buy.isPositive();
      },
    ),
  );
  fc.assert(
    fc.property(arbRate, fc.bigInt({ min: 1n, max: 10n ** 10n }), (rate, baseUnits) => {
      const q = tryQuote(() =>
        Quote.forSellAmount(Money.ofMinor(baseUnits, "AUD"), "USD", FxRate.of("AUD", "USD", rate)),
      );
      if (q === undefined) return true; // dust: unpriceable — out of scope
      return q.margin.isZero(); // zero markup → zero margin
    }),
  );
});

test("property: tiered effective margin is bounded by the tier margins", () => {
  const arbBps = fc.integer({ min: 0, max: 1000 });
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100000 }),
      fc.integer({ min: 100001, max: 500000 }),
      arbBps,
      arbBps,
      arbBps,
      fc.integer({ min: 1, max: 1000000 }),
      fc.constantFrom("progressive" as const, "flat" as const),
      (t1, t2, b1, b2, b3, amount, mode) => {
        const schedule = MarkupSchedule.of(
          "AUD",
          [
            { upTo: String(t1), markup: Markup.bps(b1) },
            { upTo: String(t2), markup: Markup.bps(b2) },
            { markup: Markup.bps(b3) },
          ],
          { mode },
        );
        const eff = schedule.effectiveMarkup(Money.of(String(amount), "AUD")).asBps();
        const lo = Math.min(b1, b2, b3);
        const hi = Math.max(b1, b2, b3);
        return eff >= lo - 1e-6 && eff <= hi + 1e-6;
      },
    ),
  );
});
