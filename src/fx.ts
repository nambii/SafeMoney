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
import { FxRateMismatchError, MoneyError, StaleRateError } from "./errors.js";
import { Money } from "./money.js";
import { divideRound, RoundingMode } from "./rounding.js";

/** A duration in milliseconds, or a short string like "500ms", "30s", "5m", "2h", "1d". */
export type Duration = number | string;

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parse a {@link Duration} into milliseconds. */
export function toMillis(duration: Duration): number {
  if (typeof duration === "number") {
    if (!Number.isFinite(duration) || duration < 0) {
      throw new RangeError(`Invalid duration: ${duration}`);
    }
    return duration;
  }
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(duration.trim());
  if (match === null) {
    throw new RangeError(`Invalid duration string: "${duration}" (use e.g. "500ms", "5m", "2h").`);
  }
  return Number.parseFloat(match[1]!) * DURATION_UNITS[match[2]!]!;
}

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
  /**
   * Reject the conversion if the rate's `asOf` is older than this window
   * (or if it has no `asOf`). Throws {@link StaleRateError}.
   */
  readonly maxAge?: Duration;
  /** Reference "now" for the staleness check. Defaults to the current time. */
  readonly now?: Date;
}

/** The result of a conversion, including the rate and metadata that produced it. */
export interface FxConversion {
  readonly from: Money;
  readonly to: Money;
  readonly rate: FxRate;
  /** Which leg of the pair was applied: "forward" (base→quote) or "reverse" (quote→base). */
  readonly direction: "forward" | "reverse";
}

