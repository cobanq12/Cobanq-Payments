import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Clock, FileSpreadsheet, FileText, Search, Send, X } from 'lucide-react';
import type { Payment, PaymentFilters, PaymentStatus, RailId } from '@core/api/types';
import { useAccount } from '@core/hooks/useAccount';
import { useApprovals, useChapsCutoffBanner, usePayments } from '@core/hooks/usePayments';
import { useStoredWizardDraft, WIZARD_STEPS } from '@core/hooks/usePaymentWizard';
import { ACCOUNT_CURRENCIES } from '@core/lib/currencies';
import { formatDateTime } from '@core/lib/dates';
import { initials } from '@core/lib/format';
import { formatMoney } from '@core/lib/money';
import { RAIL_NAMES } from '@core/payments/railConfig';
import { PAYMENT_STATUS, PAYMENT_STATUS_ORDER } from '@core/payments/statuses';
import { Button, LinkButton } from '../../components/Button';
import { Alert, Avatar, Badge, Card, CountryFlag, EmptyState, Pagination, PaymentStatusBadge, RailBadge, Skeleton } from '../../components/Primitives';
import { TabPanel, Tabs } from '../../components/Tabs';
import { PageHeader } from '../../layout/AppShell';
import { ApprovalsTab } from './ApprovalsTab';
import { PaymentDrawer } from './PaymentDrawer';

type TabId = 'payments' | 'approvals';

const selectClass = 'h-10 rounded-md border border-strong bg-surface px-2 text-sm text-ink';

function DraftCard() {
  const { draft, discard } = useStoredWizardDraft();
  const navigate = useNavigate();
  if (!draft) return null;
  const step = WIZARD_STEPS.find((s) => s.id === draft.step)?.label ?? 'Beneficiary';
  const who = draft.mode === 'new' ? (draft.values.name || `${draft.values.firstName ?? ''} ${draft.values.lastName ?? ''}`.trim() || 'New beneficiary') : 'Saved beneficiary';
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-muted"><FileText className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">Payment in progress <Badge tone="neutral">Draft</Badge></p>
          <p className="text-sm text-muted">{who}{draft.receiveAmount ? ` · ${draft.receiveAmount} ${draft.mode === 'new' ? draft.currency : ''}` : ''} · stopped at “{step}”</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => { void discard(); }}>Discard</Button>
        <Button size="sm" onClick={() => navigate('/payments/new')}>Resume</Button>
      </div>
    </Card>
  );
}

