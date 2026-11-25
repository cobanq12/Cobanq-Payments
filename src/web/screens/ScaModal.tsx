import { KeyRound, Lock, Smartphone } from 'lucide-react';
import type { ScaAction } from '@core/api/types';
import type { ScaController } from '@core/hooks/useSca';
import { formatCountdown } from '@core/lib/format';
import { formatMoney } from '@core/lib/money';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { OtpInput } from '../components/OtpInput';
import { Modal } from '../components/Overlay';
import { Alert, Spinner } from '../components/Primitives';
import { TabPanel, Tabs } from '../components/Tabs';

const TITLES: Record<ScaAction, string> = {
  PAYMENT: 'Approve this payment',
  BULK: 'Approve this bulk payment',
  CONVERT: 'Approve this conversion',
  BENEFICIARY_UPDATE: 'Confirm it’s you',
  BENEFICIARY_DELETE: 'Confirm it’s you',
};

/** Strong customer authentication dialog. Shows the payee and amount being approved (dynamic linking). */
export function ScaModal({ sca }: { sca: ScaController }) {
  const c = sca.challenge;
  const busy = sca.status === 'verifying' || sca.status === 'waitingPush' || sca.status === 'approved';
  return (
    <Modal
      open={sca.isOpen}
      onClose={busy ? undefined : sca.close}
      title={c ? TITLES[c.action] : 'Approve'}
      header={<Logo size="sm" className="-ml-1 mb-3" />}
    >
      {sca.status === 'loading' || !c ? (
        <div className="py-10 text-center"><Spinner label="Preparing secure approval" /></div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg bg-subtle p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">You’re approving</p>
            {c.amount && <p className="mt-1 text-2xl font-semibold text-ink num">{formatMoney(c.amount)}</p>}
            {c.payeeName && <p className="text-sm text-ink">{c.action === 'PAYMENT' || c.action === 'BULK' ? 'to ' : ''}<span className="font-semibold">{c.payeeName}</span></p>}
            <p className="mt-1 text-sm text-muted">{c.description}</p>
          </div>

          {sca.status === 'locked' ? (
            <Alert tone="danger" title="Too many incorrect codes" live>
              <p>For your security, approvals are locked. Try again in <span className="font-semibold num">{formatCountdown(sca.lockedSeconds)}</span>.</p>
            </Alert>
          ) : sca.status === 'approved' ? (
            <div className="py-6 text-center"><Spinner label="Approved. Finishing up…" /></div>
          ) : (
            <>
              <Tabs
                label="Approval method"
                value={sca.method}
                onChange={sca.setMethod}
                tabs={[{ id: 'code', label: 'One-time code' }, { id: 'push', label: 'Cobanq mobile app' }]}
              />
              {sca.method === 'code' ? (
                <TabPanel id="code" className="space-y-4">
                  <p className="flex items-center justify-center gap-2 text-sm text-muted">
                    <KeyRound className="h-4 w-4" aria-hidden="true" /> Enter the 6-digit code we sent to your phone.
                  </p>
                  <OtpInput length={sca.codeLength} value={sca.code} onChange={sca.setCode} disabled={sca.status === 'verifying'} invalid={!!sca.error} label="One-time code" />
                  <div aria-live="assertive" className="min-h-5 text-center">
                    {sca.status === 'verifying' && <Spinner label="Checking code" />}
                    {sca.error && <p className="text-sm font-medium text-danger">{sca.error}</p>}
                  </div>
                  <p className="text-center text-sm text-muted">
                    {sca.resendIn > 0
                      ? <>Didn’t get it? You can ask for a new code in <span className="num font-medium text-ink">{sca.resendIn}s</span>.</>
                      : <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => { void sca.resend(); }}>Send a new code</button>}
                  </p>
                </TabPanel>
              ) : (
                <TabPanel id="push" className="space-y-4 text-center">
                  <Smartphone className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
                  {sca.status === 'waitingPush' ? (
                    <div role="status">
                      <Spinner label="Waiting for you to approve in the Cobanq app…" className="justify-center" />
                      <p className="mt-2 text-xs text-muted">Open the app and check the payee and amount match before you approve.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted">We’ll send a request to the Cobanq app on your phone. Check the details match, then approve.</p>
                      <Button onClick={() => { void sca.approveWithPush(); }} icon={<Lock className="h-4 w-4" aria-hidden="true" />}>Send approval request</Button>
                    </>
                  )}
                  {sca.error && <p className="text-sm font-medium text-danger" role="alert">{sca.error}</p>}
                </TabPanel>
              )}
            </>
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Cobanq will never ask you to share this code with anyone.
          </p>
        </div>
      )}
    </Modal>
  );
}
