import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Beneficiary, CurrencyCode, Payment } from '@core/api/types';
import { usePaymentWizard, WIZARD_STEPS, type WizardStep } from '@core/hooks/usePaymentWizard';
import { useSca } from '@core/hooks/useSca';
import { formatMoney } from '@core/lib/money';
import { Button } from '../../../components/Button';
import { Checkbox } from '../../../components/Form';
import { Modal } from '../../../components/Overlay';
import { Card, Skeleton } from '../../../components/Primitives';
import { Stepper } from '../../../components/Stepper';
import { PageHeader } from '../../../layout/AppShell';
import { ScaModal } from '../../ScaModal';
import { StepAmount } from './StepAmount';
import { StepDetails } from './StepDetails';
import { StepRail } from './StepRail';
import { StepResult } from './StepResult';
import { StepReview } from './StepReview';
import { StepWho } from './StepWho';
import { SummaryPanel } from './SummaryPanel';

interface StartState { fresh?: boolean; beneficiary?: Beneficiary; repeat?: Payment; payFrom?: CurrencyCode }

/** The payment wizard. One step per screen; all logic lives in usePaymentWizard. */
export function WizardPage() {
  const wizard = usePaymentWizard();
  const navigate = useNavigate();
  const location = useLocation();
  const pending = useRef<string | null>(null);
  const [cooling, setCooling] = useState(false);
  const [coolingAck, setCoolingAck] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const heading = useRef<HTMLDivElement>(null);

  const sca = useSca({
    onApproved: (res) => { pending.current = null; wizard.completed(res.resourceId); sca.close(); },
    onCancelled: () => { if (pending.current) { void wizard.abandoned(pending.current); pending.current = null; } },
  });

  // Entry points: a fresh payment, "Pay" from Beneficiaries, "Repeat payment", or "Convert and pay".
  const started = useRef(false);
  const { ready, reset, startWith } = wizard;
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const state = (location.state ?? {}) as StartState;
    if (state.beneficiary || state.repeat || state.payFrom) void startWith(state);
    else if (state.fresh) reset();
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [ready, reset, startWith, location, navigate]);

  // Move focus to the top of each new step for keyboard and screen-reader users.
  const step = wizard.draft.step;
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);

  const send = async (confirmDuplicate = false): Promise<void> => {
    const outcome = await wizard.confirm({ confirmDuplicate });
    if (outcome.kind === 'sca') { pending.current = outcome.paymentId; await sca.open(outcome.challengeId); }
    else if (outcome.kind === 'duplicate') setDuplicate(true);
  };

  const onConfirm = (): void => {
    if (wizard.needsCoolingConfirm) { setCoolingAck(false); setCooling(true); } else void send();
  };

  if (!wizard.ready) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;

  const isResult = step === 'result' && wizard.resultPayment;
  const visibleSteps = WIZARD_STEPS.filter((s) => s.id !== 'result');
  const payeeName = wizard.payee?.name ?? 'this beneficiary';
  const amount = wizard.breakdown ? formatMoney(wizard.breakdown.receives) : '';

  return (
    <>
      <PageHeader
        title="Make a payment"
        back={{ to: '/payments', label: 'Payments' }}
        actions={!isResult && wizard.hasProgress ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => { wizard.reset(); }}>Start again</Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/payments')}>Save and exit</Button>
          </>
        ) : undefined}
      />

      {!isResult && (
        <div className="mb-6">
          <Stepper steps={visibleSteps} current={step === 'result' ? 'review' : step} onSelect={(id) => wizard.goTo(id as WizardStep)} />
        </div>
      )}

      <div className={isResult ? 'mx-auto max-w-2xl' : 'grid grid-cols-1 gap-6 pb-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-0'}>
        <Card className="p-5 sm:p-6">
          <div ref={heading} tabIndex={-1} className="outline-none">
            {step === 'who' && <StepWho wizard={wizard} />}
            {step === 'details' && <StepDetails key={`${wizard.draft.country}-${wizard.draft.currency}-${wizard.draft.mode}`} wizard={wizard} />}
            {step === 'amount' && <StepAmount wizard={wizard} />}
            {step === 'rail' && <StepRail wizard={wizard} />}
            {step === 'review' && <StepReview wizard={wizard} onConfirm={onConfirm} />}
            {isResult && <StepResult paymentId={wizard.resultPayment!} onAnother={() => wizard.reset()} />}
            {step === 'result' && !wizard.resultPayment && <StepWho wizard={wizard} />}
          </div>
        </Card>
        {!isResult && <SummaryPanel wizard={wizard} />}
      </div>

      <ScaModal sca={sca} />

      {/* New-beneficiary cooling rule: an extra confirmation for a first payment over £10,000. */}
      <Modal
        open={cooling}
        onClose={() => setCooling(false)}
        title="One more check before you pay someone new"
        description={`This is your first payment to ${payeeName}, and it’s over £10,000.`}
        footer={<>
          <Button variant="secondary" onClick={() => setCooling(false)}>Go back</Button>
          <Button disabled={!coolingAck} onClick={() => { setCooling(false); void send(); }}>Continue to approve</Button>
        </>}
      >
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
          <li>Have you spoken to {payeeName} on a phone number you already trust, and confirmed these bank details?</li>
          <li>Were you told about a change of bank details by email or message? That’s a common sign of a scam.</li>
          <li>Is anyone pressuring you to pay quickly, or to keep this payment secret?</li>
        </ul>
        <p className="mt-3 text-sm text-muted">Once {amount} leaves your account, we may not be able to get it back.</p>
        <div className="mt-4"><Checkbox checked={coolingAck} onChange={setCoolingAck}>I’ve confirmed these details independently and want to make this payment.</Checkbox></div>
      </Modal>

      {/* Duplicate detection: same beneficiary, amount and reference within 24 hours. */}
      <Modal
        open={duplicate}
        onClose={() => setDuplicate(false)}
        title="This looks like a payment you made earlier today"
        description={`You’ve already sent ${amount} to ${payeeName} with the same reference in the last 24 hours.`}
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setDuplicate(false)}>Don’t send</Button>
          <Button onClick={() => { setDuplicate(false); void send(true); }}>Send again</Button>
        </>}
      >
        <p className="text-sm text-muted">If you meant to pay them twice, you can send it again.</p>
      </Modal>
    </>
  );
}
