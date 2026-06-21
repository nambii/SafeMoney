// FX dealing: best-execution across LPs, a marked-up quote, accepting a trade,
// and a two-way (bid/ask) price.
// Run with:  npm run build && node examples/fx-dealing.mjs
import { FxQuote, FxRate, Markup, Money, RateBook } from "@nambii/safemoney";

// A rate book holds competing liquidity-provider rates for a pair.
const book = new RateBook([
  FxRate.of("AUD", "USD", "0.6543", { source: "JPM", asOf: new Date() }),
  FxRate.of("AUD", "USD", "0.6545", { source: "CurrencyCloud", asOf: new Date() }),
]);

console.log("best AUD→USD =", book.best("AUD", "USD").toString()); // picks 0.6545 (CurrencyCloud)

// Quote a customer selling 1,000 AUD, with a 50 bps house margin.
const quote = book.quoteSell(Money.of("1000.00", "AUD"), "USD", {
  markup: Markup.bps(50),
  ttl: "30s",
});
console.log("customer gets =", quote.buy.toString()); // USD payout, net of margin
console.log("house margin  =", quote.margin.toString());
console.log("client rate   =", quote.clientRate());

// Accept the quote → an immutable Trade record for the ledger.
const trade = quote.accept();
console.log("trade payIn   =", trade.payIn.toString(), "→ payOut", trade.payOut.toString());

// A two-way price: the customer trades on the side that favours the house.
const twoWay = FxQuote.fromMid(FxRate.of("EUR", "USD", "1.1000"), { pips: 2 });
console.log("\nEUR/USD       =", twoWay.toString()); // 1.0999 / 1.1001
console.log("sell 100 EUR  =", twoWay.convert(Money.of("100.00", "EUR")).toString()); // at the bid
console.log("buy with 110$ =", twoWay.convert(Money.of("110.00", "USD")).toString()); // at the ask
console.log("spread        =", twoWay.spreadPips(), "pips");
