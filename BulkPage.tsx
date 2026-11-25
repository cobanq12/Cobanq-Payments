import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Download, FileSpreadsheet, FlaskConical, Plus, Trash2 } from 'lucide-react';
import type { RailId } from '@core/api/types';
import { sampleMixed, sampleUkPayroll, sampleWithErrors } from '@core/bulk/samples';
import { USE_MOCK } from '@core/config';
import { useBatches, useBulkUpload, type BulkUpload } from '@core/hooks/useBulkUpload';
import { useSca } from '@core/hooks/useSca';
import { formatDateTime, formatDayShort } from '@core/lib/dates';
import { formatCount, pluralise } from '@core/lib/format';
import { formatMoney, formatRate } from '@core/lib/money';
import { RAIL_NAMES, railConfig } from '@core/payments/railConfig';
import { BATCH_STATUS } from '@core/payments/statuses';
import { Button } from '../../components/Button';
import { DatePicker } from '../../components/DatePicker';
import { Dropzone } from '../../components/Dropzone';
import { Alert, Badge, Card, CardHeader, Pagination, Row, StatusBadge } from '../../components/Primitives';
import { RadioCard } from '../../components/RadioCard';
import { Segmented } from '../../components/Tabs';
import { Stepper } from '../../components/Stepper';
import { PageHeader } from '../../layout/AppShell';
import { ScaModal } from '../ScaModal';
import { BulkTable } from './BulkTable';

const STEPS = [{ id: 'upload', label: 'Upload file' }, { id: 'review', label: 'Check rows' }, { id: 'options', label: 'Send' }];
const gbp = (amount: number): string => formatMoney({ amount, currency: 'GBP' });

