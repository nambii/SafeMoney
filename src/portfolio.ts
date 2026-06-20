import { getCurrency, type CurrencyCodeInput } from "./currencies.js";
import type { ConvertOptions, FxBoard } from "./fx.js";
import { Money, type MoneyJSON } from "./money.js";

/**
 * An immutable bag of money across multiple currencies. Balances in the same
 * currency are summed; each operation returns a new Portfolio.
 *
 * @example
 * const p = Portfolio.of(Money.of("100.00", "AUD"), Money.of("50.00", "USD"))
 *   .add(Money.of("25.00", "AUD"));
 * p.balance("AUD"); // 125.00 AUD
 * p.valuate("USD", board); // total value in USD via the FX board
 */
export class Portfolio {
  // code -> summed Money for that currency.
  private readonly entries: ReadonlyMap<string, Money>;

  private constructor(entries: ReadonlyMap<string, Money>) {
    this.entries = entries;
    Object.freeze(this);
  }

  /** Build from an iterable of amounts (same-currency amounts are summed). */
  static from(monies: Iterable<Money> = []): Portfolio {
    const map = new Map<string, Money>();
    for (const money of monies) {
      const existing = map.get(money.currency.code);
      map.set(money.currency.code, existing ? existing.add(money) : money);
    }
    return new Portfolio(map);
  }

  /** Build from a list of amounts. */
  static of(...monies: Money[]): Portfolio {
    return Portfolio.from(monies);
  }

  /** Reconstruct from {@link Portfolio.toJSON} output. */
  static fromJSON(json: ReadonlyArray<MoneyJSON>): Portfolio {
    return Portfolio.from(json.map(Money.fromJSON));
  }

  /** Add an amount, returning a new Portfolio. */
  add(money: Money): Portfolio {
    const next = new Map(this.entries);
    const existing = next.get(money.currency.code);
    next.set(money.currency.code, existing ? existing.add(money) : money);
    return new Portfolio(next);
  }

  /** Subtract an amount, returning a new Portfolio (balances may go negative). */
  subtract(money: Money): Portfolio {
    return this.add(money.negate());
  }

  /** Add every amount in `monies`, returning a new Portfolio. */
  addAll(monies: Iterable<Money>): Portfolio {
    let result: Portfolio = this;
    for (const money of monies) result = result.add(money);
    return result;
  }

  /** The balance in `code`, or zero of that currency if none is held. */
  balance(code: CurrencyCodeInput): Money {
    return this.entries.get(getCurrency(code).code) ?? Money.zero(code);
  }

  /** Whether any (including zero) balance is held in `code`. */
  has(code: CurrencyCodeInput): boolean {
    return this.entries.has(getCurrency(code).code);
  }

  /** Held currency codes, sorted. */
  currencies(): string[] {
    return [...this.entries.keys()].sort();
  }

  /** All held balances, ordered by currency code. */
  balances(): Money[] {
    return this.currencies().map((code) => this.entries.get(code)!);
  }

  /** Whether the portfolio holds no balances at all. */
  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  /** Whether every held balance is zero (or the portfolio is empty). */
  isZero(): boolean {
    return this.balances().every((m) => m.isZero());
  }

  /** Drop zero balances, returning a new Portfolio. */
  compact(): Portfolio {
    const next = new Map<string, Money>();
    for (const [code, money] of this.entries) {
      if (!money.isZero()) next.set(code, money);
    }
    return new Portfolio(next);
  }

  /**
   * Total value in `base`, converting every balance through the FX `board`.
   * Conversion options (rounding, freshness) are applied to each leg.
   */
  valuate(base: CurrencyCodeInput, board: FxBoard, options: ConvertOptions = {}): Money {
    const code = getCurrency(base).code;
    const converted = this.balances().map((money) => board.convert(money, code, options));
    return Money.sum(converted, code);
  }

  /** Array of `{ amount, currency }`, ordered by currency code. */
  toJSON(): MoneyJSON[] {
    return this.balances().map((money) => money.toJSON());
  }

  toString(): string {
    return this.isEmpty()
      ? "Portfolio()"
      : `Portfolio(${this.balances().map((m) => m.toString()).join(", ")})`;
  }
}
