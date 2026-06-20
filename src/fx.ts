import {
  getCurrency,
  type CurrencyCodeInput,
  type CurrencyInfo,
} from "./currencies.js";
import {
  multiplyScaled,
  parseScaled,
  pow10,
  rescale,
  scaledToString,
  type Numeric,
  type Scaled,
} from "./decimal.js";
import { FxRateMismatchError, MoneyError } from "./errors.js";
import { Money } from "./money.js";
import { divideRound, RoundingMode } from "./rounding.js";

/** Provenance metadata attached to an exchange rate. */
export interface FxMetadata {
  /** Where the rate came from, e.g. "ECB", "internal-desk", "Bloomberg". */
  readonly source?: string;
  /** When the rate was observed. */
  readonly asOf?: Date;
  /** Optional free-form tags, e.g. tier, dealer, or quote id. */
  readonly [key: string]: unknown;
}

/** Options for applying a rate to a money value. */
export interface ConvertOptions {
  /** Rounding applied when reducing to the target currency's minor unit. Default HALF_EVEN. */
  readonly mode?: RoundingMode;
  /** Override the number of fractional digits in the result. Default: target currency decimals. */
  readonly decimals?: number;
}

/** The result of a conversion, including the rate and metadata that produced it. */
export interface FxConversion {
  readonly from: Money;
  readonly to: Money;
  readonly rate: FxRate;
}

/**
 * A directed exchange rate `from → to` with optional provenance metadata.
 * 1 unit of `from` equals `rate` units of `to`.
 *
 * @example
 * const r = FxRate.of("AUD", "USD", "0.6543", { source: "ECB", asOf: new Date() });
 * r.convert(Money.of("100.00", "AUD")); // → 65.43 USD
 */
export class FxRate {
  readonly from: CurrencyInfo;
  readonly to: CurrencyInfo;
  readonly metadata: FxMetadata;

  // Exact rate value, kept at full precision.
  private readonly rateValue: Scaled;

  private constructor(from: CurrencyInfo, to: CurrencyInfo, rate: Scaled, metadata: FxMetadata) {
    this.from = from;
    this.to = to;
    this.rateValue = rate;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  /** Build a rate from currency codes and a decimal rate value. */
  static of(
    from: CurrencyCodeInput,
    to: CurrencyCodeInput,
    rate: Numeric,
    metadata: FxMetadata = {},
  ): FxRate {
    const parsed = parseScaled(rate);
    if (parsed.units <= 0n) {
      throw new MoneyError(`Exchange rate must be positive, received: ${scaledToString(parsed)}`);
    }
    return new FxRate(getCurrency(from), getCurrency(to), parsed, metadata);
  }

  /** The rate as a canonical decimal string. */
  get rate(): string {
    return scaledToString(this.rateValue);
  }

  /** Convert a `from`-currency amount into the `to` currency. */
  convert(money: Money, options: ConvertOptions = {}): Money {
    if (money.currency.code !== this.from.code) {
      throw new FxRateMismatchError(
        `Rate ${this.from.code}->${this.to.code} cannot convert ${money.currency.code}.`,
      );
    }
    const mode = options.mode ?? RoundingMode.HALF_EVEN;
    const decimals = options.decimals ?? this.to.decimals;
    const product = multiplyScaled(money.unsafeScaled(), this.rateValue);
    const rounded = rescale(product, decimals, mode);
    return Money.unsafeOf(rounded, this.to);
  }

  /** Convert and return the rate/metadata alongside the result for audit trails. */
  convertWithDetails(money: Money, options: ConvertOptions = {}): FxConversion {
    return { from: money, to: this.convert(money, options), rate: this };
  }

  /**
   * The inverse rate `to → from`, computed to `decimals` fractional digits
   * (default 12) using `mode` (default HALF_EVEN). Metadata is carried over and
   * marked as derived.
   */
  inverse(decimals = 12, mode: RoundingMode = RoundingMode.HALF_EVEN): FxRate {
    // 1 / rate, scaled to `decimals` places.
    const numerator = pow10(decimals + this.rateValue.scale);
    const units = divideRound(numerator, this.rateValue.units, mode);
    return new FxRate(this.to, this.from, { units, scale: decimals }, {
      ...this.metadata,
      derivedFrom: `${this.from.code}/${this.to.code}`,
    });
  }

  toString(): string {
    return `${this.from.code}/${this.to.code} @ ${this.rate}`;
  }
}

/**
 * A small in-memory board of exchange rates. Looks up a direct rate, falls back
 * to the inverse of the opposite pair, and supports triangulation through a
 * pivot currency (default USD). Convenient for converting across many pairs
 * from a single rate snapshot.
 */
export class FxBoard {
  private readonly rates = new Map<string, FxRate>();
  private readonly pivot: string;

  constructor(rates: ReadonlyArray<FxRate> = [], options: { pivot?: CurrencyCodeInput } = {}) {
    this.pivot = options.pivot ? getCurrency(options.pivot).code : "USD";
    for (const rate of rates) this.add(rate);
  }

  /** Add or replace a rate (and make its inverse available implicitly). */
  add(rate: FxRate): this {
    this.rates.set(key(rate.from.code, rate.to.code), rate);
    return this;
  }

  /** Find a rate for `from → to`: direct, inverse, or triangulated via the pivot. */
  getRate(from: CurrencyCodeInput, to: CurrencyCodeInput): FxRate {
    const f = getCurrency(from).code;
    const t = getCurrency(to).code;
    if (f === t) {
      return FxRate.of(f, t, "1", { source: "identity" });
    }
    const direct = this.rates.get(key(f, t));
    if (direct) return direct;

    const reverse = this.rates.get(key(t, f));
    if (reverse) return reverse.inverse();

    // Triangulate: from -> pivot -> to.
    const legA = this.leg(f, this.pivot);
    const legB = this.leg(this.pivot, t);
    if (legA && legB) {
      const crossed = parseScaled(legA.rate);
      const product = multiplyScaled(crossed, parseScaled(legB.rate));
      return FxRate.of(f, t, scaledToString(product), {
        source: "triangulated",
        via: this.pivot,
      });
    }
    throw new FxRateMismatchError(`No rate available for ${f}->${t} (pivot ${this.pivot}).`);
  }

  /** Convert money to `to` using the best available rate. */
  convert(money: Money, to: CurrencyCodeInput, options: ConvertOptions = {}): Money {
    return this.getRate(money.currency.code, to).convert(money, options);
  }

  /** A single leg `from → to`: the direct rate, or the inverse of `to → from`. */
  private leg(from: string, to: string): FxRate | undefined {
    const direct = this.rates.get(key(from, to));
    if (direct) return direct;
    const reverse = this.rates.get(key(to, from));
    return reverse ? reverse.inverse() : undefined;
  }
}

function key(from: string, to: string): string {
  return `${from}->${to}`;
}
