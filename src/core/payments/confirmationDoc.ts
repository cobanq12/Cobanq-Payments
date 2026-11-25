/** Builds the platform-neutral payment confirmation document (rendered to PDF by the platform adapter). */
import type { PdfDocument, PdfRow, PdfSection } from '../adapters';
import type { Payment } from '../api/types';
import { ENTITY, regulatoryLine } from '../config';
import { countryName } from '../lib/countries';
import { formatDate, formatDateTime } from '../lib/dates';
import { formatIban, formatSortCode } from '../lib/format';
import { formatMoney, formatMoneyCode, formatRate } from '../lib/money';
import { purposeLabel } from './purposes';
import { CHARGE_OPTION_COPY, RAIL_NAMES } from './railConfig';
import { PAYMENT_STATUS } from './statuses';

export function accountRows(details: Payment['beneficiary']['details']): PdfRow[] {
  const rows: PdfRow[] = [];
  if (details.sortCode) rows.push({ label: 'Sort code', value: formatSortCode(details.sortCode) });
  if (details.iban) rows.push({ label: 'IBAN', value: formatIban(details.iban) });
  if (details.routingNumber) rows.push({ label: 'ABA routing number', value: details.routingNumber });
  if (details.transitNumber) rows.push({ label: 'Transit number', value: details.transitNumber });
  if (details.institutionNumber) rows.push({ label: 'Institution number', value: details.institutionNumber });
  if (details.bsb) rows.push({ label: 'BSB', value: details.bsb });
  if (details.ifsc) rows.push({ label: 'IFSC', value: details.ifsc });
  if (details.accountNumber) rows.push({ label: 'Account number', value: details.accountNumber });
  if (details.cnaps) rows.push({ label: 'CNAPS code', value: details.cnaps });
  if (details.bic) rows.push({ label: 'BIC / SWIFT', value: details.bic });
  return rows;
}

export function buildConfirmationDoc(p: Payment): PdfDocument {
  const beneficiary: PdfRow[] = [
    { label: 'Name', value: p.beneficiary.name },
    ...accountRows(p.beneficiary.details),
  ];
  const bank = p.beneficiary.resolvedBank ?? p.beneficiary.details.bankName;
  if (bank) beneficiary.push({ label: 'Bank', value: bank });
  beneficiary.push({ label: 'Country', value: countryName(p.beneficiary.country) });

  const amounts: PdfRow[] = [
    { label: 'Amount sent', value: formatMoneyCode(p.sendAmount) },
    { label: 'Beneficiary receives', value: formatMoneyCode(p.receiveAmount) },
  ];
  if (p.fx) amounts.push({ label: 'Exchange rate', value: `1 ${p.sendAmount.currency} = ${formatRate(p.fx.rate)} ${p.receiveAmount.currency}` });
  for (const fee of p.fees) amounts.push({ label: fee.label, value: formatMoneyCode(fee.amount) });
  amounts.push({ label: `Total debited from ${p.payFromCurrency} balance`, value: formatMoneyCode(p.totalDebit) });

  const delivery: PdfRow[] = [
    { label: 'Sent by', value: RAIL_NAMES[p.rail] },
    { label: 'Status', value: PAYMENT_STATUS[p.status].label },
  ];
  if (p.chargeOption) delivery.push({ label: 'Charges', value: CHARGE_OPTION_COPY[p.chargeOption].title });
  if (p.uetr) delivery.push({ label: 'UETR', value: p.uetr });
  if (p.scheduledDate) delivery.push({ label: 'Payment date', value: formatDate(p.scheduledDate) });
  delivery.push({ label: 'Reference', value: p.payeeReference });
  if (p.purpose) delivery.push({ label: 'Purpose', value: purposeLabel(p.purpose, p.purposeOther) });

  const timeline: PdfRow[] = p.events.map((e) => ({ label: formatDateTime(e.at), value: e.by ? `${e.label} — ${e.by}` : e.label }));

  const sections: PdfSection[] = [
    { title: 'Beneficiary', rows: beneficiary },
    { title: 'Amount and fees', rows: amounts },
    { title: 'Payment details', rows: delivery },
    { title: 'Timeline (UK time)', rows: timeline },
  ];

  return {
    fileName: `Cobanq-confirmation-${p.reference}.pdf`,
    title: 'Payment confirmation',
    subtitle: `${p.reference} · created ${formatDateTime(p.createdAt)} by ${p.createdBy.name}`,
    headline: { label: `Paid to ${p.beneficiary.name}`, value: formatMoney(p.receiveAmount) },
    sections,
    footer: [
      regulatoryLine(),
      `This confirmation shows the instruction ${ENTITY.tradingName} received. It is not proof that the beneficiary’s bank has credited the account.`,
    ],
  };
}

/** Short text version for copy / email sharing. */
export function confirmationText(p: Payment): string {
  return [
    `${ENTITY.tradingName} payment confirmation`,
    `Reference: ${p.reference}`,
    `To: ${p.beneficiary.name}`,
    `Amount: ${formatMoneyCode(p.receiveAmount)}`,
    `Sent by: ${RAIL_NAMES[p.rail]}`,
    p.uetr ? `UETR: ${p.uetr}` : null,
    `Status: ${PAYMENT_STATUS[p.status].label}`,
    `Payment reference: ${p.payeeReference}`,
  ].filter(Boolean).join('\n');
}
