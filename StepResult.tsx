import { useState } from 'react';
import { CalendarClock, Copy, Download, Mail, Search, UserCheck, XCircle } from 'lucide-react';
import { useAdapters } from '@core/adapters';
import type { Payment } from '@core/api/types';
import { usePayment } from '@core/hooks/usePayments';
import { formatDate } from '@core/lib/dates';
import { formatMoney } from '@core/lib/money';
import { buildConfirmationDoc, confirmationText } from '@core/payments/confirmationDoc';
import { RAIL_NAMES } from '@core/payments/railConfig';
import { Button, LinkButton } from '../../../components/Button';
import { Alert, PaymentStatusBadge, Row, Skeleton } from '../../../components/Primitives';
import { useToast } from '../../../components/Toast';

function AnimatedCheck() {
  return (
    <span className="mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-success-bg" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" strokeDashoffset="24" className="animate-draw" />
      </svg>
    </span>
  );
}

function IconCircle({ tone, children }: { tone: 'warning' | 'danger' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'warning' ? 'bg-warning-bg text-warning' : tone === 'danger' ? 'bg-danger-bg text-danger' : 'bg-info-bg text-info';
  return <span className={`mx-auto flex h-16 w-16 animate-pop items-center justify-center rounded-full ${cls}`} aria-hidden="true">{children}</span>;
}

function headline(p: Payment): { icon: React.ReactNode; title: string; body: string } {
  const amount = formatMoney(p.receiveAmount);
  const to = p.beneficiary.name;
  switch (p.status) {
    case 'AWAITING_APPROVAL':
      return { icon: <IconCircle tone="warning"><UserCheck className="h-8 w-8" /></IconCircle>, title: 'Sent for approval', body: `${amount} to ${to} will be sent once a second person approves it.` };
    case 'SCHEDULED':
      return { icon: <IconCircle tone="info"><CalendarClock className="h-8 w-8" /></IconCircle>, title: 'Payment scheduled', body: `${amount} to ${to} will be sent on ${p.scheduledDate ? formatDate(p.scheduledDate) : 'the date you chose'}.` };
    case 'IN_REVIEW':
      return { icon: <IconCircle tone="warning"><Search className="h-8 w-8" /></IconCircle>, title: 'We’re checking this payment', body: 'We’re carrying out a routine check on this payment. We may contact you for more information.' };
    case 'FAILED':
      return { icon: <IconCircle tone="danger"><XCircle className="h-8 w-8" /></IconCircle>, title: 'Payment failed', body: p.statusReason ?? 'This payment could not be sent.' };
    case 'RETURNED':
      return { icon: <IconCircle tone="danger"><XCircle className="h-8 w-8" /></IconCircle>, title: 'Payment returned', body: p.statusReason ?? 'The beneficiary’s bank returned this payment.' };
    case 'REJECTED':
      return { icon: <IconCircle tone="danger"><XCircle className="h-8 w-8" /></IconCircle>, title: 'Payment not sent', body: p.statusReason ?? 'This payment could not be processed.' };
    case 'CANCELLED':
      return { icon: <IconCircle tone="info"><XCircle className="h-8 w-8" /></IconCircle>, title: 'Payment cancelled', body: `${amount} to ${to} won’t be sent.` };
    case 'COMPLETED':
      return { icon: <AnimatedCheck />, title: 'Payment complete', body: `${amount} has been delivered to ${to}.` };
    default:
      return { icon: <AnimatedCheck />, title: 'Payment sent', body: `${amount} is on its way to ${to}.` };
  }
}

/** Step 7 — Result. Follows the live status, so pending, review and failed states show correctly. */
export function StepResult({ paymentId, onAnother }: { paymentId: string; onAnother: () => void }) {
  const { data: p, isLoading } = usePayment(paymentId);
  const { pdf, share } = useAdapters();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  if (isLoading || !p) return <div className="space-y-4 py-6" aria-busy="true"><Skeleton className="mx-auto h-16 w-16 rounded-full" /><Skeleton className="mx-auto h-6 w-48" /><Skeleton className="h-40 w-full" /></div>;
  const h = headline(p);
  const failed = p.status === 'FAILED' || p.status === 'RETURNED' || p.status === 'REJECTED';

  return (
    <div className="text-center">
      {h.icon}
      <div role="status">
        <h2 className="mt-4 text-2xl font-semibold text-ink">{h.title}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{h.body}</p>
      </div>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-ink num">{formatMoney(p.receiveAmount)}</p>
      <div className="mt-2 flex justify-center"><PaymentStatusBadge status={p.status} /></div>

      {failed && p.refunded && p.events.some((e) => e.status === 'PROCESSING') && (
        <Alert tone="info" className="mx-auto mt-4 max-w-md text-left"><p>{formatMoney(p.totalDebit)} is back in your {p.payFromCurrency} balance.</p></Alert>
      )}

      <dl className="mx-auto mt-6 max-w-md rounded-lg border border-line p-4 text-left">
        <Row label="Paid to" strong>{p.beneficiary.name}</Row>
        <Row label="Sent by">{RAIL_NAMES[p.rail]}</Row>
        <Row label="Cobanq reference"><span className="num">{p.reference}</span></Row>
        {p.uetr && <Row label="UETR"><span className="num break-all text-xs">{p.uetr}</span></Row>}
        <Row label="Estimated arrival">{p.arrivalText}</Row>
        <Row label={`Total from ${p.payFromCurrency} balance`}><span className="num">{formatMoney(p.totalDebit)}</span></Row>
      </dl>

      <div className="mx-auto mt-6 flex max-w-md flex-col gap-2">
        <Button variant="secondary" loading={downloading} icon={<Download className="h-4 w-4" aria-hidden="true" />}
          onClick={async () => { setDownloading(true); try { await pdf.save(buildConfirmationDoc(p)); } catch { toast.push({ title: 'Couldn’t create the PDF', tone: 'danger' }); } finally { setDownloading(false); } }}>
          Download confirmation (PDF)
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={() => { void share.copyText(confirmationText(p)); toast.push({ title: 'Confirmation copied', body: 'Paste it into an email or message.', tone: 'success' }); }}>Copy to share</Button>
          <Button variant="secondary" icon={<Mail className="h-4 w-4" aria-hidden="true" />} onClick={() => { void share.email(`Payment confirmation ${p.reference}`, confirmationText(p)); }}>Email</Button>
        </div>
        <Button onClick={onAnother}>Make another payment</Button>
        <LinkButton to={`/payments?payment=${p.id}`} variant="ghost">Back to payments</LinkButton>
      </div>
    </div>
  );
}
