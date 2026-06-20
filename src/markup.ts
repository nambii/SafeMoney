import { parseScaled, pow10, scaledToString, type Numeric } from "./decimal.js";

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
