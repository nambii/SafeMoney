import { type CurrencyCodeInput, type CurrencyInfo, getCurrency } from "./currencies.js";
import { type Numeric, parseScaled, pow10 } from "./decimal.js";
import { FxRateMismatchError } from "./errors.js";
import { FxRate } from "./fx.js";
import { Markup, type MarkupLike, resolveMarkup } from "./markup.js";
import type { Money } from "./money.js";
import { Quote } from "./quote.js";
import type { RoundingMode } from "./rounding.js";

/** A single margin band, applying up to `upTo` units of the base currency. */
export interface MarkupTier {
  /**
   * Upper bound of the band, in base currency (inclusive). The final tier is
   * always open-ended (it applies to everything above the prior bound), so any
   * `upTo` given on the last tier is ignored.
   */
  readonly upTo?: Numeric;
  /**
   * Margin for this band — a single {@link Markup}, or several (e.g. a house
   * margin plus a partner commission) which are combined additively.
   */
  readonly markup: MarkupLike;
}

// A tier with its markups already resolved to a single Markup.
interface ResolvedTier {
  readonly upTo?: Numeric;
  readonly markup: Markup;
}

/**
 * How tiers combine:
 * - `progressive` (default): tax-bracket style — each slice of the amount is
 *   margined at its own tier and the result is the blended (weighted-average)
 *   margin.
 * - `flat`: the whole amount uses the margin of the single tier it falls into.
 */
export type TierMode = "progressive" | "flat";

/** The result of pricing an amount through a {@link MarkupSchedule}. */
export interface TieredPrice {
  /** The effective (blended, for progressive) margin applied. */
  readonly markup: Markup;
  /** The resultant client rate as an FxRate (quote per 1 base). */
  readonly rate: FxRate;
  /** The base amount converted at the resultant rate (in the quote currency). */
  readonly amount: Money;
  /** Booked margin (house revenue) on the conversion. */
  readonly margin: Money;
  /** The full quote backing this price. */
  readonly quote: Quote;
}

/** Options for resolving a resultant rate / price. */
export interface PriceOptions {
  /** Fractional digits for the resultant rate string. Default 10. */
  readonly decimals?: number;
  /** Rounding used when reducing the converted amount to the quote minor unit. Default HALF_EVEN. */
  readonly mode?: RoundingMode;
}

/**
 * A tiered margin schedule for a base currency. Tiers carry their own
 * {@link Markup} (bps, %, or ratio) and thresholds in the base currency, and
 * combine either progressively (tax-bracket style) or flat. Given a liquidity
 * provider's cost rate and a base-currency amount it yields the effective
 * margin, the resultant client rate, and optionally the converted amount.
 *
 * @example
 * const schedule = MarkupSchedule.of("AUD", [
 *   { upTo: "10000", markup: Markup.bps(50) },
 *   { upTo: "50000", markup: Markup.bps(30) },
 *   { markup: Markup.bps(20) }, // open-ended top tier
 * ]);
 *
 * schedule.effectiveMarkup(Money.of("70000", "AUD")).asBps(); // 30 (blended)
 *
 * const cost = FxRate.of("AUD", "USD", "0.6543", { source: "JPM" });
 * const priced = schedule.price(cost, Money.of("70000", "AUD"));
 * priced.rate;   // AUD/USD client rate
 * priced.amount; // USD payout
 * priced.margin; // USD revenue
 */
export class MarkupSchedule {
  readonly base: CurrencyInfo;
  readonly mode: TierMode;
  private readonly tiers: ReadonlyArray<ResolvedTier>;

  private constructor(base: CurrencyInfo, tiers: ReadonlyArray<ResolvedTier>, mode: TierMode) {
    this.base = base;
    this.tiers = tiers;
    this.mode = mode;
    Object.freeze(this);
  }

  /** Build a schedule. Tiers must be given in increasing threshold order. */
  static of(
    base: CurrencyCodeInput,
    tiers: ReadonlyArray<MarkupTier>,
    options: { mode?: TierMode } = {},
  ): MarkupSchedule {
    if (tiers.length === 0) {
      throw new RangeError("A MarkupSchedule needs at least one tier.");
    }
    // Validate strictly increasing finite thresholds; only the last may be open.
    let previous = -1n;
    for (let i = 0; i < tiers.length; i++) {
      const { upTo } = tiers[i]!;
      if (upTo === undefined) {
        if (i !== tiers.length - 1) {
          throw new RangeError("Only the final tier may be open-ended (omit `upTo`).");
        }
        continue;
      }
      const value = parseScaled(upTo);
      const normalized = value.units * pow10(18 - value.scale); // compare on a common scale
      if (normalized <= previous) {
        throw new RangeError("Tier thresholds must be strictly increasing.");
      }
      previous = normalized;
    }
    // The final tier is always open-ended: it covers everything above the prior
    // threshold, so any `upTo` on it is ignored. This keeps progressive and flat
    // modes consistent and prevents the slice above the top threshold from being
    // left un-margined.
    const lastIndex = tiers.length - 1;
    const resolved: ResolvedTier[] = tiers.map((t, i) => {
      const markup = resolveMarkup(t.markup);
      return t.upTo !== undefined && i < lastIndex ? { upTo: t.upTo, markup } : { markup };
    });
    return new MarkupSchedule(getCurrency(base), resolved, options.mode ?? "progressive");
  }

