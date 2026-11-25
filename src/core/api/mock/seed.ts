/** Seed data for the mock backend: one business, 12 balances, saved beneficiaries and payment history. */
import type {
  Account, Balance, Beneficiary, ChargeOption, CopCheck, Payment, PaymentEvent, PaymentStatus, RailId, Role, User,
} from '../types';
import { paymentReference, uetr } from '../../lib/ids';
import { toUkTime } from '../../lib/dates';
import { convertAtMid, midRate, roundRate, toGbp } from '../../fx/rates';
import { computeBreakdown, fxFee } from '../../payments/fees';
import { RAIL_NAMES } from '../../payments/railConfig';
import { buildIban } from '../../payments/validators';

export const USERS: Record<Role, User> = {
  MAKER: { id: 'u_maker', name: 'Sam Carter', email: 'sam.carter@acmetrading.example', role: 'MAKER' },
  APPROVER: { id: 'u_approver', name: 'Priya Shah', email: 'priya.shah@acmetrading.example', role: 'APPROVER' },
  ADMIN: { id: 'u_admin', name: 'Alex Morgan', email: 'alex.morgan@acmetrading.example', role: 'ADMIN' },
};

export const OWN_SORT_CODE = '400000';
export const OWN_ACCOUNT_NUMBER = '31926819';

export function seedAccount(user: User): Account {
  return {
    businessName: 'Acme Trading Ltd',
    businessAddress: '14 Wharf Road, London, England, N1 7GR',
    accountName: 'Acme Trading Ltd',
    iban: buildIban('GB', `CBNQ${OWN_SORT_CODE}${OWN_ACCOUNT_NUMBER}`),
    bic: 'CBNQGB2LXXX',
    sortCode: OWN_SORT_CODE,
    accountNumber: OWN_ACCOUNT_NUMBER,
    user,
  };
}

export function seedBalances(): Balance[] {
  return [
    { currency: 'GBP', available: 24_835_075 },
    { currency: 'EUR', available: 6_120_000 },
    { currency: 'USD', available: 9_487_540 },
    { currency: 'AED', available: 1_840_000 },
    { currency: 'AUD', available: 725_010 },
    { currency: 'CAD', available: 1_298_000 },
    { currency: 'CHF', available: 340_050 },
    { currency: 'CNY', available: 15_200_000 },
    { currency: 'HKD', available: 0 },
    { currency: 'JPY', available: 1_250_000 },
    { currency: 'PLN', available: 2_231_045 },
    { currency: 'SGD', available: 512_000 },
  ];
}

const DAY = 86_400_000;

