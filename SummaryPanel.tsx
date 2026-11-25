import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PaymentWizard } from '@core/hooks/usePaymentWizard';
import { formatDate } from '@core/lib/dates';
import { initials, maskAccount } from '@core/lib/format';
import { formatMoney, formatRate } from '@core/lib/money';
import { primaryAccount } from '@core/payments/beneficiarySchemas';
import { Avatar, Card, CountryFlag, Row } from '../../../components/Primitives';
import { cn } from '../../../components/cn';
import { FeeRows } from '../PaymentBits';

function SummaryBody({ wizard }: { wizard: PaymentWizard }) {
  const { payee, breakdown, selectedRail, draft } = wizard;
  const showRail = draft.step === 'rail' || draft.step === 'review';
  const hasAmount = wizard.sendMinor !== null && wizard.receiveMinor !== null;
  return (
    <div>
      {payee ? (
        <div className="flex items-center gap-3">
          <Avatar text={initials(payee.name)} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{payee.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <CountryFlag country={payee.country} />
              <span className="num truncate">{primaryAccount(payee).value ? maskAccount(primaryAccount(payee).value) : 'Details to follow'} · {payee.currency}</span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Choose who you’re paying to start.</p>
      )}

      {hasAmount && (
        <dl className="mt-4 border-t border-line pt-3">
          <Row label="You send"><span className="num">{formatMoney({ amount: wizard.sendMinor!, currency: wizard.payFrom })}</span></Row>
          {wizard.quote && <Row label="Rate"><span className="num">1 {wizard.payFrom} = {formatRate(wizard.quote.rate)} {wizard.receiveCurrency}</span></Row>}
          {breakdown && <FeeRows fees={breakdown.lines} />}
          {breakdown && <Row label={`Total from ${wizard.payFrom}`} strong><span className="num">{formatMoney(breakdown.totalDebit)}</span></Row>}
          <Row label="They receive" strong><span className="num">{formatMoney(breakdown?.receives ?? { amount: wizard.receiveMinor!, currency: wizard.receiveCurrency })}</span></Row>
        </dl>
      )}

      {hasAmount && selectedRail && (
        <dl className="mt-3 border-t border-line pt-3">
          <Row label={showRail ? 'Sent by' : 'Likely sent by'}>{selectedRail.name}</Row>
          <Row label="Arrival">{selectedRail.arrivalText}</Row>
          {wizard.scheduled && <Row label="Payment date"><span className="num">{formatDate(draft.scheduledDate)}</span></Row>}
          {draft.reference && <Row label="Reference"><span className="num">{draft.reference}</span></Row>}
        </dl>
      )}
      {!showRail && hasAmount && <p className="mt-2 text-xs text-muted">Fees depend on how you send it. You’ll choose on the next step.</p>}
    </div>
  );
}

/** Live summary: a sticky side panel on desktop, a collapsible bar at the bottom on mobile. */
export function SummaryPanel({ wizard }: { wizard: PaymentWizard }) {
  const [open, setOpen] = useState(false);
  const total = wizard.breakdown?.totalDebit;
  return (
    <>
      <aside className="hidden lg:block" aria-label="Payment summary">
        <Card className="sticky top-24 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Summary</h2>
          <SummaryBody wizard={wizard} />
        </Card>
      </aside>

      <div className="fixed inset-x-0 bottom-[57px] z-10 border-t border-line bg-surface shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:hidden">
        <button type="button" aria-expanded={open} aria-controls="mobile-summary" onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="min-w-0">
            <span className="block text-xs text-muted">Summary</span>
            <span className="block truncate text-sm font-semibold text-ink num">
              {wizard.payee ? wizard.payee.name : 'New payment'}{total ? ` · ${formatMoney(total)}` : ''}
            </span>
          </span>
          {open ? <ChevronDown className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" /> : <ChevronUp className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />}
        </button>
        <div id="mobile-summary" className={cn('max-h-[50dvh] overflow-y-auto px-4 pb-4', !open && 'hidden')}>
          <SummaryBody wizard={wizard} />
        </div>
      </div>
    </>
  );
}
