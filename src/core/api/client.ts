/**
 * The only door between the UI and the backend. Every screen and hook calls
 * `api.*`; nothing else knows whether the mock or the real backend answers.
 *
 * To go live: set USE_MOCK=false in core/config.ts and point API_BASE_URL at
 * the real service (see api/http.ts). No component changes are needed.
 */
import type { StorageAdapter } from '../adapters';
import { API_BASE_URL, USE_MOCK } from '../config';
import { createHttpApi } from './http';
import { createMockApi, type MockControls } from './mock';
import type {
  Account, AppNotification, ApprovalItem, Balance, BankLookupRequest, BankLookupResult, Batch, Beneficiary, BeneficiaryInput,
  BeneficiaryQuery, BulkRowInput, BulkRowResult, BulkSubmitRequest, BulkSubmitResponse, CheckPayeeRequest, CheckPayeeResponse,
  CreatePaymentRequest, CreatePaymentResponse, CurrencyCode, FxQuote, FxQuoteRequest, LimitsInfo, Page, Payment, PaymentFilters,
  ProblemReport, RailInput, RailSelection, RatePoint, ScaChallenge, UploadedDocument, VerifyScaRequest, VerifyScaResponse,
} from './types';

export interface UploadFile {
  name: string;
  size: number;
  type: string;
}

export interface ApiClient {
  // Account
  getAccount(): Promise<Account>;
  getBalances(): Promise<Balance[]>;
  getLimits(): Promise<LimitsInfo>;

  // Beneficiaries
  listBeneficiaries(query?: BeneficiaryQuery): Promise<Beneficiary[]>;
  /** Creating is immediate; editing bank details and deleting return an SCA challenge. */
  createBeneficiary(b: BeneficiaryInput): Promise<Beneficiary>;
  updateBeneficiary(id: string, b: BeneficiaryInput): Promise<{ beneficiary?: Beneficiary; scaChallengeId?: string }>;
  deleteBeneficiary(id: string): Promise<{ scaChallengeId: string }>;
  lookupBank(req: BankLookupRequest): Promise<BankLookupResult | null>;
  checkPayee(req: CheckPayeeRequest): Promise<CheckPayeeResponse>;

  // Rails & FX
  getRails(input: Omit<RailInput, 'now'>): Promise<RailSelection>;
  getFxQuote(req: FxQuoteRequest): Promise<FxQuote>;
  convert(req: { quoteId: string }): Promise<{ conversionId: string; scaChallengeId: string }>;
  getRateHistory(pair: string): Promise<RatePoint[]>;
  getIndicativeRates(base: CurrencyCode): Promise<{ currency: CurrencyCode; rate: number }[]>;

  // Payments
  createPayment(draft: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  listPayments(filters?: PaymentFilters): Promise<Page<Payment>>;
  getPayment(id: string): Promise<Payment>;
  /** Approve / reject accept payment IDs and batch IDs. */
  approvePayment(id: string): Promise<void>;
  rejectPayment(id: string, reason: string): Promise<void>;
  cancelPayment(id: string): Promise<void>;
  listApprovals(): Promise<ApprovalItem[]>;
  uploadDocument(file: UploadFile, paymentId?: string, onProgress?: (fraction: number) => void): Promise<UploadedDocument>;
  reportProblem(report: ProblemReport): Promise<{ caseNumber: string }>;

  // SCA
  getScaChallenge(challengeId: string): Promise<ScaChallenge>;
  resendScaCode(challengeId: string): Promise<void>;
  verifySca(req: VerifyScaRequest): Promise<VerifyScaResponse>;

  // Bulk
  validateBulkFile(rows: BulkRowInput[]): Promise<BulkRowResult[]>;
  submitBulk(batch: BulkSubmitRequest): Promise<BulkSubmitResponse>;
  listBatches(): Promise<Batch[]>;
  getBatch(id: string): Promise<Batch>;

  // Notifications
  listNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(): Promise<void>;
}

let impl: ApiClient | null = null;
let controls: MockControls | null = null;

/** Call once at start-up with the platform's storage adapter. */
export function configureApi(options: { storage: StorageAdapter }): void {
  if (USE_MOCK) {
    const mock = createMockApi(options.storage);
    impl = mock.api;
    controls = mock.controls;
  } else {
    impl = createHttpApi(API_BASE_URL);
    controls = null;
  }
}

function current(): ApiClient {
  if (!impl) throw new Error('configureApi() has not been called');
  return impl;
}

/** Typed API functions. Usage: `await api.getBalances()`. */
export const api: ApiClient = new Proxy({} as ApiClient, {
  get: (_target, key) => Reflect.get(current(), key),
});

/** Test-panel controls. Null when the real backend is in use. */
export function getMockControls(): MockControls | null {
  return controls;
}
