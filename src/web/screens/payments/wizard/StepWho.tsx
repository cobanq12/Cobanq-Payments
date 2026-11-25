import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { ChevronRight, Loader2, Search, UserPlus, Users } from 'lucide-react';
import type { PaymentWizard } from '@core/hooks/usePaymentWizard';
import { ALL_CURRENCY_CODES, currencyInfo } from '@core/lib/currencies';
import { formatDate, isoToUkDate } from '@core/lib/dates';
import { initials, maskAccount } from '@core/lib/format';
import { primaryAccount } from '@core/payments/beneficiarySchemas';
import { newBeneficiaryStartSchema, type NewBeneficiaryStartValues } from '@core/payments/schemas';
import { Button } from '../../../components/Button';
import { CountryPicker } from '../../../components/CountryPicker';
import { FieldShell, Select } from '../../../components/Form';
import { Avatar, Badge, CountryFlag, EmptyState, Skeleton } from '../../../components/Primitives';
import { Segmented, TabPanel, Tabs } from '../../../components/Tabs';

type Tab = 'saved' | 'new';

/** Step 1 — Who are you paying? Pick a saved beneficiary or start a new one. */
export function StepWho({ wizard }: { wizard: PaymentWizard }) {
  const [tab, setTab] = useState<Tab>(wizard.draft.mode === 'new' ? 'new' : 'saved');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = [...wizard.beneficiaries].sort((a, b) => (b.lastPaidAt ?? '').localeCompare(a.lastPaidAt ?? ''));
    if (!q) return all;
    return all.filter((b) => [b.name, b.nickname ?? '', b.details.iban ?? '', b.details.accountNumber ?? '', b.currency, b.resolvedBank ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [wizard.beneficiaries, search]);

  const form = useForm<NewBeneficiaryStartValues>({
    resolver: zodResolver(newBeneficiaryStartSchema),
    defaultValues: { country: wizard.draft.country, currency: wizard.draft.currency, type: wizard.draft.type },
  });
  const country = form.watch('country');

  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">Who are you paying?</h2>
      <Tabs<Tab>
        label="Beneficiary"
        value={tab}
        onChange={setTab}
        className="mt-4"
        tabs={[{ id: 'saved', label: 'Saved beneficiary' }, { id: 'new', label: 'New beneficiary' }]}
      />

      {tab === 'saved' ? (
        <TabPanel id="saved" className="pt-4">
          <div className="relative">
            <label htmlFor="ben-search" className="sr-only">Search saved beneficiaries</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input id="ben-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, account or bank"
              className="h-11 w-full rounded-md border border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
          </div>
          {wizard.beneficiariesLoading ? (
            <div className="mt-4 space-y-2" aria-busy="true">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : list.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title={search ? 'No beneficiaries match your search' : 'No saved beneficiaries yet'}
              action={<Button variant="secondary" onClick={() => setTab('new')} icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>Pay someone new</Button>}>
              {search ? 'Check the spelling, or add them as a new beneficiary.' : 'Add your first beneficiary to get started.'}
            </EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {list.map((b) => {
                const acct = primaryAccount(b);
                const busy = selecting === b.id;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      disabled={wizard.busy === 'selecting'}
                      onClick={async () => { setSelecting(b.id); try { await wizard.selectSaved(b); } finally { setSelecting(null); } }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle disabled:cursor-wait"
                    >
                      <Avatar text={initials(b.name)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{b.name}</span>
                          {b.nickname && <span className="truncate text-xs text-muted">“{b.nickname}”</span>}
                          {b.internal && <Badge tone="info">Cobanq account</Badge>}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <CountryFlag country={b.country} />
                          <span className="num">{acct.label} {maskAccount(acct.value)}</span>
                          <span>· {b.currency}</span>
                          <span className="num">· {b.lastPaidAt ? `Last paid ${formatDate(isoToUkDate(b.lastPaidAt))}` : 'Not paid yet'}</span>
                        </span>
                      </span>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Checking details" /> : <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabPanel>
      ) : (
        <TabPanel id="new" className="pt-4">
          <form
            noValidate
            className="space-y-5"
            onSubmit={form.handleSubmit((v) => wizard.startNew(v))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="country"
                render={({ field }) => (
                  <CountryPicker
                    label="Where is their bank account?"
                    value={field.value}
                    error={form.formState.errors.country?.message}
                    onChange={(code) => {
                      field.onChange(code);
                      // Default to the country's local currency; the customer can still change it.
                      form.setValue('currency', wizard.countryDefaultCurrency(code), { shouldValidate: true });
                    }}
                  />
                )}
              />
              <Select
                label="What currency will they receive?"
                error={form.formState.errors.currency?.message}
                hint={country ? `Local currency: ${wizard.countryDefaultCurrency(country)}` : undefined}
                options={ALL_CURRENCY_CODES.map((c) => ({ value: c, label: `${c} — ${currencyInfo(c).name}` }))}
                {...form.register('currency')}
              />
            </div>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <FieldShell id="ben-type" label="Business or individual?">
                  <div id="ben-type">
                    <Segmented label="Business or individual" value={field.value} onChange={field.onChange}
                      options={[{ value: 'BUSINESS', label: 'Business' }, { value: 'INDIVIDUAL', label: 'Individual' }]} />
                  </div>
                </FieldShell>
              )}
            />
            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit" size="lg">Continue</Button>
            </div>
          </form>
        </TabPanel>
      )}
    </div>
  );
}
