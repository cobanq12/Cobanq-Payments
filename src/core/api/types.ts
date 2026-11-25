/**
 * API contract types. The mock and the real backend both implement `ApiClient`
 * (see client.ts) against these shapes.
 */
import type { CurrencyCode } from '../lib/currencies';
import type { IsoDate } from '../lib/dates';
import type { Money } from '../lib/money';

export type { Money, CurrencyCode, IsoDate };

// ── Users & account ──────────────────────────────────────────────────────────

export type Role = 'MAKER' | 'APPROVER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Account {
  businessName: string;
  /** Registered business address, shown with the account details. */
  businessAddress: string;
  accountName: string;
  iban: string;
  bic: string;
  /** UK details for the GBP balance. */
  sortCode: string;
  accountNumber: string;
  user: User;
}

export interface Balance {
  currency: CurrencyCode;
  /** Available balance in minor units. */
  available: number;
}

// ── Beneficiaries ────────────────────────────────────────────────────────────

export type BeneficiaryType = 'BUSINESS' | 'INDIVIDUAL';

/** Bank detail keys used across corridors. Which ones apply is decided by beneficiarySchemas.ts. */
export type BankDetailKey =
  | 'sortCode' | 'accountNumber' | 'iban' | 'bic'
  | 'routingNumber' | 'transitNumber' | 'institutionNumber' | 'bsb' | 'ifsc' | 'cnaps'
  | 'bankName' | 'bankAddress';

export type BankDetails = Partial<Record<BankDetailKey, string>>;

export interface Address {
  line1: string;
  city: string;
  postcode: string;
  country: string;
}

export type CopResult = 'MATCH' | 'CLOSE_MATCH' | 'NO_MATCH' | 'UNAVAILABLE';

export interface CopCheck {
  result: CopResult;
  suggestedName?: string;
  /** True when the account type (business/personal) differs from what the customer chose. */
  accountTypeMismatch?: boolean;
  checkedAt: string;
  /** The customer chose to continue despite a warning. */
  acknowledged?: boolean;
}

export interface BeneficiaryInput {
  type: BeneficiaryType;
  /** Registered business name, or "First Last" for an individual. */
  name: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  country: string;
  currency: CurrencyCode;
  details: BankDetails;
  address?: Address;
  defaultReference?: string;
  cop?: CopCheck;
}

export interface Beneficiary extends BeneficiaryInput {
  id: string;
  /** Bank name resolved by lookup. */
  resolvedBank?: string;
  /** The account is another Cobanq account. */
  internal?: boolean;
  createdAt: string;
  lastPaidAt?: string;
}

export interface BeneficiaryQuery {
  search?: string;
  country?: string;
  currency?: CurrencyCode;
}

export interface BankLookupRequest {
  sortCode?: string;
  iban?: string;
  bic?: string;
  routingCode?: string;
  country: string;
}

export interface BankLookupResult {
  bankName: string;
  branch?: string;
  bic?: string;
  /** The account belongs to Cobanq, so the payment can go as an internal transfer. */
  internal?: boolean;
  sepaInstantReachable?: boolean;
}

export interface CheckPayeeRequest {
  name: string;
  sortCode: string;
  accountNumber: string;
  accountType: BeneficiaryType;
}

export interface CheckPayeeResponse {
  result: CopResult;
  suggestedName?: string;
  accountTypeMismatch?: boolean;
}

// ── Rails ────────────────────────────────────────────────────────────────────

export type RailId = 'INTERNAL' | 'FPS' | 'CHAPS' | 'BACS' | 'SEPA_INSTANT' | 'SEPA_CT' | 'SWIFT';
export type ChargeOption = 'SHA' | 'OUR' | 'BEN';

