import { Link } from 'react-router-dom';
import { FileText, Trash2, X } from 'lucide-react';
import type { PaymentWizard } from '@core/hooks/usePaymentWizard';
import { isAccountCurrency } from '@core/lib/currencies';
import { formatDayShort } from '@core/lib/dates';
import { formatMoney } from '@core/lib/money';
import { PURPOSES, SOURCES_OF_FUNDS } from '@core/payments/purposes';
import { REFERENCE_RULES } from '@core/payments/validators';
import { Button } from '../../../components/Button';
import { DatePicker } from '../../../components/DatePicker';
import { Dropzone } from '../../../components/Dropzone';
import { AmountInput, Checkbox, Input, Select } from '../../../components/Form';
import { Alert, CurrencyFlag } from '../../../components/Primitives';
import { Segmented } from '../../../components/Tabs';
import { FxQuoteCard } from './FxQuoteCard';

/** Step 3 — How much, and from which balance? */
export function StepAmount({ wizard }: { wizard: PaymentWizard }) {
  const { draft, payFrom, receiveCurrency, fx, requirements, detailErrors: errors } = wizard;
  const show = wizard.attemptedAmount;
  const rule = REFERENCE_RULES[wizard.corridor === 'UK_GBP' ? 'UK' : 'INTERNATIONAL'];
  const insufficient = wizard.amountIssues.find((i) => i.code === 'INSUFFICIENT');
  const otherIssues = wizard.amountIssues.filter((i) => i.code !== 'INSUFFICIENT');
  const amountErr = show ? wizard.amountFieldError : wizard.amountFieldError && draft.sendAmount.trim() !== '' && wizard.amountFieldError !== 'Enter an amount.' ? wizard.amountFieldError : null;
  const sendError = draft.lastEdited === 'send' ? amountErr : null;
  const receiveError = draft.lastEdited === 'receive' ? amountErr : null;
  const balanceOptions = wizard.balances.map((b) => ({
    value: b.currency,
    label: `${b.currency} — ${formatMoney({ amount: b.available, currency: b.currency })} available`,
    disabled: b.available === 0 && b.currency !== payFrom,
  }));

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); wizard.continueFromAmount(); }}>
      <h2 className="text-xl font-semibold text-ink">How much, and from which balance?</h2>

      <div className="mt-5 space-y-5">
        <div className="flex items-start gap-3">
          <span className="mt-[26px]"><CurrencyFlag currency={payFrom} size="lg" /></span>
          <Select
            label="Pay from"
            className="flex-1"
            value={payFrom}
            onChange={(e) => wizard.setPayFrom(e.target.value)}
            options={balanceOptions.length > 0 ? balanceOptions : [{ value: payFrom, label: payFrom }]}
            hint={wizard.limits ? `Remaining daily limit: ${formatMoney({ amount: wizard.limits.remainingToday, currency: 'GBP' })}` : undefined}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AmountInput label="You send" currency={payFrom} value={draft.sendAmount} onChange={wizard.setSendAmount} error={sendError}
            loading={wizard.fxNeeded && draft.lastEdited === 'receive' && fx.loading} autoFocus />
          <AmountInput label="They receive" currency={receiveCurrency} value={draft.receiveAmount} onChange={wizard.setReceiveAmount} error={receiveError}
            loading={wizard.fxNeeded && draft.lastEdited === 'send' && fx.loading} flash={fx.rateUpdated && draft.lastEdited === 'send'} />
        </div>

        {wizard.fxNeeded && (
          <>
            <FxQuoteCard fx={fx} sellCurrency={payFrom} buyCurrency={receiveCurrency} totalDebit={wizard.breakdown?.totalDebit} receives={wizard.breakdown?.receives} />
            {!isAccountCurrency(receiveCurrency) && (
              <p className="text-xs text-muted">{receiveCurrency} isn’t one of your account balances, so it’s converted at the point of payout.</p>
            )}
          </>
        )}

        <div aria-live="polite" className="space-y-3">
          {insufficient && (
            <Alert tone="danger" title="Not enough available balance">
              <p>{insufficient.message}</p>
              <Link to="/convert" className="mt-1 inline-block font-semibold text-accent-text hover:underline">Convert or add funds</Link>
            </Alert>
          )}
          {otherIssues.map((i) => (
            <Alert key={i.code} tone="danger" title={i.code === 'BELOW_MIN' ? 'Amount too small' : 'Above your limit'}>
              <p>{i.message}</p>
              {i.code === 'ABOVE_DAILY' && wizard.limits && <p className="mt-1 text-muted">You’ve used {formatMoney({ amount: wizard.limits.usedToday, currency: 'GBP' })} of your {formatMoney({ amount: wizard.limits.daily, currency: 'GBP' })} daily limit.</p>}
            </Alert>
          ))}
        </div>

        <fieldset className="space-y-3 border-t border-line pt-5">
          <legend className="sr-only">Payment date</legend>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink" id="when-label">When should we send it?</p>
            <Segmented label="When should we send it" value={draft.dateMode} onChange={(v) => wizard.update({ dateMode: v })}
              options={[{ value: 'today', label: 'Today' }, { value: 'scheduled', label: 'Schedule for a later date' }]} />
          </div>
          {draft.dateMode === 'scheduled' && (
            <div className="max-w-xs">
              <DatePicker label="Payment date" value={draft.scheduledDate} min={wizard.today} workingDaysOnly={wizard.workingDaysOnly}
                onChange={(d) => wizard.update({ scheduledDate: d })} error={show ? errors.scheduledDate : null}
                hint={draft.scheduledDate ? `We’ll send it on ${formatDayShort(draft.scheduledDate)}.` : undefined} />
            </div>
          )}
          {wizard.scheduleHint && <p className="text-sm text-warning" role="status">{wizard.scheduleHint}</p>}

          {wizard.corridor === 'UK_GBP' && (
            <div className="space-y-3 rounded-lg bg-subtle p-4">
              <Checkbox checked={draft.recurring} onChange={(v) => wizard.update({ recurring: v })}>Repeat this payment (like a standing order)</Checkbox>
              {draft.recurring && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Select label="How often" value={draft.frequency} onChange={(e) => wizard.update({ frequency: e.target.value as 'WEEKLY' | 'MONTHLY' })}
                    options={[{ value: 'WEEKLY', label: 'Every week' }, { value: 'MONTHLY', label: 'Every month' }]} />
                  <Select label="Ends" value={draft.endMode} onChange={(e) => wizard.update({ endMode: e.target.value as 'never' | 'date' | 'count' })}
                    options={[{ value: 'never', label: 'Until I cancel' }, { value: 'date', label: 'On a date' }, { value: 'count', label: 'After a number of payments' }]} />
                  {draft.endMode === 'date' && (
                    <DatePicker label="End date" value={draft.endDate} min={draft.dateMode === 'scheduled' && draft.scheduledDate ? draft.scheduledDate : wizard.today}
                      onChange={(d) => wizard.update({ endDate: d })} error={show ? errors.endDate : null} />
                  )}
                  {draft.endMode === 'count' && (
                    <Input label="Number of payments" numeric value={draft.count} maxLength={3} onChange={(e) => wizard.update({ count: e.target.value.replace(/\D/g, '') })} error={show ? errors.count : null} />
                  )}
                </div>
              )}
            </div>
          )}
        </fieldset>

        <div className="space-y-4 border-t border-line pt-5">
          <Input
            label="Reference"
            value={draft.reference}
            onChange={(e) => wizard.setReference(e.target.value)}
            maxLength={rule.maxLength}
            error={show ? errors.reference : null}
            hint={`The beneficiary sees this. ${rule.description}.`}
            aside={`${draft.reference.length}/${rule.maxLength}`}
            autoComplete="off"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Purpose of payment"
              optional={!requirements.purposeRequired}
              placeholder="Choose a purpose"
              value={draft.purpose}
              onChange={(e) => wizard.update({ purpose: e.target.value, scamAck: false })}
              options={PURPOSES}
              error={show ? errors.purpose : null}
              hint={requirements.purposeRequired ? 'Required for international payments and payments of £10,000 or more.' : undefined}
            />
            {draft.purpose === 'OTHER' && (
              <Input label="What is it for?" value={draft.purposeOther} maxLength={70} onChange={(e) => wizard.update({ purposeOther: e.target.value })} error={show ? errors.purposeOther : null} />
            )}
            {requirements.purposeCodes && (
              <Select label="Purpose code" placeholder="Choose a code" value={draft.purposeCode} onChange={(e) => wizard.update({ purposeCode: e.target.value })}
                options={requirements.purposeCodes} error={show ? errors.purposeCode : null} hint="Banks in this country need a purpose code." />
            )}
          </div>

          {requirements.sourceOfFundsRequired && (
            <div className="space-y-4 rounded-lg bg-subtle p-4">
              <p className="text-sm text-ink">For payments of £50,000 or more we need to know where the money comes from.</p>
              <Select label="Source of funds" placeholder="Choose a source" value={draft.sourceOfFunds} onChange={(e) => wizard.update({ sourceOfFunds: e.target.value })}
                options={SOURCES_OF_FUNDS} error={show ? errors.sourceOfFunds : null} className="max-w-sm" />
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Supporting document <span className="font-normal text-muted">(optional)</span></p>
                <Dropzone compact accept={['.pdf', '.jpg', '.jpeg']} title="Drop a file here, or choose a file" hint="An invoice or contract. PDF or JPG, up to 10 MB." onFile={(f) => { void wizard.uploadDocument(f); }} />
                <ul className="mt-2 space-y-2" aria-live="polite">
                  {wizard.uploads.map((u) => (
                    <li key={u.name} className="rounded-md border border-line bg-surface p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-ink">{u.name}</span>
                        {u.error
                          ? <button type="button" aria-label={`Dismiss ${u.name}`} className="rounded p-1 text-muted hover:bg-subtle" onClick={() => wizard.dismissUpload(u.name)}><X className="h-4 w-4" aria-hidden="true" /></button>
                          : <span className="num text-xs text-muted">{Math.round(u.progress * 100)}%</span>}
                      </div>
                      {u.error
                        ? <p className="mt-1 text-xs font-medium text-danger" role="alert">{u.error}</p>
                        : <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(u.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${u.name}`}><div className="h-full bg-accent transition-all" style={{ width: `${u.progress * 100}%` }} /></div>}
                    </li>
                  ))}
                  {draft.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-ink"><FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" /><span className="truncate">{d.name}</span></span>
                      <button type="button" aria-label={`Remove ${d.name}`} className="rounded p-1 text-muted hover:bg-subtle hover:text-danger" onClick={() => wizard.removeDocument(d.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="secondary" onClick={wizard.back}>Back</Button>
        <Button type="submit" size="lg" disabled={wizard.fxNeeded && fx.loading && !fx.quote}>Continue</Button>
      </div>
      {show && !wizard.amountStepValid && <p className="mt-2 text-right text-sm font-medium text-danger" role="alert">Check the highlighted fields to continue.</p>}
    </form>
  );
}
