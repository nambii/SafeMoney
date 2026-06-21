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

export type { CurrencyCode, CurrencyCodeInput, CurrencyInfo } from "./currencies.js";
export {
  getCurrency,
  isCurrencyRegistered,
  listCurrencies,
  registerCurrency,
} from "./currencies.js";
export type { Numeric } from "./decimal.js";
export {
  AllocationError,
  CurrencyMismatchError,
  FxRateMismatchError,
  InvalidAmountError,
  MoneyError,
  QuoteExpiredError,
  RoundingNecessaryError,
  StaleRateError,
  UnknownCurrencyError,
} from "./errors.js";
export type { FormatOptions } from "./format.js";
export { formatMoney, normalizeLocaleNumber } from "./format.js";
export type { ConvertOptions, Duration, FxConversion, FxMetadata } from "./fx.js";
export { FxBoard, FxRate, toMillis } from "./fx.js";
export { Markup } from "./markup.js";
export type { MoneyJSON, MoneyOptions } from "./money.js";
// Default export is the Money class, for `import Money from "safemoney"`.
export { Money, Money as default } from "./money.js";
export { Portfolio } from "./portfolio.js";
export type { QuoteJSON, QuoteOptions } from "./quote.js";
export { Quote } from "./quote.js";
export type { LiquidityProvider } from "./ratebook.js";
export { RateBook } from "./ratebook.js";
export { isRoundingMode, RoundingMode } from "./rounding.js";
export type { MarkupTier, PriceOptions, TieredPrice, TierMode } from "./schedule.js";
export { MarkupSchedule } from "./schedule.js";
export type { TradeJSON, TradeParams } from "./trade.js";
export { Trade } from "./trade.js";
