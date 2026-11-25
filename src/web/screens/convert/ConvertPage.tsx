import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownUp, Search } from 'lucide-react';
import type { CurrencyCode } from '@core/api/types';
import { useConvert, useIndicativeRates } from '@core/hooks/useConvert';
import { useSca } from '@core/hooks/useSca';
import { currencyInfo, isAccountCurrency } from '@core/lib/currencies';
import { formatMoney, formatRate } from '@core/lib/money';
import { Button, IconButton } from '../../components/Button';
import { AmountInput, Select } from '../../components/Form';
import { Alert, Badge, Card, CardHeader, CurrencyFlag, Row, Skeleton } from '../../components/Primitives';
import { PageHeader } from '../../layout/AppShell';
import { FxQuoteCard } from '../payments/wizard/FxQuoteCard';
import { ScaModal } from '../ScaModal';
import { RateChart } from './RateChart';

function RatesTable({ base }: { base: CurrencyCode }) {
  const { data, isLoading } = useIndicativeRates(base);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((r) => !q || r.currency.toLowerCase().includes(q) || currencyInfo(r.currency).name.toLowerCase().includes(q));
  }, [data, search]);
  return (
    <Card>
      <CardHeader title="Rates" description={`Indicative rates for 1 ${base} across every payout currency.`} />
      <div className="border-b border-line px-5 py-3">
        <div className="relative">
          <label htmlFor="rate-search" className="sr-only">Search currencies</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input id="rate-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by currency or code"
            className="h-10 w-full rounded-md border border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Indicative exchange rates from {base}</caption>
            <thead className="sticky top-0 border-b border-line bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Currency</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Type</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">1 {base} =</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.currency}>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <CurrencyFlag currency={r.currency} size="sm" />
                      <span className="font-semibold text-ink">{r.currency}</span>
                      <span className="truncate text-muted">{currencyInfo(r.currency).name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{isAccountCurrency(r.currency) ? <Badge tone="info">Account balance</Badge> : <Badge tone="neutral">Payout only</Badge>}</td>
                  <td className="num px-5 py-2.5 text-right font-medium text-ink">{formatRate(r.rate)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-muted">No currencies match “{search}”.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        You can keep balances in 12 currencies. Currencies marked “Payout only” are converted at the point of payout when you make a payment.
      </p>
    </Card>
  );
}

/** Standalone currency conversion between two balances, with a live locked quote. */
export function ConvertPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = (location.state ?? {}) as { from?: CurrencyCode; to?: CurrencyCode };
  const c = useConvert(initial);
  const sca = useSca({
    onApproved: () => { c.complete(); sca.close(); },
    onCancelled: () => c.cancel(),
  });

  const options = () => c.currencies.map((code) => {
    const bal = c.balances.find((b) => b.currency === code);
    return { value: code, label: `${code} — ${bal ? formatMoney({ amount: bal.available, currency: code }) : '…'}` };
  });

  const convert = async (): Promise<void> => {
    const challengeId = await c.start();
    if (challengeId) await sca.open(challengeId);
  };

  return (
    <>
      <PageHeader title="Convert currency" description="Move money between your balances at a live rate. The fee is always shown separately." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          {c.result ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-success-bg" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-9 w-9 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" strokeDashoffset="24" className="animate-draw" />
                </svg>
              </span>
              <div role="status">
                <h2 className="mt-4 text-2xl font-semibold text-ink">Conversion complete</h2>
                <p className="mt-1 text-sm text-muted">The money is in your {c.result.quote.buyCurrency} balance now.</p>
              </div>
              <dl className="mx-auto mt-6 max-w-sm rounded-lg border border-line p-4 text-left">
                <Row label="You converted"><span className="num">{formatMoney({ amount: c.result.quote.sellAmount, currency: c.result.quote.sellCurrency })}</span></Row>
                <Row label="Rate"><span className="num">1 {c.result.quote.sellCurrency} = {formatRate(c.result.quote.rate)} {c.result.quote.buyCurrency}</span></Row>
                <Row label="Conversion fee"><span className="num">{formatMoney(c.result.quote.fee)}</span></Row>
                <Row label="You received" strong><span className="num">{formatMoney({ amount: c.result.quote.buyAmount, currency: c.result.quote.buyCurrency })}</span></Row>
              </dl>
              <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
                <Button onClick={() => navigate('/payments/new', { state: { payFrom: c.result!.quote.buyCurrency } })}>Pay from your {c.result.quote.buyCurrency} balance</Button>
                <Button variant="secondary" onClick={c.reset}>Convert again</Button>
              </div>
            </div>
          ) : (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void convert(); }} className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="mt-[26px]"><CurrencyFlag currency={c.from} size="lg" /></span>
                <Select label="From balance" className="flex-1" value={c.from} onChange={(e) => c.setFrom(e.target.value)} options={options()} />
              </div>
              <AmountInput label="You convert" currency={c.from} value={c.sellInput} onChange={c.setSell} error={c.validation} autoFocus />

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
                <IconButton label="Swap currencies" onClick={c.swap} className="border border-strong"><ArrowDownUp className="h-4 w-4" aria-hidden="true" /></IconButton>
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
              </div>

              <div className="flex items-start gap-3">
                <span className="mt-[26px]"><CurrencyFlag currency={c.to} size="lg" /></span>
                <Select label="To balance" className="flex-1" value={c.to} onChange={(e) => c.setTo(e.target.value)} options={options()} />
              </div>
              <AmountInput label="You receive" currency={c.to} value={c.buyInput} onChange={c.setBuy} loading={c.fx.loading} flash={c.fx.rateUpdated} />

              <FxQuoteCard fx={c.fx} sellCurrency={c.from} buyCurrency={c.to} totalDebit={c.quote ? { amount: c.totalDebit, currency: c.from } : null} />

              {c.error && <Alert tone="danger" live><p>{c.error}</p></Alert>}

              <Button type="submit" block size="lg" disabled={!c.canConvert} loading={c.submitting}>Convert now</Button>
              <p className="text-center text-xs text-muted">You’ll approve the conversion with a one-time code.</p>
            </form>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-ink">{c.from} to {c.to}, last 30 days</h2>
            <RateChart points={c.history} pair={`${c.from}/${c.to}`} loading={c.historyLoading} />
          </Card>
          <RatesTable base={c.from} />
        </div>
      </div>
      <ScaModal sca={sca} />
    </>
  );
}
