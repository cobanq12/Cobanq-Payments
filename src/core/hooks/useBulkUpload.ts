/**
 * Bulk payment flow: template download, CSV upload and parsing, row validation
 * with inline fixes, grouping by rail, the Faster Payments / Bacs choice,
 * scheduling and submission.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdapters, type PickedFile } from '../adapters';
import { api } from '../api/client';
import { friendlyError, isApiError } from '../api/errors';
import type { BatchSummary, BulkColumn, BulkRowInput, BulkRowResult, BulkSubmitRow, BulkUkRail, RailId } from '../api/types';
import { bacsArrivalDate, effectiveRail, summariseBatch, ukRailComparison } from '../bulk/summary';
import { bulkTemplateCsv, parseBulkCsv, rowsToCsv, EMPTY_BULK_ROW } from '../bulk/template';
import { validateBulkRows } from '../bulk/validate';
import { now } from '../lib/clock';
import { toUkTime, type IsoDate } from '../lib/dates';
import { toCsv } from '../lib/csv';
import { minorToInput } from '../lib/money';
import { toGbp } from '../fx/rates';
import { railConfig, RAIL_NAMES } from '../payments/railConfig';
import { BATCH_ROW_STATUS } from '../payments/statuses';
import { computeLimits } from '../payments/rules';
import { POLL, qk } from './queryKeys';
import { useBalances, useLimits } from './useAccount';

export type BulkStage = 'upload' | 'review' | 'options';

export interface BulkCounts { ok: number; warning: number; error: number }

export function useBulkUpload() {
  const { fileSaver } = useAdapters();
  const qc = useQueryClient();
  const balances = useBalances();
  const limitsQuery = useLimits();

  const [stage, setStage] = useState<BulkStage>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkRowInput[]>([]);
  const [results, setResults] = useState<BulkRowResult[]>([]);
  const [overrides, setOverrides] = useState<Record<number, RailId>>({});
  const [ukRail, setUkRail] = useState<BulkUkRail>('FPS');
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState<IsoDate>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = toUkTime(now()).date;

  const downloadTemplate = useCallback(() => fileSaver.saveText('cobanq-bulk-template.csv', bulkTemplateCsv(), 'text/csv'), [fileSaver]);

  /** Read, parse and validate an uploaded CSV. */
  const loadFile = useCallback(async (file: PickedFile) => {
    setError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { setError('Upload a CSV file. You can download the template to get started.'); return; }
    setLoading(true);
    try {
      const parsed = parseBulkCsv(await file.text(), railConfig.bulkMaxRows);
      if (!parsed.ok) { setError(parsed.error); return; }
      const validated = await api.validateBulkFile(parsed.rows);
      setFileName(file.name);
      setRows(parsed.rows);
      setResults(validated);
      setOverrides({});
      setUkRail('FPS');
      setSendMode('now');
      setScheduledDate('');
      setStage('review');
    } catch (e) {
      setError(isApiError(e) && e.code === 'VALIDATION' ? e.message : friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  /** Inline fix: update one cell and re-check the file straight away. */
  const editCell = useCallback((index: number, column: BulkColumn, value: string) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, [column]: value } : r));
      setResults(validateBulkRows(next));
      return next;
    });
  }, []);

  const reindexOverrides = (keep: number[], prev: Record<number, RailId>): Record<number, RailId> => {
    const out: Record<number, RailId> = {};
    keep.forEach((oldIndex, newIndex) => { if (prev[oldIndex]) out[newIndex] = prev[oldIndex]!; });
    return out;
  };

  const removeRows = useCallback((predicate: (r: BulkRowResult) => boolean) => {
    setRows((prev) => {
      const keep = prev.map((_, i) => i).filter((i) => !predicate(results[i]!));
      const next = keep.map((i) => prev[i]!);
      setResults(validateBulkRows(next));
      setOverrides((o) => reindexOverrides(keep, o));
      return next;
    });
  }, [results]);

  const removeRow = useCallback((index: number) => removeRows((r) => r.index === index), [removeRows]);
  const removeInvalid = useCallback(() => removeRows((r) => r.severity === 'ERROR'), [removeRows]);

  const addRow = useCallback(() => {
    setRows((prev) => {
      const next = [...prev, { ...EMPTY_BULK_ROW }];
      setResults(validateBulkRows(next));
      return next;
    });
  }, []);

  const setOverride = useCallback((index: number, rail: RailId | null) => {
    setOverrides((o) => {
      const next = { ...o };
      if (rail === null) delete next[index]; else next[index] = rail;
      return next;
    });
  }, []);

  const counts: BulkCounts = useMemo(() => ({
    ok: results.filter((r) => r.severity === 'OK').length,
    warning: results.filter((r) => r.severity === 'WARNING').length,
    error: results.filter((r) => r.severity === 'ERROR').length,
  }), [results]);

  /** Rail per row after the batch-level UK choice and per-row overrides. */
  const rowRails: (RailId | undefined)[] = useMemo(
    () => results.map((r) => effectiveRail(r, ukRail, overrides[r.index] === 'FPS' || overrides[r.index] === 'BACS' ? overrides[r.index] : undefined)),
    [results, ukRail, overrides],
  );

  const valid = rows.length > 0 && counts.error === 0;

  const summary: BatchSummary | null = useMemo(() => {
    if (!valid || !balances.data) return null;
    return summariseBatch(
      results.map((r, i) => ({ currency: rows[i]!.currency.trim().toUpperCase(), amount: r.amount ?? 0, rail: rowRails[i] ?? 'FPS' })),
      balances.data,
    );
  }, [valid, balances.data, results, rows, rowRails]);

  const ukRowCount = results.filter((r) => r.rail === 'FPS').length;
  const chapsRowCount = results.filter((r) => r.rail === 'CHAPS').length;
  const comparison = useMemo(() => ukRailComparison(ukRowCount), [ukRowCount]);
  const bacsDate = bacsArrivalDate(now(), sendMode === 'scheduled' && scheduledDate > today ? scheduledDate : undefined);

  const limits = limitsQuery.data ?? computeLimits('MAKER', 0);
  const limitProblem: string | null = useMemo(() => {
    if (!summary) return null;
    const over = results.findIndex((r, i) => toGbp(r.amount ?? 0, rows[i]!.currency.trim().toUpperCase()) > limits.perPayment);
    if (over >= 0) return `Row ${over + 1} is above your limit for a single payment.`;
    if (summary.totalGbp > limits.remainingToday) return 'This batch is more than your remaining daily limit.';
    return null;
  }, [summary, results, rows, limits]);

  const scheduleError = sendMode === 'scheduled' && !(scheduledDate > today) ? 'Choose a date after today.' : null;
  const canSubmit = valid && !!summary && summary.shortfalls.length === 0 && !limitProblem && !scheduleError && !submitting;
  const needsApproval = !!summary && (limits.role === 'MAKER' || summary.totalGbp > limits.approvalThreshold);

  /** Create the batch. Resolves with the single SCA challenge for the whole batch. */
  const submit = useCallback(async (): Promise<{ batchId: string; challengeId: string } | null> => {
    if (!canSubmit) return null;
    setSubmitting(true);
    setError(null);
    try {
      const payload: BulkSubmitRow[] = rows.map((r, i) => ({ ...r, rail: rowRails[i] ?? 'FPS' }));
      const res = await api.submitBulk({ fileName, rows: payload, ukRail, scheduledDate: sendMode === 'scheduled' ? scheduledDate : undefined });
      return { batchId: res.batchId, challengeId: res.scaChallengeId };
    } catch (e) {
      setError(friendlyError(e));
      setSubmitting(false);
      return null;
    }
  }, [canSubmit, rows, rowRails, fileName, ukRail, sendMode, scheduledDate]);

  const submitted = useCallback(() => {
    setSubmitting(false);
    void qc.invalidateQueries();
  }, [qc]);

  /** SCA dialog closed without approving: withdraw the pending batch. */
  const abandoned = useCallback(async (batchId: string) => {
    setSubmitting(false);
    try { await api.cancelPayment(batchId); } catch { /* already gone */ }
  }, []);

  const reset = useCallback(() => {
    setStage('upload'); setFileName(''); setRows([]); setResults([]); setOverrides({}); setError(null); setSubmitting(false);
  }, []);

  /** Load rows directly (used by the test panel's sample files). */
  const loadRows = useCallback(async (name: string, sample: BulkRowInput[]) => {
    await loadFile({ name, size: 0, type: 'text/csv', text: async () => rowsToCsv(sample) });
  }, [loadFile]);

  return {
    stage, setStage, fileName, rows, results, counts, loading, error, setError,
    downloadTemplate, loadFile, loadRows, editCell, removeRow, removeInvalid, addRow,
    ukRail, setUkRail, overrides, setOverride, rowRails, ukRowCount, chapsRowCount, comparison, bacsDate,
    sendMode, setSendMode, scheduledDate, setScheduledDate, scheduleError, today,
    summary, valid, limitProblem, canSubmit, needsApproval, submitting, submit, submitted, abandoned, reset,
  };
}

