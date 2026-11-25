import { Clock, Info } from 'lucide-react';
import type { ChargeOption, RailOption } from '@core/api/types';
import type { PaymentWizard } from '@core/hooks/usePaymentWizard';
import { formatMoney } from '@core/lib/money';
import { CHARGE_OPTION_COPY, railConfig } from '@core/payments/railConfig';
import { Button } from '../../../components/Button';
import { Alert, Badge, Skeleton } from '../../../components/Primitives';
import { RadioCard } from '../../../components/RadioCard';

/** Step 4 — Choose how to send it. Eligible rails are cards; ineligible ones are greyed out with the reason. */
export function StepRail({ wizard }: { wizard: PaymentWizard }) {
  const { rails, selectedRail } = wizard;
  const chargeOptions = selectedRail?.chargeOptions;
  // For SWIFT the fee depends on who pays the charges, so show the fee for the current choice.
  const feeText = (o: RailOption): string => {
    const fee = o.chargeFees && wizard.chargeOption && selectedRail?.rail === o.rail ? o.chargeFees[wizard.chargeOption] ?? o.fee : o.fee;
    return fee.amount === 0 ? (o.chargeFees ? 'None for you' : 'Free') : formatMoney(fee);
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); wizard.continueFromRail(); }}>
      <h2 className="text-xl font-semibold text-ink">Choose how to send it</h2>
      <p className="mt-1 text-sm text-muted">We’ve picked the best option for this payment. You can change it where another is available.</p>

      {selectedRail?.fxLabel && (
        <Alert tone="info" className="mt-4">
          <p className="font-medium">{selectedRail.fxLabel}. The conversion happens first, from your {wizard.payFrom} balance.</p>
        </Alert>
      )}

      {wizard.railsLoading ? (
        <div className="mt-4 space-y-3" aria-busy="true">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <fieldset className="mt-4 space-y-3">
          <legend className="sr-only">How to send this payment</legend>
          {rails.options.map((o) => (
            <RadioCard
              key={o.rail}
              name="rail"
              value={o.rail}
              checked={selectedRail?.rail === o.rail}
              disabled={!o.eligible}
              onChange={() => wizard.chooseRail(o.rail)}
              title={o.name}
              badge={o.recommended ? <Badge tone="success">Recommended</Badge> : !o.eligible ? <Badge tone="neutral">Not available</Badge> : undefined}
            >
              <span className="mt-1 block text-sm text-muted">{o.description}</span>
              {o.eligible ? (
                <span className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink"><Clock className="h-4 w-4 text-muted" aria-hidden="true" />{o.arrivalText}</span>
                  <span className="num text-ink">Fee <span className="font-semibold">{feeText(o)}</span></span>
                </span>
              ) : (
                <span className="mt-2 flex items-start gap-1.5 text-sm font-medium text-ink"><Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />{o.reason}</span>
              )}
              {o.eligible && o.note && <span className="mt-1 block text-xs text-muted">{o.note}</span>}
            </RadioCard>
          ))}
        </fieldset>
      )}

      {chargeOptions && selectedRail && (
        <fieldset className="mt-6 border-t border-line pt-5">
          <legend className="text-base font-semibold text-ink">Who pays the charges?</legend>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {chargeOptions.map((c: ChargeOption) => {
              const fee = selectedRail.chargeFees?.[c];
              return (
                <RadioCard key={c} name="charges" value={c} checked={wizard.chargeOption === c} onChange={() => wizard.chooseChargeOption(c)}
                  title={CHARGE_OPTION_COPY[c].title} badge={c === 'SHA' ? <Badge tone="neutral">Default</Badge> : undefined}>
                  <span className="mt-1 block text-sm text-muted">{CHARGE_OPTION_COPY[c].description}</span>
                  <span className="num mt-2 block text-sm text-ink">
                    {c === 'BEN'
                      ? <>You pay <span className="font-semibold">nothing</span>; about {formatMoney(railConfig.benDeduction)} comes off what they receive</>
                      : <>Fee <span className="font-semibold">{fee ? formatMoney(fee) : '—'}</span></>}
                  </span>
                </RadioCard>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="secondary" onClick={wizard.back}>Back</Button>
        <Button type="submit" size="lg" disabled={!selectedRail}>Review payment</Button>
      </div>
    </form>
  );
}
