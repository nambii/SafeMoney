/**
 * Base class for all errors thrown by SafeMoney. Catching this lets callers
 * distinguish library-level failures from unexpected runtime errors.
 */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore prototype chain for environments that transpile to ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when an amount string/number cannot be parsed into an exact decimal. */
export class InvalidAmountError extends MoneyError {}

/** Thrown when a currency code is not a known ISO 4217 code. */
export class UnknownCurrencyError extends MoneyError {
  readonly code: string;
  constructor(code: string) {
    super(`Unknown currency code: "${code}". Use a registered ISO 4217 code.`);
    this.code = code;
  }
}

/** Thrown when an operation mixes two different currencies. */
export class CurrencyMismatchError extends MoneyError {
  readonly left: string;
  readonly right: string;
  constructor(left: string, right: string) {
    super(`Currency mismatch: cannot combine ${left} with ${right}.`);
    this.left = left;
    this.right = right;
  }
}

/** Thrown when a value would be lost because rounding is required but not permitted. */
export class RoundingNecessaryError extends MoneyError {
  constructor(message = "Rounding is necessary but no rounding mode was provided.") {
    super(message);
  }
}

/** Thrown when an FX conversion is asked to use a rate that does not match the money's currency. */
export class FxRateMismatchError extends MoneyError {}

/** Thrown when a rate is older than the freshness window allowed for a conversion. */
export class StaleRateError extends MoneyError {}

/** Thrown when accepting a quote whose validity window has already passed. */
export class QuoteExpiredError extends MoneyError {}

/** Thrown for invalid allocation/split arguments (e.g. empty ratios, all-zero weights). */
export class AllocationError extends MoneyError {}
