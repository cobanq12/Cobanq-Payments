/**
 * Money maths in integer minor units. Never use floating point for amounts:
 * all arithmetic on amounts goes through BigInt, and rates are scaled to integers first.
 */
import { currencyInfo, type CurrencyCode } from './currencies';

export interface Money {
  /** Integer minor units (pence, cents, yen). */
  amount: number;
  currency: CurrencyCode;
}

export const money = (amount: number, currency: CurrencyCode): Money => ({ amount, currency });

const RATE_SCALE = 10_000_000_000n; // 1e10
const RATE_SCALE_N = 1e10;

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const half = denominator / 2n;
  return numerator >= 0n ? (numerator + half) / denominator : -((-numerator + half) / denominator);
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** Multiply minor units by a decimal rate, rounding half up. */
export function mulRate(amountMinor: number, rate: number): number {
  const scaled = BigInt(Math.round(rate * RATE_SCALE_N));
  return Number(roundDiv(BigInt(amountMinor) * scaled, RATE_SCALE));
}

/** Divide minor units by a decimal rate, rounding half up. */
export function divRate(amountMinor: number, rate: number): number {
  const scaled = BigInt(Math.round(rate * RATE_SCALE_N));
  if (scaled === 0n) return 0;
  return Number(roundDiv(BigInt(amountMinor) * RATE_SCALE, scaled));
}

/**
 * Convert between currencies. `rate` is "1 unit of `from` = rate units of `to`"
 * in major units; the result is adjusted for differing decimal places.
 */
export function convertMinor(amountMinor: number, from: CurrencyCode, to: CurrencyCode, rate: number): number {
  const fd = currencyInfo(from).decimals;
  const td = currencyInfo(to).decimals;
  const scaled = BigInt(Math.round(rate * RATE_SCALE_N));
  let num = BigInt(amountMinor) * scaled;
  let den = RATE_SCALE;
  if (td >= fd) num *= pow10(td - fd);
  else den *= pow10(fd - td);
  return Number(roundDiv(num, den));
}

/** Inverse of convertMinor: how much `from` is needed to get `amountMinor` of `to`. */
export function convertMinorInverse(amountMinor: number, from: CurrencyCode, to: CurrencyCode, rate: number): number {
  const fd = currencyInfo(from).decimals;
  const td = currencyInfo(to).decimals;
  const scaled = BigInt(Math.round(rate * RATE_SCALE_N));
  if (scaled === 0n) return 0;
  let num = BigInt(amountMinor) * RATE_SCALE;
  let den = scaled;
  if (fd >= td) num *= pow10(fd - td);
  else den *= pow10(td - fd);
  return Number(roundDiv(num, den));
}

/** Basis-point percentage of an amount (50 bps = 0.5%), rounded half up. */
export function bps(amountMinor: number, basisPoints: number): number {
  return Number(roundDiv(BigInt(amountMinor) * BigInt(basisPoints), 10_000n));
}

export type ParseAmountResult =
  | { ok: true; minor: number }
  | { ok: false; error: 'EMPTY' | 'INVALID' | 'TOO_MANY_DECIMALS' | 'TOO_LARGE' };

/** Parse user input ("1,234.56") into minor units using string maths only. */
export function parseAmount(input: string, currency: CurrencyCode): ParseAmountResult {
  const decimals = currencyInfo(currency).decimals;
  const cleaned = input.replace(/[,\s]/g, '');
  if (cleaned === '') return { ok: false, error: 'EMPTY' };
  if (!/^\d*(\.\d*)?$/.test(cleaned) || cleaned === '.') return { ok: false, error: 'INVALID' };
  const [whole = '', frac = ''] = cleaned.split('.');
  if (frac.length > decimals) return { ok: false, error: 'TOO_MANY_DECIMALS' };
  if (whole.replace(/^0+/, '').length > 12) return { ok: false, error: 'TOO_LARGE' };
  const minor = BigInt(whole === '' ? '0' : whole) * pow10(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
  return { ok: true, minor: Number(minor) };
}

/** Minor units → plain decimal string for an input field ("1234.50"). */
export function minorToInput(amountMinor: number, currency: CurrencyCode): string {
  const decimals = currencyInfo(currency).decimals;
  const neg = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(decimals + 1, '0');
  if (decimals === 0) return (neg ? '-' : '') + digits;
  return `${neg ? '-' : ''}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Format for display with Intl.NumberFormat('en-GB'). Uses unambiguous symbols
 * (£, €, US$, A$, CA$, HK$, JP¥, CN¥, AED…) so the currency is always clear.
 */
export function formatMoney(m: Money, opts: { code?: boolean } = {}): string {
  const decimals = currencyInfo(m.currency).decimals;
  const key = `${m.currency}:${opts.code ? 'c' : 's'}`;
  let f = formatters.get(key);
  if (!f) {
    f = opts.code
      ? new Intl.NumberFormat('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency, currencyDisplay: 'symbol', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formatters.set(key, f);
  }
  // Division by a power of ten for display only; the stored value stays an integer.
  const major = m.amount / 10 ** decimals;
  return opts.code ? `${f.format(major)} ${m.currency}` : f.format(major);
}

/** "248,350.75 GBP" style — unambiguous for currencies that share a symbol. */
export function formatMoneyCode(m: Money): string {
  return formatMoney(m, { code: true });
}

/** Format a rate to 6 significant figures. */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '—';
  return new Intl.NumberFormat('en-GB', { minimumSignificantDigits: 6, maximumSignificantDigits: 6, useGrouping: false }).format(rate);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function sumMinor(values: number[]): number {
  return Number(values.reduce((acc, v) => acc + BigInt(v), 0n));
}
