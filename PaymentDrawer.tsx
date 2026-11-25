import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Ban, Check, Copy, Download, FileUp, Repeat, Search, Undo2, XCircle } from 'lucide-react';
import { useAdapters } from '@core/adapters';
import { api } from '@core/api/client';
import { friendlyError } from '@core/api/errors';
import type { Payment } from '@core/api/types';
import { usePayment, usePaymentActions } from '@core/hooks/usePayments';
import { countryName } from '@core/lib/countries';
import { formatDate, formatDateTime, formatDateTimeSeconds } from '@core/lib/dates';
import { formatMoney, formatRate } from '@core/lib/money';
import { buildConfirmationDoc, confirmationText } from '@core/payments/confirmationDoc';
import { purposeLabel, sourceOfFundsLabel } from '@core/payments/purposes';
import { CHARGE_OPTION_COPY, RAIL_NAMES } from '@core/payments/railConfig';
import { problemSchema, type ProblemValues } from '@core/payments/schemas';
import { canCancel, PAYMENT_STATUS } from '@core/payments/statuses';
import { Button } from '../../components/Button';
import { cn } from '../../components/cn';
import { Dropzone } from '../../components/Dropzone';
import { Select, Textarea } from '../../components/Form';
import { Drawer, Modal } from '../../components/Overlay';
import { Alert, CountryFlag, PaymentStatusBadge, Row, Skeleton } from '../../components/Primitives';
import { useToast } from '../../components/Toast';
import { AccountRows, CopBadge, FeeRows } from './PaymentBits';

const RECURRENCE = { WEEKLY: 'Every week', MONTHLY: 'Every month' } as const;

