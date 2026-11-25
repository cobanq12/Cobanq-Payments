import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, XCircle } from 'lucide-react';
import type { BulkColumn } from '@core/api/types';
import { BULK_COLUMNS } from '@core/bulk/template';
import type { BulkUpload } from '@core/hooks/useBulkUpload';
import { formatCount } from '@core/lib/format';
import { cn } from '../../components/cn';
import { Pagination } from '../../components/Primitives';
import { Segmented } from '../../components/Tabs';

const PAGE_SIZE = 25;
type Filter = 'all' | 'error' | 'warning';

const WIDTHS: Partial<Record<BulkColumn, string>> = {
  beneficiaryName: 'min-w-[12rem]', type: 'min-w-[7rem]', country: 'min-w-[5rem]', currency: 'min-w-[5rem]', sortCode: 'min-w-[7rem]',
  accountNumber: 'min-w-[8rem]', iban: 'min-w-[15rem]', bic: 'min-w-[8rem]', amount: 'min-w-[7rem]', reference: 'min-w-[10rem]', purpose: 'min-w-[10rem]',
};

/** Validation table: every row green / amber / red, the exact error under each cell, and inline editing. */
export function BulkTable({ bulk }: { bulk: BulkUpload }) {
  const [filter, setFilter] = useState<Filter>(bulk.counts.error > 0 ? 'error' : 'all');
  const [page, setPage] = useState(1);

  const indexes = useMemo(() => bulk.results
    .filter((r) => filter === 'all' || (filter === 'error' ? r.severity === 'ERROR' : r.severity === 'WARNING'))
    .map((r) => r.index), [bulk.results, filter]);

  // When the last error is fixed, fall back to showing everything.
  useEffect(() => { if (filter !== 'all' && indexes.length === 0) setFilter('all'); }, [filter, indexes.length]);
  const pages = Math.max(1, Math.ceil(indexes.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = indexes.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Segmented<Filter>
          label="Rows to show"
          value={filter}
          onChange={(f) => { setFilter(f); setPage(1); }}
          options={[
            { value: 'all', label: `All (${formatCount(bulk.rows.length)})` },
            { value: 'error', label: `Errors (${formatCount(bulk.counts.error)})` },
            { value: 'warning', label: `Warnings (${formatCount(bulk.counts.warning)})` },
          ]}
        />
        <p className="text-xs text-muted">Click any cell to fix it. Rows are checked again as you type.</p>
      </div>
      <div className="overflow-x-auto border-y border-line scrollbar-thin">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Uploaded payment rows with validation results</caption>
          <thead className="bg-subtle text-xs text-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-subtle px-3 py-2.5 font-semibold">Row</th>
              {BULK_COLUMNS.map((c) => <th key={c.key} scope="col" className="px-2 py-2.5 font-semibold capitalize">{c.header}</th>)}
              <th scope="col" className="px-2 py-2.5"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((i) => {
              const row = bulk.rows[i]!;
              const res = bulk.results[i]!;
              const Icon = res.severity === 'ERROR' ? XCircle : res.severity === 'WARNING' ? AlertTriangle : CheckCircle2;
              const tone = res.severity === 'ERROR' ? 'text-danger' : res.severity === 'WARNING' ? 'text-warning' : 'text-success';
              const label = res.severity === 'ERROR' ? 'Has errors' : res.severity === 'WARNING' ? 'Has warnings' : 'Ready';
              return (
                <tr key={i} className={cn(res.severity === 'ERROR' && 'bg-danger-bg/40', res.severity === 'WARNING' && 'bg-warning-bg/40')}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 align-top font-medium">
                    <span className={cn('inline-flex items-center gap-1.5 num', tone)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="text-ink">{i + 1}</span>
                      <span className="sr-only">{label}</span>
                    </span>
                  </th>
                  {BULK_COLUMNS.map((c) => {
                    const error = res.errors[c.key];
                    const warning = res.warnings[c.key];
                    const id = `bulk-${i}-${c.key}`;
                    return (
                      <td key={c.key} className={cn('px-1.5 py-1.5 align-top', WIDTHS[c.key])}>
                        <input
                          id={id}
                          value={row[c.key]}
                          onChange={(e) => bulk.editCell(i, c.key, e.target.value)}
                          aria-label={`Row ${i + 1} ${c.header}`}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error || warning ? `${id}-msg` : undefined}
                          className={cn(
                            'num h-8 w-full rounded border bg-surface px-2 text-sm text-ink',
                            error ? 'border-danger' : warning ? 'border-warning' : 'border-transparent hover:border-line focus:border-focus',
                          )}
                        />
                        {(error || warning) && <p id={`${id}-msg`} className={cn('mt-0.5 px-1 text-xs font-medium', error ? 'text-danger' : 'text-warning')}>{error ?? warning}</p>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 align-top">
                    <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => bulk.removeRow(i)} className="rounded p-1.5 text-muted hover:bg-subtle hover:text-danger">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={BULK_COLUMNS.length + 2} className="px-5 py-8 text-center text-muted">No rows to show.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={current} pageSize={PAGE_SIZE} total={indexes.length} onChange={setPage} />
    </div>
  );
}
