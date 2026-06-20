/**
 * SafeMoney — money-safe TypeScript primitives.
 *
 * Currency-safe arithmetic with no floating-point error, typed ISO 4217
 * currency codes, explicit rounding policies, FX metadata, formatting and
 * minor-unit conversion.
 *
 * @example
 * import { Money, FxRate } from "safemoney";
 *
 * const price = Money.of("12.34", "AUD").add(Money.of("0.66", "AUD"));
 * price.format({ locale: "en-AU" }); // "$13.00"
 *
 * const usd = FxRate.of("AUD", "USD", "0.6543").convert(price);
 */

export { Money } from "./money.js";
export type { MoneyJSON, MoneyOptions } from "./money.js";

export { FxRate, FxBoard } from "./fx.js";
export type { FxMetadata, ConvertOptions, FxConversion } from "./fx.js";

export { formatMoney } from "./format.js";
export type { FormatOptions } from "./format.js";

export { RoundingMode, isRoundingMode } from "./rounding.js";

export {
  getCurrency,
  isCurrencyRegistered,
  listCurrencies,
  registerCurrency,
} from "./currencies.js";
export type { CurrencyCode, CurrencyCodeInput, CurrencyInfo } from "./currencies.js";

export type { Numeric } from "./decimal.js";

export {
  MoneyError,
  InvalidAmountError,
  UnknownCurrencyError,
  CurrencyMismatchError,
  RoundingNecessaryError,
  FxRateMismatchError,
  AllocationError,
} from "./errors.js";

// Default export is the Money class, for `import Money from "safemoney"`.
export { Money as default } from "./money.js";
