import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowUpRight, Check, Copy, FileSpreadsheet, LifeBuoy, UserPlus } from 'lucide-react';
import { useAdapters } from '@core/adapters';
import type { Payment } from '@core/api/types';
import { useAccount, useBalances } from '@core/hooks/useAccount';
import { usePayments } from '@core/hooks/usePayments';
import { currencyInfo } from '@core/lib/currencies';
import { formatDate, isoToUkDate } from '@core/lib/dates';
import { formatIban, formatSortCode, initials } from '@core/lib/format';
import { formatMoney, sumMinor } from '@core/lib/money';
import { Button } from '../components/Button';
import { cn } from '../components/cn';
import { Textarea } from '../components/Form';
import { Modal } from '../components/Overlay';
import { Avatar, Card, CountryFlag, CurrencyFlag, EmptyState, PaymentStatusBadge, Skeleton } from '../components/Primitives';
import { useToast } from '../components/Toast';
import { PaymentDrawer } from './payments/PaymentDrawer';

const QUICK_ACTIONS = [
  { to: '/payments/new', state: { fresh: true }, label: 'Send money', icon: ArrowUpRight },
  { to: '/convert', state: undefined, label: 'Convert', icon: ArrowLeftRight },
  { to: '/payments/bulk', state: undefined, label: 'Bulk payment', icon: FileSpreadsheet },
  { to: '/beneficiaries', state: undefined, label: 'Beneficiaries', icon: UserPlus },
] as const;

function feeOf(p: Payment): string {
  return formatMoney({ amount: sumMinor(p.fees.map((f) => f.amount.amount)), currency: p.payFromCurrency });
}

