import type { BulkColumn, BulkRowInput } from '../api/types';
import { parseCsv, toCsv } from '../lib/csv';

export const BULK_COLUMNS: { key: BulkColumn; header: string }[] = [
  { key: 'beneficiaryName', header: 'beneficiary name' },
  { key: 'type', header: 'type' },
  { key: 'country', header: 'country' },
  { key: 'currency', header: 'currency' },
  { key: 'sortCode', header: 'sort code' },
  { key: 'accountNumber', header: 'account number' },
  { key: 'iban', header: 'IBAN' },
  { key: 'bic', header: 'BIC' },
  { key: 'amount', header: 'amount' },
  { key: 'reference', header: 'reference' },
  { key: 'purpose', header: 'purpose' },
];

export const EMPTY_BULK_ROW: BulkRowInput = {
  beneficiaryName: '', type: '', country: '', currency: '', sortCode: '', accountNumber: '', iban: '', bic: '', amount: '', reference: '', purpose: '',
};

export function rowsToCsv(rows: BulkRowInput[]): string {
  return toCsv([BULK_COLUMNS.map((c) => c.header), ...rows.map((r) => BULK_COLUMNS.map((c) => r[c.key]))]);
}

/** The downloadable template: headers plus three example rows. */
export function bulkTemplateCsv(): string {
  return rowsToCsv([
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Brightwave Supplies Ltd', type: 'business', country: 'GB', currency: 'GBP', sortCode: '20-45-45', accountNumber: '43219876', amount: '1250.00', reference: 'INV 10432', purpose: 'Supplier / goods' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Muller Maschinenbau GmbH', type: 'business', country: 'DE', currency: 'EUR', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', amount: '980.50', reference: 'RE 2026 118', purpose: 'Supplier / goods' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Atlantic Parts Inc', type: 'business', country: 'US', currency: 'USD', accountNumber: '483920174', bic: 'CHASUS33', amount: '4300.00', reference: 'PO 7781', purpose: 'Supplier / goods' },
  ]);
}

const normalise = (h: string): string => h.toLowerCase().replace(/[^a-z]/g, '');

export type ParseBulkResult =
  | { ok: true; rows: BulkRowInput[] }
  | { ok: false; error: string };

/** Parse an uploaded CSV into rows, matching columns by header name (any order, case-insensitive). */
export function parseBulkCsv(text: string, maxRows: number): ParseBulkResult {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: 'This file has no payment rows. Add at least one row under the headers.' };
  const headers = table[0]!.map(normalise);
  const indexOf = new Map<BulkColumn, number>();
  for (const col of BULK_COLUMNS) {
    const i = headers.indexOf(normalise(col.header));
    if (i >= 0) indexOf.set(col.key, i);
  }
  const missing = BULK_COLUMNS.filter((c) => !indexOf.has(c.key)).map((c) => c.header);
  if (missing.length > 0) return { ok: false, error: `This file is missing columns: ${missing.join(', ')}. Download the template and try again.` };
  const body = table.slice(1);
  if (body.length > maxRows) return { ok: false, error: `This file has ${body.length} rows. The maximum is ${maxRows} per file.` };
  const rows = body.map((cells) => {
    const row = { ...EMPTY_BULK_ROW };
    for (const col of BULK_COLUMNS) row[col.key] = (cells[indexOf.get(col.key)!] ?? '').trim();
    return row;
  });
  return { ok: true, rows };
}
