import { InvalidAmountError } from "./errors.js";
import { divideRound, type RoundingMode } from "./rounding.js";

/**
 * A fixed-point decimal represented exactly as `units * 10^(-scale)`.
 * `units` is an arbitrary-precision bigint and `scale` is a non-negative
 * integer number of fractional digits. This is the internal numeric core that
 * keeps every operation free of binary floating-point error.
 */
export interface Scaled {
  readonly units: bigint;
  readonly scale: number;
}

/** Accepted scalar inputs for amounts and factors. Strings are preferred. */
export type Numeric = number | bigint | string;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

const TEN = 10n;

/** 10^n as a bigint, for non-negative integer n. */
export function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/**
 * Parse a scalar into an exact {@link Scaled} value. Accepts decimal strings
 * ("12.34", "-0.005", "1_000.50", "1.5e-3"), bigints, and finite numbers.
 * Numbers are converted via their shortest round-trip string, so values that
 * cannot be represented exactly in binary (e.g. 0.1 + 0.2) carry their float
 * artefact into the decimal — prefer strings for untrusted/derived values.
 */
export function parseScaled(input: Numeric): Scaled {
  if (typeof input === "bigint") {
    return { units: input, scale: 0 };
  }

  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new InvalidAmountError(`Cannot create money from non-finite number: ${input}`);
    }
    text = numberToDecimalString(input);
  } else if (typeof input === "string") {
    text = input.trim().replace(/_/g, "");
  } else {
    throw new InvalidAmountError(`Unsupported amount type: ${typeof input}`);
  }

  const match = DECIMAL_PATTERN.exec(text);
  if (match === null) {
    throw new InvalidAmountError(`Invalid decimal amount: "${input}"`);
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const intPart = match[2] ?? "0";
  const fracPart = match[3] ?? "";
  const expPart = match[4];

  let units = BigInt(intPart + fracPart) * sign;
  let scale = fracPart.length;

  if (expPart !== undefined) {
    scale -= Number.parseInt(expPart, 10);
  }
  if (scale < 0) {
    units *= pow10(-scale);
    scale = 0;
  }
  return { units, scale };
}

// Numbers like 1e21 or 1e-7 stringify with an exponent; the parser handles
// that, so we can rely on the engine's shortest round-trip representation.
function numberToDecimalString(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

/** Scale `value` to exactly `targetScale` fractional digits, rounding if needed. */
export function rescale(value: Scaled, targetScale: number, mode: RoundingMode): Scaled {
  if (targetScale === value.scale) {
    return value;
  }
  if (targetScale > value.scale) {
    return { units: value.units * pow10(targetScale - value.scale), scale: targetScale };
  }
  const units = divideRound(value.units, pow10(value.scale - targetScale), mode);
  return { units, scale: targetScale };
}

/** Bring two values to a common scale (the larger of the two) without rounding. */
export function align(a: Scaled, b: Scaled): { a: bigint; b: bigint; scale: number } {
  if (a.scale === b.scale) {
    return { a: a.units, b: b.units, scale: a.scale };
  }
  const scale = Math.max(a.scale, b.scale);
  return {
    a: a.units * pow10(scale - a.scale),
    b: b.units * pow10(scale - b.scale),
    scale,
  };
}

/** Exact addition. */
export function addScaled(a: Scaled, b: Scaled): Scaled {
  const { a: au, b: bu, scale } = align(a, b);
  return { units: au + bu, scale };
}

/** Exact subtraction. */
export function subtractScaled(a: Scaled, b: Scaled): Scaled {
  const { a: au, b: bu, scale } = align(a, b);
  return { units: au - bu, scale };
}

/** Exact multiplication; the result scale is the sum of the operand scales. */
export function multiplyScaled(a: Scaled, b: Scaled): Scaled {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** Sign of the value: -1, 0, or 1. */
export function signOf(value: Scaled): -1 | 0 | 1 {
  return value.units < 0n ? -1 : value.units > 0n ? 1 : 0;
}

/** Compare two values, returning -1, 0, or 1. */
export function compareScaled(a: Scaled, b: Scaled): -1 | 0 | 1 {
  const { a: au, b: bu } = align(a, b);
  return au < bu ? -1 : au > bu ? 1 : 0;
}

/** Render a {@link Scaled} as a canonical decimal string, preserving its scale. */
export function scaledToString(value: Scaled): string {
  const negative = value.units < 0n;
  const digits = (negative ? -value.units : value.units).toString();

  if (value.scale === 0) {
    return (negative ? "-" : "") + digits;
  }

  const padded = digits.padStart(value.scale + 1, "0");
  const cut = padded.length - value.scale;
  const intPart = padded.slice(0, cut);
  const fracPart = padded.slice(cut);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}