export type BulkUpload = ReturnType<typeof useBulkUpload>;

export function useBatches() {
  return useQuery({ queryKey: qk.batches, queryFn: () => api.listBatches(), refetchInterval: POLL.payments });
}

/** One batch with live per-row statuses and a downloadable results file. */
export function useBatch(id: string | undefined) {
  const { fileSaver } = useAdapters();
  const query = useQuery({
    queryKey: qk.batch(id ?? ''),
    queryFn: () => api.getBatch(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(q.state.data.status) ? false : POLL.batch),
  });
  const batch = query.data;

  const progress = useMemo(() => {
    const rows = batch?.rows ?? [];
    const paid = rows.filter((r) => r.status === 'COMPLETED').length;
    const failed = rows.filter((r) => r.status === 'FAILED').length;
    const sent = rows.filter((r) => r.status === 'SENT').length;
    return { total: rows.length, paid, failed, sent, pending: rows.length - paid - failed - sent };
  }, [batch]);

  const downloadResults = useCallback(async () => {
    if (!batch) return;
    const csv = toCsv([
      ['row', 'beneficiary name', 'country', 'currency', 'account', 'amount', 'reference', 'sent by', 'status', 'arrival date', 'note'],
      ...batch.rows.map((r) => [
        r.index + 1, r.beneficiaryName, r.country, r.currency, r.account, minorToInput(r.amount, r.currency), r.reference,
        RAIL_NAMES[r.rail], BATCH_ROW_STATUS[r.status].label, r.arrivalDate ?? '', r.statusReason ?? '',
      ]),
    ]);
    await fileSaver.saveText(`cobanq-bulk-results-${batch.reference}.csv`, csv, 'text/csv');
  }, [batch, fileSaver]);

  return { batch, isLoading: query.isLoading, isError: query.isError, progress, downloadResults };
}

