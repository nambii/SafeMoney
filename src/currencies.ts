import { UnknownCurrencyError } from "./errors.js";

/** Static metadata describing a currency. */
export interface CurrencyInfo {
  /** ISO 4217 alphabetic code, e.g. "AUD". */
  readonly code: string;
  /** Number of digits after the decimal point (the "minor unit" exponent). */
  readonly decimals: number;
  /** Human-readable name. */
  readonly name: string;
  /** ISO 4217 numeric code, where defined. */
  readonly numeric?: number;
}

// ISO 4217 active currencies. `decimals` is the minor-unit exponent: USD=2
// (cents), JPY=0 (no minor unit), BHD=3 (fils). Kept as a plain object so the
// alphabetic codes can be lifted into a literal union type.
const BUILT_IN = {
  AED: { decimals: 2, name: "UAE Dirham", numeric: 784 },
  AFN: { decimals: 2, name: "Afghani", numeric: 971 },
  ALL: { decimals: 2, name: "Lek", numeric: 8 },
  AMD: { decimals: 2, name: "Armenian Dram", numeric: 51 },
  ANG: { decimals: 2, name: "Netherlands Antillean Guilder", numeric: 532 },
  AOA: { decimals: 2, name: "Kwanza", numeric: 973 },
  ARS: { decimals: 2, name: "Argentine Peso", numeric: 32 },
  AUD: { decimals: 2, name: "Australian Dollar", numeric: 36 },
  AWG: { decimals: 2, name: "Aruban Florin", numeric: 533 },
  AZN: { decimals: 2, name: "Azerbaijan Manat", numeric: 944 },
  BAM: { decimals: 2, name: "Convertible Mark", numeric: 977 },
  BBD: { decimals: 2, name: "Barbados Dollar", numeric: 52 },
  BDT: { decimals: 2, name: "Taka", numeric: 50 },
  BGN: { decimals: 2, name: "Bulgarian Lev", numeric: 975 },
  BHD: { decimals: 3, name: "Bahraini Dinar", numeric: 48 },
  BIF: { decimals: 0, name: "Burundi Franc", numeric: 108 },
  BMD: { decimals: 2, name: "Bermudian Dollar", numeric: 60 },
  BND: { decimals: 2, name: "Brunei Dollar", numeric: 96 },
  BOB: { decimals: 2, name: "Boliviano", numeric: 68 },
  BRL: { decimals: 2, name: "Brazilian Real", numeric: 986 },
  BSD: { decimals: 2, name: "Bahamian Dollar", numeric: 44 },
  BTN: { decimals: 2, name: "Ngultrum", numeric: 64 },
  BWP: { decimals: 2, name: "Pula", numeric: 72 },
  BYN: { decimals: 2, name: "Belarusian Ruble", numeric: 933 },
  BZD: { decimals: 2, name: "Belize Dollar", numeric: 84 },
  CAD: { decimals: 2, name: "Canadian Dollar", numeric: 124 },
  CDF: { decimals: 2, name: "Congolese Franc", numeric: 976 },
  CHF: { decimals: 2, name: "Swiss Franc", numeric: 756 },
  CLP: { decimals: 0, name: "Chilean Peso", numeric: 152 },
  CNY: { decimals: 2, name: "Yuan Renminbi", numeric: 156 },
  COP: { decimals: 2, name: "Colombian Peso", numeric: 170 },
  CRC: { decimals: 2, name: "Costa Rican Colon", numeric: 188 },
  CUP: { decimals: 2, name: "Cuban Peso", numeric: 192 },
  CVE: { decimals: 2, name: "Cabo Verde Escudo", numeric: 132 },
  CZK: { decimals: 2, name: "Czech Koruna", numeric: 203 },
  DJF: { decimals: 0, name: "Djibouti Franc", numeric: 262 },
  DKK: { decimals: 2, name: "Danish Krone", numeric: 208 },
  DOP: { decimals: 2, name: "Dominican Peso", numeric: 214 },
  DZD: { decimals: 2, name: "Algerian Dinar", numeric: 12 },
  EGP: { decimals: 2, name: "Egyptian Pound", numeric: 818 },
  ERN: { decimals: 2, name: "Nakfa", numeric: 232 },
  ETB: { decimals: 2, name: "Ethiopian Birr", numeric: 230 },
  EUR: { decimals: 2, name: "Euro", numeric: 978 },
  FJD: { decimals: 2, name: "Fiji Dollar", numeric: 242 },
  FKP: { decimals: 2, name: "Falkland Islands Pound", numeric: 238 },
  GBP: { decimals: 2, name: "Pound Sterling", numeric: 826 },
  GEL: { decimals: 2, name: "Lari", numeric: 981 },
  GHS: { decimals: 2, name: "Ghana Cedi", numeric: 936 },
  GIP: { decimals: 2, name: "Gibraltar Pound", numeric: 292 },
  GMD: { decimals: 2, name: "Dalasi", numeric: 270 },
  GNF: { decimals: 0, name: "Guinean Franc", numeric: 324 },
  GTQ: { decimals: 2, name: "Quetzal", numeric: 320 },
  GYD: { decimals: 2, name: "Guyana Dollar", numeric: 328 },
  HKD: { decimals: 2, name: "Hong Kong Dollar", numeric: 344 },
  HNL: { decimals: 2, name: "Lempira", numeric: 340 },
  HTG: { decimals: 2, name: "Gourde", numeric: 332 },
  HUF: { decimals: 2, name: "Forint", numeric: 348 },
  IDR: { decimals: 2, name: "Rupiah", numeric: 360 },
  ILS: { decimals: 2, name: "New Israeli Sheqel", numeric: 376 },
  INR: { decimals: 2, name: "Indian Rupee", numeric: 356 },
  IQD: { decimals: 3, name: "Iraqi Dinar", numeric: 368 },
  IRR: { decimals: 2, name: "Iranian Rial", numeric: 364 },
  ISK: { decimals: 0, name: "Iceland Krona", numeric: 352 },
  JMD: { decimals: 2, name: "Jamaican Dollar", numeric: 388 },
  JOD: { decimals: 3, name: "Jordanian Dinar", numeric: 400 },
  JPY: { decimals: 0, name: "Yen", numeric: 392 },
  KES: { decimals: 2, name: "Kenyan Shilling", numeric: 404 },
  KGS: { decimals: 2, name: "Som", numeric: 417 },
  KHR: { decimals: 2, name: "Riel", numeric: 116 },
  KMF: { decimals: 0, name: "Comorian Franc", numeric: 174 },
  KPW: { decimals: 2, name: "North Korean Won", numeric: 408 },
  KRW: { decimals: 0, name: "Won", numeric: 410 },
  KWD: { decimals: 3, name: "Kuwaiti Dinar", numeric: 414 },
  KYD: { decimals: 2, name: "Cayman Islands Dollar", numeric: 136 },
  KZT: { decimals: 2, name: "Tenge", numeric: 398 },
  LAK: { decimals: 2, name: "Lao Kip", numeric: 418 },
  LBP: { decimals: 2, name: "Lebanese Pound", numeric: 422 },
  LKR: { decimals: 2, name: "Sri Lanka Rupee", numeric: 144 },
  LRD: { decimals: 2, name: "Liberian Dollar", numeric: 430 },
  LSL: { decimals: 2, name: "Loti", numeric: 426 },
  LYD: { decimals: 3, name: "Libyan Dinar", numeric: 434 },
  MAD: { decimals: 2, name: "Moroccan Dirham", numeric: 504 },
  MDL: { decimals: 2, name: "Moldovan Leu", numeric: 498 },
  MGA: { decimals: 2, name: "Malagasy Ariary", numeric: 969 },
  MKD: { decimals: 2, name: "Denar", numeric: 807 },
  MMK: { decimals: 2, name: "Kyat", numeric: 104 },
  MNT: { decimals: 2, name: "Tugrik", numeric: 496 },
  MOP: { decimals: 2, name: "Pataca", numeric: 446 },
  MRU: { decimals: 2, name: "Ouguiya", numeric: 929 },
  MUR: { decimals: 2, name: "Mauritius Rupee", numeric: 480 },
  MVR: { decimals: 2, name: "Rufiyaa", numeric: 462 },
  MWK: { decimals: 2, name: "Malawi Kwacha", numeric: 454 },
  MXN: { decimals: 2, name: "Mexican Peso", numeric: 484 },
  MYR: { decimals: 2, name: "Malaysian Ringgit", numeric: 458 },
  MZN: { decimals: 2, name: "Mozambique Metical", numeric: 943 },
  NAD: { decimals: 2, name: "Namibia Dollar", numeric: 516 },
  NGN: { decimals: 2, name: "Naira", numeric: 566 },
  NIO: { decimals: 2, name: "Cordoba Oro", numeric: 558 },
  NOK: { decimals: 2, name: "Norwegian Krone", numeric: 578 },
  NPR: { decimals: 2, name: "Nepalese Rupee", numeric: 524 },
  NZD: { decimals: 2, name: "New Zealand Dollar", numeric: 554 },
  OMR: { decimals: 3, name: "Rial Omani", numeric: 512 },
  PAB: { decimals: 2, name: "Balboa", numeric: 590 },
  PEN: { decimals: 2, name: "Sol", numeric: 604 },
  PGK: { decimals: 2, name: "Kina", numeric: 598 },
  PHP: { decimals: 2, name: "Philippine Peso", numeric: 608 },
  PKR: { decimals: 2, name: "Pakistan Rupee", numeric: 586 },
  PLN: { decimals: 2, name: "Zloty", numeric: 985 },
  PYG: { decimals: 0, name: "Guarani", numeric: 600 },
  QAR: { decimals: 2, name: "Qatari Rial", numeric: 634 },
  RON: { decimals: 2, name: "Romanian Leu", numeric: 946 },
  RSD: { decimals: 2, name: "Serbian Dinar", numeric: 941 },
  RUB: { decimals: 2, name: "Russian Ruble", numeric: 643 },
  RWF: { decimals: 0, name: "Rwanda Franc", numeric: 646 },
  SAR: { decimals: 2, name: "Saudi Riyal", numeric: 682 },
  SBD: { decimals: 2, name: "Solomon Islands Dollar", numeric: 90 },
  SCR: { decimals: 2, name: "Seychelles Rupee", numeric: 690 },
  SDG: { decimals: 2, name: "Sudanese Pound", numeric: 938 },
  SEK: { decimals: 2, name: "Swedish Krona", numeric: 752 },
  SGD: { decimals: 2, name: "Singapore Dollar", numeric: 702 },
  SHP: { decimals: 2, name: "Saint Helena Pound", numeric: 654 },
  SLE: { decimals: 2, name: "Leone", numeric: 925 },
  SOS: { decimals: 2, name: "Somali Shilling", numeric: 706 },
  SRD: { decimals: 2, name: "Surinam Dollar", numeric: 968 },
  SSP: { decimals: 2, name: "South Sudanese Pound", numeric: 728 },
  STN: { decimals: 2, name: "Dobra", numeric: 930 },
  SVC: { decimals: 2, name: "El Salvador Colon", numeric: 222 },
  SYP: { decimals: 2, name: "Syrian Pound", numeric: 760 },
  SZL: { decimals: 2, name: "Lilangeni", numeric: 748 },
  THB: { decimals: 2, name: "Baht", numeric: 764 },
  TJS: { decimals: 2, name: "Somoni", numeric: 972 },
  TMT: { decimals: 2, name: "Turkmenistan New Manat", numeric: 934 },
  TND: { decimals: 3, name: "Tunisian Dinar", numeric: 788 },
  TOP: { decimals: 2, name: "Pa’anga", numeric: 776 },
  TRY: { decimals: 2, name: "Turkish Lira", numeric: 949 },
  TTD: { decimals: 2, name: "Trinidad and Tobago Dollar", numeric: 780 },
  TWD: { decimals: 2, name: "New Taiwan Dollar", numeric: 901 },
  TZS: { decimals: 2, name: "Tanzanian Shilling", numeric: 834 },
  UAH: { decimals: 2, name: "Hryvnia", numeric: 980 },
  UGX: { decimals: 0, name: "Uganda Shilling", numeric: 800 },
  USD: { decimals: 2, name: "US Dollar", numeric: 840 },
  UYU: { decimals: 2, name: "Peso Uruguayo", numeric: 858 },
  UZS: { decimals: 2, name: "Uzbekistan Sum", numeric: 860 },
  VES: { decimals: 2, name: "Bolívar Soberano", numeric: 928 },
  VND: { decimals: 0, name: "Dong", numeric: 704 },
  VUV: { decimals: 0, name: "Vatu", numeric: 548 },
  WST: { decimals: 2, name: "Tala", numeric: 882 },
  XAF: { decimals: 0, name: "CFA Franc BEAC", numeric: 950 },
  XCD: { decimals: 2, name: "East Caribbean Dollar", numeric: 951 },
  XOF: { decimals: 0, name: "CFA Franc BCEAO", numeric: 952 },
  XPF: { decimals: 0, name: "CFP Franc", numeric: 953 },
  YER: { decimals: 2, name: "Yemeni Rial", numeric: 886 },
  ZAR: { decimals: 2, name: "Rand", numeric: 710 },
  ZMW: { decimals: 2, name: "Zambian Kwacha", numeric: 967 },
  ZWG: { decimals: 2, name: "Zimbabwe Gold", numeric: 924 },
} as const satisfies Record<string, Omit<CurrencyInfo, "code">>;

