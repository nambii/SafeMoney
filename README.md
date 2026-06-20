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

Ships dual ESM + CommonJS builds with full type declarations. Node ≥ 20 (where
`Intl` formats decimal strings losslessly), and any modern bundler. No runtime
dependencies.

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

### Comparison & aggregation

```ts
Money.of("10.00", "USD").equals(Money.of("10.000", "USD")); // true (value, not scale)
a.greaterThan(b); a.lessThanOrEqual(b); a.compare(b);       // -1 | 0 | 1
a.isZero(); a.isPositive(); a.isNegative();
a.min(b); a.max(b);

Money.sum([a, b, c]);        // currency-safe sum (pass a code for the empty case)
Money.min(list); Money.max(list);
```

### Parsing & cash rounding

```ts
Money.parse("$1,234.56", "USD");                       // 1234.56 USD (inverse of format)
Money.parse("1.234,56 €", "EUR", { locale: "de-DE" }); // 1234.56 EUR
Money.parse("(5.00)", "USD");                          // -5.00 USD  (accounting negative)

Money.of("12.37", "CHF").roundToIncrement("0.05");     // 12.35 CHF (nearest 5 cents)
Money.of("1.13", "USD").roundToIncrement("0.25");      // 1.25 USD
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

A rate is scoped to its currency pair and carries provenance metadata
(`source`, `asOf`, and any custom fields) for audit trails. `convert` works in
**either direction** but accepts **only the pair's two currencies** — anything
else throws:

```ts
import { Money, FxRate } from "safemoney";

const rate = FxRate.of("AUD", "USD", "0.6543", {
  source: "ECB",
  asOf: new Date("2026-06-20T00:00:00Z"),
  tier: "retail",
});

rate.convert(Money.of("100.00", "AUD"));                 // 65.43 USD  (forward, ×rate)
rate.convert(Money.of("100.00", "USD"));                 // 152.84 AUD (reverse, ÷rate)
rate.convert(Money.of("100.00", "AUD"), { mode: "UP" }); // round-up variant
rate.convert(Money.of("100.00", "EUR"));                 // throws — only AUD or USD allowed

const audit = rate.convertWithDetails(Money.of("100.00", "USD"));
// { from: 100.00 USD, to: 152.84 AUD, rate: AUD/USD @ 0.6543, direction: "reverse" }

rate.inverse(); // USD/AUD @ 1.528351... (metadata.derivedFrom = "AUD/USD")
```

> **Note:** the reverse leg applies the *exact inverse* (`1 / rate`), so a single
> `FxRate` is treated as a **mid/reference rate** — it does not model a bid/ask
> spread. For spread-sensitive dealing, use two rates (e.g. a bid `FxRate` and an
> ask `FxRate`) and pick the side explicitly.

### Pip math & rate freshness

```ts
const r = FxRate.of("AUD", "USD", "0.6543", { asOf: new Date() });

r.pipSize();                          // "0.0001"  (JPY-quoted pairs → "0.01")
r.pipsTo(FxRate.of("AUD", "USD", "0.6553")); // 10  (signed pip distance)
r.addPips(10);                        // AUD/USD @ 0.6553  (fractional pips allowed)
r.pipValue(Money.of("100000", "AUD"));// 10.00 USD per pip for a 100k notional

// Reject stale rates at conversion time:
r.convert(Money.of("100.00", "AUD"), { maxAge: "5m" }); // throws StaleRateError if older than 5m
r.isStale("5m"); r.age();                                 // freshness inspection
```

### Multi-currency portfolios

```ts
import { Portfolio } from "safemoney";

const p = Portfolio.of(Money.of("100.00", "AUD"), Money.of("50.00", "USD"))
  .add(Money.of("25.00", "AUD"));

p.balance("AUD");          // 125.00 AUD
p.currencies();            // ["AUD", "USD"]
p.valuate("USD", board);   // total value in USD via an FxBoard
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

## FX dealing: quotes, trades & margin

