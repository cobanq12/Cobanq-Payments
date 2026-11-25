import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { friendlyError } from '../api/errors';
import type { CurrencyCode, FxQuote } from '../api/types';
import { ACCOUNT_CURRENCIES } from '../lib/currencies';
import { formatMoney, minorToInput, parseAmount } from '../lib/money';
import { qk } from './queryKeys';
import { useBalances } from './useAccount';
import { useFxQuote } from './useFxQuote';

export interface ConvertResult {
  quote: FxQuote;
}

/** Standalone currency conversion between two of the account's balances. */
export function useConvert(initial?: { from?: CurrencyCode; to?: CurrencyCode }) {
  const balances = useBalances();
  const [from, setFromState] = useState<CurrencyCode>(initial?.from ?? 'GBP');
  const [to, setToState] = useState<CurrencyCode>(initial?.to ?? 'EUR');
  const [sellInput, setSellInput] = useState('');
  const [buyInput, setBuyInput] = useState('');
  const [lastEdited, setLastEdited] = useState<'sell' | 'buy'>('sell');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  /** The quote the customer confirmed, kept so the success screen shows what was approved. */
  const [confirmedQuote, setConfirmedQuote] = useState<FxQuote | null>(null);

  const sellParsed = parseAmount(sellInput, from);
  const buyParsed = parseAmount(buyInput, to);
  const quoteParams = lastEdited === 'sell'
    ? { sellAmount: sellParsed.ok && sellParsed.minor > 0 ? sellParsed.minor : undefined }
    : { buyAmount: buyParsed.ok && buyParsed.minor > 0 ? buyParsed.minor : undefined };
  const fx = useFxQuote({ sellCurrency: from, buyCurrency: to, ...quoteParams, enabled: !result && !submitting });

  // Fill the other field from the quote.
  const quote = fx.quote;
  useEffect(() => {
    if (!quote) return;
    if (lastEdited === 'sell') setBuyInput(minorToInput(quote.buyAmount, quote.buyCurrency));
    else setSellInput(minorToInput(quote.sellAmount, quote.sellCurrency));
  }, [quote, lastEdited]);

  const setSell = useCallback((v: string) => { setSellInput(v); setLastEdited('sell'); if (v.trim() === '') setBuyInput(''); setError(null); }, []);
  const setBuy = useCallback((v: string) => { setBuyInput(v); setLastEdited('buy'); if (v.trim() === '') setSellInput(''); setError(null); }, []);

  const setFrom = useCallback((c: CurrencyCode) => {
    setFromState(c);
    if (c === to) setToState(from);
  }, [from, to]);

  const setTo = useCallback((c: CurrencyCode) => {
    setToState(c);
    if (c === from) setFromState(to);
  }, [from, to]);

  const swap = useCallback(() => {
    setFromState(to);
    setToState(from);
    setSellInput(buyInput);
    setBuyInput(sellInput);
    setLastEdited('sell');
  }, [from, to, sellInput, buyInput]);

  const available = balances.data?.find((b) => b.currency === from)?.available ?? 0;
  const totalDebit = quote ? quote.sellAmount + quote.fee.amount : 0;

  const validation = useMemo((): string | null => {
    const active = lastEdited === 'sell' ? sellParsed : buyParsed;
    const ccy = lastEdited === 'sell' ? from : to;
    if (!active.ok) {
      if (active.error === 'EMPTY') return null;
      if (active.error === 'TOO_MANY_DECIMALS') return ccy === 'JPY' ? 'Yen amounts can’t have decimal places.' : `Use up to 2 decimal places for ${ccy}.`;
      return 'Enter a valid amount.';
    }
    if (quote && totalDebit > available) {
      return `Your available ${from} balance is ${formatMoney({ amount: available, currency: from })}. You need ${formatMoney({ amount: totalDebit, currency: from })} including the fee.`;
    }
    return null;
  }, [sellParsed, buyParsed, lastEdited, from, to, quote, totalDebit, available]);

  const canConvert = !!quote && fx.locked && !validation && !submitting;

  /** Start the conversion. Resolves with the SCA challenge to approve. */
  const start = useCallback(async (): Promise<string | null> => {
    if (!quote) return null;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.convert({ quoteId: quote.quoteId });
      setConfirmedQuote(quote);
      return res.scaChallengeId;
    } catch (e) {
      setError(friendlyError(e));
      setSubmitting(false);
      void fx.refresh();
      return null;
    }
  }, [quote, fx]);

  const complete = useCallback(() => {
    if (confirmedQuote) setResult({ quote: confirmedQuote });
    setSubmitting(false);
  }, [confirmedQuote]);

  const cancel = useCallback(() => { setSubmitting(false); setConfirmedQuote(null); }, []);

  const reset = useCallback(() => {
    setResult(null);
    setConfirmedQuote(null);
    setSellInput('');
    setBuyInput('');
    setError(null);
  }, []);

  const pair = `${from}/${to}`;
  const history = useQuery({ queryKey: qk.rateHistory(pair), queryFn: () => api.getRateHistory(pair), staleTime: 60_000 });

  return {
    currencies: ACCOUNT_CURRENCIES, balances: balances.data ?? [], from, to, setFrom, setTo, swap,
    sellInput, buyInput, setSell, setBuy, fx, quote, totalDebit, available, validation, canConvert,
    start, complete, cancel, reset, submitting, error, result, history: history.data ?? [], historyLoading: history.isLoading,
  };
}

/** Indicative rates for every payout currency, for the searchable Rates table. */
export function useIndicativeRates(base: CurrencyCode) {
  return useQuery({ queryKey: qk.indicativeRates(base), queryFn: () => api.getIndicativeRates(base), staleTime: 60_000 });
}
