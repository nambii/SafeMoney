import { InvalidAmountError } from "./errors.js";
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
    // their true precision. Clamp the minimum to the maximum so that an explicit
    // `maximumFractionDigits` below the minor unit (e.g. "whole dollars") doesn't
    // make Intl throw on min > max.
    const max = rest.maximumFractionDigits ?? Math.max(decimals, rest.minimumFractionDigits ?? 0);
    const min = Math.min(rest.minimumFractionDigits ?? decimals, max);
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: rest.currencyDisplay ?? "symbol",
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      ...(rest.useGrouping !== undefined ? { useGrouping: rest.useGrouping } : {}),
      ...(rest.signDisplay !== undefined ? { signDisplay: rest.signDisplay } : {}),
    });
    // Passing the decimal string preserves full precision in modern engines.
    return formatter.format(amount as unknown as number);
  } catch {
    return fallbackFormat(money, options);
  }
}

/**
 * Normalize a localized, human-typed amount into a plain decimal string
 * ("-1234.56"). Strips currency symbols/codes and grouping separators, maps the
 * locale's digits and decimal separator, and treats accounting parentheses as
 * negative. The inverse of the numeric side of {@link formatMoney}.
 *
 * Returns a string suitable for `Money.of`; throws {@link InvalidAmountError}
 * if no digits are found.
 */
export function normalizeLocaleNumber(text: string, locale?: string): string {
  const { group, decimal, digits } = localeNumberSymbols(locale);

  let s = text.normalize("NFKC").trim();

  // Map locale-specific digits (e.g. Arabic-Indic) back to ASCII.
  if (digits.size > 0) {
    s = s.replace(/./gu, (ch) => digits.get(ch) ?? ch);
  }
  // Remove grouping separators, then normalize the decimal separator to ".".
  if (group) s = s.split(group).join("");
  if (decimal && decimal !== ".") s = s.split(decimal).join(".");

  // Sign: accounting parentheses, or a minus sign before the first digit.
  const firstDigit = s.search(/\d/);
  const signRegion = firstDigit >= 0 ? s.slice(0, firstDigit) : s;
  const negative = /[(]/.test(s) || /[-−]/.test(signRegion);

  // Strip leading/trailing decoration (currency symbol, code, spaces, sign,
  // parentheses) but keep the numeric core intact, then validate it. This
  // rejects scientific notation ("1e3"), embedded letters ("1a2b3"), and
  // multiple decimal points ("1.2.3") instead of silently producing a wrong
  // amount — the dangerous failure mode for a money parser.
  const core = s.replace(/^[^\d.]+/, "").replace(/[^\d.]+$/, "");
  if (core === "" || core === ".") {
    throw new InvalidAmountError(`Could not parse a number from: "${text}"`);
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(core)) {
    throw new InvalidAmountError(`Ambiguous or malformed number: "${text}"`);
  }
  return (negative ? "-" : "") + core;
}

// Discover a locale's grouping/decimal separators and digit glyphs via Intl.
function localeNumberSymbols(locale?: string): {
  group: string;
  decimal: string;
  digits: Map<string, string>;
} {
  const nf = new Intl.NumberFormat(locale);
  let group = "";
  let decimal = ".";
  for (const part of nf.formatToParts(12345.6)) {
    if (part.type === "group") group = part.value;
    else if (part.type === "decimal") decimal = part.value;
  }

  const digits = new Map<string, string>();
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });
  for (let d = 0; d <= 9; d++) {
    const glyph = plain.format(d);
    if (glyph !== String(d)) digits.set(glyph, String(d));
  }
  return { group, decimal, digits };
}

// Used for currencies Intl doesn't know about (custom/registered codes).
function fallbackFormat(money: Money, options: FormatOptions): string {
  const decimals = money.currency.decimals;
  const max = options.maximumFractionDigits ?? decimals;
  const min = Math.min(options.minimumFractionDigits ?? decimals, max);
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "decimal",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    ...(options.useGrouping !== undefined ? { useGrouping: options.useGrouping } : {}),
    ...(options.signDisplay !== undefined ? { signDisplay: options.signDisplay } : {}),
  });
  const number = formatter.format(money.getAmount() as unknown as number);
  return options.currencyDisplay === "name"
    ? `${number} ${money.currency.name}`
    : `${number} ${money.currency.code}`;
}