Primitives for the source-rate → mark-up → quote → trade flow. You source cost
rates from liquidity providers (tagged via `source`), apply a `Markup` to price a
customer `Quote`, and turn an accepted quote into a `Trade` with explicit pay-in
and payout legs. The spread you earn is captured as `margin` and never lost to
rounding.

```ts
import { Money, FxRate, Markup, RateBook, Trade } from "safemoney";

// 1. Cost rates from multiple liquidity providers.
const book = new RateBook([
  FxRate.of("AUD", "USD", "0.6543", { source: "JPM", asOf: new Date() }),
  FxRate.of("AUD", "USD", "0.6545", { source: "CurrencyCloud", asOf: new Date() }),
]);

// 2. Quote the customer: best execution + 50 bps margin, valid for 30s.
//    Fix the pay-in ("customer sends 1000 AUD") or the payout (forBuyAmount).
const quote = book.quoteSell(Money.of("1000.00", "AUD"), "USD", {
  markup: Markup.bps(50),
  ttl: "30s",
});
quote.buy;       // 651.23 USD  (payout to beneficiary)
quote.margin;    // 3.27 USD    (house revenue)
quote.provider;  // "CurrencyCloud" (cheapest cost → best for the customer)
quote.clientRate(6); // "0.651230"

// 3. Customer accepts → a Trade with the two settlement legs.
const trade = quote.accept({ id: "T-1001" });
trade.payIn;   // 1000.00 AUD   (received from customer)
trade.payOut;  // 651.23 USD    (sent to beneficiary)

// 4. Roll up booked margin across trades into a per-currency revenue Portfolio.
Trade.totalMargin([trade /* … */]).balance("USD"); // total USD revenue
```

`Markup` is exact (`Markup.bps`, `.percent`, `.ratio`) and always applied in the
house's favour. `Quote.forBuyAmount` fixes the payout instead of the pay-in.
Expired quotes throw `QuoteExpiredError` on `accept()`. `Trade` is a pure value
object — lifecycle, persistence and payment rails stay in your application.

### Tiered / progressive margins

A pair often has margins that vary by deal size. `MarkupSchedule` holds margin
tiers (each a `Markup` in bps or %) with thresholds in the **base currency**, and
combines them either **progressively** (tax-bracket style — each slice of the
amount is margined at its own tier, blended into one effective margin) or `flat`
(the whole amount uses the tier it falls into). It resolves the effective margin,
the resultant client rate, and the converted amount in one call.

```ts
import { MarkupSchedule, Markup, Money, FxRate } from "safemoney";

const schedule = MarkupSchedule.of("AUD", [
  { upTo: "10000", markup: Markup.bps(50) }, //      0 – 10k @ 50 bps
  { upTo: "50000", markup: Markup.bps(30) }, //    10k – 50k @ 30 bps
  { markup: Markup.bps(20) },                //       50k+   @ 20 bps (open)
]); // mode defaults to "progressive"

// 70k → 10k@50 + 40k@30 + 20k@20 = blended 30 bps
schedule.effectiveMarkup(Money.of("70000", "AUD")).asBps(); // 30

const cost = FxRate.of("AUD", "USD", "0.6543", { source: "JPM" });
const priced = schedule.price(cost, Money.of("70000", "AUD"));
priced.markup.asBps(); // 30
priced.rate;           // AUD/USD @ 0.6523371429  (resultant client rate, reusable)
priced.amount;         // 45663.60 USD            (converted payout)
priced.margin;         // 137.40 USD              (house revenue)

// Flat mode instead: whole amount at the tier it lands in
MarkupSchedule.of("AUD", tiers, { mode: "flat" });
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
`StaleRateError`, `QuoteExpiredError`, `AllocationError`.

## Development

```sh
npm install
npm run build      # dual ESM + CJS build into dist/
npm test           # build + run the node:test suite
npm run typecheck  # strict type-check of src and tests
```

## License

[MIT](./LICENSE) © Ebin Joshy Nambiaparambil
