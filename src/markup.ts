import { parseScaled, pow10, scaledToString, type Numeric } from "./decimal.js";
import { Money } from "./money.js";

/**
 * A pricing margin applied to a liquidity provider's cost rate to produce a
 * customer rate. Stored as an exact rational fraction `f = num/den` with
 * `0 ≤ f < 1`, so margins compose without floating-point drift.
 *
 * The markup is always applied in the house's favour: the customer receives a
 * `(1 − f)` fraction of what the cost rate would give.
 *
 * @example
 * Markup.bps(25);      // 0.25% margin
 * Markup.percent("1"); // 1% margin
 * Markup.ratio("0.0025");
 */
export class Markup {
  // Markup fraction f = num/den (den > 0, 0 <= num < den).
  private readonly num: bigint;
  private readonly den: bigint;
  private readonly label: string;

  private constructor(num: bigint, den: bigint, label: string) {
    if (den <= 0n || num < 0n || num >= den) {
      throw new RangeError(`Markup fraction must be in [0, 1); got ${num}/${den}.`);
    }
    this.num = num;
    this.den = den;
    this.label = label;
    Object.freeze(this);
  }

  /** Markup in basis points (1 bp = 0.01%). Fractional bps allowed. */
  static bps(basisPoints: Numeric): Markup {
    const p = parseScaled(basisPoints);
    return new Markup(p.units, 10_000n * pow10(p.scale), `${scaledToString(p)}bps`);
  }

  /** Markup as a percentage. */
  static percent(pct: Numeric): Markup {
    const p = parseScaled(pct);
    return new Markup(p.units, 100n * pow10(p.scale), `${scaledToString(p)}%`);
  }

  /** Markup as a raw fraction (e.g. "0.0025" for 25 bps). */
  static ratio(fraction: Numeric): Markup {
    const p = parseScaled(fraction);
    return new Markup(p.units, pow10(p.scale), scaledToString(p));
  }

  /** No margin (cost rate passes through to the customer). */
  static zero(): Markup {
    return new Markup(0n, 1n, "0bps");
  }

  /**
   * Build a markup from an exact rational fraction `num/den` (reduced
   * automatically). Used to represent blended margins, e.g. the weighted
   * average produced by a tiered {@link MarkupSchedule}.
   */
  static fromFraction(num: bigint, den: bigint, label?: string): Markup {
    if (den === 0n) throw new RangeError("Markup denominator must be non-zero.");
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num < 0n ? -num : num, den);
    const n = g > 1n ? num / g : num;
    const d = g > 1n ? den / g : den;
    const bps = Math.round((Number(n) / Number(d)) * 10_000 * 1e6) / 1e6;
    return new Markup(n, d, label ?? `${bps}bps`);
  }

  /**
   * Combine several markups additively (their fractions add): a 30 bps and a
   * 20 bps margin together make 50 bps. The common case for stacking fees such
   * as a house margin plus a partner commission. Exact.
   */
  static sum(...markups: Markup[]): Markup {
    let num = 0n;
    let den = 1n;
    for (const m of markups) {
      num = num * m.den + m.num * den;
      den = den * m.den;
    }
    return Markup.fromFraction(num, den);
  }

  /**
   * Combine several markups multiplicatively, as if each were applied in turn
   * to the previous result: retention `k = Π(1 − fᵢ)`, so 30 bps then 20 bps
   * is slightly under 50 bps. Exact.
   */
  static compound(...markups: Markup[]): Markup {
    let num = 1n; // numerator of the retention product
    let den = 1n;
    for (const m of markups) {
      num *= m.den - m.num;
      den *= m.den;
    }
    return Markup.fromFraction(den - num, den); // f = 1 − k
  }

  /**
   * Split an earned `margin` across the markup `components` in proportion to
   * their fractions, distributing every minor unit (no money lost). Use this to
   * attribute revenue back to each fee component, e.g. the partner's share.
   */
  static attribute(margin: Money, components: ReadonlyArray<Markup>): Money[] {
    if (components.length === 0) {
      throw new RangeError("attribute() needs at least one component.");
    }
    const den = components.reduce((d, c) => d * c.den, 1n);
    const weights = components.map((c) => c.num * (den / c.den));
    if (weights.every((w) => w === 0n)) {
      return components.map(() => Money.zero(margin.currency.code));
    }
    return margin.allocate(weights);
  }

  /** The markup fraction as `num/den` (house's take per unit). */
  fraction(): { num: bigint; den: bigint } {
    return { num: this.num, den: this.den };
  }

  /** The retention fraction `(1 − f) = (den − num)/den` (what the customer keeps). */
  retention(): { num: bigint; den: bigint } {
    return { num: this.den - this.num, den: this.den };
  }

  /** The markup expressed in basis points, as a number (for display/metrics). */
  asBps(): number {
    return (Number(this.num) / Number(this.den)) * 10_000;
  }

  toString(): string {
    return this.label;
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a < 0n ? -a : a;
}

/** A single markup, or several to be combined additively. */
export type MarkupLike = Markup | ReadonlyArray<Markup>;

/** Normalize a {@link MarkupLike} (or nothing) into one {@link Markup}. */
export function resolveMarkup(markup: MarkupLike | undefined): Markup {
  if (markup === undefined) return Markup.zero();
  return Array.isArray(markup) ? Markup.sum(...markup) : (markup as Markup);
}