export interface RailInput {
  destinationCountry: string;
  receiveCurrency: CurrencyCode;
  payFromCurrency: CurrencyCode;
  /** Payment amount converted to GBP, minor units. */
  amountGbp: number;
  /** Payment amount in the receive currency, minor units. */
  receiveAmount: number;
  /** Date the customer wants the payment sent (UK date). */
  paymentDate: IsoDate;
  /** True when paymentDate is in the future. */
  scheduled: boolean;
  beneficiaryType: BeneficiaryType;
  isBulk: boolean;
  /** Current instant; the engine works in UK time. */
  now: Date;
  /** The beneficiary account is another Cobanq account. */
  internal?: boolean;
  /** Whether the receiving bank can accept SEPA Instant. */
  sepaInstantReachable?: boolean;
}

export interface RailOption {
  rail: RailId;
  name: string;
  description: string;
  eligible: boolean;
  /** Why the rail cannot be used, in plain English. */
  reason?: string;
  recommended: boolean;
  /** Fee in the rail's native fee currency (default charge option). */
  fee: Money;
  /** e.g. "Usually within minutes" */
  arrivalText: string;
  /** Expected arrival date (UK). */
  arrivalDate: IsoDate;
  note?: string;
  chargeOptions?: ChargeOption[];
  /** Fee per charge option, when the rail has charge options. */
  chargeFees?: Partial<Record<ChargeOption, Money>>;
  /** A conversion runs first, from the pay-from balance. */
  requiresFx: boolean;
  /** e.g. "Convert GBP → EUR, then send by SEPA Instant" */
  fxLabel?: string;
}

export interface RailSelection {
  recommended: RailId | null;
  options: RailOption[];
}

// ── FX ───────────────────────────────────────────────────────────────────────

export interface FxQuoteRequest {
  sellCurrency: CurrencyCode;
  buyCurrency: CurrencyCode;
  /** Provide exactly one of sellAmount / buyAmount (minor units). */
  sellAmount?: number;
  buyAmount?: number;
}

export interface FxQuote {
  quoteId: string;
  sellCurrency: CurrencyCode;
  buyCurrency: CurrencyCode;
  sellAmount: number;
  buyAmount: number;
  /** 1 sell = rate buy (mid-market; the Cobanq fee is a separate line, never hidden in the rate). */
  rate: number;
  inverseRate: number;
  /** Cobanq conversion fee, in the sell currency. */
  fee: Money;
  expiresAt: string;
}

export interface RatePoint {
  date: IsoDate;
  rate: number;
}

export interface Conversion {
  id: string;
  reference: string;
  sell: Money;
  buy: Money;
  rate: number;
  fee: Money;
  createdAt: string;
}

// ── Payments ─────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'DRAFT' | 'SCHEDULED' | 'AWAITING_APPROVAL' | 'PROCESSING' | 'IN_REVIEW'
  | 'SENT' | 'COMPLETED' | 'RETURNED' | 'FAILED' | 'CANCELLED' | 'REJECTED';

export type RecurrenceFrequency = 'WEEKLY' | 'MONTHLY';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  endDate?: IsoDate;
  count?: number;
}

export interface FeeLine {
  label: string;
  amount: Money;
  kind: 'RAIL' | 'FX' | 'CHARGES';
}

