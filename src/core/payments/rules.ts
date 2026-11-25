/**
 * Safety and compliance rules for the amount and review steps: what must be
 * collected, which warnings to show, and whether a payment needs a second approver.
 */
import type { LimitsInfo, Role } from '../api/types';
import type { CurrencyCode } from '../lib/currencies';
import { formatMoney } from '../lib/money';
import { purposeCodesFor, type Option } from './purposes';
import { corridorOf } from './railEngine';
import { railConfig as defaultConfig, type RailConfig } from './railConfig';

export interface Requirements {
  purposeRequired: boolean;
  purposeCodes: Option[] | null;
  sourceOfFundsRequired: boolean;
}

export function requirementsFor(country: string, currency: CurrencyCode, amountGbp: number, cfg: RailConfig = defaultConfig): Requirements {
  const international = corridorOf(country, currency) !== 'UK_GBP';
  return {
    purposeRequired: international || amountGbp >= cfg.purposeRequiredFromGbp,
    purposeCodes: international ? purposeCodesFor(country) : null,
    sourceOfFundsRequired: amountGbp >= cfg.sourceOfFundsFromGbp,
  };
}

export function computeLimits(role: Role, usedToday: number, cfg: RailConfig = defaultConfig): LimitsInfo {
  const l = cfg.limits[role];
  return {
    role,
    perPayment: l.perPayment,
    daily: l.daily,
    usedToday,
    remainingToday: Math.max(0, l.daily - usedToday),
    approvalThreshold: cfg.approvalThresholdGbp,
  };
}

export type AmountIssueCode = 'INSUFFICIENT' | 'BELOW_MIN' | 'ABOVE_LIMIT' | 'ABOVE_DAILY';

export interface AmountIssue {
  code: AmountIssueCode;
  message: string;
}

export interface AmountCheck {
  amountGbp: number;
  /** Total leaving the pay-from balance, minor units. */
  totalDebit: number;
  payFromCurrency: CurrencyCode;
  available: number;
  limits: LimitsInfo;
}

const gbp = (amount: number): string => formatMoney({ amount, currency: 'GBP' });

export function checkAmount(c: AmountCheck, cfg: RailConfig = defaultConfig): AmountIssue[] {
  const issues: AmountIssue[] = [];
  if (c.amountGbp < cfg.minPaymentGbp) {
    issues.push({ code: 'BELOW_MIN', message: `The minimum payment is ${gbp(cfg.minPaymentGbp)} or equivalent.` });
  }
  if (c.amountGbp > c.limits.perPayment) {
    issues.push({ code: 'ABOVE_LIMIT', message: `Your limit for a single payment is ${gbp(c.limits.perPayment)} or equivalent.` });
  } else if (c.amountGbp > c.limits.remainingToday) {
    issues.push({ code: 'ABOVE_DAILY', message: `This is more than your remaining daily limit of ${gbp(c.limits.remainingToday)}.` });
  }
  if (c.totalDebit > c.available) {
    issues.push({
      code: 'INSUFFICIENT',
      message: `Your available ${c.payFromCurrency} balance is ${formatMoney({ amount: c.available, currency: c.payFromCurrency })}. You need ${formatMoney({ amount: c.totalDebit, currency: c.payFromCurrency })} including fees.`,
    });
  }
  return issues;
}

/** A Maker's payments always go for approval; above the threshold everyone needs a second approver. */
export function needsApproval(role: Role, amountGbp: number, cfg: RailConfig = defaultConfig): boolean {
  return role === 'MAKER' || amountGbp > cfg.approvalThresholdGbp;
}

export interface ScamWarning {
  title: string;
  body: string;
  /** The customer must tick a box to continue. */
  requiresAck: boolean;
}

/** Dynamic APP-fraud warning based on purpose and whether the beneficiary is new. */
export function scamWarningFor(purpose: string | undefined, newBeneficiary: boolean, amountGbp: number, cfg: RailConfig = defaultConfig): ScamWarning | null {
  const requiresAck = newBeneficiary && amountGbp > cfg.scamAckFromGbp;
  const byPurpose: Record<string, string> = {
    SUPPLIER: 'Have you verified these bank details by phone, using a number you already know? Criminals often send fake invoices with changed bank details.',
    SERVICES: 'Have you checked this invoice is genuine? Call the supplier on a number you already know before you pay.',
    INVESTMENT: 'Check the firm is authorised on the FCA Register before you invest. Offers that sound too good to be true usually are.',
    FAMILY: 'Has someone asked for money urgently by message or email? Speak to them in person or by phone before you send it.',
    PAYROLL: 'Has an employee asked to change their bank details by email? Confirm the change with them in person or by phone.',
    RENT: 'Have you seen the property and checked the landlord or agent is genuine? Never pay a deposit under pressure.',
    TAXES: 'HMRC will never ask you to move money to a "safe account" or pay a new account by phone or text.',
    LOAN: 'Check the lender’s bank details with them directly, using contact details you already trust.',
  };
  if (newBeneficiary) {
    return {
      title: 'Stop and check — this is a new beneficiary',
      body: byPurpose[purpose ?? ''] ?? 'Check these bank details with the beneficiary using contact details you already trust. If someone is pressuring you to pay, stop.',
      requiresAck,
    };
  }
  if (purpose === 'INVESTMENT') {
    return { title: 'Check before you invest', body: byPurpose.INVESTMENT!, requiresAck: false };
  }
  return null;
}

export const SCAM_ACK_TEXT = 'I’ve checked these details and I’m confident this payment is genuine. I understand I may not get my money back if this turns out to be a scam.';
export const COP_ACK_TEXT = 'I understand the name doesn’t match and I may not get my money back if this payment goes to the wrong account.';
export const COP_UNAVAILABLE_ACK_TEXT = 'I understand the name couldn’t be checked and I’m sure these details are correct.';