/**
 * Union of all built-in ISO 4217 codes. Used for compile-time autocompletion
 * and to reject typos before runtime. Custom currencies registered via
 * {@link registerCurrency} are valid at runtime but are typed as plain strings.
 */
export type CurrencyCode = keyof typeof BUILT_IN;

/** Any string is accepted at the API boundary, but known codes get IntelliSense. */
export type CurrencyCodeInput = CurrencyCode | (string & {});

const REGISTRY = new Map<string, CurrencyInfo>();
for (const [code, info] of Object.entries(BUILT_IN)) {
  REGISTRY.set(code, { code, ...info });
}

/** Returns the metadata for a code, or throws {@link UnknownCurrencyError}. */
export function getCurrency(code: CurrencyCodeInput): CurrencyInfo {
  const info = REGISTRY.get(code);
  if (info === undefined) {
    throw new UnknownCurrencyError(String(code));
  }
  return info;
}

/** Whether a code is registered (built-in or custom). */
export function isCurrencyRegistered(code: string): boolean {
  return REGISTRY.has(code);
}

/** Snapshot list of every registered currency, sorted by code. */
export function listCurrencies(): CurrencyInfo[] {
  return [...REGISTRY.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/**
 * Register a custom currency (e.g. a crypto asset or an internal book currency).
 * Re-registering an existing code replaces it. Returns the stored info.
 *
 * @example
 * registerCurrency({ code: "BTC", decimals: 8, name: "Bitcoin" });
 * registerCurrency({ code: "USDC", decimals: 6, name: "USD Coin" });
 */
export function registerCurrency(info: CurrencyInfo): CurrencyInfo {
  if (!/^[A-Za-z0-9]{2,12}$/.test(info.code)) {
    throw new RangeError(
      `Invalid currency code "${info.code}": expected 2–12 alphanumeric characters.`,
    );
  }
  if (!Number.isInteger(info.decimals) || info.decimals < 0 || info.decimals > 18) {
    throw new RangeError(`Invalid decimals for "${info.code}": expected an integer in [0, 18].`);
  }
  const stored: CurrencyInfo = Object.freeze({ ...info });
  REGISTRY.set(info.code, stored);
  return stored;
}
