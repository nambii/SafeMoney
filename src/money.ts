import {
  getCurrency,
  type CurrencyCodeInput,
  type CurrencyInfo,
} from "./currencies.js";
import {
  addScaled,
  compareScaled,
  multiplyScaled,
  parseScaled,
  pow10,
  rescale,
  scaledToString,
  signOf,
  subtractScaled,
  type Numeric,
  type Scaled,
} from "./decimal.js";
import {
  AllocationError,
  CurrencyMismatchError,
  RoundingNecessaryError,
} from "./errors.js";
import { formatMoney, type FormatOptions } from "./format.js";
import { divideRound, RoundingMode } from "./rounding.js";

/** Serialized form of a {@link Money}, safe to JSON.stringify and round-trip. */
export interface MoneyJSON {
  readonly amount: string;
  readonly currency: string;
}

/** Options accepted when constructing money via {@link Money.of}. */
export interface MoneyOptions {
  /**
   * If true, the parsed amount must fit exactly within the currency's minor
   * units (e.g. no sub-cent precision for USD), otherwise an error is thrown.
   * Defaults to false, which keeps extra precision exactly.
   */
  readonly exact?: boolean;
}

/**
 * An immutable monetary value: an exact decimal amount tagged with a currency.
 *
 * Amounts are stored as arbitrary-precision integers internally, so arithmetic
 * never incurs binary floating-point error. Operations that cannot be exact
 * (division, rounding, FX conversion) always take an explicit
 * {@link RoundingMode}.
 *
 * @example
 * Money.of("12.34", "AUD").add(Money.of("0.66", "AUD")).format();
 * // → "$13.00"
 */
export class Money {
  /** Currency metadata (code, decimals, name). */
  readonly currency: CurrencyInfo;

  // Exact amount as units * 10^(-scale). `scale` may exceed the currency's
  // minor-unit exponent when extra precision is retained (e.g. mid-conversion).
  private readonly value: Scaled;

  private constructor(value: Scaled, currency: CurrencyInfo) {
    this.value = value;
    this.currency = currency;
    Object.freeze(this);
  }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * Create money from a decimal amount and currency code.
   *
   * @example
   * Money.of("12.34", "AUD");
   * Money.of(1000n, "JPY");
   * Money.of("-0.005", "BHD"); // 3-dp currency
   */
  static of(amount: Numeric, code: CurrencyCodeInput, options: MoneyOptions = {}): Money {
    const currency = getCurrency(code);
    const parsed = parseScaled(amount);
    if (options.exact === true && parsed.scale > currency.decimals) {
      throw new RoundingNecessaryError(
        `Amount ${scaledToString(parsed)} has more precision than ${currency.code} allows (${currency.decimals} dp).`,
      );
    }
    return new Money(parsed, currency);
  }

  /**
   * Create money from an integer number of minor units (e.g. cents, fils).
   *
   * @example
   * Money.ofMinor(1234, "USD"); // → 12.34 USD
   * Money.ofMinor(1234n, "JPY"); // → 1234 JPY (0 dp)
   */
  static ofMinor(minorUnits: bigint | number | string, code: CurrencyCodeInput): Money {
    const currency = getCurrency(code);
    const units = typeof minorUnits === "bigint" ? minorUnits : parseIntegerStrict(minorUnits);
    return new Money({ units, scale: currency.decimals }, currency);
  }

  /** The additive identity for a currency (0 at the currency's minor scale). */
  static zero(code: CurrencyCodeInput): Money {
    const currency = getCurrency(code);
    return new Money({ units: 0n, scale: currency.decimals }, currency);
  }

  /** Reconstruct money from {@link Money.toJSON} output. */
  static fromJSON(json: MoneyJSON): Money {
    return Money.of(json.amount, json.currency);
  }

  /** Whether `value` is a Money instance. */
  static isMoney(value: unknown): value is Money {
    return value instanceof Money;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** The currency's ISO 4217 (or registered) code. */
  get code(): string {
    return this.currency.code;
  }

  /** Number of fractional digits currently retained (≥ currency.decimals possible). */
  get scale(): number {
    return this.value.scale;
  }

  /** The exact amount as a canonical decimal string (preserves its scale). */
  getAmount(): string {
    return scaledToString(this.value);
  }

  /**
   * The amount as an integer number of minor units.
   *
   * If the value carries more precision than the currency's minor unit, a
   * {@link RoundingMode} must be supplied; otherwise rounding is rejected.
   *
   * @example Money.of("12.34", "USD").toMinor() // → 1234n
   */
  toMinor(mode: RoundingMode = RoundingMode.UNNECESSARY): bigint {
    return rescale(this.value, this.currency.decimals, mode).units;
  }

  // ---------------------------------------------------------------------------
  // Arithmetic (exact unless a rounding mode is required)
  // ---------------------------------------------------------------------------

  /** Sum of two same-currency amounts (exact). */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(addScaled(this.value, other.value), this.currency);
  }