/**
 * An exchange rate for the unordered pair `{from, to}` with optional provenance
 * metadata. The stored price means 1 unit of `from` equals `rate` units of `to`,
 * but conversion works in **either** direction: a rate involving AUD/USD accepts
 * AUD or USD and nothing else. Reverse conversions apply the exact inverse, so
 * the single rate is treated as a mid/reference rate (no bid/ask spread).
 *
 * @example
 * const r = FxRate.of("AUD", "USD", "0.6543", { source: "ECB", asOf: new Date() });
 * r.convert(Money.of("100.00", "AUD")); // → 65.43 USD   (forward)
 * r.convert(Money.of("100.00", "USD")); // → 152.84 AUD  (reverse, exact inverse)
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

  /** The liquidity provider / source, if tagged in metadata (e.g. "JPM"). */
  get provider(): string | undefined {
    return this.metadata.source;
  }

  /** @internal Exact rate value (quote units per 1 base unit). */
  unsafeRate(): Scaled {
    return this.rateValue;
  }

  /**
   * Convert an amount in either currency of the pair. Passing the `from`
   * currency multiplies by the rate (forward); passing the `to` currency
   * applies the exact inverse (reverse). Any other currency is rejected, so a
   * rate involving AUD/USD only ever accepts AUD or USD.
   */
  convert(money: Money, options: ConvertOptions = {}): Money {
    if (options.maxAge !== undefined) {
      this.assertFresh(options.maxAge, options.now);
    }
    const mode = options.mode ?? RoundingMode.HALF_EVEN;
    const code = money.currency.code;

    if (code === this.from.code) {
      const decimals = options.decimals ?? this.to.decimals;
      const product = multiplyScaled(money.unsafeScaled(), this.rateValue);
      return Money.unsafeOf(rescale(product, decimals, mode), this.to);
    }

    if (code === this.to.code) {
      const decimals = options.decimals ?? this.from.decimals;
      const value = money.unsafeScaled();
      // (value / rate) rounded to `decimals` = round(value * 10^(rateScale+decimals) / (rateUnits * 10^valueScale))
      const numerator = value.units * pow10(this.rateValue.scale + decimals);
      const denominator = this.rateValue.units * pow10(value.scale);
      const units = divideRound(numerator, denominator, mode);
      return Money.unsafeOf({ units, scale: decimals }, this.from);
    }

    throw new FxRateMismatchError(
      `Rate ${this.from.code}/${this.to.code} only converts ${this.from.code} or ${this.to.code}, received ${code}.`,
    );
  }

  /** Convert and return the rate, direction, and metadata for audit trails. */
  convertWithDetails(money: Money, options: ConvertOptions = {}): FxConversion {
    const direction = money.currency.code === this.from.code ? "forward" : "reverse";
    return { from: money, to: this.convert(money, options), rate: this, direction };
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

  // ---------------------------------------------------------------------------
  // Freshness
  // ---------------------------------------------------------------------------

  /** When the rate was observed, if `asOf` metadata was provided. */
  get asOf(): Date | undefined {
    return this.metadata.asOf;
  }

  /** Milliseconds since the rate was observed, or `undefined` if it has no `asOf`. */
  age(now: Date = new Date()): number | undefined {
    return this.asOf ? now.getTime() - this.asOf.getTime() : undefined;
  }

  /** Whether the rate is older than `maxAge`. A rate with no `asOf` is always stale. */
  isStale(maxAge: Duration, now?: Date): boolean {
    const age = this.age(now);
    return age === undefined || age > toMillis(maxAge);
  }

  /** Throw {@link StaleRateError} if the rate is older than `maxAge` (or has no `asOf`). */
  assertFresh(maxAge: Duration, now?: Date): void {
    const age = this.age(now);
    if (age === undefined) {
      throw new StaleRateError(
        `Rate ${this.from.code}/${this.to.code} has no asOf timestamp; cannot verify freshness.`,
      );
    }
    const limit = toMillis(maxAge);
    if (age > limit) {
      throw new StaleRateError(
        `Rate ${this.from.code}/${this.to.code} is stale: age ${age}ms exceeds ${limit}ms.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Pip math
  // ---------------------------------------------------------------------------

  /** Conventional pip decimal place: 2 for JPY-quoted pairs, 4 otherwise. */
  pipExponent(): number {
    return this.to.code === "JPY" ? 2 : 4;
  }

  /** The size of one pip for this pair as a decimal string (e.g. "0.0001", "0.01"). */
  pipSize(): string {
    return scaledToString({ units: 1n, scale: this.pipExponent() });
  }

  /** Signed pip distance from this rate to `other` (must be the same pair). */
  pipsTo(other: FxRate): number {
    this.assertSamePair(other);
    const scale = Math.max(this.rateValue.scale, other.rateValue.scale);
    const diff =
      other.rateValue.units * pow10(scale - other.rateValue.scale) -
      this.rateValue.units * pow10(scale - this.rateValue.scale);
    return Number(diff) / 10 ** (scale - this.pipExponent());
  }

  /** A new rate shifted by `n` pips (fractional pips allowed). */
  addPips(n: Numeric): FxRate {
    const pip: Scaled = { units: 1n, scale: this.pipExponent() };
    const delta = multiplyScaled(parseScaled(n), pip);
    const scale = Math.max(this.rateValue.scale, delta.scale);
    const units =
      this.rateValue.units * pow10(scale - this.rateValue.scale) +
      delta.units * pow10(scale - delta.scale);
    return FxRate.of(this.from.code, this.to.code, scaledToString({ units, scale }), {
      ...this.metadata,
      derivedFrom: `${this.from.code}/${this.to.code}`,
    });
  }

  /**
   * Value of one pip for a `notional` in the base currency, expressed in the
   * quote currency (rounded to its minor unit). E.g. 100,000 AUD on AUD/USD →
   * 10.00 USD per pip.
   */
  pipValue(notional: Money, mode: RoundingMode = RoundingMode.HALF_EVEN): Money {
    if (notional.currency.code !== this.from.code) {
      throw new FxRateMismatchError(
        `pipValue expects a ${this.from.code} notional, received ${notional.currency.code}.`,
      );
    }
    const pip: Scaled = { units: 1n, scale: this.pipExponent() };
    const value = multiplyScaled(notional.unsafeScaled(), pip);
    return Money.unsafeOf(rescale(value, this.to.decimals, mode), this.to);
  }

  toString(): string {
    return `${this.from.code}/${this.to.code} @ ${this.rate}`;
  }

  private assertSamePair(other: FxRate): void {
    if (other.from.code !== this.from.code || other.to.code !== this.to.code) {
      throw new FxRateMismatchError(
        `Pair mismatch: ${this.from.code}/${this.to.code} vs ${other.from.code}/${other.to.code}.`,
      );
    }
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
