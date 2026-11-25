/** Purpose of payment, purpose codes and source of funds lists. */

export interface Option { value: string; label: string }

export const PURPOSES: Option[] = [
  { value: 'SUPPLIER', label: 'Supplier / goods' },
  { value: 'SERVICES', label: 'Services' },
  { value: 'PAYROLL', label: 'Payroll / salaries' },
  { value: 'RENT', label: 'Rent' },
  { value: 'TAXES', label: 'Taxes' },
  { value: 'INTRA_COMPANY', label: 'Intra-company transfer' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'LOAN', label: 'Loan repayment' },
  { value: 'FAMILY', label: 'Family support' },
  { value: 'OTHER', label: 'Other' },
];

export function purposeLabel(value: string | undefined, other?: string): string {
  if (!value) return '—';
  if (value === 'OTHER' && other) return `Other — ${other}`;
  return PURPOSES.find((p) => p.value === value)?.label ?? value;
}

/**
 * Corridors that need a regulatory purpose code. Sample lists for testing —
 * replace with the live lists from the payout partner before go-live.
 */
export const PURPOSE_CODES: Record<string, Option[]> = {
  CN: [
    { value: 'CGODDR', label: 'CGODDR — Cross-border goods trade' },
    { value: 'CSTRDR', label: 'CSTRDR — Cross-border service trade' },
    { value: 'CCTFDR', label: 'CCTFDR — Cross-border capital transfer' },
    { value: 'COCADR', label: 'COCADR — Other current account transactions' },
  ],
  AE: [
    { value: 'GDI', label: 'GDI — Goods bought or sold (imports)' },
    { value: 'STS', label: 'STS — Professional and management services' },
    { value: 'SAL', label: 'SAL — Salary' },
    { value: 'RNT', label: 'RNT — Rent payments' },
    { value: 'FAM', label: 'FAM — Family support' },
    { value: 'IGT', label: 'IGT — Inter-group transfer' },
  ],
  IN: [
    { value: 'P0101', label: 'P0101 — Payment for goods (imports)' },
    { value: 'P0802', label: 'P0802 — Software and IT services' },
    { value: 'P1006', label: 'P1006 — Business and management consultancy' },
    { value: 'P1301', label: 'P1301 — Family maintenance' },
    { value: 'P1401', label: 'P1401 — Compensation of employees' },
  ],
  PK: [
    { value: '9471', label: '9471 — Software and IT services' },
    { value: '9491', label: '9491 — Professional and consultancy services' },
    { value: '1211', label: '1211 — Payment for goods' },
    { value: '9530', label: '9530 — Family maintenance' },
    { value: '9520', label: '9520 — Salaries and wages' },
  ],
};

export function purposeCodesFor(country: string): Option[] | null {
  return PURPOSE_CODES[country.toUpperCase()] ?? null;
}

export const SOURCES_OF_FUNDS: Option[] = [
  { value: 'TRADING', label: 'Business trading income' },
  { value: 'INVESTMENT', label: 'Investment or shareholder funds' },
  { value: 'LOAN', label: 'Loan or credit facility' },
  { value: 'ASSET_SALE', label: 'Sale of an asset' },
  { value: 'GROUP', label: 'Funds from a group company' },
  { value: 'OTHER', label: 'Other' },
];

export function sourceOfFundsLabel(value: string | undefined): string {
  return SOURCES_OF_FUNDS.find((s) => s.value === value)?.label ?? '—';
}
