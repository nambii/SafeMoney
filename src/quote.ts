import { type CurrencyCodeInput, type CurrencyInfo, getCurrency } from "./currencies.js";
import { pow10, type Scaled, scaledToString } from "./decimal.js";
import { FxRateMismatchError, QuoteExpiredError } from "./errors.js";
import { type Duration, type FxRate, toMillis } from "./fx.js";
import { type Markup, type MarkupLike, resolveMarkup } from "./markup.js";
import { Money } from "./money.js";
import { divideRound, RoundingMode } from "./rounding.js";
import { Trade } from "./trade.js";

/** Options shared by the quote factories. */
export interface QuoteOptions {
  /** Margin applied to the cost rate — one {@link Markup} or several (combined additively). */
  readonly markup?: MarkupLike;
  /** Rounding used when reducing computed amounts to a currency's minor unit. Default HALF_EVEN. */
  readonly mode?: RoundingMode;
  /** Absolute expiry. Takes precedence over `ttl`. */
  readonly expiresAt?: Date;
  /** Relative validity window from `createdAt` (e.g. "30s", "5m"). */
  readonly ttl?: Duration;
  /** Quote creation time (defaults to now). */
  readonly createdAt?: Date;
  /** Quote identifier. */
  readonly id?: string;
  /** Liquidity provider (defaults to `costRate.provider`). */
  readonly provider?: string;
}

/** Serialized form of a {@link Quote}. */
export interface QuoteJSON {
  readonly id: string | undefined;
  readonly sell: { amount: string; currency: string };
  readonly buy: { amount: string; currency: string };
  readonly margin: { amount: string; currency: string };
  readonly markupBps: number;
  readonly costRate: { from: string; to: string; rate: string };
  readonly provider: string | undefined;
  readonly fixed: "sell" | "buy";
  readonly createdAt: string;
  readonly expiresAt: string | undefined;
}

/**
 * A customer-facing price derived from a liquidity provider's cost rate plus a
 * {@link Markup}. Holds both legs of the deal — what the customer pays in
 * (`sell`) and what the beneficiary receives (`buy`) — the booked `margin`
 * (house revenue), and an optional validity window.
 *
 * Create it by fixing one side; the other is computed:
 * - {@link Quote.forSellAmount} — "customer sends exactly X".
 * - {@link Quote.forBuyAmount} — "beneficiary receives exactly Y".
 *
 * @example
 * const cost = FxRate.of("AUD", "USD", "0.6543", { source: "JPM" });
 * const q = Quote.forSellAmount(Money.of("1000.00", "AUD"), "USD", cost, {
 *   markup: Markup.bps(50),
 *   ttl: "30s",
 * });
 * q.buy;    // payout in USD
 * q.margin; // house revenue
 * const trade = q.accept();
 */
export class Quote {
  readonly id: string | undefined;
  /** Amount the customer pays in. */
  readonly sell: Money;
  /** Amount the beneficiary receives. */
  readonly buy: Money;
  /** Booked margin (in the buy currency for fixed-sell, the sell currency for fixed-buy). */
  readonly margin: Money;
  /** The liquidity provider's cost rate this quote was priced from. */
  readonly costRate: FxRate;
  readonly markup: Markup;
  readonly provider: string | undefined;
  /** Which side was fixed when the quote was created. */
  readonly fixed: "sell" | "buy";
  readonly createdAt: Date;
  readonly expiresAt: Date | undefined;

  private constructor(params: {
    id: string | undefined;
    sell: Money;
    buy: Money;
    margin: Money;
    costRate: FxRate;
    markup: Markup;
    provider: string | undefined;
    fixed: "sell" | "buy";
    createdAt: Date;
    expiresAt: Date | undefined;
  }) {
    this.id = params.id;
    this.sell = params.sell;
    this.buy = params.buy;
    this.margin = params.margin;
    this.costRate = params.costRate;
    this.markup = params.markup;
    this.provider = params.provider;
    this.fixed = params.fixed;
    this.createdAt = params.createdAt;
    this.expiresAt = params.expiresAt;
    Object.freeze(this);
  }

  /** Quote for a fixed pay-in amount: the customer sends exactly `sell`. */
  static forSellAmount(
    sell: Money,
    buyCurrency: CurrencyCodeInput,
    costRate: FxRate,
    options: QuoteOptions = {},
  ): Quote {
    if (!sell.isPositive()) throw new RangeError("Quote sell amount must be positive.");
    const buyInfo = getCurrency(buyCurrency);
    const { forward } = classify(costRate, sell.currency.code, buyInfo.code);
    const r = costRate.unsafeRate();
    const s = sell.unsafeScaled();
    const markup = resolveMarkup(options.markup);
    const { num: kN, den: kD } = markup.retention();
    const mode = options.mode ?? RoundingMode.HALF_EVEN;

    // buy = sell × rate × k  (forward) | sell × k ÷ rate (reverse)
    const buy = forward
      ? rationalMoney(s.units * r.units * kN, pow10(s.scale + r.scale) * kD, buyInfo, mode)
      : rationalMoney(s.units * kN * pow10(r.scale), pow10(s.scale) * kD * r.units, buyInfo, mode);
    const buyAtCost = forward
      ? rationalMoney(s.units * r.units, pow10(s.scale + r.scale), buyInfo, mode)
      : rationalMoney(s.units * pow10(r.scale), pow10(s.scale) * r.units, buyInfo, mode);

    return Quote.build(sell, buy, buyAtCost.subtract(buy), costRate, "sell", markup, options);
  }

