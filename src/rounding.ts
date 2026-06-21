/**
 * Rounding policies. Every value-losing operation in SafeMoney takes one of
 * these explicitly, so rounding is always a deliberate choice rather than a
 * silent default.
 */
export const RoundingMode = {
  /** Toward zero (truncate). Never increases magnitude. */
  DOWN: "DOWN",
  /** Away from zero. Never decreases magnitude. */
  UP: "UP",
  /** Toward +∞. */
  CEIL: "CEIL",
  /** Toward −∞. */
  FLOOR: "FLOOR",
  /** Nearest neighbour; ties go away from zero. The common "commercial" rounding. */
  HALF_UP: "HALF_UP",
  /** Nearest neighbour; ties go toward zero. */
  HALF_DOWN: "HALF_DOWN",
  /** Nearest neighbour; ties go to the even neighbour. "Banker's rounding". */
  HALF_EVEN: "HALF_EVEN",
  /** Asserts no rounding is needed; throws if the value cannot be represented exactly. */
  UNNECESSARY: "UNNECESSARY",
} as const;

export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

import { RoundingNecessaryError } from "./errors.js";

/**
 * Divide `numerator` by `denominator` (denominator > 0) returning an integer
 * quotient rounded according to `mode`. All arithmetic is exact bigint math.
 *
 * This is the single primitive every rounding decision flows through, so the
 * behaviour of each {@link RoundingMode} is defined in exactly one place.
 */
export function divideRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) {
    throw new RangeError("denominator must be a positive bigint");
  }

  const quotient = numerator / denominator; // truncates toward zero
  const remainder = numerator % denominator; // sign follows numerator
  if (remainder === 0n) {
    return quotient;
  }

  const negative = numerator < 0n;
  const sign = negative ? -1n : 1n;
  // Compare |remainder| * 2 against denominator to classify against the halfway point.
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;

  switch (mode) {
    case RoundingMode.DOWN:
      return quotient;
    case RoundingMode.UP:
      return quotient + sign;
    case RoundingMode.CEIL:
      return negative ? quotient : quotient + 1n;
    case RoundingMode.FLOOR:
      return negative ? quotient - 1n : quotient;
    case RoundingMode.HALF_UP:
      return twiceRemainder >= denominator ? quotient + sign : quotient;
    case RoundingMode.HALF_DOWN:
      return twiceRemainder > denominator ? quotient + sign : quotient;
    case RoundingMode.HALF_EVEN: {
      if (twiceRemainder > denominator) return quotient + sign;
      if (twiceRemainder < denominator) return quotient;
      // Exactly halfway: round to even quotient.
      return quotient % 2n === 0n ? quotient : quotient + sign;
    }
    case RoundingMode.UNNECESSARY:
      throw new RoundingNecessaryError();
    default: {
      const exhaustive: never = mode;
      throw new RangeError(`Unsupported rounding mode: ${String(exhaustive)}`);
    }
  }
}

const ROUNDING_MODES: ReadonlySet<string> = new Set(Object.values(RoundingMode));

/** Type guard: is `value` a valid {@link RoundingMode}? */
export function isRoundingMode(value: unknown): value is RoundingMode {
  return typeof value === "string" && ROUNDING_MODES.has(value);
}