function UploadStage({ bulk }: { bulk: BulkUpload }) {
  const batches = useBatches();
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Upload your payment file</h2>
            <p className="mt-1 text-sm text-muted">Pay up to {railConfig.bulkMaxRows.toLocaleString('en-GB')} recipients at once from one CSV file. UK, euro and international payments can be in the same file.</p>
          </div>
          <Button variant="secondary" onClick={() => { void bulk.downloadTemplate(); }} icon={<Download className="h-4 w-4" aria-hidden="true" />}>Download CSV template</Button>
        </div>
        <div className="mt-5">
          <Dropzone accept={['.csv', 'text/csv']} title="Drop your CSV file here, or choose a file" hint="Columns: beneficiary name, type, country, currency, sort code, account number, IBAN, BIC, amount, reference, purpose" busy={bulk.loading} onFile={(f) => { void bulk.loadFile(f); }} />
        </div>
        {bulk.error && <Alert tone="danger" className="mt-4" title="We couldn’t use that file" live><p>{bulk.error}</p></Alert>}
        {USE_MOCK && (
          <div className="mt-5 rounded-lg border border-warning/40 bg-warning-bg p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning"><FlaskConical className="h-4 w-4" aria-hidden="true" />Test files</p>
            <p className="mt-1 text-sm text-ink">Load a sample file without downloading it first.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={bulk.loading} onClick={() => { void bulk.loadRows('sample-1000-uk-payroll.csv', sampleUkPayroll()); }}>1,000 UK rows</Button>
              <Button size="sm" variant="secondary" disabled={bulk.loading} onClick={() => { void bulk.loadRows('sample-mixed-rails.csv', sampleMixed()); }}>Mixed rails (UK + SEPA + SWIFT)</Button>
              <Button size="sm" variant="secondary" disabled={bulk.loading} onClick={() => { void bulk.loadRows('sample-with-errors.csv', sampleWithErrors()); }}>File with errors</Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent bulk payments" />
        {!batches.data || batches.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No bulk payments yet. Batches you send appear here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {batches.data.map((b) => {
              const paid = b.rows.filter((r) => r.status === 'COMPLETED').length;
              return (
                <li key={b.id}>
                  <Link to={`/payments/bulk/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-subtle">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-muted"><FileSpreadsheet className="h-5 w-5" aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{b.fileName}</span>
                        <span className="block text-xs text-muted num">{b.reference} · {formatDateTime(b.createdAt)} · {pluralise(b.summary.rowCount, 'payment')}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      {b.status === 'PROCESSING' && <span className="num text-sm text-muted">{formatCount(paid)} of {formatCount(b.summary.rowCount)} paid</span>}
                      <span className="num text-sm font-semibold text-ink">{b.summary.debits.map((d) => formatMoney(d)).join(' + ')}</span>
                      <StatusBadge meta={BATCH_STATUS[b.status]} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ReviewStage({ bulk }: { bulk: BulkUpload }) {
  const { counts } = bulk;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Check your rows</h2>
          <p className="mt-1 text-sm text-muted num">{bulk.fileName} · {pluralise(bulk.rows.length, 'row')}</p>
          <p className="mt-2 flex flex-wrap gap-2">
            <Badge tone="success">{formatCount(counts.ok)} ready</Badge>
            {counts.warning > 0 && <Badge tone="warning">{formatCount(counts.warning)} with warnings</Badge>}
            {counts.error > 0 && <Badge tone="danger">{formatCount(counts.error)} with errors</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={bulk.addRow} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Add row</Button>
          {counts.error > 0 && <Button variant="secondary" size="sm" onClick={bulk.removeInvalid} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>Remove {pluralise(counts.error, 'invalid row')}</Button>}
        </div>
      </div>
      <div aria-live="polite" className="px-5">
        {counts.error > 0
          ? <Alert tone="danger" className="mb-3" title={`${pluralise(counts.error, 'row')} ${counts.error === 1 ? 'needs' : 'need'} fixing`}><p>Fix the highlighted cells, or remove the invalid rows, to continue.</p></Alert>
          : bulk.rows.length > 0 && <Alert tone="success" className="mb-3" title="Every row is ready to send">{counts.warning > 0 && <p>{pluralise(counts.warning, 'row')} {counts.warning === 1 ? 'has a warning' : 'have warnings'} — worth a look, but they won’t stop the batch.</p>}</Alert>}
      </div>
      <BulkTable bulk={bulk} />
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
        <Button variant="secondary" onClick={bulk.reset}>Start again</Button>
        <Button size="lg" disabled={!bulk.valid} onClick={() => bulk.setStage('options')}>Continue</Button>
      </div>
    </Card>
  );
}

function RowOverrides({ bulk }: { bulk: BulkUpload }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const ukIndexes = bulk.results.filter((r) => r.rail === 'FPS').map((r) => r.index);
  const size = 10;
  const visible = ukIndexes.slice((page - 1) * size, page * size);
  const overridden = Object.keys(bulk.overrides).length;
  return (
    <div className="rounded-lg border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-ink">
        <span>Advanced: choose per row {overridden > 0 && <Badge tone="info" className="ml-2">{overridden} changed</Badge>}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />}
      </button>
      {open && (
        <div className="border-t border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Choose how each UK row is sent</caption>
            <thead className="text-xs text-muted"><tr><th scope="col" className="px-4 py-2 font-semibold">Row</th><th scope="col" className="px-2 py-2 font-semibold">Beneficiary</th><th scope="col" className="px-2 py-2 text-right font-semibold">Amount</th><th scope="col" className="px-4 py-2 font-semibold">Send by</th></tr></thead>
            <tbody className="divide-y divide-line">
              {visible.map((i) => (
                <tr key={i}>
                  <td className="num px-4 py-2 text-muted">{i + 1}</td>
                  <td className="px-2 py-2 text-ink">{bulk.rows[i]!.beneficiaryName}</td>
                  <td className="num px-2 py-2 text-right text-ink">{formatMoney({ amount: bulk.results[i]!.amount ?? 0, currency: 'GBP' })}</td>
                  <td className="px-4 py-2">
                    <select aria-label={`Row ${i + 1} send by`} className="h-8 rounded border border-strong bg-surface px-2 text-sm text-ink" value={bulk.overrides[i] ?? ''}
                      onChange={(e) => bulk.setOverride(i, e.target.value === '' ? null : (e.target.value as RailId))}>
                      <option value="">Batch choice ({RAIL_NAMES[bulk.ukRail]})</option>
                      <option value="FPS">Faster Payments</option>
                      <option value="BACS">Bacs</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line"><Pagination page={page} pageSize={size} total={ukIndexes.length} onChange={setPage} /></div>
        </div>
      )}
    </div>
  );
}

function OptionsStage({ bulk, onSubmit }: { bulk: BulkUpload; onSubmit: () => void }) {
  const s = bulk.summary;
  if (!s) return <Card className="p-6"><Alert tone="warning" title="Fix the rows with errors first" action={<Button size="sm" onClick={() => bulk.setStage('review')}>Back to rows</Button>} /></Card>;
  const fxTotals = s.currencyTotals.filter((c) => c.fxRate !== undefined);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {bulk.ukRowCount > 0 && (
          <Card className="p-5 sm:p-6">
            <fieldset>
              <legend className="text-lg font-semibold text-ink">How should we pay your UK recipients?</legend>
              <p className="mt-1 text-sm text-muted num">{pluralise(bulk.ukRowCount, 'UK payment')} in pounds.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <RadioCard name="uk-rail" value="FPS" checked={bulk.ukRail === 'FPS'} onChange={() => bulk.setUkRail('FPS')} title="Faster Payments" badge={<Badge tone="success">Default</Badge>}>
                  <span className="mt-1 block text-sm text-muted">Arrives within minutes — each recipient is paid individually.</span>
                  <span className="num mt-3 block text-sm text-ink">Total fee <span className="font-semibold">{gbp(bulk.comparison.fps)}</span></span>
                </RadioCard>
                <RadioCard name="uk-rail" value="BACS" checked={bulk.ukRail === 'BACS'} onChange={() => bulk.setUkRail('BACS')} title="Bacs">
                  <span className="mt-1 block text-sm text-muted">Arrives on {formatDayShort(bulk.bacsDate)}, in 3 working days — lowest cost.</span>
                  <span className="num mt-3 block text-sm text-ink">Total fee <span className="font-semibold">{gbp(bulk.comparison.bacs)}</span></span>
                </RadioCard>
              </div>
              <p className="mt-3 text-sm text-muted num" aria-live="polite">
                {bulk.ukRail === 'FPS'
                  ? <>Bacs would cost {gbp(bulk.comparison.saving)} less, but arrive on {formatDayShort(bulk.bacsDate)}.</>
                  : <>You’re saving {gbp(bulk.comparison.saving)} compared with Faster Payments.</>}
              </p>
              {bulk.chapsRowCount > 0 && (
                <Alert tone="info" className="mt-3"><p>{pluralise(bulk.chapsRowCount, 'row')} over £1,000,000 will go by CHAPS automatically.</p></Alert>
              )}
            </fieldset>
            <div className="mt-4"><RowOverrides bulk={bulk} /></div>
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <fieldset>
            <legend className="text-lg font-semibold text-ink">When should we send it?</legend>
            <div className="mt-3">
              <Segmented label="When to send" value={bulk.sendMode} onChange={bulk.setSendMode} options={[{ value: 'now', label: 'Send now' }, { value: 'scheduled', label: 'Schedule' }]} />
            </div>
            {bulk.sendMode === 'scheduled' && (
              <div className="mt-4 max-w-xs">
                <DatePicker label="Send date" value={bulk.scheduledDate} min={bulk.today} onChange={bulk.setScheduledDate} error={bulk.scheduledDate ? bulk.scheduleError : null}
                  hint="Faster Payments go on the day. Other payments go on the next working day if it’s a weekend or bank holiday." />
              </div>
            )}
            <p className="mt-3 text-sm text-muted">
              {bulk.sendMode === 'now'
                ? 'Faster Payments rows go out straight away and you can watch each one being paid. Other rows show their arrival date.'
                : 'Nothing leaves your balances until the send date.'}
            </p>
          </fieldset>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Batch summary</h2>
          <p className="text-sm text-muted num">{bulk.fileName}</p>
          <p className="text-2xl font-semibold text-ink num">{pluralise(s.rowCount, 'payment')}</p>

          <h3 className="mb-1 mt-4 text-xs font-semibold text-muted">By how they’re sent</h3>
          <dl>{s.railGroups.map((g) => <Row key={g.rail} label={RAIL_NAMES[g.rail]}><span className="num">{formatCount(g.count)} · fees {gbp(g.feeGbp)}</span></Row>)}</dl>

          <h3 className="mb-1 mt-4 text-xs font-semibold text-muted">Totals by currency</h3>
          <dl>{s.currencyTotals.map((c) => <Row key={c.currency} label={`${c.currency} (${formatCount(c.count)})`}><span className="num">{formatMoney({ amount: c.total, currency: c.currency })}</span></Row>)}</dl>

          {fxTotals.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-xs font-semibold text-muted">Conversion needed</h3>
              <dl>
                {fxTotals.map((c) => (
                  <Row key={c.currency} label={`GBP → ${c.currency}`}>
                    <span className="num">{gbp(c.debit)}<span className="block text-xs text-muted">at {formatRate(c.fxRate!)} · fee {gbp(c.fxFee ?? 0)}</span></span>
                  </Row>
                ))}
              </dl>
              <p className="text-xs text-muted">Where a currency balance can’t cover its rows, we convert from your GBP balance.</p>
            </>
          )}

          <dl className="mt-4 border-t border-line pt-3">
            <Row label="Total fees"><span className="num">{gbp(s.totalFeesGbp)}</span></Row>
            {s.debits.map((d) => <Row key={d.currency} label={`From ${d.currency} balance`} strong><span className="num">{formatMoney(d)}</span></Row>)}
          </dl>

          <div aria-live="polite" className="mt-3 space-y-3">
            {s.shortfalls.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Your balances cover this batch.</p>
            ) : (
              <Alert tone="danger" title="Not enough available balance">
                {s.shortfalls.map((m) => <p key={m.currency} className="num">You’re {formatMoney(m)} short in {m.currency}.</p>)}
                <Link to="/convert" className="mt-1 inline-block font-semibold text-accent-text hover:underline">Convert or add funds</Link>
              </Alert>
            )}
            {bulk.limitProblem && <Alert tone="danger" title="Above your limit"><p>{bulk.limitProblem}</p></Alert>}
            {bulk.needsApproval && <Alert tone="info"><p>This batch will go to an approver before it’s sent.</p></Alert>}
            {bulk.error && <Alert tone="danger" live><p>{bulk.error}</p></Alert>}
          </div>

          <Button block size="lg" className="mt-4" disabled={!bulk.canSubmit} loading={bulk.submitting} onClick={onSubmit} icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
            {bulk.sendMode === 'scheduled' ? 'Confirm and schedule' : 'Confirm and send'}
          </Button>
          <p className="mt-2 text-center text-xs text-muted">One approval covers the whole batch.</p>
        </Card>
        <Button variant="secondary" block onClick={() => bulk.setStage('review')}>Back to rows</Button>
      </div>
    </div>
  );
}

/** Bulk payments: upload a CSV, fix rows, choose how to send, approve once. */
export function BulkPage() {
  const bulk = useBulkUpload();
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  const sca = useSca({
    onApproved: (res) => { pending.current = null; bulk.submitted(); sca.close(); navigate(`/payments/bulk/${res.resourceId}`); },
    onCancelled: () => { if (pending.current) { void bulk.abandoned(pending.current); pending.current = null; } },
  });

  const submit = async (): Promise<void> => {
    const res = await bulk.submit();
    if (res) { pending.current = res.batchId; await sca.open(res.challengeId); }
  };

  return (
    <>
      <PageHeader title="Bulk payments" description="Payroll, supplier runs and payouts from one file." back={{ to: '/payments', label: 'Payments' }} />
      <div className="mb-6">
        <Stepper steps={STEPS} current={bulk.stage} onSelect={(id) => { if (id === 'upload') bulk.reset(); else bulk.setStage(id as 'review' | 'options'); }} />
      </div>
      {bulk.stage === 'upload' && <UploadStage bulk={bulk} />}
      {bulk.stage === 'review' && <ReviewStage bulk={bulk} />}
      {bulk.stage === 'options' && <OptionsStage bulk={bulk} onSubmit={() => { void submit(); }} />}
      <ScaModal sca={sca} />
    </>
  );
}
