/** Sample bulk files for testing (served from the test panel). */
import type { BulkRowInput } from '../api/types';
import { buildIban } from '../payments/validators';
import { EMPTY_BULK_ROW } from './template';

const UK_SORT_CODES = ['20-45-45', '60-83-71', '30-96-26', '09-01-28', '11-04-33', '08-92-99', '04-00-04', '83-06-08'];
const FIRST = ['Amelia', 'Oliver', 'Isla', 'George', 'Ava', 'Noah', 'Mia', 'Arthur', 'Freya', 'Leo', 'Zara', 'Harry', 'Aisha', 'Jack', 'Priya', 'Theo'];
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Patel', 'Wright', 'Khan', 'Walker', 'Hughes', 'Green', 'Ali', 'Clarke'];

function ukRow(i: number, reference: string, purpose: string): BulkRowInput {
  // Amounts between £80.00 and £299.xx; never ending in a magic value.
  let pence = 8_000 + ((i * 3_719) % 22_000);
  if ([13, 31, 77].includes(pence % 100)) pence += 1;
  return {
    ...EMPTY_BULK_ROW,
    beneficiaryName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    type: 'individual', country: 'GB', currency: 'GBP',
    sortCode: UK_SORT_CODES[i % UK_SORT_CODES.length]!,
    accountNumber: String(10_000_000 + ((i * 7_919) % 89_999_999)).padStart(8, '0'),
    amount: `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}`,
    reference, purpose,
  };
}

/** 1,000 UK GBP rows — a payroll run. */
export function sampleUkPayroll(count = 1000): BulkRowInput[] {
  return Array.from({ length: count }, (_, i) => ukRow(i, 'PAYROLL NOV', 'Payroll / salaries'));
}

/** UK + SEPA + SWIFT rows in one file. */
export function sampleMixed(): BulkRowInput[] {
  const rows: BulkRowInput[] = Array.from({ length: 40 }, (_, i) => ukRow(i, `INV ${1000 + i}`, 'Supplier / goods'));
  const sepa: [string, string, string][] = [
    ['DE', '37040044', 'Rhein Logistik GmbH'], ['FR', '2004101005', 'Atelier Lumiere SARL'], ['NL', 'ABNA', 'Van Dijk Handel BV'],
    ['ES', '21000418', 'Costa Verde SL'], ['DE', '50010517', 'Nordlicht Technik GmbH'], ['IE', 'AIBK931152', 'Shannon Foods Ltd'],
  ];
  sepa.forEach(([cc, bank, name], i) => {
    const bban = cc === 'DE' ? `${bank}${String(532013000 + i).padStart(10, '0')}`
      : cc === 'FR' ? `${bank}0500013M026${String(6 + i).padStart(2, '0')}`
      : cc === 'NL' ? `${bank}${String(417164300 + i).padStart(10, '0')}`
      : cc === 'ES' ? `${bank}45${String(200051332 + i).padStart(10, '0')}`
      : `${bank}${String(12345678 + i).padStart(8, '0')}`;
    for (let k = 0; k < 2; k++) {
      rows.push({
        ...EMPTY_BULK_ROW, beneficiaryName: name, type: 'business', country: cc!, currency: 'EUR', iban: buildIban(cc!, bban),
        amount: `${650 + i * 120 + k * 75}.00`, reference: `RE 2026 ${200 + i * 2 + k}`, purpose: 'Supplier / goods',
      });
    }
  });
  rows.push(
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Atlantic Parts Inc', type: 'business', country: 'US', currency: 'USD', accountNumber: '483920174', bic: 'CHASUS33', amount: '4300.00', reference: 'PO 7781', purpose: 'Supplier / goods' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Lakeshore Design LLC', type: 'business', country: 'US', currency: 'USD', accountNumber: '900214477', bic: 'BOFAUS3N', amount: '1250.00', reference: 'INV 3321', purpose: 'Services' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Al Noor Trading LLC', type: 'business', country: 'AE', currency: 'AED', iban: buildIban('AE', '0331234567890123456'), bic: 'EBILAEAD', amount: '18500.00', reference: 'CONTRACT 56', purpose: 'Supplier / goods' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Shenzhen Hua Electronics Co Ltd', type: 'business', country: 'CN', currency: 'CNY', accountNumber: '7430012345678', bic: 'BKCHCNBJ', amount: '42000.00', reference: 'PO 4480', purpose: 'Supplier / goods' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Harbour Freight Pty Ltd', type: 'business', country: 'AU', currency: 'AUD', accountNumber: '120044871', bic: 'ANZBAU3M', amount: '2100.00', reference: 'FREIGHT 88', purpose: 'Services' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Maple Ridge Supply Inc', type: 'business', country: 'CA', currency: 'CAD', accountNumber: '5521004', bic: 'ROYCCAT2', amount: '3100.00', reference: 'INV 0098', purpose: 'Supplier / goods' },
  );
  return rows;
}

/** A small file with one of each kind of problem, to test the validation table. */
export function sampleWithErrors(): BulkRowInput[] {
  const ok = (i: number): BulkRowInput => ukRow(i, `INV ${500 + i}`, 'Supplier / goods');
  return [
    ok(1),
    { ...ok(2), sortCode: '20-45-4' },
    { ...ok(3), accountNumber: '1234567' },
    { ...ok(4), amount: '125.999' },
    { ...ok(5), reference: 'THIS REFERENCE IS FAR TOO LONG' },
    { ...ok(6), beneficiaryName: '' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Rhein Logistik GmbH', type: 'business', country: 'DE', currency: 'EUR', iban: 'DE00370400440532013000', amount: '900.00', reference: 'RE 1', purpose: 'Supplier / goods' },
    { ...EMPTY_BULK_ROW, beneficiaryName: 'Atlantic Parts Inc', type: 'business', country: 'US', currency: 'USD', accountNumber: '483920174', bic: 'CHAS', amount: '4300.00', reference: 'PO 1', purpose: '' },
    { ...ok(9), type: 'company ltd' },
    { ...ok(10), amount: '250.13' },
    ok(11),
    ok(11),
  ];
}