function PaymentRowMobile({ p, onOpen }: { p: Payment; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle">
        <Avatar text={initials(p.beneficiary.name)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{p.beneficiary.name}</span>
          <span className="block text-xs text-muted num">{formatDateTime(p.createdAt)} · {RAIL_NAMES[p.rail]}</span>
          <span className="mt-1 block"><PaymentStatusBadge status={p.status} /></span>
        </span>
        <span className="num shrink-0 text-sm font-semibold text-ink">{formatMoney(p.receiveAmount)}</span>
      </button>
    </li>
  );
}

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('payment');
  const [tab, setTab] = useState<TabId>(params.get('tab') === 'approvals' ? 'approvals' : 'payments');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<PaymentStatus | 'ALL'>('ALL');
  const [currency, setCurrency] = useState<string>('ALL');
  const [rail, setRail] = useState<RailId | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { const id = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(id); }, [search]);
  useEffect(() => { setPage(1); }, [debounced, status, currency, rail, from, to]);

  const filters: PaymentFilters = { search: debounced, status, currency, rail, from: from || undefined, to: to || undefined, page, pageSize: 10 };
  const query = usePayments(filters);
  const approvals = useApprovals();
  const account = useAccount();
  const banner = useChapsCutoffBanner();
  const hasFilters = debounced !== '' || status !== 'ALL' || currency !== 'ALL' || rail !== 'ALL' || from !== '' || to !== '';
  const clear = (): void => { setSearch(''); setStatus('ALL'); setCurrency('ALL'); setRail('ALL'); setFrom(''); setTo(''); };

  const open = (id: string | null): void => {
    const next = new URLSearchParams(params);
    if (id) next.set('payment', id); else next.delete('payment');
    setParams(next, { replace: true });
  };

  const data = query.data;
  const pending = approvals.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Pay UK and overseas beneficiaries from any of your balances."
        actions={<>
          <LinkButton to="/convert" variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}>Convert currency</LinkButton>
          <LinkButton to="/payments/bulk" variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>Bulk payment</LinkButton>
          <LinkButton to="/payments/new" state={{ fresh: true }} size="lg" icon={<Send className="h-4 w-4" aria-hidden="true" />}>Make a payment</LinkButton>
        </>}
      />

      {banner && (
        <Alert tone="warning" className="mb-4" live>
          <p className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4" aria-hidden="true" />{banner.message}</p>
        </Alert>
      )}

      <DraftCard />

      <Card>
        <Tabs<TabId>
          label="Payments views"
          value={tab}
          onChange={setTab}
          className="px-2"
          tabs={[
            { id: 'payments', label: 'Recent payments' },
            { id: 'approvals', label: 'Approvals', badge: pending > 0 ? <Badge tone="warning">{pending}</Badge> : undefined },
          ]}
        />

        {tab === 'payments' ? (
          <TabPanel id="payments">
            <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
              <div className="relative min-w-[14rem] flex-1">
                <label htmlFor="payment-search" className="sr-only">Search payments</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input id="payment-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by beneficiary, reference or amount"
                  className="h-10 w-full rounded-md border border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">Status
                <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | 'ALL')}>
                  <option value="ALL">All statuses</option>
                  {PAYMENT_STATUS_ORDER.filter((s) => s !== 'DRAFT').map((s) => <option key={s} value={s}>{PAYMENT_STATUS[s].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">Currency
                <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="ALL">All</option>
                  {[...ACCOUNT_CURRENCIES, 'PKR'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">Sent by
                <select className={selectClass} value={rail} onChange={(e) => setRail(e.target.value as RailId | 'ALL')}>
                  <option value="ALL">All</option>
                  {(Object.keys(RAIL_NAMES) as RailId[]).map((r) => <option key={r} value={r}>{RAIL_NAMES[r]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">From
                <input type="date" className={`${selectClass} num`} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">To
                <input type="date" className={`${selectClass} num`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
              {hasFilters && <Button variant="ghost" size="sm" onClick={clear} icon={<X className="h-4 w-4" aria-hidden="true" />}>Clear</Button>}
            </div>

            {query.isLoading ? (
              <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading payments">
                {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : query.isError ? (
              <div className="p-5"><Alert tone="danger" title="We couldn’t load your payments" action={<Button size="sm" variant="secondary" onClick={() => { void query.refetch(); }}>Try again</Button>} /></div>
            ) : !data || data.items.length === 0 ? (
              <EmptyState icon={<Send className="h-6 w-6" aria-hidden="true" />} title={hasFilters ? 'No payments match your filters' : 'No payments yet'}
                action={hasFilters ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : <LinkButton to="/payments/new" state={{ fresh: true }}>Make a payment</LinkButton>}>
                {hasFilters ? 'Try a different search, or clear the filters.' : 'When you make a payment it appears here.'}
              </EmptyState>
            ) : (
              <>
                <table className="hidden w-full text-left text-sm lg:table">
                  <caption className="sr-only">Recent payments</caption>
                  <thead className="border-b border-line text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Beneficiary</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Sent by</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.items.map((p) => (
                      <tr key={p.id} className="cursor-pointer hover:bg-subtle" onClick={() => open(p.id)}>
                        <td className="num whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(p.createdAt)}</td>
                        <td className="px-3 py-3">
                          <button type="button" onClick={(e) => { e.stopPropagation(); open(p.id); }} className="flex items-center gap-2 text-left font-semibold text-ink hover:underline" aria-label={`Open payment to ${p.beneficiary.name}, ${formatMoney(p.receiveAmount)}`}>
                            <CountryFlag country={p.beneficiary.country} />
                            <span className="max-w-[16rem] truncate">{p.beneficiary.name}</span>
                          </button>
                          <span className="block pl-6 text-xs text-muted">{p.payeeReference}</span>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-3 text-right font-semibold text-ink">{formatMoney(p.receiveAmount)}</td>
                        <td className="px-3 py-3"><RailBadge rail={p.rail} /></td>
                        <td className="px-5 py-3"><PaymentStatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-line lg:hidden">
                  {data.items.map((p) => <PaymentRowMobile key={p.id} p={p} onOpen={() => open(p.id)} />)}
                </ul>
                <div className="border-t border-line">
                  <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
                </div>
              </>
            )}
          </TabPanel>
        ) : (
          <TabPanel id="approvals">
            <ApprovalsTab items={approvals.data ?? []} loading={approvals.isLoading} role={account.data?.user.role ?? 'MAKER'} userId={account.data?.user.id ?? ''} onOpen={open} />
          </TabPanel>
        )}
      </Card>

      <PaymentDrawer paymentId={openId} onClose={() => open(null)} />
    </>
  );
}