function Detail({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <dt className="font-semibold text-white">{label}</dt>
      <dd className="num flex items-center gap-1.5 text-right text-white/90">
        {value}
        {onCopy && (
          <button type="button" aria-label={`Copy ${label.toLowerCase()}`} onClick={onCopy} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </dd>
    </div>
  );
}

/** Dashboard: welcome, quick actions, balances, recent payments and account details. All live from the API. */
export function DashboardPage() {
  const account = useAccount();
  const balances = useBalances();
  const recent = usePayments({ pageSize: 5 });
  const { share } = useAdapters();
  const toast = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState('GBP');
  const [openId, setOpenId] = useState<string | null>(null);
  const [contact, setContact] = useState(false);
  const [message, setMessage] = useState('');

  const a = account.data;
  const copy = (label: string, value: string): void => { void share.copyText(value); toast.push({ title: `${label} copied`, tone: 'success' }); };
  const isGbp = selected === 'GBP';

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{a ? `Welcome back, ${a.user.name}` : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-muted">Here is your financial overview.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="quick-actions">
            <h2 id="quick-actions" className="mb-3 text-base font-semibold text-ink">Quick actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK_ACTIONS.map((q) => (
                <Link key={q.label} to={q.to} state={q.state} className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-3 py-5 text-center transition-colors hover:border-strong hover:bg-subtle">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-ink"><q.icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="text-sm font-semibold text-ink">{q.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="balances">
            <h2 id="balances" className="mb-3 text-base font-semibold text-ink">Balances</h2>
            {balances.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)}</div>
            ) : (
              <div role="radiogroup" aria-label="Balances" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(balances.data ?? []).map((b) => {
                  const on = b.currency === selected;
                  return (
                    <button key={b.currency} type="button" role="radio" aria-checked={on} onClick={() => setSelected(b.currency)}
                      className={cn('flex items-center gap-3 rounded-lg border p-3 text-left transition-colors', on ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-ink hover:border-strong')}>
                      <CurrencyFlag currency={b.currency} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold tracking-wide">{b.currency}</span>
                        <span className="num block truncate text-sm font-bold">{formatMoney({ amount: b.available, currency: b.currency })}</span>
                      </span>
                      {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <Card>
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Recent payments</h2>
              <Link to="/payments" className="text-sm font-semibold text-accent-text hover:underline">View all</Link>
            </div>
            {recent.isLoading ? (
              <div className="space-y-3 px-5 pb-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !recent.data || recent.data.items.length === 0 ? (
              <EmptyState title="No payments yet" action={<Button onClick={() => navigate('/payments/new', { state: { fresh: true } })}>Send money</Button>}>When you make a payment it appears here.</EmptyState>
            ) : (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Your five most recent payments</caption>
                  <thead className="text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Transaction</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Date</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Fee</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line border-t border-line">
                    {recent.data.items.map((p) => (
                      <tr key={p.id} className="cursor-pointer hover:bg-subtle" onClick={() => setOpenId(p.id)}>
                        <td className="py-3 pl-5 pr-2">
                          <button type="button" className="flex items-center gap-3 text-left" onClick={(e) => { e.stopPropagation(); setOpenId(p.id); }} aria-label={`Open payment to ${p.beneficiary.name}`}>
                            <Avatar text={initials(p.beneficiary.name)} className="h-9 w-9 text-xs" />
                            <span className="min-w-0">
                              <span className="block max-w-[10rem] truncate font-semibold text-ink">{p.beneficiary.name}</span>
                              <span className="block max-w-[10rem] truncate text-xs text-muted">{p.payeeReference}</span>
                            </span>
                          </button>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-3 text-muted">{formatDate(isoToUkDate(p.createdAt))}</td>
                        <td className="num whitespace-nowrap px-3 py-3 text-right font-semibold text-ink">
                          <span className="inline-flex items-center gap-2"><CountryFlag country={currencyInfo(p.receiveAmount.currency).flag} />{formatMoney(p.receiveAmount)}</span>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-3 text-right text-muted">{feeOf(p)}</td>
                        <td className="px-3 py-3"><PaymentStatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <section aria-label="Account details" className="rounded-lg bg-[#000031] p-5 text-white dark:border dark:border-line">
            {!a ? <Skeleton className="h-40 w-full bg-white/10" /> : (
              <>
                <h2 className="text-lg font-semibold uppercase tracking-tight">{a.businessName}</h2>
                <p className="mt-1 text-sm text-white/80">{a.businessAddress}</p>
                <dl className="mt-4">
                  {isGbp && <Detail label="Account number" value={a.accountNumber} onCopy={() => copy('Account number', a.accountNumber)} />}
                  {isGbp && <Detail label="Sort code" value={formatSortCode(a.sortCode)} onCopy={() => copy('Sort code', a.sortCode)} />}
                  <Detail label="IBAN" value={formatIban(a.iban)} onCopy={() => copy('IBAN', a.iban)} />
                  {!isGbp && <Detail label="BIC" value={a.bic} onCopy={() => copy('BIC', a.bic)} />}
                  <Detail label="Account type" value={isGbp ? 'Sterling' : currencyInfo(selected).name} />
                </dl>
                <p className="mt-3 text-xs text-white/70">Details for collecting {selected}. Choose another balance to see its details.</p>
              </>
            )}
          </section>

          <section aria-labelledby="need-help" className="rounded-lg border border-line bg-surface p-5">
            <h2 id="need-help" className="flex items-center gap-2 text-base font-semibold text-ink"><LifeBuoy className="h-5 w-5 text-muted" aria-hidden="true" />Need help?</h2>
            <p className="mt-1 text-sm text-muted">If you need help, reach out to our support team.</p>
            <Button variant="secondary" className="mt-4" onClick={() => setContact(true)}>Contact support</Button>
          </section>
        </div>
      </div>

      <PaymentDrawer paymentId={openId} onClose={() => setOpenId(null)} />

      <Modal open={contact} onClose={() => setContact(false)} title="Contact support" description="Tell us what you need and the team will get back to you."
        footer={<>
          <Button variant="secondary" onClick={() => setContact(false)}>Cancel</Button>
          <Button disabled={message.trim().length < 10} onClick={() => { setContact(false); setMessage(''); toast.push({ title: 'Test version', body: 'Your message was not sent. In the live app this goes to the support team.', tone: 'info' }); }}>Send message</Button>
        </>}>
        <Textarea label="How can we help?" value={message} onChange={(e) => setMessage(e.target.value)} hint="At least 10 characters." data-autofocus />
      </Modal>
    </>
  );
}
