import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { History, Pencil, Plus, Search, Send, Trash2, Users } from 'lucide-react';
import { friendlyError } from '@core/api/errors';
import type { Beneficiary, BeneficiaryType } from '@core/api/types';
import { useBeneficiaries, useBeneficiaryEditor, useBeneficiaryHistory } from '@core/hooks/useBeneficiaries';
import { useSca } from '@core/hooks/useSca';
import { countryName } from '@core/lib/countries';
import { ALL_CURRENCY_CODES, currencyInfo } from '@core/lib/currencies';
import { formatDate, formatDateTime, isoToUkDate } from '@core/lib/dates';
import { initials, maskAccount } from '@core/lib/format';
import { formatMoney } from '@core/lib/money';
import { buildBeneficiarySchema, primaryAccount, type BeneficiaryFormValues } from '@core/payments/beneficiarySchemas';
import { COP_META } from '@core/payments/statuses';
import { Button, IconButton } from '../../components/Button';
import { CountryPicker } from '../../components/CountryPicker';
import { FieldShell, Input, Select } from '../../components/Form';
import { Drawer, Modal } from '../../components/Overlay';
import { Alert, Avatar, Badge, Card, CountryFlag, EmptyState, PaymentStatusBadge, Skeleton } from '../../components/Primitives';
import { Segmented } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { PageHeader } from '../../layout/AppShell';
import { CopBadge } from '../payments/PaymentBits';
import { ScaModal } from '../ScaModal';
import { BeneficiaryFields, defaultsFor } from './BeneficiaryFields';

