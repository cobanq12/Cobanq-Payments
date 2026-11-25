import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Check, FileSpreadsheet, UserCheck, X } from 'lucide-react';
import type { ApprovalItem, Role } from '@core/api/types';
import { friendlyError, isApiError } from '@core/api/errors';
import { usePaymentActions } from '@core/hooks/usePayments';
import { formatDateTime } from '@core/lib/dates';
import { initials, pluralise } from '@core/lib/format';
import { formatMoney } from '@core/lib/money';
import { RAIL_NAMES } from '@core/payments/railConfig';
import { rejectSchema, type RejectValues } from '@core/payments/schemas';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Form';
import { Modal } from '../../components/Overlay';
import { Alert, Avatar, EmptyState, Skeleton } from '../../components/Primitives';
import { useToast } from '../../components/Toast';

function describe(item: ApprovalItem): { title: string; subtitle: string; amount: string; creator: { id: string; name: string }; createdAt: string } {
  if (item.kind === 'PAYMENT') {
    const p = item.payment;
    return {
      title: p.beneficiary.name,
      subtitle: `${RAIL_NAMES[p.rail]} · ${p.payeeReference}`,
      amount: formatMoney(p.receiveAmount),
      creator: p.createdBy, createdAt: p.createdAt,
    };
  }
  const b = item.batch;
  return {
    title: `Bulk payment — ${b.fileName}`,
    subtitle: `${pluralise(b.summary.rowCount, 'payment')} · ${b.reference}`,
    amount: b.summary.debits.map((d) => formatMoney(d)).join(' + '),
    creator: b.createdBy, createdAt: b.createdAt,
  };
}

/** Approvals queue: approvers approve or reject payments and batches created by someone else. */
export function ApprovalsTab({ items, loading, role, userId, onOpen }: {
  items: ApprovalItem[]; loading: boolean; role: Role; userId: string; onOpen: (paymentId: string) => void;
}) {
  const { approve, reject } = usePaymentActions();
  const toast = useToast();
  const navigate = useNavigate();
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const form = useForm<RejectValues>({ resolver: zodResolver(rejectSchema), defaultValues: { reason: '' } });

  const onApprove = async (item: ApprovalItem): Promise<void> => {
    setBusyId(item.id);
    try {
      await approve.mutateAsync(item.id);
      toast.push({ title: 'Approved', body: `${describe(item).title} is on its way.`, tone: 'success' });
    } catch (e) {
      toast.push({ title: 'Couldn’t approve', body: isApiError(e) && e.code === 'NOT_PERMITTED' ? 'You can’t approve something you created. Ask another approver.' : friendlyError(e), tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const onReject = form.handleSubmit(async (values) => {
    if (!rejecting) return;
    try {
      await reject.mutateAsync({ id: rejecting.id, reason: values.reason });
      toast.push({ title: 'Rejected', body: `${describe(rejecting).title} was rejected.`, tone: 'info' });
      setRejecting(null);
      form.reset();
    } catch (e) {
      form.setError('reason', { message: friendlyError(e) });
    }
  });

  if (loading) return <div className="space-y-3 p-5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div>
      {role === 'MAKER' && items.length > 0 && (
        <div className="px-5 pt-4">
          <Alert tone="info" title="Waiting for an approver">
            <p>You’re signed in as a Maker, so you can’t approve payments. An Approver or Admin needs to review these.</p>
          </Alert>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={<UserCheck className="h-6 w-6" aria-hidden="true" />} title="Nothing is waiting for approval">
          Payments created by a Maker, and any payment over £25,000, appear here for a second person to approve.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const d = describe(item);
            const own = d.creator.id === userId;
            const canAct = role !== 'MAKER' && !own;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                {item.kind === 'BATCH'
                  ? <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-muted"><FileSpreadsheet className="h-5 w-5" aria-hidden="true" /></span>
                  : <Avatar text={initials(d.title)} />}
                <div className="min-w-0 flex-1">
                  <button type="button" className="block max-w-full truncate text-left text-sm font-semibold text-ink hover:underline"
                    onClick={() => (item.kind === 'PAYMENT' ? onOpen(item.id) : navigate(`/payments/bulk/${item.id}`))}>
                    {d.title}
                  </button>
                  <p className="truncate text-sm text-muted">{d.subtitle}</p>
                  <p className="text-xs text-muted num">Created by {d.creator.name} · {formatDateTime(d.createdAt)}</p>
                </div>
                <p className="num text-base font-semibold text-ink">{d.amount}</p>
                <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={!canAct} onClick={() => setRejecting(item)} icon={<X className="h-4 w-4" aria-hidden="true" />}>Reject</Button>
                    <Button size="sm" disabled={!canAct} loading={busyId === item.id} onClick={() => { void onApprove(item); }} icon={<Check className="h-4 w-4" aria-hidden="true" />}>Approve</Button>
                  </div>
                  {role !== 'MAKER' && own && <p className="text-xs text-muted">You created this, so someone else must approve it.</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => { setRejecting(null); form.reset(); }}
        title="Reject this payment?"
        description={rejecting ? `${describe(rejecting).title} · ${describe(rejecting).amount}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => { setRejecting(null); form.reset(); }}>Cancel</Button>
          <Button variant="danger" loading={reject.isPending} onClick={() => { void onReject(); }}>Reject payment</Button>
        </>}
      >
        <form onSubmit={(e) => { e.preventDefault(); void onReject(); }} noValidate>
          <Textarea label="Reason" hint="The person who created it will see this." error={form.formState.errors.reason?.message} data-autofocus {...form.register('reason')} />
        </form>
      </Modal>
    </div>
  );
}
