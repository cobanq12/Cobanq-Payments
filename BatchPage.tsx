import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ban, Download } from 'lucide-react';
import { friendlyError } from '@core/api/errors';
import type { BatchRowStatus } from '@core/api/types';
import { useBatch } from '@core/hooks/useBulkUpload';
import { usePaymentActions } from '@core/hooks/usePayments';
import { formatDate, formatDateTime, formatDayShort } from '@core/lib/dates';
import { formatCount, pluralise } from '@core/lib/format';
import { formatMoney } from '@core/lib/money';
import { RAIL_NAMES } from '@core/payments/railConfig';
import { BATCH_ROW_STATUS, BATCH_STATUS } from '@core/payments/statuses';
import { Button, LinkButton } from '../../components/Button';
import { Alert, Card, Pagination, RailBadge, Row, Skeleton, StatusBadge } from '../../components/Primitives';
import { useToast } from '../../components/Toast';
import { PageHeader } from '../../layout/AppShell';

const PAGE_SIZE = 25;
type Filter = 'ALL' | BatchRowStatus;

/** Batch status page: live per-row statuses and a downloadable results file. */
export function BatchPage() {
  const { id } = useParams();
  const { batch, isLoading, isError, progress, downloadResults } = useBatch(id);
  const { cancel } = usePaymentActions();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('ALL');

  const rows = useMemo(() => (batch?.rows ?? []).filter((r) => filter === 'ALL' || r.status === filter), [batch, filter]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (isError || !batch) {
    return (
      <>
        <PageHeader title="Bulk payment" back={{ to: '/payments/bulk', label: 'Bulk payments' }} />
        <Alert tone="danger" title="We couldn’t find this batch" action={<LinkButton to="/payments/bulk" size="sm" variant="secondary">Back to bulk payments</LinkButton>}>
          <p>It may have been removed. Only the most recent batches are kept in the test version.</p>
        </Alert>
      </>
    );
  }

  const done = progress.paid + progress.failed;
  const pct = progress.total === 0 ? 0 : Math.round((done / progress.total) * 100);
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const statuses = [...new Set(batch.rows.map((r) => r.status))];

  return (
    <>
      <PageHeader
        title={batch.fileName}
        description={<span className="num">{batch.reference} · created {formatDateTime(batch.createdAt)} by {batch.createdBy.name}</span>}
        back={{ to: '/payments/bulk', label: 'Bulk payments' }}
        actions={<>
          {(batch.status === 'AWAITING_APPROVAL' || batch.status === 'SCHEDULED') && (
            <Button variant="secondary" loading={cancel.isPending} icon={<Ban className="h-4 w-4" aria-hidden="true" />}
              onClick={async () => { try { await cancel.mutateAsync(batch.id); toast.push({ title: 'Batch cancelled', tone: 'info' }); } catch (e) { toast.push({ title: 'Couldn’t cancel', body: friendlyError(e), tone: 'danger' }); } }}>
              Cancel batch
            </Button>
          )}
          <Button variant="secondary" onClick={() => { void downloadResults(); }} icon={<Download className="h-4 w-4" aria-hidden="true" />}>Download results (CSV)</Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge meta={BATCH_STATUS[batch.status]} />
            <p className="text-sm text-muted num">{pluralise(progress.total, 'payment')}</p>
          </div>

          {batch.status === 'AWAITING_APPROVAL' && <Alert tone="warning" className="mt-4" title="Waiting for an approver"><p>Nothing leaves your balances until an approver approves this batch from Payments → Approvals.</p></Alert>}
          {batch.status === 'SCHEDULED' && batch.scheduledDate && <Alert tone="info" className="mt-4" title={`Scheduled for ${formatDate(batch.scheduledDate)}`}><p>We’ll send the whole batch on that day. You can cancel it before then.</p></Alert>}
          {(batch.status === 'REJECTED' || batch.status === 'CANCELLED') && <Alert tone={batch.status === 'REJECTED' ? 'danger' : 'neutral'} className="mt-4" title={batch.status === 'REJECTED' ? 'This batch wasn’t sent' : 'This batch was cancelled'}><p>{batch.statusReason ?? 'No payments were sent and nothing left your balances.'}</p></Alert>}

          {(batch.status === 'PROCESSING' || batch.status === 'COMPLETED') && (
            <div className="mt-5">
              <p className="text-3xl font-semibold tracking-tight text-ink num" role="status" aria-live="polite">{formatCount(progress.paid)} of {formatCount(progress.total)} paid</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Batch progress">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-muted num">
                {progress.pending > 0 && <span>{formatCount(progress.pending)} being paid now</span>}
                {progress.sent > 0 && <span>{formatCount(progress.sent)} sent, arriving later</span>}
                {progress.failed > 0 && <span className="font-medium text-danger">{formatCount(progress.failed)} failed and refunded</span>}
                {batch.status === 'COMPLETED' && progress.failed === 0 && <span className="font-medium text-success">All payments complete</span>}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Summary</h2>
          <dl>
            {batch.summary.railGroups.map((g) => <Row key={g.rail} label={RAIL_NAMES[g.rail]}><span className="num">{formatCount(g.count)}</span></Row>)}
            <Row label="Total fees"><span className="num">{formatMoney({ amount: batch.summary.totalFeesGbp, currency: 'GBP' })}</span></Row>
            {batch.summary.debits.map((d) => <Row key={d.currency} label={`From ${d.currency} balance`} strong><span className="num">{formatMoney(d)}</span></Row>)}
            <Row label="Approved by">{batch.approvedBy?.name ?? (batch.status === 'AWAITING_APPROVAL' ? 'Waiting' : 'Not needed')}</Row>
          </dl>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Payments in this batch</h2>
          <label className="flex items-center gap-2 text-sm text-muted">Show
            <select className="h-9 rounded-md border border-strong bg-surface px-2 text-sm text-ink" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(1); }}>
              <option value="ALL">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{BATCH_ROW_STATUS[s].label}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Payments in this batch with their statuses</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Row</th>
                <th scope="col" className="px-3 py-3 font-semibold">Beneficiary</th>
                <th scope="col" className="px-3 py-3 font-semibold">Reference</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                <th scope="col" className="px-3 py-3 font-semibold">Sent by</th>
                <th scope="col" className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => (
                <tr key={r.index}>
                  <td className="num px-5 py-2.5 text-muted">{r.index + 1}</td>
                  <td className="px-3 py-2.5"><span className="block max-w-[16rem] truncate font-medium text-ink">{r.beneficiaryName}</span><span className="num block text-xs text-muted">{r.account}</span></td>
                  <td className="num px-3 py-2.5 text-muted">{r.reference}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ink">{formatMoney({ amount: r.amount, currency: r.currency })}</td>
                  <td className="px-3 py-2.5"><RailBadge rail={r.rail} /></td>
                  <td className="px-5 py-2.5">
                    <StatusBadge meta={BATCH_ROW_STATUS[r.status]} />
                    {r.status === 'SENT' && r.arrivalDate && <span className="num mt-0.5 block text-xs text-muted">Arrives {formatDayShort(r.arrivalDate)}</span>}
                    {r.statusReason && <span className="mt-0.5 block text-xs text-danger">{r.statusReason}</span>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">No payments with this status.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
      </Card>
    </>
  );
}
