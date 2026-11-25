import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { friendlyError } from '../api/errors';
import type { CurrencyCode, FxQuote } from '../api/types';
import { isQuoteExpired, quoteFractionLeft, quoteSecondsLeft } from '../fx/quote';
import { useTicker } from './useNow';

export interface FxQuoteParams {
  sellCurrency: CurrencyCode;
  buyCurrency: CurrencyCode;
  /** Exactly one of these should be set (minor units). */
  sellAmount?: number;
  buyAmount?: number;
  enabled?: boolean;
}

/**
 * Live FX quote with a 30-second lock. Debounces typing, counts down,
 * re-quotes automatically on expiry and flags when the rate moved.
 */
export function useFxQuote(params: FxQuoteParams) {
  const { sellCurrency, buyCurrency, sellAmount, buyAmount } = params;
  const hasAmount = (sellAmount ?? 0) > 0 || (buyAmount ?? 0) > 0;
  const enabled = params.enabled !== false && sellCurrency !== buyCurrency && hasAmount;

  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateUpdated, setRateUpdated] = useState(false);
  const requestId = useRef(0);
  const lastRate = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After a failed quote, wait before retrying so an outage cannot cause a request loop. */
  const retryAt = useRef(0);

  const fetchQuote = useCallback(async (flagChange: boolean) => {
    const mine = ++requestId.current;
    setLoading(true);
    try {
      const q = await api.getFxQuote(sellAmount !== undefined ? { sellCurrency, buyCurrency, sellAmount } : { sellCurrency, buyCurrency, buyAmount });
      if (requestId.current !== mine) return;
      if (flagChange && lastRate.current !== null && lastRate.current !== q.rate) {
        setRateUpdated(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setRateUpdated(false), 3000);
      }
      lastRate.current = q.rate;
      setQuote(q);
      setError(null);
    } catch (e) {
      if (requestId.current !== mine) return;
      retryAt.current = Date.now() + 3000;
      setError(friendlyError(e));
    } finally {
      if (requestId.current === mine) setLoading(false);
    }
  }, [sellCurrency, buyCurrency, sellAmount, buyAmount]);

  // New inputs: debounce, then quote. A pair change is not a "rate update".
  const pair = `${sellCurrency}/${buyCurrency}`;
  const lastPair = useRef(pair);
  useEffect(() => {
    if (!enabled) {
      requestId.current++;
      setQuote(null);
      setLoading(false);
      setError(null);
      lastRate.current = null;
      return;
    }
    if (lastPair.current !== pair) { lastPair.current = pair; lastRate.current = null; setQuote(null); }
    setLoading(true);
    const id = setTimeout(() => { void fetchQuote(false); }, 400);
    return () => clearTimeout(id);
  }, [enabled, pair, fetchQuote]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const nowMs = useTicker(250, enabled && quote !== null);
  const secondsLeft = quote ? quoteSecondsLeft(quote, nowMs) : 0;
  const fraction = quote ? quoteFractionLeft(quote, nowMs) : 0;
  const expired = quote ? isQuoteExpired(quote, nowMs) : false;

  // Lock ran out: re-quote automatically and highlight any change.
  useEffect(() => {
    if (enabled && quote && expired && !loading && nowMs >= retryAt.current) void fetchQuote(true);
  }, [enabled, quote, expired, loading, fetchQuote, nowMs]);

  const refresh = useCallback(() => fetchQuote(true), [fetchQuote]);

  return {
    quote: enabled ? quote : null,
    loading: enabled && loading,
    error,
    secondsLeft,
    fraction,
    /** True while the rate is guaranteed. */
    locked: !!quote && !expired,
    rateUpdated,
    refresh,
  };
}

export type FxQuoteController = ReturnType<typeof useFxQuote>;