export interface PaymentEvent {
  at: string;
  status: PaymentStatus;
  label: string;
  detail?: string;
  by?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

export interface PaymentBeneficiarySnapshot {
  id?: string;
  type: BeneficiaryType;
  name: string;
  country: string;
  currency: CurrencyCode;
  details: BankDetails;
  resolvedBank?: string;
  address?: Address;
}

export interface Payment {
  id: string;
  /** Cobanq reference, e.g. CBQ-2026-11-000123 */
  reference: string;
  /** SWIFT payments only. */
  uetr?: string;
  status: PaymentStatus;
  beneficiary: PaymentBeneficiarySnapshot;
  newBeneficiary: boolean;
  payFromCurrency: CurrencyCode;
  /** Principal sent, in the pay-from currency (before fees). */
  sendAmount: Money;
  /** Amount the beneficiary receives. */
  receiveAmount: Money;
  /** The figure the customer typed (minor units), whichever side they fixed. */
  enteredAmount?: number;
  fx?: { quoteId: string; rate: number; inverseRate: number };
  fees: FeeLine[];
  /** Principal + all fees, in the pay-from currency. */
  totalDebit: Money;
  /** GBP equivalent of the principal, used for limits. */
  amountGbp: number;
  rail: RailId;
  chargeOption?: ChargeOption;
  arrivalText: string;
  arrivalDate: IsoDate;
  scheduledDate?: IsoDate;
  recurrence?: Recurrence;
  payeeReference: string;
  purpose?: string;
  purposeOther?: string;
  purposeCode?: string;
  sourceOfFunds?: string;
  documents: UploadedDocument[];
  cop?: CopCheck;
  createdBy: Pick<User, 'id' | 'name' | 'role'>;
  approvedBy?: Pick<User, 'id' | 'name' | 'role'>;
  createdAt: string;
  updatedAt: string;
  events: PaymentEvent[];
  /** Plain-English reason for Failed / Returned / Rejected. */
  statusReason?: string;
  /** True once the debit has been returned to the balance. */
  refunded?: boolean;
  caseNumber?: string;
}

export interface CreatePaymentRequest {
  beneficiaryId?: string;
  /** Provide when paying a new beneficiary. */
  beneficiary?: BeneficiaryInput;
  saveBeneficiary?: boolean;
  payFromCurrency: CurrencyCode;
  /** Which side the customer fixed, and its value in minor units. */
  amount: { side: 'SEND' | 'RECEIVE'; value: number };
  /** Required when pay-from and receive currencies differ. */
  quoteId?: string;
  rail: RailId;
  chargeOption?: ChargeOption;
  scheduledDate?: IsoDate;
  recurrence?: Recurrence;
  payeeReference: string;
  purpose?: string;
  purposeOther?: string;
  purposeCode?: string;
  sourceOfFunds?: string;
  documentIds?: string[];
  cop?: CopCheck;
  /** Set after the customer confirms a suspected duplicate. */
  confirmDuplicate?: boolean;
}

export interface CreatePaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  scaChallengeId: string;
}

