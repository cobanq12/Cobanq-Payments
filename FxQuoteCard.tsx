import { Lock, RefreshCw } from 'lucide-react';
import type { FxQuoteController } from '@core/hooks/useFxQuote';
import { formatMoney, formatRate } from '@core/lib/money';
import { cn } from '../../../components/cn';
import { RingTimer, Row, Skeleton } from '../../../components/Primitives';

/** Inline FX quote: rate, inverse, fee, totals and the 30-second lock countdown. */
export function FxQuoteCard({ fx, sellCurrency, buyCurrency, totalDebit, receives, compact }: {
  fx: FxQuoteController; sellCurrency: string; buyCurrency: string;
  /** Total leaving the balance including every fee, when known. */
  totalDebit?: { amount: number; currency: string } | null;
  receives?: { amount: number; currency: string } | null;
  compact?: boolean;
}) {
  const q = fx.quote;
  if (!q) {
    return (
      <div className="rounded-lg border border-line bg-subtle p-4" aria-busy={fx.loading}>
        {fx.loading ? (
          <div className="space-y-2"><Skeleton className="h-5 w-48 bg-line" /><Skeleton className="h-4 w-64 bg-line" /></div>
        ) : fx.error ? (
          <p className="text-sm text-danger" role="alert">{fx.error}</p>
        ) : (
          <p className="text-sm text-muted">Enter an amount to see the live {sellCurrency} → {buyCurrency} rate.</p>
        )}
      </div>
    );
  }
  return (
    <div className={cn('rounded-lg border border-line bg-subtle p-4', fx.rateUpdated && 'animate-flash')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Exchange rate</p>
          <p className="mt-0.5 text-lg font-semibold text-ink num">1 {q.sellCurrency} = {formatRate(q.rate)} {q.buyCurrency}</p>
          <p className="text-xs text-muted num">1 {q.buyCurrency} = {formatRate(q.inverseRate)} {q.sellCurrency}</p>
        </div>
        <div className="flex items-center gap-2">
          {fx.loading && <RefreshCw className="h-4 w-4 animate-spin text-muted" aria-label="Updating rate" />}
          <RingTimer fraction={fx.fraction} seconds={fx.secondsLeft} />
        </div>
      </div>
      <div aria-live="polite" className="mt-2 min-h-5 text-xs">
        {fx.rateUpdated ? (
          <span className="font-semibold text-warning">Rate updated</span>
        ) : fx.locked ? (
          <span className="inline-flex items-center gap-1 text-muted"><Lock className="h-3 w-3" aria-hidden="true" />Rate guaranteed until you confirm, for the next {fx.secondsLeft} seconds. It refreshes automatically.</span>
        ) : (
          <span className="text-muted">Getting a new rate…</span>
        )}
      </div>
      {!compact && (
        <dl className="mt-2 border-t border-line pt-2">
          <Row label="You convert"><span className="num">{formatMoney({ amount: q.sellAmount, currency: q.sellCurrency })}</span></Row>
          <Row label="Cobanq conversion fee (0.5%)"><span className="num">{formatMoney(q.fee)}</span></Row>
          {totalDebit && <Row label={`Total from your ${totalDebit.currency} balance`} strong><span className="num">{formatMoney(totalDebit)}</span></Row>}
          <Row label="They receive" strong><span className="num">{formatMoney(receives ?? { amount: q.buyAmount, currency: q.buyCurrency })}</span></Row>
        </dl>
      )}
    </div>
  );
}
