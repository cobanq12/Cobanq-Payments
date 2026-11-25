/**
 * Indicative mid-market reference rates (1 GBP = x). Used for GBP-equivalent
 * limit checks and the mock quote engine. Live quotes always come from the API.
 */
import type { CurrencyCode } from '../lib/currencies';
import { convertMinor } from '../lib/money';

export const GBP_MID_RATES: Record<CurrencyCode, number> = {
  GBP: 1, EUR: 1.1724, USD: 1.2682, AED: 4.6574, AUD: 1.9451, CAD: 1.7623, CHF: 1.1152, CNY: 9.1806,
  HKD: 9.8712, JPY: 196.31, PLN: 5.0715, SGD: 1.7012,
  BDT: 151.62, BGN: 2.2931, BHD: 0.4781, BRL: 7.3142, BWP: 17.284, CLP: 1231.5, COP: 5542.1, CZK: 29.612,
  DKK: 8.7461, EGP: 62.714, FJD: 2.8713, GHS: 19.862, HUF: 482.31, IDR: 20124, ILS: 4.6931, INR: 106.92,
  ISK: 176.42, JOD: 0.8992, KES: 163.84, KRW: 1762.4, KWD: 0.3902, LKR: 371.25, MAD: 12.642, MUR: 58.914,
  MXN: 25.613, MYR: 5.6712, NGN: 2104.5, NOK: 13.972, NPR: 171.08, NZD: 2.1463, OMR: 0.4883, PEN: 4.7612,
  PHP: 74.215, PKR: 352.41, QAR: 4.6162, RON: 5.8341, RSD: 137.25, SAR: 4.7561, SEK: 13.584, THB: 43.612,
  TND: 3.9641, TRY: 43.815, TWD: 41.236, TZS: 3412.6, UGX: 4681.2, UYU: 54.213, VND: 32184, XAF: 769.05,
  XOF: 769.05, ZAR: 23.142, ZMW: 34.615,
};

/** Mid rate: 1 unit of `from` = x units of `to`. */
export function midRate(from: CurrencyCode, to: CurrencyCode): number {
  const f = GBP_MID_RATES[from];
  const t = GBP_MID_RATES[to];
  if (!f || !t) return 0;
  return t / f;
}

/** Round a rate to 6 significant figures, as shown to customers. */
export function roundRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Number(rate.toPrecision(6));
}

/** Convert minor units at the indicative mid rate. */
export function convertAtMid(amountMinor: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amountMinor;
  return convertMinor(amountMinor, from, to, midRate(from, to));
}

/** GBP equivalent (minor units) at the indicative mid rate, for limits and thresholds. */
export function toGbp(amountMinor: number, currency: CurrencyCode): number {
  return convertAtMid(amountMinor, currency, 'GBP');
}