  /** Difference of two same-currency amounts (exact). */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(subtractScaled(this.value, other.value), this.currency);
  }

  /** Multiply by a scalar factor (exact; scale grows as needed). */
  multiply(factor: Numeric): Money {
    return new Money(multiplyScaled(this.value, parseScaled(factor)), this.currency);
  }

  /**
   * Divide by a scalar divisor, rounding the result to `decimals` fractional
   * digits (default: the currency's minor unit) using `mode`.
   */
  divide(
    divisor: Numeric,
    mode: RoundingMode,
    decimals: number = this.currency.decimals,
  ): Money {
    const d = parseScaled(divisor);
    if (d.units === 0n) {
      throw new RangeError("Division by zero");
    }
    // (a/10^sa) / (b/10^sb) rounded to `decimals` =
    //   round( a * 10^(decimals + sb) / (b * 10^sa) )
    const numerator = this.value.units * pow10(decimals + d.scale);
    const denominator = d.units * pow10(this.value.scale);
    const negDenominator = denominator < 0n;
    const units = divideRound(
      negDenominator ? -numerator : numerator,
      negDenominator ? -denominator : denominator,
      mode,
    );
    return new Money({ units, scale: decimals }, this.currency);
  }

  /** Negate the amount. */
  negate(): Money {
    return new Money({ units: -this.value.units, scale: this.value.scale }, this.currency);
  }

  /** Absolute value. */
  abs(): Money {
    const units = this.value.units < 0n ? -this.value.units : this.value.units;
    return new Money({ units, scale: this.value.scale }, this.currency);
  }

  /**
   * Round to `decimals` fractional digits (default: the currency's minor unit)
   * using `mode` (default HALF_EVEN, "banker's rounding").
   */
  round(
    mode: RoundingMode = RoundingMode.HALF_EVEN,
    decimals: number = this.currency.decimals,
  ): Money {
    return new Money(rescale(this.value, decimals, mode), this.currency);
  }

  // ---------------------------------------------------------------------------
  // Distribution
  // ---------------------------------------------------------------------------

  /**
   * Split the amount into shares proportional to `weights`, distributing any
   * leftover minor units by the largest-remainder method so that the parts sum
   * back to exactly the original amount — no money is created or destroyed.
   *
   * @example
   * Money.of("0.05", "USD").allocate([1, 1, 1]).map(m => m.getAmount());
   * // → ["0.02", "0.02", "0.01"]
   */
  allocate(weights: ReadonlyArray<Numeric>): Money[] {
    if (weights.length === 0) {
      throw new AllocationError("allocate() requires at least one weight.");
    }

    // Bring all weights to a common integer basis.
    const parsedWeights = weights.map((w) => parseScaled(w));
    const weightScale = parsedWeights.reduce((max, w) => Math.max(max, w.scale), 0);
    const intWeights = parsedWeights.map((w) => w.units * pow10(weightScale - w.scale));

    if (intWeights.some((w) => w < 0n)) {
      throw new AllocationError("allocate() weights must be non-negative.");
    }
    const totalWeight = intWeights.reduce((sum, w) => sum + w, 0n);
    if (totalWeight === 0n) {
      throw new AllocationError("allocate() weights must not all be zero.");
    }

    const negative = this.value.units < 0n;
    const total = negative ? -this.value.units : this.value.units;
    const scale = this.value.scale;

    const shares: bigint[] = [];
    let distributed = 0n;
    for (const w of intWeights) {
      const share = (total * w) / totalWeight; // floor for non-negatives
      shares.push(share);
      distributed += share;
    }

    // Hand out the remaining minor units to the largest fractional remainders.
    let remainder = total - distributed;
    const order = intWeights
      .map((w, index) => ({ index, frac: total * w - ((total * w) / totalWeight) * totalWeight }))
      .sort((a, b) => (a.frac < b.frac ? 1 : a.frac > b.frac ? -1 : a.index - b.index));

    for (const { index } of order) {
      if (remainder <= 0n) break;
      shares[index] = shares[index]! + 1n;
      remainder -= 1n;
    }

    return shares.map(
      (units) => new Money({ units: negative ? -units : units, scale }, this.currency),
    );
  }

  /** Split into `n` as-equal-as-possible parts (largest-remainder distribution). */
  split(n: number): Money[] {
    if (!Number.isInteger(n) || n <= 0) {
      throw new AllocationError("split() requires a positive integer count.");
    }
    return this.allocate(new Array(n).fill(1));
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  /** -1, 0, or 1 comparing this to `other` (same currency required). */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return compareScaled(this.value, other.value);
  }

  equals(other: Money): boolean {
    return this.currency.code === other.currency.code && compareScaled(this.value, other.value) === 0;
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  isZero(): boolean {
    return signOf(this.value) === 0;
  }

  isPositive(): boolean {
    return signOf(this.value) > 0;
  }

  isNegative(): boolean {
    return signOf(this.value) < 0;
  }

  /** The smaller of two same-currency amounts. */
  min(other: Money): Money {
    return this.lessThanOrEqual(other) ? this : other;
  }

  /** The larger of two same-currency amounts. */
  max(other: Money): Money {
    return this.greaterThanOrEqual(other) ? this : other;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** `{ amount, currency }` — stable and lossless. */
  toJSON(): MoneyJSON {
    return { amount: this.getAmount(), currency: this.currency.code };
  }

  /** Human-readable `"12.34 AUD"` (not localized — use `format()` for display). */
  toString(): string {
    return `${this.getAmount()} ${this.currency.code}`;
  }

  /**
   * Localized display string via `Intl.NumberFormat`.
   * @example Money.of("1234.5", "AUD").format({ locale: "en-AU" }) // "$1,234.50"
   */
  format(options?: FormatOptions): string {
    return formatMoney(this, options);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** @internal Exposes the raw scaled value to sibling modules (e.g. FX, format). */
  unsafeScaled(): Scaled {
    return this.value;
  }

  /** @internal Construct without re-parsing; used by sibling modules. */
  static unsafeOf(value: Scaled, currency: CurrencyInfo): Money {
    return new Money(value, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency.code !== other.currency.code) {
      throw new CurrencyMismatchError(this.currency.code, other.currency.code);
    }
  }
}

function parseIntegerStrict(value: number | string): bigint {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new RangeError(`Minor units must be an integer, received: ${value}`);
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new RangeError(`Minor units must be an integer string, received: "${value}"`);
  }
  return BigInt(trimmed);
}