  /** The effective margin for `baseAmount` (blended for progressive, looked-up for flat). */
  effectiveMarkup(baseAmount: Money): Markup {
    this.assertBase(baseAmount);
    if (!baseAmount.isPositive()) {
      throw new RangeError("Amount must be positive to resolve a tier.");
    }

    // Work in a common integer scale across the amount and all thresholds.
    const amt = baseAmount.unsafeScaled();
    const scales = [amt.scale, ...this.thresholdScales()];
    const w = Math.max(...scales);
    const amount = amt.units * pow10(w - amt.scale);
    const bounds = this.tiers.map((t) =>
      t.upTo === undefined ? null : scaleUnits(parseScaled(t.upTo), w),
    );

    if (this.mode === "flat") {
      for (let i = 0; i < this.tiers.length; i++) {
        const upper = bounds[i]!;
        if (upper === null || amount <= upper) return this.tiers[i]!.markup;
      }
      return this.tiers[this.tiers.length - 1]!.markup;
    }

    // Progressive: sum portion_i * f_i (as an exact fraction N/D), then divide by amount.
    let lower = 0n;
    let numerator = 0n; // running Σ portion·num/den as N/D
    let denominator = 1n;
    for (let i = 0; i < this.tiers.length; i++) {
      const upper = bounds[i]!;
      const top = upper === null ? amount : upper < amount ? upper : amount;
      const portion = top - lower;
      if (portion > 0n) {
        const { num, den } = this.tiers[i]!.markup.fraction();
        numerator = numerator * den + portion * num * denominator;
        denominator = denominator * den;
      }
      if (upper === null || upper >= amount) break;
      lower = upper;
    }
    // blended f = (N/D) / amount = N / (D · amount)
    return Markup.fromFraction(numerator, denominator * amount);
  }

  /** Resultant client rate (quote per 1 base) for `baseAmount` against `costRate`. */
  rateFor(costRate: FxRate, baseAmount: Money, options: PriceOptions = {}): FxRate {
    return this.price(costRate, baseAmount, options).rate;
  }

  /**
   * Price `baseAmount` through the schedule against a provider `costRate`,
   * returning the effective margin, resultant rate, converted amount and margin.
   */
  price(costRate: FxRate, baseAmount: Money, options: PriceOptions = {}): TieredPrice {
    this.assertBase(baseAmount);
    const quoteCode = this.quoteCodeOf(costRate);
    const markup = this.effectiveMarkup(baseAmount);

    const quote = Quote.forSellAmount(baseAmount, quoteCode, costRate, {
      markup,
      ...(options.mode !== undefined ? { mode: options.mode } : {}),
    });
    const rate = FxRate.of(this.base.code, quoteCode, quote.clientRate(options.decimals ?? 10), {
      source: "tiered-markup",
      markupBps: markup.asBps(),
    });
    return { markup, rate, amount: quote.buy, margin: quote.margin, quote };
  }

  private thresholdScales(): number[] {
    return this.tiers
      .filter((t) => t.upTo !== undefined)
      .map((t) => parseScaled(t.upTo as Numeric).scale);
  }

  private quoteCodeOf(costRate: FxRate): string {
    if (costRate.from.code === this.base.code) return costRate.to.code;
    if (costRate.to.code === this.base.code) return costRate.from.code;
    throw new FxRateMismatchError(
      `Cost rate ${costRate.from.code}/${costRate.to.code} does not involve base ${this.base.code}.`,
    );
  }

  private assertBase(amount: Money): void {
    if (amount.currency.code !== this.base.code) {
      throw new FxRateMismatchError(
        `Schedule base is ${this.base.code}; amount is ${amount.currency.code}.`,
      );
    }
  }
}

function scaleUnits(value: { units: bigint; scale: number }, toScale: number): bigint {
  return value.units * pow10(toScale - value.scale);
}