export function seedBeneficiaries(now: Date): Beneficiary[] {
  const ago = (days: number): string => new Date(now.getTime() - days * DAY).toISOString();
  const cop = (days: number): CopCheck => ({ result: 'MATCH', checkedAt: ago(days) });
  return [
    {
      id: 'ben_brightwave', type: 'BUSINESS', name: 'Brightwave Supplies Ltd', country: 'GB', currency: 'GBP',
      details: { sortCode: '204545', accountNumber: '43219876' }, resolvedBank: 'Barclays Bank UK PLC',
      defaultReference: 'ACME ACCOUNT', cop: cop(5), createdAt: ago(210), lastPaidAt: ago(2),
    },
    {
      id: 'ben_harper', type: 'BUSINESS', name: 'Harper & Lane LLP', country: 'GB', currency: 'GBP',
      details: { sortCode: '608371', accountNumber: '20145566' }, resolvedBank: 'National Westminster Bank plc',
      cop: cop(45), createdAt: ago(160), lastPaidAt: ago(40),
    },
    {
      id: 'ben_priya', type: 'INDIVIDUAL', name: 'Daniel Okafor', firstName: 'Daniel', lastName: 'Okafor', nickname: 'Dan (contractor)',
      country: 'GB', currency: 'GBP', details: { sortCode: '309626', accountNumber: '55667788' }, resolvedBank: 'Lloyds Bank plc',
      cop: cop(12), createdAt: ago(90), lastPaidAt: ago(26),
    },
    {
      id: 'ben_northgate', type: 'BUSINESS', name: 'Northgate Logistics Ltd', country: 'GB', currency: 'GBP',
      details: { sortCode: '400000', accountNumber: '12345678' }, resolvedBank: 'Cobanq', internal: true,
      cop: cop(3), createdAt: ago(60), lastPaidAt: ago(9),
    },
    {
      id: 'ben_muller', type: 'BUSINESS', name: 'Müller Maschinenbau GmbH', country: 'DE', currency: 'EUR',
      details: { iban: buildIban('DE', '370400440532013000'), bic: 'COBADEFFXXX' }, resolvedBank: 'Commerzbank AG',
      address: { line1: 'Industriestraße 14', city: 'Köln', postcode: '50667', country: 'DE' }, createdAt: ago(300), lastPaidAt: ago(6),
    },
    {
      id: 'ben_dupont', type: 'BUSINESS', name: 'Dupont Conseil SARL', country: 'FR', currency: 'EUR',
      details: { iban: buildIban('FR', '20041010050500013M02606'), bic: 'PSSTFRPPXXX' }, resolvedBank: 'La Banque Postale',
      address: { line1: '8 Rue de la Paix', city: 'Paris', postcode: '75002', country: 'FR' }, createdAt: ago(120), lastPaidAt: ago(18),
    },
    {
      id: 'ben_lisboa', type: 'BUSINESS', name: 'Lisboa Têxteis Lda', country: 'PT', currency: 'EUR',
      details: { iban: buildIban('PT', '000201231234567890154'), bic: 'CGDIPTPLXXX' }, resolvedBank: 'Caixa Geral de Depósitos',
      address: { line1: 'Rua Augusta 102', city: 'Lisboa', postcode: '1100-053', country: 'PT' }, createdAt: ago(75), lastPaidAt: ago(30),
    },
    {
      id: 'ben_atlantic', type: 'BUSINESS', name: 'Atlantic Parts Inc', country: 'US', currency: 'USD',
      details: { routingNumber: '021000021', accountNumber: '483920174', bic: 'CHASUS33', bankName: 'JPMorgan Chase Bank N.A.', bankAddress: '383 Madison Avenue, New York, NY 10179' },
      resolvedBank: 'JPMorgan Chase Bank N.A.',
      address: { line1: '2200 Harbor Blvd', city: 'Newark', postcode: 'NJ 07114', country: 'US' }, createdAt: ago(200), lastPaidAt: ago(11),
    },
    {
      id: 'ben_alnoor', type: 'BUSINESS', name: 'Al Noor Trading LLC', country: 'AE', currency: 'AED',
      details: { iban: buildIban('AE', '0331234567890123456'), bic: 'EBILAEADXXX', bankName: 'Emirates NBD Bank PJSC', bankAddress: 'Baniyas Road, Deira, Dubai' },
      resolvedBank: 'Emirates NBD Bank PJSC',
      address: { line1: 'Office 1204, Business Bay Tower', city: 'Dubai', postcode: '00000', country: 'AE' }, createdAt: ago(140), lastPaidAt: ago(21),
    },
    {
      id: 'ben_shenzhen', type: 'BUSINESS', name: 'Shenzhen Hua Electronics Co Ltd', country: 'CN', currency: 'CNY',
      details: { accountNumber: '7430012345678', bic: 'BKCHCNBJ', bankName: 'Bank of China', bankAddress: 'Futian District, Shenzhen' },
      resolvedBank: 'Bank of China',
      address: { line1: '88 Shennan Avenue', city: 'Shenzhen', postcode: '518000', country: 'CN' }, createdAt: ago(95), lastPaidAt: ago(14),
    },
    {
      id: 'ben_techsoft', type: 'BUSINESS', name: 'TechSoft Solutions (Pvt) Ltd', country: 'PK', currency: 'PKR',
      details: { iban: buildIban('PK', 'SCBL0000001123456702'), bic: 'SCBLPKKXXXX', bankName: 'Standard Chartered Bank (Pakistan) Ltd', bankAddress: 'I.I. Chundrigar Road, Karachi' },
      resolvedBank: 'Standard Chartered Bank (Pakistan) Ltd',
      address: { line1: 'Plot 12, Software Technology Park', city: 'Islamabad', postcode: '44000', country: 'PK' }, createdAt: ago(50), lastPaidAt: ago(16),
    },
  ];
}