/** Add / edit dialog. Editing bank details needs a one-time code. */
function Editor({ existing, onClose, onSca }: { existing: Beneficiary | null; onClose: () => void; onSca: (challengeId: string) => void }) {
  const editor = useBeneficiaryEditor(existing);
  const toast = useToast();
  const { ctx, fields } = editor;
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const resolver = useMemo(() => zodResolver(buildBeneficiarySchema(fields)), [fields]);
  const form = useForm<BeneficiaryFormValues>({
    resolver, mode: 'onTouched', reValidateMode: 'onChange',
    defaultValues: defaultsFor(fields, editor.initialValues, ctx.country),
  });

  // Changing country, currency or type changes the fields: keep what still applies.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const current = form.getValues();
    form.reset(defaultsFor(fields, { ...current, addressCountry: ctx.country }, ctx.country));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.country, ctx.currency, ctx.type]);

  const { cop, clearCop } = editor;
  useEffect(() => {
    if (!cop) return;
    const sub = form.watch((_v, info) => { if (info.type === 'change') clearCop(); });
    return () => sub.unsubscribe();
  }, [form, cop, clearCop]);

  const submit = (acceptCop: boolean) => form.handleSubmit(async (values) => {
    setError(null);
    const outcome = await editor.save(values, nickname, { acceptCop });
    if (outcome.kind === 'saved') {
      toast.push({ title: existing ? 'Beneficiary updated' : 'Beneficiary added', body: outcome.beneficiary.name, tone: 'success' });
      onClose();
    } else if (outcome.kind === 'sca') { onSca(outcome.challengeId); onClose(); }
    else if (outcome.kind === 'error') setError(outcome.message);
  });

  const copWarning = cop && !(cop.result === 'MATCH' && !cop.accountTypeMismatch) ? cop : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={existing ? `Edit ${existing.name}` : 'Add a beneficiary'}
      description={existing ? 'Changing the name or bank details needs a one-time code.' : 'The details we need depend on where their bank is and the currency they’ll receive.'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {copWarning
          ? <Button loading={editor.saving} onClick={() => { void submit(true)(); }}>Save anyway</Button>
          : <Button loading={editor.saving} onClick={() => { void submit(false)(); }}>{existing ? 'Save changes' : editor.corridor === 'UK_GBP' ? 'Check and save' : 'Save beneficiary'}</Button>}
      </>}
    >
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(false)(); }} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <CountryPicker label="Where is their bank account?" value={ctx.country} onChange={(country) => editor.setCtx({ country })} />
          <Select label="What currency will they receive?" value={ctx.currency} onChange={(e) => editor.setCtx({ currency: e.target.value })}
            options={ALL_CURRENCY_CODES.map((c) => ({ value: c, label: `${c} — ${currencyInfo(c).name}` }))} />
          <FieldShell id="editor-type" label="Business or individual?">
            <div id="editor-type">
              <Segmented<BeneficiaryType> label="Business or individual" value={ctx.type} onChange={(type) => editor.setCtx({ type })}
                options={[{ value: 'BUSINESS', label: 'Business' }, { value: 'INDIVIDUAL', label: 'Individual' }]} />
            </div>
          </FieldShell>
        </div>

        <BeneficiaryFields fields={fields} control={form.control} errors={form.formState.errors} bank={editor.bank}
          onLookup={(kind, value) => { void editor.lookup(kind, value); }} onResetBank={editor.resetBank} />

        <Input label="Nickname" optional value={nickname} maxLength={30} onChange={(e) => setNickname(e.target.value)} hint="Only you see this." className="max-w-sm" />

        {copWarning && (
          <Alert tone={COP_META[copWarning.result].tone === 'danger' ? 'danger' : 'warning'} live
            title={copWarning.result === 'NO_MATCH' ? 'The name doesn’t match the account holder'
              : copWarning.result === 'CLOSE_MATCH' ? 'The name is similar, but not the same'
              : copWarning.result === 'UNAVAILABLE' ? 'We couldn’t check this name right now' : 'The account type is different'}>
            {copWarning.result === 'CLOSE_MATCH' && <p>The account name is <span className="font-semibold">{copWarning.suggestedName}</span>. Correct the name above, or save anyway.</p>}
            {copWarning.result === 'NO_MATCH' && <p>Check the details with the beneficiary before you save. Paying the wrong account can mean you don’t get your money back.</p>}
            {copWarning.result === 'UNAVAILABLE' && <p>You can save now. We’ll check the name again when you make a payment.</p>}
            {copWarning.result === 'MATCH' && <p>The name matches, but the account is a {ctx.type === 'BUSINESS' ? 'personal' : 'business'} account. Change the type above, or save anyway.</p>}
          </Alert>
        )}
        {error && <Alert tone="danger" live><p>{error}</p></Alert>}
      </form>
    </Modal>
  );
}

