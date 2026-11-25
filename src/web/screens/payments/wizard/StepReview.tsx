import type { ReactNode } from 'react';
import { Pencil, ShieldAlert } from 'lucide-react';
import type { PaymentWizard, WizardStep } from '@core/hooks/usePaymentWizard';
import { countryName } from '@core/lib/countries';
import { formatDate } from '@core/lib/dates';
import { maskAccount } from '@core/lib/format';
import { formatMoney, formatRate } from '@core/lib/money';
import { primaryAccount } from '@core/payments/beneficiarySchemas';
import { purposeLabel, sourceOfFundsLabel } from '@core/payments/purposes';
import { CHARGE_OPTION_COPY } from '@core/payments/railConfig';
import { SCAM_ACK_TEXT } from '@core/payments/rules';
import { Button } from '../../../components/Button';
import { Checkbox } from '../../../components/Form';
import { Alert, CountryFlag, Row } from '../../../components/Primitives';
import { CopBadge, FeeRows } from '../PaymentBits';
import { FxQuoteCard } from './FxQuoteCard';

function Block({ title, step, wizard, children }: { title: string; step: WizardStep; wizard: PaymentWizard; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-0 first:pt-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <button type="button" onClick={() => wizard.goTo(step)} className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline" aria-label={`Edit ${title.toLowerCase()}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
        </button>
      </div>
      <dl>{children}</dl>
    </section>
  );
}

const FREQUENCY = { WEEKLY: 'every week', MONTHLY: 'every month' } as const;

/** Step 5 — Review everything, with the scam warning, before confirming. */
export function StepReview({ wizard, onConfirm }: { wizard: PaymentWizard; onConfirm: () => void }) {
  const { draft, payee, selectedRail, breakdown, scamWarning } = wizard;
  if (!payee || !selectedRail || !breakdown) {
    return <Alert tone="warning" title="Some details are missing" action={<Button size="sm" onClick={() => wizard.goTo('amount')}>Go back</Button>} />;
  }
  const acct = primaryAccount(payee);
  const editBeneficiary: WizardStep = draft.mode === 'saved' ? 'who' : 'details';
  const scheduled = wizard.scheduled;

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
      <h2 className="text-xl font-semibold text-ink">Review your payment</h2>
      <p className="mt-1 text-sm text-muted">Check everything carefully. Payments can’t always be recalled once they’re sent.</p>

      <div className="mt-5 rounded-lg border border-line p-5">
        <Block title="Beneficiary" step={editBeneficiary} wizard={wizard}>
          <Row label="Name" strong><span className="inline-flex items-center gap-2"><CountryFlag country={payee.country} />{payee.name}</span></Row>
          <Row label={acct.label}><span className="num">{maskAccount(acct.value)}</span></Row>
          {wizard.resolvedBank && <Row label="Bank">{wizard.resolvedBank}</Row>}
          <Row label="Country">{countryName(payee.country)}</Row>
          {wizard.corridor === 'UK_GBP' && draft.cop && <Row label="Name check"><CopBadge cop={draft.cop} /></Row>}
        </Block>

        <Block title="Amount" step="amount" wizard={wizard}>
          <Row label="You send"><span className="num">{formatMoney({ amount: wizard.sendMinor ?? 0, currency: wizard.payFrom })}</span></Row>
          {wizard.quote && <Row label="Exchange rate"><span className="num">1 {wizard.payFrom} = {formatRate(wizard.quote.rate)} {wizard.receiveCurrency}</span></Row>}
          <FeeRows fees={breakdown.lines} />
          <Row label={`Total from your ${wizard.payFrom} balance`} strong><span className="num">{formatMoney(breakdown.totalDebit)}</span></Row>
          <Row label="They receive" strong><span className="num text-base">{formatMoney(breakdown.receives)}</span></Row>
          {breakdown.deducted && <Row label="Charges taken from their amount"><span className="num">{formatMoney(breakdown.deducted)}</span></Row>}
        </Block>

        <Block title="How it’s sent" step="rail" wizard={wizard}>
          <Row label="Sent by" strong>{selectedRail.name}</Row>
          {selectedRail.fxLabel && <Row label="Conversion">{selectedRail.fxLabel}</Row>}
          {wizard.chargeOption && <Row label="Charges">{CHARGE_OPTION_COPY[wizard.chargeOption].title}</Row>}
          <Row label="Arrival">{selectedRail.arrivalText}</Row>
        </Block>

        <Block title="Details" step="amount" wizard={wizard}>
          <Row label="Payment date"><span className="num">{scheduled ? formatDate(draft.scheduledDate) : 'Today'}</span></Row>
          {draft.recurring && wizard.corridor === 'UK_GBP' && (
            <Row label="Repeats">
              Repeats {FREQUENCY[draft.frequency]}
              {draft.endMode === 'date' && draft.endDate ? ` until ${formatDate(draft.endDate)}` : draft.endMode === 'count' ? `, ${draft.count} payments in total` : ' until you cancel'}
            </Row>
          )}
          <Row label="Reference"><span className="num">{draft.reference}</span></Row>
          {draft.purpose && <Row label="Purpose">{purposeLabel(draft.purpose, draft.purposeOther)}</Row>}
          {wizard.requirements.purposeCodes && draft.purposeCode && <Row label="Purpose code"><span className="num">{draft.purposeCode}</span></Row>}
          {wizard.requirements.sourceOfFundsRequired && <Row label="Source of funds">{sourceOfFundsLabel(draft.sourceOfFunds)}</Row>}
          {draft.documents.length > 0 && <Row label="Documents">{draft.documents.map((d) => d.name).join(', ')}</Row>}
        </Block>
      </div>

      {wizard.fxNeeded && <div className="mt-4"><FxQuoteCard fx={wizard.fx} sellCurrency={wizard.payFrom} buyCurrency={wizard.receiveCurrency} compact /></div>}

      {wizard.amountIssues.length > 0 && (
        <Alert tone="danger" className="mt-4" title="This payment can’t be sent as it is" live action={<Button size="sm" variant="secondary" onClick={() => wizard.goTo('amount')}>Change amount</Button>}>
          {wizard.amountIssues.map((i) => <p key={i.code}>{i.message}</p>)}
        </Alert>
      )}

      {scamWarning && (
        <Alert tone="warning" className="mt-4" title={scamWarning.title}>
          <p className="flex items-start gap-1.5"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{scamWarning.body}</span></p>
          {scamWarning.requiresAck && (
            <div className="mt-3"><Checkbox checked={draft.scamAck} onChange={(v) => wizard.update({ scamAck: v })}>{SCAM_ACK_TEXT}</Checkbox></div>
          )}
        </Alert>
      )}

      {wizard.error && <Alert tone="danger" className="mt-4" live><p>{wizard.error}</p></Alert>}

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="secondary" onClick={wizard.back}>Back</Button>
        <Button type="submit" size="lg" disabled={!wizard.canConfirm} loading={wizard.busy === 'confirming'}>
          {scheduled ? 'Confirm and schedule' : 'Confirm and send'}
        </Button>
      </div>
      {scamWarning?.requiresAck && !draft.scamAck && <p className="mt-2 text-right text-xs text-muted">Tick the box above to continue.</p>}
    </form>
  );
}