interface SeedSpec {
  daysAgo: number;
  ben: string;
  /** Amount the beneficiary receives, minor units. */
  amount: number;
  rail: RailId;
  status: PaymentStatus;
  payFrom?: string;
  reference: string;
  purpose?: string;
  charge?: ChargeOption;
  by?: Role;
  reason?: string;
  scheduledInDays?: number;
}

const SPECS: SeedSpec[] = [
  { daysAgo: 0.1, ben: 'ben_brightwave', amount: 348_000, rail: 'FPS', status: 'COMPLETED', reference: 'INV 10431' },
  { daysAgo: 0.3, ben: 'ben_muller', amount: 1_250_000, rail: 'SEPA_INSTANT', status: 'COMPLETED', reference: 'RE 2026 114', purpose: 'SUPPLIER' },
  { daysAgo: 0.6, ben: 'ben_harper', amount: 3_200_000, rail: 'FPS', status: 'AWAITING_APPROVAL', reference: 'LEGAL FEES NOV', purpose: 'SERVICES' },
  { daysAgo: 1, ben: 'ben_atlantic', amount: 1_800_000, rail: 'SWIFT', status: 'SENT', reference: 'PO 7780', purpose: 'SUPPLIER', charge: 'SHA' },
  { daysAgo: 1.2, ben: 'ben_alnoor', amount: 5_500_000, rail: 'SWIFT', status: 'IN_REVIEW', payFrom: 'GBP', reference: 'CONTRACT 55', purpose: 'SUPPLIER', charge: 'SHA' },
  { daysAgo: 2, ben: 'ben_brightwave', amount: 125_050, rail: 'FPS', status: 'COMPLETED', reference: 'INV 10398' },
  { daysAgo: 2.5, ben: 'ben_priya', amount: 210_000, rail: 'FPS', status: 'RETURNED', reference: 'OCT SERVICES', reason: 'The beneficiary’s bank returned this payment: account closed.' },
  { daysAgo: 3, ben: 'ben_northgate', amount: 780_000, rail: 'INTERNAL', status: 'COMPLETED', reference: 'HAULAGE W47' },
  { daysAgo: 4, ben: 'ben_dupont', amount: 430_000, rail: 'SEPA_CT', status: 'COMPLETED', payFrom: 'GBP', reference: 'CONSEIL T4', purpose: 'SERVICES' },
  { daysAgo: 5, ben: 'ben_harper', amount: 5_421_033, rail: 'CHAPS', status: 'COMPLETED', reference: 'COMPLETION 14B', purpose: 'SERVICES', by: 'APPROVER' },
  { daysAgo: 6, ben: 'ben_muller', amount: 890_000, rail: 'SEPA_INSTANT', status: 'COMPLETED', reference: 'RE 2026 101', purpose: 'SUPPLIER' },
  { daysAgo: 7, ben: 'ben_shenzhen', amount: 9_600_000, rail: 'SWIFT', status: 'COMPLETED', reference: 'PO 4471', purpose: 'SUPPLIER', charge: 'OUR' },
  { daysAgo: 8, ben: 'ben_brightwave', amount: 64_213, rail: 'FPS', status: 'FAILED', reference: 'INV 10377', reason: 'The beneficiary’s bank rejected this payment.' },
  { daysAgo: 9, ben: 'ben_northgate', amount: 1_150_000, rail: 'INTERNAL', status: 'COMPLETED', reference: 'HAULAGE W46' },
  { daysAgo: 10, ben: 'ben_lisboa', amount: 2_240_000, rail: 'SEPA_CT', status: 'COMPLETED', reference: 'FT 2026 77', purpose: 'SUPPLIER' },
  { daysAgo: 11, ben: 'ben_atlantic', amount: 4_300_000, rail: 'SWIFT', status: 'COMPLETED', reference: 'PO 7702', purpose: 'SUPPLIER', charge: 'SHA' },
  { daysAgo: 12, ben: 'ben_priya', amount: 185_000, rail: 'BACS', status: 'COMPLETED', reference: 'OCT SERVICES' },
  { daysAgo: 13, ben: 'ben_techsoft', amount: 176_200_000, rail: 'SWIFT', status: 'COMPLETED', payFrom: 'GBP', reference: 'DEV SPRINT 21', purpose: 'SERVICES', charge: 'SHA' },
  { daysAgo: 14, ben: 'ben_harper', amount: 96_000, rail: 'FPS', status: 'CANCELLED', reference: 'RETAINER' },
  { daysAgo: 16, ben: 'ben_brightwave', amount: 512_400, rail: 'FPS', status: 'COMPLETED', reference: 'INV 10311' },
  { daysAgo: 18, ben: 'ben_dupont', amount: 310_000, rail: 'SEPA_INSTANT', status: 'COMPLETED', reference: 'CONSEIL T3', purpose: 'SERVICES' },
  { daysAgo: 19, ben: 'ben_alnoor', amount: 2_750_000, rail: 'SWIFT', status: 'COMPLETED', reference: 'CONTRACT 51', purpose: 'SUPPLIER', charge: 'SHA' },
  { daysAgo: 21, ben: 'ben_muller', amount: 4_100_000, rail: 'SEPA_CT', status: 'REJECTED', reference: 'RE 2026 090', purpose: 'SUPPLIER', reason: 'Rejected by approver: duplicate of an earlier payment.' },
  { daysAgo: 23, ben: 'ben_brightwave', amount: 220_000, rail: 'FPS', status: 'COMPLETED', reference: 'INV 10288' },
  { daysAgo: 26, ben: 'ben_priya', amount: 185_000, rail: 'FPS', status: 'COMPLETED', reference: 'SEPT SERVICES' },
  { daysAgo: 0.05, ben: 'ben_brightwave', amount: 275_000, rail: 'BACS', status: 'SCHEDULED', reference: 'INV 10440', scheduledInDays: 5 },
];

