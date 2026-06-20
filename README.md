# SafeMoney

Money-safe TypeScript primitives for FX and finance: **currency-safe arithmetic
with no floating-point error**, typed ISO 4217 currency codes, explicit rounding
policies, FX metadata, localized formatting, and minor-unit conversion.

```ts
import { Money, FxRate } from "safemoney";

const price = Money.of("12.34", "AUD").add(Money.of("0.66", "AUD"));
price.format({ locale: "en-AU" }); // "$13.00"

const usd = FxRate.of("AUD", "USD", "0.6543", { source: "ECB" }).convert(price);
usd.toString(); // "8.51 USD"
```

## Why

`0.1 + 0.2 === 0.30000000000000004` is unacceptable when the numbers are money.
SafeMoney stores every amount as an **arbitrary-precision integer** (`bigint`)
scaled by the currency's minor unit, so arithmetic is exact. Anything that
*cannot* be exact — division, rounding, FX conversion — requires you to name a
[`RoundingMode`](#rounding-policies) explicitly. Money is **immutable**: every
operation returns a new frozen value.

## Install

```sh
npm install safemoney
```

Ships dual ESM + CommonJS builds with full type declarations. Node ≥ 18, and any
modern bundler. No runtime dependencies.

```ts
import { Money } from "safemoney";       // ESM / TypeScript
const { Money } = require("safemoney");  // CommonJS
```

## Core concepts

### Construction

```ts
Money.of("12.34", "AUD");        // from a decimal string (preferred)
Money.of(1000n, "JPY");          // from a bigint
Money.of(12.34, "USD");          // from a number (uses shortest round-trip)
Money.ofMinor(1234, "USD");      // from minor units → 12.34 USD
Money.ofMinor(5n, "BHD");        // 3-dp currency → 0.005 BHD
Money.zero("EUR");               // additive identity
```

Strings are preferred for any untrusted or derived value — a `number` can only
carry whatever a float already lost. Pass `{ exact: true }` to reject amounts
with more precision than the currency allows.

### Arithmetic

```ts
Money.of("0.1", "USD").add(Money.of("0.2", "USD")).getAmount(); // "0.3" (exact)

Money.of("19.99", "USD").multiply("1.1");                       // 21.989 (exact, scale grows)
Money.of("10.00", "USD").divide(3, "HALF_EVEN");                // 3.33
Money.of("10.00", "USD").divide(3, "HALF_EVEN", 6);             // 3.333333

Money.of("12.34", "USD").negate();   // -12.34
Money.of("-12.34", "USD").abs();     // 12.34
```

Mixing currencies throws `CurrencyMismatchError`. Multiplication keeps full
precision; call `.round()` when you want to settle to a payable amount.

### Minor-unit conversion

```ts
Money.of("12.34", "USD").toMinor();             // 1234n
Money.of("12.349", "USD").toMinor();            // throws RoundingNecessaryError
Money.of("12.349", "USD").toMinor("HALF_UP");   // 1235n
```

### Allocation (no money lost)

Split an amount so the parts sum back to *exactly* the original — leftover minor
units are distributed by the largest-remainder method:

```ts
Money.of("0.05", "USD").allocate([1, 1, 1]).map(m => m.getAmount());
// ["0.02", "0.02", "0.01"]   ← sums to 0.05, nothing created or destroyed

Money.of("100.00", "USD").allocate([70, 30]); // weighted split
Money.of("10.00", "USD").split(3);            // ["3.34", "3.33", "3.33"]
```

### Comparison

```ts
Money.of("10.00", "USD").equals(Money.of("10.000", "USD")); // true (value, not scale)
a.greaterThan(b); a.lessThanOrEqual(b); a.compare(b);       // -1 | 0 | 1
a.isZero(); a.isPositive(); a.isNegative();
a.min(b); a.max(b);
```

## Rounding policies

Every value-losing operation takes a `RoundingMode`. `round()` defaults to
`HALF_EVEN` (banker's rounding); everything else is explicit.

| Mode | Behaviour |
| --- | --- |
| `DOWN` | Toward zero (truncate) |
| `UP` | Away from zero |
| `CEIL` | Toward +∞ |
| `FLOOR` | Toward −∞ |
| `HALF_UP` | Nearest; ties away from zero (commercial rounding) |
| `HALF_DOWN` | Nearest; ties toward zero |
| `HALF_EVEN` | Nearest; ties to even (banker's rounding) |
| `UNNECESSARY` | Assert exactness; throws if rounding would be needed |

```ts
import { RoundingMode } from "safemoney";
Money.of("2.5", "USD").round(RoundingMode.HALF_EVEN, 0); // enum or the string "HALF_EVEN"
```

## FX conversion & metadata

A directed rate carries provenance metadata (`source`, `asOf`, and any custom
fields) for audit trails:

```ts
import { Money, FxRate } from "safemoney";

const rate = FxRate.of("AUD", "USD", "0.6543", {
  source: "ECB",
  asOf: new Date("2026-06-20T00:00:00Z"),
  tier: "retail",
});

rate.convert(Money.of("100.00", "AUD"));                 // 65.43 USD (HALF_EVEN)
rate.convert(Money.of("100.00", "AUD"), { mode: "UP" }); // round-up variant

const audit = rate.convertWithDetails(Money.of("100.00", "AUD"));
// { from: 100.00 AUD, to: 65.43 USD, rate: AUD/USD @ 0.6543 }

rate.inverse(); // USD/AUD @ 1.528351... (metadata.derivedFrom = "AUD/USD")
```

### Rate boards & triangulation

`FxBoard` resolves a pair from a rate snapshot — directly, via the inverse, or by
triangulating through a pivot currency (default `USD`):

```ts
import { FxBoard, FxRate, Money } from "safemoney";

const board = new FxBoard([
  FxRate.of("AUD", "USD", "0.6543"),
  FxRate.of("EUR", "USD", "1.0800"),
]);

board.getRate("USD", "AUD");                      // inverse of AUD/USD
board.convert(Money.of("100.00", "AUD"), "EUR");  // triangulated via USD
```

## Formatting

`format()` uses `Intl.NumberFormat` and hands it the exact decimal string, so no
precision is lost even beyond `Number.MAX_SAFE_INTEGER`:

```ts
Money.of("1234.5", "AUD").format({ locale: "en-AU" });                     // "$1,234.50"
Money.of("5", "USD").format({ locale: "en-US", currencyDisplay: "code" }); // "USD 5.00"
Money.of("9007199254740993.01", "USD").format({ locale: "en-US" });
// "$9,007,199,254,740,993.01" — exact
```

## Currencies

All active ISO 4217 currencies are built in with their correct minor units
(USD = 2, JPY = 0, BHD/KWD = 3, …). Codes are typed for autocompletion. Register
custom or crypto assets at runtime:

```ts
import { registerCurrency, Money, getCurrency, listCurrencies } from "safemoney";

registerCurrency({ code: "BTC", decimals: 8, name: "Bitcoin" });
Money.ofMinor(150000000n, "BTC").getAmount(); // "1.50000000"

getCurrency("KWD").decimals; // 3
listCurrencies();            // full sorted snapshot
```

## Serialization

```ts
const json = Money.of("12.30", "USD").toJSON(); // { amount: "12.30", currency: "USD" }
Money.fromJSON(json);                            // lossless round-trip
```

## Errors

All errors extend `MoneyError`: `InvalidAmountError`, `UnknownCurrencyError`,
`CurrencyMismatchError`, `RoundingNecessaryError`, `FxRateMismatchError`,
`AllocationError`.

## Development

```sh
npm install
npm run build      # dual ESM + CJS build into dist/
npm test           # build + run the node:test suite
npm run typecheck  # strict type-check of src and tests
```

## License

[MIT](./LICENSE) © Ebin Joshy Nambiaparambil
