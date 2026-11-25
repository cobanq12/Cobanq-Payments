/** Pure FX quote helpers: building a quote and checking its lock. */
import type { FxQuote, FxQuoteRequest } from '../api/types';
import { convertMinor, convertMinorInverse } from '../lib/money';
import { fxFee } from '../payments/fees';
import { railConfig as defaultConfig, type RailConfig } from '../payments/railConfig';
import { roundRate } from './rates';

export function buildQuote(req: FxQuoteRequest, rawRate: number, nowMs: number, quoteId: string, cfg: RailConfig = defaultConfig): FxQuote {
  const rate = roundRate(rawRate);
  const sellAmount = req.sellAmount !== undefined
    ? req.sellAmount
    : convertMinorInverse(req.buyAmount ?? 0, req.sellCurrency, req.buyCurrency, rate);
  const buyAmount = req.buyAmount !== undefined && req.sellAmount === undefined
    ? req.buyAmount
    : convertMinor(sellAmount, req.sellCurrency, req.buyCurrency, rate);
  return {
    quoteId,
    sellCurrency: req.sellCurrency,
    buyCurrency: req.buyCurrency,
    sellAmount,
    buyAmount,
    rate,
    inverseRate: roundRate(1 / rate),
    fee: { amount: fxFee(sellAmount, cfg), currency: req.sellCurrency },
    expiresAt: new Date(nowMs + cfg.quoteLockSeconds * 1000).toISOString(),
  };
}

/** Whole seconds left on the quote lock (never negative). */
export function quoteSecondsLeft(quote: Pick<FxQuote, 'expiresAt'>, nowMs: number): number {
  return Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - nowMs) / 1000));
}

export function isQuoteExpired(quote: Pick<FxQuote, 'expiresAt'>, nowMs: number): boolean {
  return new Date(quote.expiresAt).getTime() <= nowMs;
}

/** Fraction of the lock remaining, 1 → 0, for the ring timer. */
export function quoteFractionLeft(quote: Pick<FxQuote, 'expiresAt'>, nowMs: number, cfg: RailConfig = defaultConfig): number {
  const left = new Date(quote.expiresAt).getTime() - nowMs;
  return Math.min(1, Math.max(0, left / (cfg.quoteLockSeconds * 1000)));
}
