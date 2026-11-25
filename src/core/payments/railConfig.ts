/**
 * Every threshold, cut-off, fee and corridor timing lives here so operations
 * can tune them without touching the engine or the UI.
 * All amounts are integer minor units.
 */
import type { ChargeOption, Money, RailId, Role } from '../api/types';

export interface RailConfig {
  /** Faster Payments per-payment limit, GBP minor units. */
  fpsMaxGbp: number;
  /** SEPA Instant per-payment limit, EUR minor units. */
  sepaInstantMaxEur: number;
  /** UK local cut-off times (HH:mm) for rails that run on working days only. */
  cutoffs: { CHAPS: string; BACS: string; SEPA_CT: string; SWIFT: string };
  /** Bacs arrives this many working days after the submission day (2 = third working day). */
  bacsWorkingDaysAfterSubmission: number;
  fees: {
    INTERNAL: Money; FPS: Money; BACS: Money; CHAPS: Money; SEPA_INSTANT: Money; SEPA_CT: Money;
    SWIFT: Record<ChargeOption, Money>;
  };
  /** With BEN, this is deducted from the amount the beneficiary receives. */
  benDeduction: Money;
  /** Cobanq FX margin on the mid rate, in basis points (50 = 0.5%). Shown as its own line. */
  fxMarginBps: number;
  /** SWIFT arrival in working days [min, max], per destination country. */
  swiftDays: { default: [number, number]; gbpCrossBorder: [number, number]; byCountry: Record<string, [number, number]> };
  limits: Record<Role, { perPayment: number; daily: number }>;
  /** Payments above this (GBP) always need a second approver. */
  approvalThresholdGbp: number;
  minPaymentGbp: number;
  /** Purpose is required at or above this (GBP), and for all international payments. */
  purposeRequiredFromGbp: number;
  /** Source of funds is required at or above this (GBP). */
  sourceOfFundsFromGbp: number;
  /** First payment to a new beneficiary above this (GBP) needs an extra confirmation. */
  newBeneficiaryCoolingGbp: number;
  /** New-beneficiary payments above this (GBP) need the scam-warning tick box. */
  scamAckFromGbp: number;
  /** Re-run Confirmation of Payee for saved UK beneficiaries when the last check is older than this. */
  copMaxAgeDays: number;
  duplicateWindowHours: number;
  quoteLockSeconds: number;
  /** Show the CHAPS cut-off banner when this close to the cut-off. */
  chapsBannerMinutes: number;
  maxDocumentBytes: number;
  bulkMaxRows: number;
}

const gbp = (amount: number): Money => ({ amount, currency: 'GBP' });
const eur = (amount: number): Money => ({ amount, currency: 'EUR' });

export const railConfig: RailConfig = {
  fpsMaxGbp: 100_000_000, // £1,000,000.00
  sepaInstantMaxEur: 10_000_000, // €100,000.00
  cutoffs: { CHAPS: '15:30', BACS: '16:30', SEPA_CT: '14:00', SWIFT: '15:00' },
  bacsWorkingDaysAfterSubmission: 2,
  fees: {
    INTERNAL: gbp(0),
    FPS: gbp(50),
    BACS: gbp(25),
    CHAPS: gbp(1500),
    SEPA_INSTANT: eur(100),
    SEPA_CT: eur(50),
    SWIFT: { SHA: gbp(1000), OUR: gbp(2500), BEN: gbp(0) },
  },
  benDeduction: gbp(1000),
  fxMarginBps: 50,
  swiftDays: {
    default: [1, 3],
    gbpCrossBorder: [1, 2],
    byCountry: { US: [1, 2], AE: [1, 2], CA: [1, 2], AU: [1, 2], HK: [1, 2], SG: [1, 2], JP: [1, 2], CN: [2, 3], IN: [1, 2], PK: [1, 3] },
  },
  limits: {
    MAKER: { perPayment: 25_000_000, daily: 100_000_000 }, // £250,000 / £1,000,000
    APPROVER: { perPayment: 500_000_000, daily: 500_000_000 }, // £5,000,000
    ADMIN: { perPayment: 500_000_000, daily: 500_000_000 },
  },
  approvalThresholdGbp: 2_500_000, // £25,000
  minPaymentGbp: 100, // £1.00
  purposeRequiredFromGbp: 1_000_000, // £10,000
  sourceOfFundsFromGbp: 5_000_000, // £50,000
  newBeneficiaryCoolingGbp: 1_000_000, // £10,000
  scamAckFromGbp: 100_000, // £1,000
  copMaxAgeDays: 30,
  duplicateWindowHours: 24,
  quoteLockSeconds: 30,
  chapsBannerMinutes: 60,
  maxDocumentBytes: 10 * 1024 * 1024,
  bulkMaxRows: 1000,
};

export const RAIL_NAMES: Record<RailId, string> = {
  INTERNAL: 'Cobanq transfer',
  FPS: 'Faster Payments',
  CHAPS: 'CHAPS',
  BACS: 'Bacs',
  SEPA_INSTANT: 'SEPA Instant',
  SEPA_CT: 'SEPA Credit Transfer',
  SWIFT: 'SWIFT',
};

export const CHARGE_OPTION_COPY: Record<ChargeOption, { title: string; description: string }> = {
  SHA: { title: 'Shared (SHA)', description: 'You pay Cobanq’s fee. The beneficiary’s bank may deduct its own charges.' },
  OUR: { title: 'You pay all charges (OUR)', description: 'You pay all charges, including intermediary banks. They receive the full amount.' },
  BEN: { title: 'Beneficiary pays (BEN)', description: 'All charges are deducted from the amount they receive.' },
};
