import { type CurrencyCodeInput, getCurrency } from "./currencies.js";
import { pow10 } from "./decimal.js";
import { FxRateMismatchError } from "./errors.js";
import type { FxRate } from "./fx.js";
import type { Money } from "./money.js";
import { Quote, type QuoteOptions } from "./quote.js";

/** Identifier of a liquidity provider, e.g. "JPM" or "CurrencyCloud". */
export type LiquidityProvider = string;

/**
 * A collection of cost rates from one or more liquidity providers. Unlike
 * {@link FxBoard} (which triangulates a single snapshot), a RateBook may hold
 * several competing rates for the same pair and selects the one giving the
 * customer the most favourable execution.
 *
 * @example
 * const book = new RateBook([
 *   FxRate.of("AUD", "USD", "0.6543", { source: "JPM" }),
 *   FxRate.of("AUD", "USD", "0.6545", { source: "CurrencyCloud" }),
 * ]);
 * book.best("AUD", "USD");                 // the 0.6545 (more USD per AUD)
 * book.quoteSell(Money.of("1000", "AUD"), "USD", { markup: Markup.bps(50) });
 */
export class RateBook {
  private readonly rates: FxRate[] = [];

  constructor(rates: ReadonlyArray<FxRate> = []) {
    for (const rate of rates) this.add(rate);
  }

  /** Add a rate (multiple per pair/provider are allowed). */
  add(rate: FxRate): this {
    this.rates.push(rate);
    return this;
  }

  /** All rates quoting the unordered pair `{from, to}`. */
  ratesFor(from: CurrencyCodeInput, to: CurrencyCodeInput): FxRate[] {
    const a = getCurrency(from).code;
    const b = getCurrency(to).code;
    return this.rates.filter(
      (r) => (r.from.code === a && r.to.code === b) || (r.from.code === b && r.to.code === a),
    );
  }

  /** Distinct providers represented in the book. */
  providers(): LiquidityProvider[] {
    const set = new Set<string>();
    for (const r of this.rates) if (r.provider) set.add(r.provider);
    return [...set].sort();
  }

  /**
   * The rate giving the most `buy` per unit `sell` (best execution for the
   * customer). Throws {@link FxRateMismatchError} if no rate quotes the pair.
   */
  best(sellCode: CurrencyCodeInput, buyCode: CurrencyCodeInput): FxRate {
    const sell = getCurrency(sellCode).code;
    const buy = getCurrency(buyCode).code;

    let winner: FxRate | undefined;
    let bestNum = 0n;
    let bestDen = 1n;
    for (const r of this.ratesFor(sell, buy)) {
      // Express each candidate as buy-per-sell = num/den.
      const rate = r.unsafeRate();
      const num = r.from.code === sell ? rate.units : pow10(rate.scale);
      const den = r.from.code === sell ? pow10(rate.scale) : rate.units;
      // Compare num/den > bestNum/bestDen via cross-multiplication (all positive).
      if (winner === undefined || num * bestDen > bestNum * den) {
        winner = r;
        bestNum = num;
        bestDen = den;
      }
    }
    if (winner === undefined) {
      throw new FxRateMismatchError(`No rate available for ${sell}->${buy}.`);
    }
    return winner;
  }

  /** Quote a fixed pay-in amount using the best available rate. */
  quoteSell(sell: Money, buyCurrency: CurrencyCodeInput, options?: QuoteOptions): Quote {
    return Quote.forSellAmount(
      sell,
      buyCurrency,
      this.best(sell.currency.code, buyCurrency),
      options,
    );
  }

  /** Quote a fixed payout amount using the best available rate. */
  quoteBuy(buy: Money, sellCurrency: CurrencyCodeInput, options?: QuoteOptions): Quote {
    return Quote.forBuyAmount(
      buy,
      sellCurrency,
      this.best(sellCurrency, buy.currency.code),
      options,
    );
  }
}