const SENT_LABEL = (rail: RailId): string => (rail === 'INTERNAL' ? 'Transferred to the Cobanq account' : `Submitted to ${RAIL_NAMES[rail]}`);

export function seedPayments(now: Date, beneficiaries: Beneficiary[]): { payments: Payment[]; seq: number } {
  const byId = new Map(beneficiaries.map((b) => [b.id, b]));
  let seq = 96;
  const payments = SPECS.map((s, i): Payment => {
    const b = byId.get(s.ben)!;
    const created = new Date(now.getTime() - s.daysAgo * DAY);
    const at = (minutes: number): string => new Date(created.getTime() + minutes * 60_000).toISOString();
    const payFrom = s.payFrom ?? b.currency;
    const rate = roundRate(midRate(payFrom, b.currency));
    const send = payFrom === b.currency ? s.amount : convertAtMid(s.amount, b.currency, payFrom);
    const fee = payFrom === b.currency ? 0 : fxFee(send);
    const breakdown = computeBreakdown({ payFromCurrency: payFrom, receiveCurrency: b.currency, sendAmount: send, receiveAmount: s.amount, rail: s.rail, chargeOption: s.charge, fxFeeAmount: fee });
    const creator = USERS[s.by ?? 'MAKER'];
    const approver = creator.role === 'MAKER' ? USERS.APPROVER : USERS.ADMIN;
    const events: PaymentEvent[] = [{ at: at(0), status: 'DRAFT', label: 'Created', by: creator.name }];
    const approved = s.status !== 'AWAITING_APPROVAL' && s.status !== 'CANCELLED' && !(s.status === 'REJECTED' && s.reason?.startsWith('Rejected by approver'));
    if (s.status === 'AWAITING_APPROVAL') events.push({ at: at(1), status: 'AWAITING_APPROVAL', label: 'Sent for approval' });
    if (s.status === 'CANCELLED') events.push({ at: at(1), status: 'AWAITING_APPROVAL', label: 'Sent for approval' }, { at: at(30), status: 'CANCELLED', label: 'Cancelled', by: creator.name });
    if (s.status === 'REJECTED') events.push({ at: at(1), status: 'AWAITING_APPROVAL', label: 'Sent for approval' }, { at: at(45), status: 'REJECTED', label: 'Rejected by approver', by: approver.name, detail: s.reason });
    if (approved) {
      events.push({ at: at(2), status: 'AWAITING_APPROVAL', label: 'Approved', by: approver.name });
      if (s.status === 'SCHEDULED') events.push({ at: at(2), status: 'SCHEDULED', label: 'Scheduled' });
      else {
        events.push({ at: at(3), status: 'PROCESSING', label: 'Processing' });
        if (s.status === 'IN_REVIEW') events.push({ at: at(4), status: 'IN_REVIEW', label: 'Routine check in progress' });
        else if (s.status === 'FAILED') events.push({ at: at(4), status: 'FAILED', label: 'Failed', detail: s.reason });
        else {
          events.push({ at: at(3.5), status: 'PROCESSING', label: 'Screening passed' }, { at: at(4), status: 'SENT', label: SENT_LABEL(s.rail) });
          if (s.status === 'COMPLETED') events.push({ at: at(s.rail === 'FPS' || s.rail === 'SEPA_INSTANT' || s.rail === 'INTERNAL' ? 4.2 : 600), status: 'COMPLETED', label: 'Completed' });
          if (s.status === 'RETURNED') events.push({ at: at(900), status: 'RETURNED', label: 'Returned by the beneficiary’s bank', detail: s.reason });
        }
      }
    }
    const createdUk = toUkTime(created).date;
    const scheduledDate = s.scheduledInDays ? toUkTime(new Date(now.getTime() + s.scheduledInDays * DAY)).date : undefined;
    seq += 1;
    return {
      id: `pay_seed_${i + 1}`,
      reference: paymentReference(created, seq),
      uetr: s.rail === 'SWIFT' ? uetr() : undefined,
      status: s.status,
      beneficiary: { id: b.id, type: b.type, name: b.name, country: b.country, currency: b.currency, details: b.details, resolvedBank: b.resolvedBank, address: b.address },
      newBeneficiary: false,
      payFromCurrency: payFrom,
      sendAmount: { amount: send, currency: payFrom },
      receiveAmount: breakdown.receives,
      fx: payFrom === b.currency ? undefined : { quoteId: `q_seed_${i}`, rate, inverseRate: roundRate(1 / rate) },
      fees: breakdown.lines,
      totalDebit: breakdown.totalDebit,
      amountGbp: toGbp(send, payFrom),
      rail: s.rail,
      chargeOption: s.charge,
      arrivalText: s.status === 'SCHEDULED' ? 'In 3 working days' : 'See timeline',
      arrivalDate: scheduledDate ?? createdUk,
      scheduledDate,
      payeeReference: s.reference,
      purpose: s.purpose,
      documents: [],
      cop: b.cop,
      createdBy: { id: creator.id, name: creator.name, role: creator.role },
      approvedBy: approved ? { id: approver.id, name: approver.name, role: approver.role } : undefined,
      createdAt: created.toISOString(),
      updatedAt: events[events.length - 1]!.at,
      events,
      statusReason: s.reason,
      refunded: s.status === 'RETURNED' || s.status === 'FAILED' ? true : undefined,
    };
  });
  return { payments, seq };
}