function HistoryDrawer({ beneficiary, onClose }: { beneficiary: Beneficiary | null; onClose: () => void }) {
  const { data, isLoading } = useBeneficiaryHistory(beneficiary?.id ?? null);
  const navigate = useNavigate();
  return (
    <Drawer open={!!beneficiary} onClose={onClose} title={beneficiary ? `Payments to ${beneficiary.name}` : 'Payments'}>
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" aria-hidden="true" />} title="No payments yet">You haven’t paid this beneficiary yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.items.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-subtle" onClick={() => navigate(`/payments?payment=${p.id}`)}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink num">{formatMoney(p.receiveAmount)}</span>
                  <span className="block truncate text-xs text-muted num">{formatDateTime(p.createdAt)} · {p.payeeReference}</span>
                </span>
                <PaymentStatusBadge status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

export function BeneficiariesPage() {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const all = useBeneficiaries({});
  const { remove, refresh } = all;
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState<Beneficiary | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Beneficiary | null>(null);
  const [history, setHistory] = useState<Beneficiary | null>(null);
  const scaMessage = useRef('Beneficiary updated');

  const sca = useSca({
    onApproved: () => { toast.push({ title: scaMessage.current, tone: 'success' }); void refresh(); sca.close(); },
  });

  const countries = useMemo(() => [...new Set(all.beneficiaries.map((b) => b.country))].sort((a, b) => countryName(a).localeCompare(countryName(b))), [all.beneficiaries]);
  const currencies = useMemo(() => [...new Set(all.beneficiaries.map((b) => b.currency))].sort(), [all.beneficiaries]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.beneficiaries.filter((b) => {
      if (country && b.country !== country) return false;
      if (currency && b.currency !== currency) return false;
      if (!q) return true;
      return [b.name, b.nickname ?? '', b.details.iban ?? '', b.details.accountNumber ?? '', b.resolvedBank ?? ''].some((v) => v.toLowerCase().includes(q));
    });
  }, [all.beneficiaries, search, country, currency]);

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    try {
      const res = await remove.mutateAsync(deleting.id);
      scaMessage.current = `${deleting.name} deleted`;
      setDeleting(null);
      await sca.open(res.scaChallengeId);
    } catch (e) {
      toast.push({ title: 'Couldn’t delete', body: friendlyError(e), tone: 'danger' });
    }
  };

  const filterClass = 'h-10 rounded-md border border-strong bg-surface px-2 text-sm text-ink';

  return (
    <>
      <PageHeader
        title="Beneficiaries"
        description="The people and businesses you pay."
        actions={<Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Add beneficiary</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <div className="relative min-w-[14rem] flex-1">
            <label htmlFor="beneficiary-search" className="sr-only">Search beneficiaries</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input id="beneficiary-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, account or bank"
              className="h-10 w-full rounded-md border border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">Country
            <select className={filterClass} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">Currency
            <select className={filterClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">All currencies</option>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        {all.isLoading ? (
          <div className="space-y-3 p-5" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title={all.beneficiaries.length === 0 ? 'No beneficiaries yet' : 'No beneficiaries match'}
            action={<Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Add beneficiary</Button>}>
            {all.beneficiaries.length === 0 ? 'Add someone to pay them faster next time.' : 'Try a different search or filter.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((b) => {
              const acct = primaryAccount(b);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                  <Avatar text={initials(b.name)} />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{b.name}</span>
                      {b.nickname && <span className="text-xs text-muted">“{b.nickname}”</span>}
                      {b.internal && <Badge tone="info">Cobanq account</Badge>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <CountryFlag country={b.country} />
                      <span>{countryName(b.country)} · {b.currency}</span>
                      <span className="num">· {acct.label} {maskAccount(acct.value)}</span>
                      {b.resolvedBank && <span>· {b.resolvedBank}</span>}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {b.cop ? <CopBadge cop={b.cop} withDate /> : b.country === 'GB' && b.currency === 'GBP' ? <Badge tone="neutral">Name not checked yet</Badge> : null}
                      <span className="num">{b.lastPaidAt ? `Last paid ${formatDate(isoToUkDate(b.lastPaidAt))}` : 'Not paid yet'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => navigate('/payments/new', { state: { beneficiary: b } })} icon={<Send className="h-4 w-4" aria-hidden="true" />}>Pay</Button>
                    <IconButton label={`Payment history for ${b.name}`} onClick={() => setHistory(b)}><History className="h-4 w-4" aria-hidden="true" /></IconButton>
                    <IconButton label={`Edit ${b.name}`} onClick={() => setEditing(b)}><Pencil className="h-4 w-4" aria-hidden="true" /></IconButton>
                    <IconButton label={`Delete ${b.name}`} onClick={() => setDeleting(b)} className="hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <Editor
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSca={(challengeId) => { scaMessage.current = 'Beneficiary updated'; void sca.open(challengeId); }}
        />
      )}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete this beneficiary?" size="sm"
        description={deleting ? `${deleting.name} will be removed from your saved beneficiaries.` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setDeleting(null)}>Keep</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => { void confirmDelete(); }}>Delete</Button>
        </>}>
        <p className="text-sm text-muted">Your payment history stays. You’ll confirm with a one-time code.</p>
      </Modal>

      <HistoryDrawer beneficiary={history} onClose={() => setHistory(null)} />
      <ScaModal sca={sca} />
    </>
  );
}