  /** Quote for a fixed payout amount: the beneficiary receives exactly `buy`. */
  static forBuyAmount(
    buy: Money,
    sellCurrency: CurrencyCodeInput,
    costRate: FxRate,
    options: QuoteOptions = {},
  ): Quote {
    if (!buy.isPositive()) throw new RangeError("Quote buy amount must be positive.");
    const sellInfo = getCurrency(sellCurrency);
    const { forward } = classify(costRate, sellInfo.code, buy.currency.code);
    const r = costRate.unsafeRate();
    const b = buy.unsafeScaled();
    const markup = resolveMarkup(options.markup);
    const { num: kN, den: kD } = markup.retention();
    const mode = options.mode ?? RoundingMode.HALF_EVEN;

    // sell = buy ÷ (rate × k) (forward) | buy × rate ÷ k (reverse)
    const sell = forward
      ? rationalMoney(b.units * pow10(r.scale) * kD, pow10(b.scale) * r.units * kN, sellInfo, mode)
      : rationalMoney(b.units * r.units * kD, pow10(b.scale + r.scale) * kN, sellInfo, mode);
    const sellAtCost = forward
      ? rationalMoney(b.units * pow10(r.scale), pow10(b.scale) * r.units, sellInfo, mode)
      : rationalMoney(b.units * r.units, pow10(b.scale + r.scale), sellInfo, mode);

    return Quote.build(sell, buy, sell.subtract(sellAtCost), costRate, "buy", markup, options);
  }

  private static build(
    sell: Money,
    buy: Money,
    margin: Money,
    costRate: FxRate,
    fixed: "sell" | "buy",
    markup: Markup,
    options: QuoteOptions,
  ): Quote {
    const createdAt = options.createdAt ?? new Date();
    const expiresAt =
      options.expiresAt ??
      (options.ttl !== undefined
        ? new Date(createdAt.getTime() + toMillis(options.ttl))
        : undefined);
    return new Quote({
      id: options.id,
      sell,
      buy,
      margin,
      costRate,
      markup,
      provider: options.provider ?? costRate.provider,
      fixed,
      createdAt,
      expiresAt,
    });
  }

  /** The effective customer rate (buy units per 1 sell unit) to `decimals` places. */
  clientRate(decimals = 10): string {
    const s = this.sell.unsafeScaled();
    const b = this.buy.unsafeScaled();
    const units = divideRound(
      b.units * pow10(s.scale + decimals),
      s.units * pow10(b.scale),
      RoundingMode.HALF_EVEN,
    );
    return scaledToString({ units, scale: decimals });
  }

  /** Whether the quote's validity window has passed (always false if no expiry). */
  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt !== undefined && now.getTime() > this.expiresAt.getTime();
  }

  /**
   * Convert the quote into a {@link Trade}. Throws {@link QuoteExpiredError} if
   * the quote has expired as of `executedAt`.
   */
  accept(options: { id?: string; executedAt?: Date } = {}): Trade {
    const executedAt = options.executedAt ?? new Date();
    if (this.isExpired(executedAt)) {
      throw new QuoteExpiredError(
        `Quote ${this.id ?? "(anonymous)"} expired at ${this.expiresAt?.toISOString()}.`,
      );
    }
    return Trade.of({
      payIn: this.sell,
      payOut: this.buy,
      margin: this.margin,
      rate: this.costRate,
      provider: this.provider,
      executedAt,
      quoteId: this.id,
      id: options.id,
    });
  }

  toJSON(): QuoteJSON {
    return {
      id: this.id,
      sell: this.sell.toJSON(),
      buy: this.buy.toJSON(),
      margin: this.margin.toJSON(),
      markupBps: this.markup.asBps(),
      costRate: {
        from: this.costRate.from.code,
        to: this.costRate.to.code,
        rate: this.costRate.rate,
      },
      provider: this.provider,
      fixed: this.fixed,
      createdAt: this.createdAt.toISOString(),
      expiresAt: this.expiresAt?.toISOString(),
    };
  }

  toString(): string {
    return `Quote(${this.sell.toString()} → ${this.buy.toString()} @ ${this.clientRate()}, margin ${this.margin.toString()})`;
  }
}

// Determine whether the sell currency is the base (from) of the cost rate.
function classify(costRate: FxRate, sellCode: string, buyCode: string): { forward: boolean } {
  const from = costRate.from.code;
  const to = costRate.to.code;
  if (sellCode === from && buyCode === to) return { forward: true };
  if (sellCode === to && buyCode === from) return { forward: false };
  throw new FxRateMismatchError(`Cost rate ${from}/${to} cannot price ${sellCode}->${buyCode}.`);
}

// Build a Money of `currency` from the exact rational value P/Q, rounded to the
// currency's minor unit.
function rationalMoney(P: bigint, Q: bigint, currency: CurrencyInfo, mode: RoundingMode): Money {
  const negative = P < 0n !== Q < 0n;
  const p = P < 0n ? -P : P;
  const q = Q < 0n ? -Q : Q;
  const units = divideRound(p * pow10(currency.decimals), q, mode);
  const value: Scaled = { units: negative ? -units : units, scale: currency.decimals };
  return Money.unsafeOf(value, currency);
}