function Timeline({ payment }: { payment: Payment }) {
  const last = payment.events.length - 1;
  return (
    <ol className="relative ml-2 border-l border-line">
      {payment.events.map((e, i) => {
        const tone = PAYMENT_STATUS[e.status].tone;
        const bad = tone === 'danger';
        const current = i === last;
        return (
          <li key={`${e.at}-${i}`} className="relative pb-4 pl-6 last:pb-0">
            <span className={cn(
              'absolute -left-[9px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface',
              bad ? 'bg-danger text-white' : current && tone === 'warning' ? 'bg-warning text-white' : current && tone !== 'success' ? 'bg-info text-white' : 'bg-success text-white',
            )} aria-hidden="true">
              {bad ? <XCircle className="h-3 w-3" /> : <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <p className={cn('text-sm text-ink', current && 'font-semibold')}>{e.label}{e.by ? <span className="font-normal text-muted"> · {e.by}</span> : null}</p>
            {e.detail && <p className="text-sm text-muted">{e.detail}</p>}
            <p className="text-xs text-muted num">{formatDateTimeSeconds(e.at)}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Payment detail drawer: status timeline, full details and the actions valid for the status. */
export function PaymentDrawer({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const { data: p, isLoading, isError } = usePayment(paymentId);
  const { cancel, report } = usePaymentActions();
  const { pdf, share } = useAdapters();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const form = useForm<ProblemValues>({ resolver: zodResolver(problemSchema), defaultValues: { category: 'SCAM', description: '' } });

  const download = async (): Promise<void> => {
    if (!p) return;
    setDownloading(true);
    try { await pdf.save(buildConfirmationDoc(p)); } catch { toast.push({ title: 'Couldn’t create the PDF', body: 'Try again in a moment.', tone: 'danger' }); } finally { setDownloading(false); }
  };

  const onCancel = async (): Promise<void> => {
    if (!p) return;
    try {
      await cancel.mutateAsync(p.id);
      toast.push({ title: 'Payment cancelled', body: `${formatMoney(p.receiveAmount)} to ${p.beneficiary.name} won’t be sent.`, tone: 'info' });
      setConfirmCancel(false);
    } catch (e) { toast.push({ title: 'Couldn’t cancel', body: friendlyError(e), tone: 'danger' }); }
  };

  const onReport = form.handleSubmit(async (values) => {
    if (!p) return;
    try {
      const res = await report.mutateAsync({ paymentId: p.id, ...values });
      toast.push({ title: `Case ${res.caseNumber} opened`, body: 'Our team will contact you. If you think this is a scam, we’ll try to recover the money.', tone: 'info' });
      setReporting(false);
      form.reset();
    } catch (e) { form.setError('description', { message: friendlyError(e) }); }
  });

  return (
    <>
      <Drawer
        open={!!paymentId}
        onClose={onClose}
        title="Payment details"
        footer={p ? <>
          <Button variant="secondary" size="sm" loading={downloading} onClick={() => { void download(); }} icon={<Download className="h-4 w-4" aria-hidden="true" />}>Download confirmation (PDF)</Button>
          <Button variant="secondary" size="sm" onClick={() => { onClose(); navigate('/payments/new', { state: { repeat: p } }); }} icon={<Repeat className="h-4 w-4" aria-hidden="true" />}>Repeat payment</Button>
          {canCancel(p.status) && <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(true)} icon={<Ban className="h-4 w-4" aria-hidden="true" />}>Cancel payment</Button>}
          <Button variant="ghost" size="sm" onClick={() => setReporting(true)} icon={<AlertOctagon className="h-4 w-4" aria-hidden="true" />}>Report a problem</Button>
        </> : undefined}
      >
        {isLoading ? (
          <div className="space-y-4" aria-busy="true"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : isError || !p ? (
          <Alert tone="danger" title="We couldn’t load this payment" />
        ) : (
          <div>
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={p.status} />
                <span className="text-xs text-muted num">{p.reference}</span>
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink num">{formatMoney(p.receiveAmount)}</p>
              <p className="flex items-center gap-2 text-sm text-ink">to <CountryFlag country={p.beneficiary.country} /> <span className="font-semibold">{p.beneficiary.name}</span></p>
            </div>

            {p.status === 'IN_REVIEW' && (
              <Alert tone="warning" title="We’re carrying out a routine check on this payment" className="mb-4" live>
                <p>We may contact you for more information. You don’t need to do anything right now.</p>
                <div className="mt-3">
                  {uploading !== null ? (
                    <div role="status" aria-label="Uploading document">
                      <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(uploading * 100)}%` }} /></div>
                      <p className="mt-1 text-xs text-muted num">Uploading… {Math.round(uploading * 100)}%</p>
                    </div>
                  ) : (
                    <Dropzone compact accept={['.pdf', '.jpg', '.jpeg']} title="Upload supporting documents" hint="Optional. PDF or JPG, up to 10 MB."
                      onFile={async (file) => {
                        setUploading(0);
                        try {
                          await api.uploadDocument({ name: file.name, size: file.size, type: file.type }, p.id, setUploading);
                          toast.push({ title: 'Document uploaded', body: file.name, tone: 'success' });
                          await qc.invalidateQueries({ queryKey: ['payment', p.id] });
                        } catch (e) { toast.push({ title: 'Upload failed', body: friendlyError(e), tone: 'danger' }); } finally { setUploading(null); }
                      }} />
                  )}
                </div>
              </Alert>
            )}

            {(p.status === 'RETURNED' || p.status === 'FAILED' || p.status === 'REJECTED') && (
              <Alert tone="danger" title={p.status === 'RETURNED' ? 'This payment was returned' : p.status === 'FAILED' ? 'This payment failed' : 'This payment wasn’t sent'} className="mb-4" live>
                <p>{p.statusReason ?? 'This payment could not be completed.'}</p>
                {p.refunded && p.events.some((e) => e.status === 'PROCESSING') && (
                  <p className="mt-2 flex items-center gap-1.5 font-medium"><Undo2 className="h-4 w-4" aria-hidden="true" />{formatMoney(p.totalDebit)} is back in your {p.payFromCurrency} balance.</p>
                )}
              </Alert>
            )}

            {p.status === 'AWAITING_APPROVAL' && (
              <Alert tone="warning" title="Waiting for a second person to approve" className="mb-4"><p>Nothing leaves your balance until an approver approves this payment.</p></Alert>
            )}
            {p.status === 'SCHEDULED' && p.scheduledDate && (
              <Alert tone="info" title={`Scheduled for ${formatDate(p.scheduledDate)}`} className="mb-4"><p>We’ll take the money from your {p.payFromCurrency} balance on that day. You can cancel any time before then.</p></Alert>
            )}
            {p.caseNumber && (
              <Alert tone="info" className="mb-4"><p className="flex items-center gap-1.5"><Search className="h-4 w-4" aria-hidden="true" />Case <span className="num font-semibold">{p.caseNumber}</span> is open for this payment.</p></Alert>
            )}

            <Section title="Timeline"><Timeline payment={p} /></Section>

            <Section title="Beneficiary">
              <dl>
                <Row label="Name" strong>{p.beneficiary.name}</Row>
                <Row label="Type">{p.beneficiary.type === 'BUSINESS' ? 'Business' : 'Individual'}</Row>
                <AccountRows details={p.beneficiary.details} />
                {(p.beneficiary.resolvedBank ?? p.beneficiary.details.bankName) && <Row label="Bank">{p.beneficiary.resolvedBank ?? p.beneficiary.details.bankName}</Row>}
                <Row label="Country">{countryName(p.beneficiary.country)}</Row>
                {p.cop && <Row label="Name check"><CopBadge cop={p.cop} /></Row>}
              </dl>
            </Section>

            <Section title="Amount and fees">
              <dl>
                <Row label="Amount sent"><span className="num">{formatMoney(p.sendAmount)}</span></Row>
                {p.fx && <Row label="Exchange rate"><span className="num">1 {p.sendAmount.currency} = {formatRate(p.fx.rate)} {p.receiveAmount.currency}</span></Row>}
                <FeeRows fees={p.fees} />
                <Row label={`Total from ${p.payFromCurrency} balance`} strong><span className="num">{formatMoney(p.totalDebit)}</span></Row>
                <Row label="Beneficiary receives" strong><span className="num">{formatMoney(p.receiveAmount)}</span></Row>
              </dl>
            </Section>

            <Section title="How it was sent">
              <dl>
                <Row label="Sent by">{RAIL_NAMES[p.rail]}</Row>
                {p.chargeOption && <Row label="Charges">{CHARGE_OPTION_COPY[p.chargeOption].title}</Row>}
                {p.uetr && (
                  <Row label="UETR">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="num break-all text-xs">{p.uetr}</span>
                      <button type="button" aria-label="Copy UETR" className="rounded p-1 text-muted hover:bg-subtle hover:text-ink" onClick={() => { void share.copyText(p.uetr!); toast.push({ title: 'UETR copied', tone: 'success' }); }}>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </Row>
                )}
                <Row label="Expected arrival">{p.arrivalText === 'See timeline' ? formatDate(p.arrivalDate) : p.arrivalText}</Row>
                {p.scheduledDate && <Row label="Payment date"><span className="num">{formatDate(p.scheduledDate)}</span></Row>}
                {p.recurrence && <Row label="Repeats">{RECURRENCE[p.recurrence.frequency]}{p.recurrence.endDate ? ` until ${formatDate(p.recurrence.endDate)}` : p.recurrence.count ? ` · ${p.recurrence.count} payments left` : ''}</Row>}
                <Row label="Reference"><span className="num">{p.payeeReference}</span></Row>
                {p.purpose && <Row label="Purpose">{purposeLabel(p.purpose, p.purposeOther)}</Row>}
                {p.purposeCode && <Row label="Purpose code"><span className="num">{p.purposeCode}</span></Row>}
                {p.sourceOfFunds && <Row label="Source of funds">{sourceOfFundsLabel(p.sourceOfFunds)}</Row>}
                {p.documents.length > 0 && <Row label="Documents"><span className="inline-flex items-center gap-1"><FileUp className="h-3.5 w-3.5" aria-hidden="true" />{p.documents.map((d) => d.name).join(', ')}</span></Row>}
              </dl>
            </Section>

            <Section title="People">
              <dl>
                <Row label="Created by">{p.createdBy.name} <span className="text-muted">· {formatDateTime(p.createdAt)}</span></Row>
                <Row label="Approved by">{p.approvedBy ? p.approvedBy.name : p.status === 'AWAITING_APPROVAL' ? 'Waiting' : 'Not needed'}</Row>
              </dl>
              <button type="button" className="mt-2 text-sm font-semibold text-accent-text hover:underline" onClick={() => { void share.copyText(confirmationText(p)); toast.push({ title: 'Confirmation copied', body: 'Paste it into an email or message.', tone: 'success' }); }}>
                Copy confirmation text
              </button>
            </Section>
          </div>
        )}
      </Drawer>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this payment?" size="sm"
        description={p ? `${formatMoney(p.receiveAmount)} to ${p.beneficiary.name} won’t be sent.` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep payment</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => { void onCancel(); }}>Cancel payment</Button>
        </>}>
        <p className="text-sm text-muted">You can make it again later with “Repeat payment”.</p>
      </Modal>

      <Modal open={reporting} onClose={() => setReporting(false)} title="Report a problem"
        description="Tell us what’s wrong and we’ll open a case. If you think you’ve been scammed, tell us straight away."
        footer={<>
          <Button variant="secondary" onClick={() => setReporting(false)}>Cancel</Button>
          <Button loading={report.isPending} onClick={() => { void onReport(); }}>Send report</Button>
        </>}>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void onReport(); }}>
          <Select label="What’s the problem?" error={form.formState.errors.category?.message} {...form.register('category')}
            options={[
              { value: 'SCAM', label: 'I think this is a scam' },
              { value: 'WRONG_DETAILS', label: 'I sent it to the wrong account' },
              { value: 'NOT_ARRIVED', label: 'The payment hasn’t arrived' },
              { value: 'OTHER', label: 'Something else' },
            ]} />
          <Textarea label="What happened?" error={form.formState.errors.description?.message} {...form.register('description')} />
        </form>
      </Modal>
    </>
  );
}