export interface PaymentFilters {
  search?: string;
  status?: PaymentStatus | 'ALL';
  currency?: CurrencyCode | 'ALL';
  rail?: RailId | 'ALL';
  from?: IsoDate;
  to?: IsoDate;
  beneficiaryId?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── SCA ──────────────────────────────────────────────────────────────────────

export type ScaAction = 'PAYMENT' | 'BULK' | 'CONVERT' | 'BENEFICIARY_UPDATE' | 'BENEFICIARY_DELETE';

export interface ScaChallenge {
  challengeId: string;
  action: ScaAction;
  /** Dynamic linking: what the customer is approving. */
  payeeName?: string;
  amount?: Money;
  description: string;
  attemptsLeft: number;
  lockedUntil?: string;
}

export type VerifyScaRequest =
  | { challengeId: string; code: string }
  | { challengeId: string; method: 'push' };

export interface VerifyScaResponse {
  status: 'APPROVED';
  action: ScaAction;
  /** ID of the thing the challenge completed (payment, batch, conversion or beneficiary). */
  resourceId: string;
}

// ── Bulk ─────────────────────────────────────────────────────────────────────

export interface BulkRowInput {
  beneficiaryName: string;
  type: string;
  country: string;
  currency: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  bic: string;
  amount: string;
  reference: string;
  purpose: string;
}

export type BulkColumn = keyof BulkRowInput;

export type BulkRowSeverity = 'OK' | 'WARNING' | 'ERROR';

export interface BulkRowResult {
  index: number;
  severity: BulkRowSeverity;
  /** Error message per cell. */
  errors: Partial<Record<BulkColumn, string>>;
  warnings: Partial<Record<BulkColumn, string>>;
  /** Parsed amount in minor units when valid. */
  amount?: number;
  /** Rail the row will use by default. */
  rail?: RailId;
  note?: string;
}

export type BulkUkRail = 'FPS' | 'BACS';

export interface BulkSubmitRow extends BulkRowInput {
  /** Rail chosen for this row (after the batch-level choice and any per-row override). */
  rail: RailId;
}

export interface BulkSubmitRequest {
  fileName: string;
  rows: BulkSubmitRow[];
  ukRail: BulkUkRail;
  scheduledDate?: IsoDate;
}

export type BatchStatus = 'DRAFT' | 'AWAITING_APPROVAL' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type BatchRowStatus = 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'COMPLETED' | 'FAILED';

export interface BatchRow {
  index: number;
  beneficiaryName: string;
  country: string;
  currency: CurrencyCode;
  account: string;
  amount: number;
  reference: string;
  rail: RailId;
  status: BatchRowStatus;
  statusReason?: string;
  arrivalDate?: IsoDate;
}

export interface BatchCurrencyTotal {
  currency: CurrencyCode;
  count: number;
  total: number;
  /** Balance used to fund this currency. */
  fundedFrom: CurrencyCode;
  /** Amount debited from the funding balance (after FX when needed). */
  debit: number;
  fxRate?: number;
  fxFee?: number;
}

export interface BatchRailGroup {
  rail: RailId;
  count: number;
  /** Total rail fees for this group in GBP minor units. */
  feeGbp: number;
}

export interface BatchSummary {
  rowCount: number;
  railGroups: BatchRailGroup[];
  currencyTotals: BatchCurrencyTotal[];
  /** All rail fees, GBP minor units. */
  totalFeesGbp: number;
  /** Total debit per funding balance. */
  debits: Money[];
  /** GBP equivalent of the whole batch, for limits. */
  totalGbp: number;
  /** Funding balances that cannot cover their debit. */
  shortfalls: Money[];
}

export interface Batch {
  id: string;
  reference: string;
  fileName: string;
  status: BatchStatus;
  ukRail: BulkUkRail;
  scheduledDate?: IsoDate;
  rows: BatchRow[];
  summary: BatchSummary;
  createdBy: Pick<User, 'id' | 'name' | 'role'>;
  approvedBy?: Pick<User, 'id' | 'name' | 'role'>;
  createdAt: string;
  statusReason?: string;
}

export interface BulkSubmitResponse {
  batchId: string;
  scaChallengeId: string;
}

// ── Approvals, notifications, cases ──────────────────────────────────────────

export type ApprovalItem =
  | { kind: 'PAYMENT'; id: string; payment: Payment }
  | { kind: 'BATCH'; id: string; batch: Batch };

export interface AppNotification {
  id: string;
  at: string;
  title: string;
  body: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
  paymentId?: string;
  batchId?: string;
  read: boolean;
}

export interface ProblemReport {
  paymentId: string;
  category: 'SCAM' | 'WRONG_DETAILS' | 'NOT_ARRIVED' | 'OTHER';
  description: string;
}

export interface LimitsInfo {
  role: Role;
  /** Per-payment limit, GBP minor units. */
  perPayment: number;
  /** Daily limit, GBP minor units. */
  daily: number;
  /** GBP equivalent already used today. */
  usedToday: number;
  remainingToday: number;
  /** Payments above this always need a second approver. */
  approvalThreshold: number;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'VALIDATION' | 'NOT_FOUND' | 'INSUFFICIENT_FUNDS' | 'LIMIT_EXCEEDED' | 'DAILY_LIMIT_EXCEEDED'
  | 'FX_QUOTE_EXPIRED' | 'RAIL_NOT_ELIGIBLE' | 'DUPLICATE_SUSPECTED'
  | 'SCA_INVALID_CODE' | 'SCA_LOCKED' | 'SCA_EXPIRED'
  | 'NOT_PERMITTED' | 'COP_UNAVAILABLE' | 'FILE_TOO_LARGE' | 'FILE_TYPE' | 'NETWORK' | 'UNKNOWN';

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  field?: string;
}
