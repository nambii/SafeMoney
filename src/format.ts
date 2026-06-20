import type { Money } from "./money.js";

/** Options for {@link formatMoney} / {@link Money} display. */
export interface FormatOptions {
  /** BCP-47 locale (e.g. "en-AU", "de-DE"). Defaults to the runtime locale. */
  readonly locale?: string;
  /** How to show the currency: symbol (default), narrow symbol, ISO code, or name. */
  readonly currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  /** Minimum fraction digits. Defaults to the currency's minor unit. */
  readonly minimumFractionDigits?: number;
  /** Maximum fraction digits. Defaults to the currency's minor unit. */
  readonly maximumFractionDigits?: number;
  /** Whether to group thousands (default true). */
  readonly useGrouping?: boolean;
  /** "auto" (default) or "always" to force a sign even for positives. */
  readonly signDisplay?: "auto" | "always" | "exceptZero" | "never";
}

/**
 * Format money for display using `Intl.NumberFormat`. The exact decimal string
 * is handed to Intl so no precision is lost for large amounts. Currencies that
 * Intl does not recognise (e.g. registered crypto assets) fall back to a
 * decimal format with the code appended.
 *
 * @example
 * formatMoney(Money.of("1234.5", "AUD"), { locale: "en-AU" }); // "$1,234.50"
 */
export function formatMoney(money: Money, options: FormatOptions = {}): string {
  const { locale, ...rest } = options;
  const code = money.currency.code;
  const decimals = money.currency.decimals;
  const amount = money.getAmount();

  try {
    // Default fraction digits to the currency's own minor unit so that custom
    // and crypto currencies (which Intl renders with a generic 2 dp) display at
    // their true precision.
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: rest.currencyDisplay ?? "symbol",
      minimumFractionDigits: rest.minimumFractionDigits ?? decimals,
      maximumFractionDigits: rest.maximumFractionDigits ?? Math.max(decimals, rest.minimumFractionDigits ?? 0),
      ...(rest.useGrouping !== undefined ? { useGrouping: rest.useGrouping } : {}),
      ...(rest.signDisplay !== undefined ? { signDisplay: rest.signDisplay } : {}),
    });
    // Passing the decimal string preserves full precision in modern engines.
    return formatter.format(amount as unknown as number);
  } catch {
    return fallbackFormat(money, options);
  }
}

// Used for currencies Intl doesn't know about (custom/registered codes).
function fallbackFormat(money: Money, options: FormatOptions): string {
  const decimals = money.currency.decimals;
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "decimal",
    minimumFractionDigits: options.minimumFractionDigits ?? decimals,
    maximumFractionDigits: options.maximumFractionDigits ?? decimals,
    ...(options.useGrouping !== undefined ? { useGrouping: options.useGrouping } : {}),
    ...(options.signDisplay !== undefined ? { signDisplay: options.signDisplay } : {}),
  });
  const number = formatter.format(money.getAmount() as unknown as number);
  return options.currencyDisplay === "name"
    ? `${number} ${money.currency.name}`
    : `${number} ${money.currency.code}`;
}
