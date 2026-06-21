import type { FxRate } from "./fx.js";
import { Money, type MoneyJSON } from "./money.js";
import { Portfolio } from "./portfolio.js";

/** The data needed to construct a {@link Trade}. */
export interface TradeParams {
  /** Amount received from the customer (the sell currency). */
  readonly payIn: Money;
  /** Amount paid out to the beneficiary (the buy currency). */
  readonly payOut: Money;
  /** Booked margin (house revenue) for this trade. */
  readonly margin: Money;
  /** The cost rate the trade was executed against. */
  readonly rate: FxRate;
  /** Liquidity provider the trade is executed with (defaults to `rate.provider`). */
  readonly provider?: string | undefined;
  /** When the trade was executed (defaults to now). */
  readonly executedAt?: Date | undefined;
  /** Identifier of the originating quote, if any. */
  readonly quoteId?: string | undefined;
  /** Trade identifier, if any. */
  readonly id?: string | undefined;
}

/** Serialized form of a {@link Trade}. */
export interface TradeJSON {
  readonly id: string | undefined;
  readonly payIn: MoneyJSON;
  readonly payOut: MoneyJSON;
  readonly margin: MoneyJSON;
  readonly rate: { from: string; to: string; rate: string };
  readonly provider: string | undefined;
  readonly executedAt: string;
  readonly quoteId: string | undefined;
}

/**
 * An executed conversion: what was received from the customer (`payIn`), what
 * was paid out to the beneficiary (`payOut`), the cost `rate` it was dealt at,
 * and the booked `margin`. A pure value object — lifecycle/status and
 * persistence belong to the application.
 */
export class Trade {
  readonly id: string | undefined;
  readonly payIn: Money;
  readonly payOut: Money;
  readonly margin: Money;
  readonly rate: FxRate;
  readonly provider: string | undefined;
  readonly executedAt: Date;
  readonly quoteId: string | undefined;

  private constructor(params: TradeParams) {
    this.id = params.id;
    this.payIn = params.payIn;
    this.payOut = params.payOut;
    this.margin = params.margin;
    this.rate = params.rate;
    this.provider = params.provider ?? params.rate.provider;
    this.executedAt = params.executedAt ?? new Date();
    this.quoteId = params.quoteId;
    Object.freeze(this);
  }

  static of(params: TradeParams): Trade {
    return new Trade(params);
  }

  /** Aggregate booked margin across many trades into a per-currency Portfolio. */
  static totalMargin(trades: ReadonlyArray<Trade>): Portfolio {
    return Portfolio.from(trades.map((t) => t.margin));
  }

  toJSON(): TradeJSON {
    return {
      id: this.id,
      payIn: this.payIn.toJSON(),
      payOut: this.payOut.toJSON(),
      margin: this.margin.toJSON(),
      rate: { from: this.rate.from.code, to: this.rate.to.code, rate: this.rate.rate },
      provider: this.provider,
      executedAt: this.executedAt.toISOString(),
      quoteId: this.quoteId,
    };
  }

  toString(): string {
    return `Trade(${this.payIn.toString()} → ${this.payOut.toString()}, margin ${this.margin.toString()})`;
  }
}
