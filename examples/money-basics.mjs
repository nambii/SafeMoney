// Money primitives: exact arithmetic, allocation, rounding, formatting.
// Run with:  npm run build && node examples/money-basics.mjs
import { Money, RoundingMode } from "safemoney";

// Construction is exact — no binary floating-point error.
const a = Money.of("0.10", "USD");
const b = Money.of("0.20", "USD");
console.log("0.10 + 0.20 =", a.add(b).toString()); // 0.30 USD (not 0.30000000000000004)

// Multiplication keeps full precision, then rounds explicitly to the minor unit.
const price = Money.of("19.99", "USD");
console.log("19.99 × 3   =", price.multiply(3).toString()); // 59.97 USD
// multiply keeps full precision; round explicitly to the minor unit.
console.log("19.99 × 1.5 =", price.multiply("1.5").round(RoundingMode.HALF_UP).toString());

// Allocation splits without losing a cent: the remainder is distributed.
const pot = Money.of("100.00", "USD");
const [x, y, z] = pot.allocate([1, 1, 1]);
console.log("split 100 / 3 =", [x, y, z].map((m) => m.toString()).join(", ")); // 33.34, 33.33, 33.33
console.log("  sum back    =", x.add(y).add(z).toString()); // 100.00 USD — nothing lost

// Formatting via Intl, and lossless minor-unit access.
const eur = Money.of("1234.50", "EUR");
console.log("formatted    =", eur.format({ locale: "de-DE" }));
console.log("minor units  =", eur.toMinor()); // 123450n
