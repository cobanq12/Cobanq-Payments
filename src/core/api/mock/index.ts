/**
 * In-memory mock backend with realistic latency, persistent state (through the
 * storage adapter) and built-in test scenarios. It reuses the same pure core
 * functions the real server would run (rail engine, fees, validators).
 */
import type { StorageAdapter } from '../../adapters';
import { SCA } from '../../config';
import { summariseBatch } from '../../bulk/summary';
import { normaliseType, validateBulkRows } from '../../bulk/validate';
import { buildQuote, isQuoteExpired } from '../../fx/quote';
import { GBP_MID_RATES, midRate, roundRate, toGbp } from '../../fx/rates';
import { now as clockNow, setClockOffset } from '../../lib/clock';
import { ALL_CURRENCY_CODES } from '../../lib/currencies';
import { addDays, addMonths, addWorkingDays, formatDate, onOrNextWorkingDay, toUkTime, type IsoDate } from '../../lib/dates';
import { formatSortCode, stripSpaces } from '../../lib/format';
import { paymentReference, randomId, uetr } from '../../lib/ids';
import { formatMoney } from '../../lib/money';
import { bankDetailsChanged } from '../../payments/beneficiarySchemas';
import { computeBreakdown } from '../../payments/fees';
import { RAIL_NAMES, railConfig } from '../../payments/railConfig';
import { corridorOf, selectRails } from '../../payments/railEngine';
import { computeLimits, needsApproval } from '../../payments/rules';
import { canCancel, countsTowardsLimit } from '../../payments/statuses';
import type { ApiClient, UploadFile } from '../client';
import { ApiError } from '../errors';
import type {
  Account, AppNotification, ApprovalItem, Balance, Batch, BatchRow, Beneficiary, BeneficiaryInput, BulkSubmitRequest, Conversion,
  CopCheck, CreatePaymentRequest, FxQuote, Money, Payment, PaymentBeneficiarySnapshot, PaymentEvent, PaymentStatus, RailId,
  RailInput, RatePoint, Role, ScaAction, UploadedDocument, User,
} from '../types';
import { mockLookupBank } from './bankDirectory';
import { seedAccount, seedBalances, seedBeneficiaries, seedPayments, USERS } from './seed';

// ── Test settings & controls ─────────────────────────────────────────────────

export interface TestSettings {
  role: Role;
  /** Shift of the mock clock from real time, in ms. */
  clockOffsetMs: number;
  sepaInstantReachable: boolean;
  copAvailable: boolean;
  /** When on, each new quote moves the rate slightly. */
  fxVolatility: boolean;
}

export interface MockControls {
  getSettings(): Promise<TestSettings>;
  updateSettings(patch: Partial<TestSettings>): Promise<TestSettings>;
  /** Wipe everything back to the seed data. */
  reset(): Promise<void>;
  /** Add test funds to a balance (minor units). */
  addFunds(money: Money): Promise<void>;
  /** The one-time code that always works. */
  otp: string;
  dispose(): void;
}

// ── Database ─────────────────────────────────────────────────────────────────

interface Transition {
  paymentId: string;
  /** Real epoch ms at which to apply. */
  at: number;
  status: PaymentStatus;
  label: string;
  detail?: string;
  reason?: string;
  refund?: boolean;
  notify?: Pick<AppNotification, 'title' | 'body' | 'tone'>;
}

interface Challenge {
  id: string;
  action: ScaAction;
  resourceId: string;
  payeeName?: string;
  amount?: Money;
  description: string;
  userId: string;
  beneficiaryInput?: BeneficiaryInput;
  quoteId?: string;
}

interface Db {
  version: number;
  seq: number;
  balances: Balance[];
  beneficiaries: Beneficiary[];
  payments: Payment[];
  transitions: Transition[];
  batches: Batch[];
  /** Real epoch ms when a batch's slower rows complete. */
  batchSlowDone: Record<string, number>;
  conversions: Conversion[];
  quotes: FxQuote[];
  challenges: Challenge[];
  documents: UploadedDocument[];
  notifications: AppNotification[];
  settings: TestSettings;
  sca: { failed: number; lockedUntil: number };
}

const DB_KEY = 'cobanq.mock.db';
const DB_VERSION = 3;
const MAX_BATCHES = 6;

const DEFAULT_SETTINGS: TestSettings = { role: 'MAKER', clockOffsetMs: 0, sepaInstantReachable: true, copAvailable: true, fxVolatility: true };

function freshDb(): Db {
  const now = clockNow();
  const beneficiaries = seedBeneficiaries(now);
  const { payments, seq } = seedPayments(now, beneficiaries);
  return {
    version: DB_VERSION, seq, balances: seedBalances(), beneficiaries, payments, transitions: [], batches: [], batchSlowDone: {},
    conversions: [], quotes: [], challenges: [], documents: [], notifications: [], settings: { ...DEFAULT_SETTINGS }, sca: { failed: 0, lockedUntil: 0 },
  };
}

const FAST_RAILS: RailId[] = ['FPS', 'SEPA_INSTANT', 'INTERNAL'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface MockOptions {
  /** Set false to remove artificial latency (unit tests). */
  latency?: boolean;
  /** Set false to stop the background lifecycle timer (unit tests drive `tick` themselves). */
  autoTick?: boolean;
}

export function createMockApi(storage: StorageAdapter, options: MockOptions = {}): { api: ApiClient; controls: MockControls; tick: () => void } {
  let db: Db = freshDb();
  const latency = options.latency !== false;

  const ready: Promise<void> = (async () => {
    try {
      const raw = await storage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Db;
        if (parsed.version === DB_VERSION) db = parsed;
      }
    } catch {
      // Corrupt or unavailable storage: start from the seed.
    }
    setClockOffset(db.settings.clockOffsetMs);
  })();

  let saveQueued = false;
  function save(): void {
    if (saveQueued) return;
    saveQueued = true;
    void Promise.resolve().then(async () => {
      saveQueued = false;
      try {
        await storage.setItem(DB_KEY, JSON.stringify(db));
      } catch {
        // Storage full or blocked: the session keeps working in memory.
      }
    });
  }

  async function wait(kind: 'read' | 'write'): Promise<void> {
    await ready;
    if (!latency) return;
    const [min, max] = kind === 'read' ? [300, 520] : [500, 1200];
    await sleep(min + Math.random() * (max - min));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const user = (): User => USERS[db.settings.role];
  const who = (): Pick<User, 'id' | 'name' | 'role'> => { const u = user(); return { id: u.id, name: u.name, role: u.role }; };
  const today = (): IsoDate => toUkTime(clockNow()).date;
  const nowIso = (): string => clockNow().toISOString();

  function balanceOf(currency: string): Balance {
    let b = db.balances.find((x) => x.currency === currency);
    if (!b) { b = { currency, available: 0 }; db.balances.push(b); }
    return b;
  }

  function notify(n: Pick<AppNotification, 'title' | 'body' | 'tone'> & { paymentId?: string; batchId?: string }): void {
    db.notifications.unshift({ id: randomId('ntf'), at: nowIso(), read: false, ...n });
    db.notifications = db.notifications.slice(0, 40);
  }

  function findPayment(id: string): Payment {
    const p = db.payments.find((x) => x.id === id);
    if (!p) throw new ApiError('NOT_FOUND', 'Payment not found');
    return p;
  }

  function findBatch(id: string): Batch {
    const b = db.batches.find((x) => x.id === id);
    if (!b) throw new ApiError('NOT_FOUND', 'Batch not found');
    return b;
  }

  function addEvent(p: Payment, status: PaymentStatus, label: string, extra: Partial<PaymentEvent> = {}): void {
    p.events.push({ at: nowIso(), status, label, ...extra });
    p.status = status;
    p.updatedAt = nowIso();
  }

  function usedToday(): number {
    const u = user();
    const day = today();
    const payments = db.payments
      .filter((p) => p.createdBy.id === u.id && countsTowardsLimit(p.status) && toUkTime(new Date(p.createdAt)).date === day)
      .reduce((sum, p) => sum + p.amountGbp, 0);
    const batches = db.batches
      .filter((b) => b.createdBy.id === u.id && b.status !== 'DRAFT' && b.status !== 'REJECTED' && b.status !== 'CANCELLED' && toUkTime(new Date(b.createdAt)).date === day)
      .reduce((sum, b) => sum + b.summary.totalGbp, 0);
    return payments + batches;
  }

  function lookupFor(b: Pick<BeneficiaryInput, 'country' | 'details'>): ReturnType<typeof mockLookupBank> {
    const enabled = db.settings.sepaInstantReachable;
    if (b.details.sortCode) return mockLookupBank({ sortCode: b.details.sortCode, country: b.country }, enabled);
    if (b.details.iban) return mockLookupBank({ iban: b.details.iban, country: b.country }, enabled);
    if (b.details.routingNumber) return mockLookupBank({ routingCode: b.details.routingNumber, country: b.country }, enabled);
    if (b.details.bic) return mockLookupBank({ bic: b.details.bic, country: b.country }, enabled);
    return null;
  }

  function accountKey(b: Pick<BeneficiaryInput, 'details'>): string {
    return [b.details.sortCode, b.details.accountNumber, b.details.iban, b.details.routingNumber].map((x) => x ?? '').join('|');
  }

  function saveBeneficiary(input: BeneficiaryInput): Beneficiary {
    const lookup = lookupFor(input);
    const created: Beneficiary = {
      ...clone(input),
      id: randomId('ben'),
      resolvedBank: lookup?.bankName ?? input.details.bankName,
      internal: lookup?.internal,
      createdAt: nowIso(),
    };
    db.beneficiaries.unshift(created);
    return created;
  }

  // ── Payment lifecycle ──────────────────────────────────────────────────────

  type Scenario = 'NORMAL' | 'FAIL' | 'REVIEW' | 'RETURN' | 'SANCTION';

  function scenarioOf(p: Payment): Scenario {
    if (p.beneficiary.name.toUpperCase().includes('TEST SANCTION')) return 'SANCTION';
    // Only the figure the customer typed counts, so an FX-derived amount can never trigger a scenario by accident.
    const tail = (p.enteredAmount ?? p.receiveAmount.amount) % 100;
    if (tail === 13) return 'FAIL';
    if (tail === 31) return 'REVIEW';
    if (tail === 77) return 'RETURN';
    return 'NORMAL';
  }

  function refund(p: Payment): void {
    if (p.refunded) return;
    balanceOf(p.totalDebit.currency).available += p.totalDebit.amount;
    p.refunded = true;
  }

  function scheduleNextRecurrence(p: Payment): void {
    const r = p.recurrence;
    if (!r) return;
    const base = p.scheduledDate ?? today();
    const next = r.frequency === 'WEEKLY' ? addDays(base, 7) : addMonths(base, 1);
    if (r.endDate && next > r.endDate) return;
    if (r.count !== undefined && r.count <= 1) return;
    db.seq += 1;
    const copy: Payment = {
      ...clone(p),
      id: randomId('pay'),
      reference: paymentReference(clockNow(), db.seq),
      uetr: p.rail === 'SWIFT' ? uetr() : undefined,
      status: 'SCHEDULED',
      scheduledDate: next,
      arrivalDate: next,
      arrivalText: `Scheduled for ${formatDate(next)}`,
      recurrence: { ...r, count: r.count !== undefined ? r.count - 1 : undefined },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      events: [{ at: nowIso(), status: 'SCHEDULED', label: 'Scheduled from a recurring payment' }],
      refunded: undefined,
      statusReason: undefined,
    };
    db.payments.unshift(copy);
  }

  function startProcessing(p: Payment): void {
    const bal = balanceOf(p.totalDebit.currency);
    if (bal.available < p.totalDebit.amount) {
      p.statusReason = 'There wasn’t enough available balance to send this payment.';
      addEvent(p, 'FAILED', 'Failed', { detail: p.statusReason });
      p.refunded = true;
      notify({ title: 'Payment failed', body: `${p.beneficiary.name}: not enough available balance.`, tone: 'danger', paymentId: p.id });
      return;
    }
    bal.available -= p.totalDebit.amount;
    addEvent(p, 'PROCESSING', 'Processing');
    scheduleNextRecurrence(p);

    const benId = p.beneficiary.id;
    const saved = benId ? db.beneficiaries.find((b) => b.id === benId) : undefined;
    if (saved) saved.lastPaidAt = nowIso();

    const t0 = Date.now();
    const fast = FAST_RAILS.includes(p.rail);
    const sentAt = fast ? 2000 : 6000;
    const doneAt = fast ? 5000 : 20000;
    const amount = formatMoney(p.receiveAmount);
    const push = (t: Omit<Transition, 'paymentId'>): void => { db.transitions.push({ paymentId: p.id, ...t }); };
    const sentLabel = p.rail === 'INTERNAL' ? 'Transferred to the Cobanq account' : `Submitted to ${RAIL_NAMES[p.rail]}`;
    const scenario = scenarioOf(p);

    switch (scenario) {
      case 'FAIL': {
        const reason = 'The beneficiary’s bank rejected this payment.';
        push({ at: t0 + 1000, status: 'PROCESSING', label: 'Screening passed' });
        push({ at: t0 + 3000, status: 'FAILED', label: 'Failed', detail: reason, reason, refund: true, notify: { title: 'Payment failed', body: `${amount} to ${p.beneficiary.name} was rejected by their bank. The money is back in your balance.`, tone: 'danger' } });
        break;
      }
      case 'REVIEW':
        push({ at: t0 + 2000, status: 'IN_REVIEW', label: 'Routine check in progress', notify: { title: 'Payment in review', body: `We’re carrying out a routine check on ${amount} to ${p.beneficiary.name}.`, tone: 'warning' } });
        push({ at: t0 + 20000, status: 'PROCESSING', label: 'Check complete' });
        push({ at: t0 + 21500, status: 'SENT', label: sentLabel });
        push({ at: t0 + 24000, status: 'COMPLETED', label: 'Completed', notify: { title: 'Payment completed', body: `${amount} to ${p.beneficiary.name} has arrived.`, tone: 'success' } });
        break;
      case 'SANCTION': {
        const reason = 'We’re unable to process this payment. If you have questions, contact Cobanq support.';
        push({ at: t0 + 2000, status: 'IN_REVIEW', label: 'Routine check in progress', notify: { title: 'Payment in review', body: `We’re carrying out a routine check on ${amount} to ${p.beneficiary.name}.`, tone: 'warning' } });
        push({ at: t0 + 14000, status: 'REJECTED', label: 'Not processed', detail: reason, reason, refund: true, notify: { title: 'Payment not processed', body: `We couldn’t process ${amount} to ${p.beneficiary.name}. The money is back in your balance.`, tone: 'danger' } });
        break;
      }
      case 'RETURN': {
        const reason = 'The beneficiary’s bank returned this payment: account closed.';
        push({ at: t0 + 1000, status: 'PROCESSING', label: 'Screening passed' });
        push({ at: t0 + sentAt, status: 'SENT', label: sentLabel });
        push({ at: t0 + 15000, status: 'RETURNED', label: 'Returned by the beneficiary’s bank', detail: reason, reason, refund: true, notify: { title: 'Payment returned', body: `${amount} to ${p.beneficiary.name} was returned: account closed. The money is back in your balance.`, tone: 'danger' } });
        break;
      }
      default:
        push({ at: t0 + 1000, status: 'PROCESSING', label: 'Screening passed' });
        push({ at: t0 + sentAt, status: 'SENT', label: sentLabel });
        push({ at: t0 + doneAt, status: 'COMPLETED', label: 'Completed', notify: { title: 'Payment completed', body: `${amount} to ${p.beneficiary.name} has ${fast ? 'arrived' : 'been delivered'}.`, tone: 'success' } });
    }
  }

  /** Move an authorised payment to its next state: approval, schedule or processing. */
  function release(p: Payment, skipApproval: boolean): void {
    if (!skipApproval && needsApproval(p.createdBy.role, p.amountGbp)) {
      addEvent(p, 'AWAITING_APPROVAL', 'Sent for approval');
      notify({ title: 'Payment awaiting approval', body: `${formatMoney(p.receiveAmount)} to ${p.beneficiary.name} needs an approver.`, tone: 'info', paymentId: p.id });
      return;
    }
    if (p.scheduledDate && p.scheduledDate > today()) {
      addEvent(p, 'SCHEDULED', `Scheduled for ${formatDate(p.scheduledDate)}`);
      return;
    }
    startProcessing(p);
  }

  function startBatch(b: Batch): void {
    for (const d of b.summary.debits) {
      if (balanceOf(d.currency).available < d.amount) {
        b.status = 'REJECTED';
        b.statusReason = 'There wasn’t enough available balance to send this batch.';
        notify({ title: 'Bulk payment failed', body: `${b.fileName}: not enough available balance.`, tone: 'danger', batchId: b.id });
        return;
      }
    }
    for (const d of b.summary.debits) balanceOf(d.currency).available -= d.amount;
    b.status = 'PROCESSING';
    const start = b.scheduledDate ? onOrNextWorkingDay(b.scheduledDate) : today();
    for (const r of b.rows) {
      if (FAST_RAILS.includes(r.rail)) r.status = 'PROCESSING';
      else {
        r.status = 'SENT';
        r.arrivalDate = r.rail === 'BACS' ? addWorkingDays(start, railConfig.bacsWorkingDaysAfterSubmission) : addWorkingDays(start, r.rail === 'SWIFT' ? 3 : r.rail === 'CHAPS' ? 0 : 1);
      }
    }
    db.batchSlowDone[b.id] = Date.now() + 20000;
  }

  function releaseBatch(b: Batch, skipApproval: boolean): void {
    if (!skipApproval && needsApproval(b.createdBy.role, b.summary.totalGbp)) {
      b.status = 'AWAITING_APPROVAL';
      notify({ title: 'Bulk payment awaiting approval', body: `${b.fileName} (${b.rows.length} payments) needs an approver.`, tone: 'info', batchId: b.id });
      return;
    }
    if (b.scheduledDate && b.scheduledDate > today()) {
      b.status = 'SCHEDULED';
      for (const r of b.rows) r.status = 'SCHEDULED';
      return;
    }
    startBatch(b);
  }

  function tick(): void {
    let changed = false;
    const nowMs = Date.now();

    // Due payment transitions, in time order.
    const due = db.transitions.filter((t) => t.at <= nowMs).sort((a, b) => a.at - b.at);
    if (due.length > 0) {
      db.transitions = db.transitions.filter((t) => t.at > nowMs);
      for (const t of due) {
        const p = db.payments.find((x) => x.id === t.paymentId);
        if (!p) continue;
        addEvent(p, t.status, t.label, { detail: t.detail });
        if (t.reason) p.statusReason = t.reason;
        if (t.refund) refund(p);
        if (t.notify) notify({ ...t.notify, paymentId: p.id });
      }
      changed = true;
    }

    // Scheduled payments and batches whose date has arrived.
    const day = today();
    for (const p of db.payments) {
      if (p.status === 'SCHEDULED' && p.scheduledDate && p.scheduledDate <= day) { startProcessing(p); changed = true; }
    }
    for (const b of db.batches) {
      if (b.status === 'SCHEDULED' && b.scheduledDate && b.scheduledDate <= day) { startBatch(b); changed = true; }
    }

    // Bulk progress: instant rails pay row by row; slower rails complete together.
    for (const b of db.batches) {
      if (b.status !== 'PROCESSING') continue;
      const processing = b.rows.filter((r) => r.status === 'PROCESSING');
      const perTick = Math.max(5, Math.ceil(b.rows.length / 12));
      for (const r of processing.slice(0, perTick)) {
        if (r.amount % 100 === 13) {
          r.status = 'FAILED';
          r.statusReason = 'The beneficiary’s bank rejected this payment.';
          // Refund the row to the balance that funded it.
          const funded = b.summary.currencyTotals.find((c) => c.currency === r.currency)?.fundedFrom ?? r.currency;
          balanceOf(funded).available += funded === r.currency ? r.amount : toGbp(r.amount, r.currency);
        } else r.status = 'COMPLETED';
        changed = true;
      }
      const slowDone = db.batchSlowDone[b.id];
      if (slowDone !== undefined && slowDone <= nowMs) {
        for (const r of b.rows) if (r.status === 'SENT') { r.status = 'COMPLETED'; changed = true; }
      }
      if (b.rows.every((r) => r.status === 'COMPLETED' || r.status === 'FAILED')) {
        b.status = 'COMPLETED';
        delete db.batchSlowDone[b.id];
        const failed = b.rows.filter((r) => r.status === 'FAILED').length;
        notify({
          title: 'Bulk payment finished',
          body: failed > 0 ? `${b.fileName}: ${b.rows.length - failed} paid, ${failed} failed and refunded.` : `${b.fileName}: all ${b.rows.length} payments are complete.`,
          tone: failed > 0 ? 'warning' : 'success', batchId: b.id,
        });
        changed = true;
      }
    }
    if (changed) save();
  }

  const timer = options.autoTick === false ? null : setInterval(() => { void ready.then(tick); }, 1000);

  // ── SCA ────────────────────────────────────────────────────────────────────

  function createChallenge(c: Omit<Challenge, 'id' | 'userId'>): string {
    const id = randomId('sca');
    db.challenges.push({ id, userId: user().id, ...c });
    db.challenges = db.challenges.slice(-20);
    return id;
  }

  function findChallenge(id: string): Challenge {
    const c = db.challenges.find((x) => x.id === id);
    if (!c) throw new ApiError('SCA_EXPIRED', 'Challenge not found');
    return c;
  }

  function assertNotLocked(): void {
    if (db.sca.lockedUntil > Date.now()) {
      throw new ApiError('SCA_LOCKED', 'Too many attempts', undefined, { lockedUntil: db.sca.lockedUntil });
    }
    if (db.sca.lockedUntil !== 0) { db.sca.lockedUntil = 0; db.sca.failed = 0; }
  }

  function completeChallenge(c: Challenge): string {
    db.challenges = db.challenges.filter((x) => x.id !== c.id);
    switch (c.action) {
      case 'PAYMENT': {
        const p = findPayment(c.resourceId);
        addEvent(p, 'DRAFT', 'Authorised with a one-time code', { by: p.createdBy.name });
        release(p, false);
        return p.id;
      }
      case 'BULK': {
        const b = findBatch(c.resourceId);
        releaseBatch(b, false);
        return b.id;
      }
      case 'CONVERT': {
        const q = db.quotes.find((x) => x.quoteId === c.quoteId);
        if (!q) throw new ApiError('FX_QUOTE_EXPIRED', 'Quote not found');
        const sell = balanceOf(q.sellCurrency);
        const total = q.sellAmount + q.fee.amount;
        if (sell.available < total) throw new ApiError('INSUFFICIENT_FUNDS', 'Not enough balance', 'sellAmount');
        sell.available -= total;
        balanceOf(q.buyCurrency).available += q.buyAmount;
        db.seq += 1;
        const conv: Conversion = {
          id: c.resourceId, reference: paymentReference(clockNow(), db.seq).replace('CBQ', 'CBX'),
          sell: { amount: q.sellAmount, currency: q.sellCurrency }, buy: { amount: q.buyAmount, currency: q.buyCurrency },
          rate: q.rate, fee: q.fee, createdAt: nowIso(),
        };
        db.conversions.unshift(conv);
        notify({ title: 'Conversion complete', body: `${formatMoney(conv.sell)} converted to ${formatMoney(conv.buy)}.`, tone: 'success' });
        return conv.id;
      }
      case 'BENEFICIARY_UPDATE': {
        const b = db.beneficiaries.find((x) => x.id === c.resourceId);
        if (!b || !c.beneficiaryInput) throw new ApiError('NOT_FOUND', 'Beneficiary not found');
        applyBeneficiaryUpdate(b, c.beneficiaryInput);
        return b.id;
      }
      case 'BENEFICIARY_DELETE':
        db.beneficiaries = db.beneficiaries.filter((x) => x.id !== c.resourceId);
        return c.resourceId;
    }
  }

  function applyBeneficiaryUpdate(b: Beneficiary, input: BeneficiaryInput): void {
    const lookup = lookupFor(input);
    Object.assign(b, clone(input), { resolvedBank: lookup?.bankName ?? input.details.bankName ?? b.resolvedBank, internal: lookup?.internal });
  }

  // ── Payment creation ───────────────────────────────────────────────────────

  function buildPayment(req: CreatePaymentRequest): Payment {
    let snapshot: PaymentBeneficiarySnapshot;
    let source: BeneficiaryInput;
    let isNew = false;
    if (req.beneficiaryId) {
      const b = db.beneficiaries.find((x) => x.id === req.beneficiaryId);
      if (!b) throw new ApiError('NOT_FOUND', 'Beneficiary not found', 'beneficiaryId');
      source = b;
      isNew = !b.lastPaidAt;
      snapshot = { id: b.id, type: b.type, name: b.name, country: b.country, currency: b.currency, details: clone(b.details), resolvedBank: b.resolvedBank, address: b.address };
    } else if (req.beneficiary) {
      source = req.beneficiary;
      isNew = !db.beneficiaries.some((b) => b.lastPaidAt && accountKey(b) === accountKey(req.beneficiary!));
      snapshot = {
        type: source.type, name: source.name, country: source.country, currency: source.currency,
        details: clone(source.details), resolvedBank: lookupFor(source)?.bankName ?? source.details.bankName, address: source.address,
      };
    } else throw new ApiError('VALIDATION', 'A beneficiary is required', 'beneficiary');

    const receiveCurrency = source.currency;
    const payFrom = req.payFromCurrency;
    if (req.amount.value <= 0) throw new ApiError('VALIDATION', 'Enter an amount', 'amount');

    let send: number;
    let receive: number;
    let fx: Payment['fx'];
    let fxFeeAmount = 0;
    if (payFrom !== receiveCurrency) {
      const q = db.quotes.find((x) => x.quoteId === req.quoteId);
      if (!q || q.sellCurrency !== payFrom || q.buyCurrency !== receiveCurrency) throw new ApiError('FX_QUOTE_EXPIRED', 'A valid quote is required', 'quoteId');
      if (isQuoteExpired(q, Date.now())) throw new ApiError('FX_QUOTE_EXPIRED', 'The quote has expired', 'quoteId');
      send = q.sellAmount;
      receive = q.buyAmount;
      fx = { quoteId: q.quoteId, rate: q.rate, inverseRate: q.inverseRate };
      fxFeeAmount = q.fee.amount;
    } else {
      send = req.amount.value;
      receive = req.amount.value;
    }

    const amountGbp = toGbp(send, payFrom);
    const lookup = lookupFor(source);
    const scheduled = !!req.scheduledDate && req.scheduledDate > today();
    const railInput: RailInput = {
      destinationCountry: source.country, receiveCurrency, payFromCurrency: payFrom, amountGbp, receiveAmount: receive,
      paymentDate: scheduled ? req.scheduledDate! : today(), scheduled, beneficiaryType: source.type, isBulk: false, now: clockNow(),
      internal: lookup?.internal ?? false,
      sepaInstantReachable: lookup?.sepaInstantReachable ?? db.settings.sepaInstantReachable,
    };
    const option = selectRails(railInput).options.find((o) => o.rail === req.rail);
    if (!option || !option.eligible) throw new ApiError('RAIL_NOT_ELIGIBLE', option?.reason ?? 'Rail not available', 'rail');
    const chargeOption = option.chargeOptions ? req.chargeOption ?? 'SHA' : undefined;

    const breakdown = computeBreakdown({ payFromCurrency: payFrom, receiveCurrency, sendAmount: send, receiveAmount: receive, rail: req.rail, chargeOption, fxFeeAmount });

    const limits = computeLimits(user().role, usedToday());
    if (amountGbp < railConfig.minPaymentGbp) throw new ApiError('VALIDATION', 'Below the minimum payment', 'amount');
    if (amountGbp > limits.perPayment) throw new ApiError('LIMIT_EXCEEDED', 'Above the per-payment limit', 'amount');
    if (amountGbp > limits.remainingToday) throw new ApiError('DAILY_LIMIT_EXCEEDED', 'Above the daily limit', 'amount');
    if (balanceOf(payFrom).available < breakdown.totalDebit.amount) throw new ApiError('INSUFFICIENT_FUNDS', 'Not enough balance', 'amount');

    if (!req.confirmDuplicate) {
      const windowStart = clockNow().getTime() - railConfig.duplicateWindowHours * 3_600_000;
      const dup = db.payments.find((p) =>
        p.status !== 'DRAFT' && p.status !== 'CANCELLED' && p.status !== 'FAILED' && p.status !== 'REJECTED'
        && new Date(p.createdAt).getTime() >= windowStart
        && accountKey(p.beneficiary) === accountKey(source)
        && p.receiveAmount.amount === breakdown.receives.amount && p.receiveAmount.currency === receiveCurrency
        && p.payeeReference.trim().toLowerCase() === req.payeeReference.trim().toLowerCase());
      if (dup) throw new ApiError('DUPLICATE_SUSPECTED', 'Possible duplicate', undefined, { paymentId: dup.id });
    }

    db.seq += 1;
    const at = nowIso();
    const documents = db.documents.filter((d) => req.documentIds?.includes(d.id));
    return {
      id: randomId('pay'),
      reference: paymentReference(clockNow(), db.seq),
      uetr: req.rail === 'SWIFT' ? uetr() : undefined,
      status: 'DRAFT',
      beneficiary: snapshot,
      newBeneficiary: isNew,
      payFromCurrency: payFrom,
      sendAmount: { amount: send, currency: payFrom },
      receiveAmount: breakdown.receives,
      enteredAmount: req.amount.value,
      fx,
      fees: breakdown.lines,
      totalDebit: breakdown.totalDebit,
      amountGbp,
      rail: req.rail,
      chargeOption,
      arrivalText: option.arrivalText,
      arrivalDate: option.arrivalDate,
      scheduledDate: scheduled ? req.scheduledDate : undefined,
      recurrence: req.recurrence,
      payeeReference: req.payeeReference,
      purpose: req.purpose,
      purposeOther: req.purposeOther,
      purposeCode: req.purposeCode,
      sourceOfFunds: req.sourceOfFunds,
      documents,
      cop: req.cop,
      createdBy: who(),
      createdAt: at,
      updatedAt: at,
      events: [{ at, status: 'DRAFT', label: 'Created', by: user().name }],
    };
  }

  function assertCanApprove(creatorId: string): void {
    const u = user();
    if (u.role === 'MAKER') throw new ApiError('NOT_PERMITTED', 'Makers cannot approve');
    if (u.id === creatorId) throw new ApiError('NOT_PERMITTED', 'You cannot approve your own payment');
  }

  // ── API ────────────────────────────────────────────────────────────────────

  const api: ApiClient = {
    async getAccount(): Promise<Account> {
      await wait('read');
      return seedAccount(user());
    },

    async getBalances() {
      await wait('read');
      return clone(db.balances);
    },

    async getLimits() {
      await wait('read');
      return computeLimits(user().role, usedToday());
    },

    async listBeneficiaries(query = {}) {
      await wait('read');
      const s = query.search?.trim().toLowerCase();
      return clone(db.beneficiaries.filter((b) => {
        if (query.country && b.country !== query.country) return false;
        if (query.currency && b.currency !== query.currency) return false;
        if (!s) return true;
        return [b.name, b.nickname ?? '', b.details.iban ?? '', b.details.accountNumber ?? '', b.resolvedBank ?? ''].some((v) => v.toLowerCase().includes(s));
      }));
    },

    async createBeneficiary(input) {
      await wait('write');
      if (!input.name.trim()) throw new ApiError('VALIDATION', 'Name is required', 'name');
      const created = saveBeneficiary(input);
      save();
      return clone(created);
    },

    async updateBeneficiary(id, input) {
      await wait('write');
      const b = db.beneficiaries.find((x) => x.id === id);
      if (!b) throw new ApiError('NOT_FOUND', 'Beneficiary not found');
      if (bankDetailsChanged(b, input)) {
        assertNotLocked();
        const scaChallengeId = createChallenge({
          action: 'BENEFICIARY_UPDATE', resourceId: id, payeeName: input.name, beneficiaryInput: clone(input),
          description: `Change bank details for ${input.name}`,
        });
        save();
        return { scaChallengeId };
      }
      applyBeneficiaryUpdate(b, input);
      save();
      return { beneficiary: clone(b) };
    },

    async deleteBeneficiary(id) {
      await wait('write');
      const b = db.beneficiaries.find((x) => x.id === id);
      if (!b) throw new ApiError('NOT_FOUND', 'Beneficiary not found');
      assertNotLocked();
      const scaChallengeId = createChallenge({ action: 'BENEFICIARY_DELETE', resourceId: id, payeeName: b.name, description: `Delete beneficiary ${b.name}` });
      save();
      return { scaChallengeId };
    },

    async lookupBank(req) {
      await wait('read');
      return mockLookupBank(req, db.settings.sepaInstantReachable);
    },

    async checkPayee(req) {
      await wait('write');
      const sc = stripSpaces(req.sortCode);
      if (!db.settings.copAvailable || sc === '222222') return { result: 'UNAVAILABLE' };
      if (sc === '000000') return { result: 'NO_MATCH' };
      if (sc === '111111') return { result: 'CLOSE_MATCH', suggestedName: 'Acme Tradng Limited' };
      if (sc === '333333') return { result: 'MATCH', accountTypeMismatch: true };
      return { result: 'MATCH' };
    },

    async getRails(input) {
      await wait('read');
      return selectRails({ ...input, now: clockNow() });
    },

    async getFxQuote(req) {
      await wait('read');
      if (req.sellCurrency === req.buyCurrency) throw new ApiError('VALIDATION', 'Choose two different currencies', 'buyCurrency');
      if ((req.sellAmount ?? 0) <= 0 && (req.buyAmount ?? 0) <= 0) throw new ApiError('VALIDATION', 'Enter an amount', 'sellAmount');
      const mid = midRate(req.sellCurrency, req.buyCurrency);
      if (mid <= 0) throw new ApiError('VALIDATION', 'Unsupported currency pair', 'buyCurrency');
      const jitter = db.settings.fxVolatility ? 1 + (Math.random() - 0.5) * 0.004 : 1;
      const quote = buildQuote(req, mid * jitter, Date.now(), randomId('q'));
      db.quotes.push(quote);
      db.quotes = db.quotes.slice(-60);
      return clone(quote);
    },

    async convert({ quoteId }) {
      await wait('write');
      const q = db.quotes.find((x) => x.quoteId === quoteId);
      if (!q || isQuoteExpired(q, Date.now())) throw new ApiError('FX_QUOTE_EXPIRED', 'The quote has expired', 'quoteId');
      if (balanceOf(q.sellCurrency).available < q.sellAmount + q.fee.amount) throw new ApiError('INSUFFICIENT_FUNDS', 'Not enough balance', 'sellAmount');
      assertNotLocked();
      const conversionId = randomId('cnv');
      const scaChallengeId = createChallenge({
        action: 'CONVERT', resourceId: conversionId, quoteId, amount: { amount: q.sellAmount, currency: q.sellCurrency },
        description: `Convert ${formatMoney({ amount: q.sellAmount, currency: q.sellCurrency })} to ${formatMoney({ amount: q.buyAmount, currency: q.buyCurrency })}`,
      });
      save();
      return { conversionId, scaChallengeId };
    },

    async getRateHistory(pair) {
      await wait('read');
      const [from = 'GBP', to = 'EUR'] = pair.split('/');
      const end = roundRate(midRate(from, to));
      // Deterministic pseudo-random walk that ends on today's rate.
      let seed = [...pair].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7) % 2147483647;
      const rand = (): number => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
      const steps: number[] = [0];
      for (let i = 1; i < 30; i++) steps.push(steps[i - 1]! + (rand() - 0.5) * 0.008);
      const last = steps[29]!;
      const day = today();
      const points: RatePoint[] = steps.map((s, i) => ({ date: addDays(day, i - 29), rate: roundRate(end * (1 + s - last)) }));
      return points;
    },

    async getIndicativeRates(base) {
      await wait('read');
      return ALL_CURRENCY_CODES.filter((c) => c !== base && GBP_MID_RATES[c]).map((currency) => ({ currency, rate: roundRate(midRate(base, currency)) }));
    },

    async createPayment(req) {
      await wait('write');
      assertNotLocked();
      const payment = buildPayment(req);
      db.payments.unshift(payment);
      if (req.beneficiary && req.saveBeneficiary !== false) {
        const saved = saveBeneficiary({ ...req.beneficiary, cop: req.cop ?? req.beneficiary.cop });
        payment.beneficiary.id = saved.id;
      } else if (req.beneficiaryId && req.cop) {
        const b = db.beneficiaries.find((x) => x.id === req.beneficiaryId);
        if (b) b.cop = req.cop;
      }
      const scaChallengeId = createChallenge({
        action: 'PAYMENT', resourceId: payment.id, payeeName: payment.beneficiary.name, amount: payment.receiveAmount,
        description: `Pay ${formatMoney(payment.receiveAmount)} to ${payment.beneficiary.name}`,
      });
      save();
      return { paymentId: payment.id, status: payment.status, scaChallengeId };
    },

    async listPayments(filters = {}) {
      await wait('read');
      const s = filters.search?.trim().toLowerCase();
      const rows = db.payments
        .filter((p) => {
          if (p.status === 'DRAFT') return false;
          if (filters.status && filters.status !== 'ALL' && p.status !== filters.status) return false;
          if (filters.currency && filters.currency !== 'ALL' && p.receiveAmount.currency !== filters.currency) return false;
          if (filters.rail && filters.rail !== 'ALL' && p.rail !== filters.rail) return false;
          if (filters.beneficiaryId && p.beneficiary.id !== filters.beneficiaryId) return false;
          const day = toUkTime(new Date(p.createdAt)).date;
          if (filters.from && day < filters.from) return false;
          if (filters.to && day > filters.to) return false;
          if (!s) return true;
          return [p.beneficiary.name, p.reference, p.payeeReference, formatMoney(p.receiveAmount), p.uetr ?? ''].some((v) => v.toLowerCase().includes(s));
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const pageSize = filters.pageSize ?? 10;
      const page = Math.max(1, Math.min(filters.page ?? 1, Math.max(1, Math.ceil(rows.length / pageSize))));
      return { items: clone(rows.slice((page - 1) * pageSize, page * pageSize)), total: rows.length, page, pageSize };
    },

    async getPayment(id) {
      await wait('read');
      return clone(findPayment(id));
    },

    async approvePayment(id) {
      await wait('write');
      if (id.startsWith('bat_')) {
        const b = findBatch(id);
        if (b.status !== 'AWAITING_APPROVAL') throw new ApiError('NOT_PERMITTED', 'This batch is not awaiting approval');
        assertCanApprove(b.createdBy.id);
        b.approvedBy = who();
        releaseBatch(b, true);
      } else {
        const p = findPayment(id);
        if (p.status !== 'AWAITING_APPROVAL') throw new ApiError('NOT_PERMITTED', 'This payment is not awaiting approval');
        assertCanApprove(p.createdBy.id);
        p.approvedBy = who();
        addEvent(p, 'AWAITING_APPROVAL', 'Approved', { by: user().name });
        release(p, true);
      }
      save();
    },

    async rejectPayment(id, reason) {
      await wait('write');
      const text = `Rejected by approver: ${reason.trim() || 'no reason given'}`;
      if (id.startsWith('bat_')) {
        const b = findBatch(id);
        if (b.status !== 'AWAITING_APPROVAL') throw new ApiError('NOT_PERMITTED', 'This batch is not awaiting approval');
        assertCanApprove(b.createdBy.id);
        b.status = 'REJECTED';
        b.statusReason = text;
        notify({ title: 'Bulk payment rejected', body: `${b.fileName}: ${text}`, tone: 'danger', batchId: b.id });
      } else {
        const p = findPayment(id);
        if (p.status !== 'AWAITING_APPROVAL') throw new ApiError('NOT_PERMITTED', 'This payment is not awaiting approval');
        assertCanApprove(p.createdBy.id);
        p.statusReason = text;
        addEvent(p, 'REJECTED', 'Rejected by approver', { by: user().name, detail: text });
        notify({ title: 'Payment rejected', body: `${formatMoney(p.receiveAmount)} to ${p.beneficiary.name}: ${text}`, tone: 'danger', paymentId: p.id });
      }
      save();
    },

    async cancelPayment(id) {
      await wait('write');
      if (id.startsWith('bat_')) {
        const b = findBatch(id);
        if (b.status === 'DRAFT') db.batches = db.batches.filter((x) => x.id !== id);
        else if (b.status === 'AWAITING_APPROVAL' || b.status === 'SCHEDULED') b.status = 'CANCELLED';
        else throw new ApiError('NOT_PERMITTED', 'This batch can no longer be cancelled');
      } else {
        const p = findPayment(id);
        if (p.status === 'DRAFT') {
          // Abandoned before authorisation: remove it and its challenge.
          db.payments = db.payments.filter((x) => x.id !== id);
          db.challenges = db.challenges.filter((c) => c.resourceId !== id);
        } else if (canCancel(p.status)) addEvent(p, 'CANCELLED', 'Cancelled', { by: user().name });
        else throw new ApiError('NOT_PERMITTED', 'This payment can no longer be cancelled');
      }
      save();
    },

    async listApprovals() {
      await wait('read');
      const items: ApprovalItem[] = [
        ...db.payments.filter((p) => p.status === 'AWAITING_APPROVAL').map((p): ApprovalItem => ({ kind: 'PAYMENT', id: p.id, payment: clone(p) })),
        ...db.batches.filter((b) => b.status === 'AWAITING_APPROVAL').map((b): ApprovalItem => ({ kind: 'BATCH', id: b.id, batch: { ...clone(b), rows: [] } })),
      ];
      return items;
    },

    async uploadDocument(file: UploadFile, paymentId, onProgress) {
      await ready;
      const okType = /\.(pdf|jpe?g)$/i.test(file.name) || ['application/pdf', 'image/jpeg'].includes(file.type);
      if (!okType) throw new ApiError('FILE_TYPE', 'Unsupported file type', 'document');
      if (file.size > railConfig.maxDocumentBytes) throw new ApiError('FILE_TOO_LARGE', 'File too large', 'document');
      for (let i = 1; i <= 8; i++) {
        if (latency) await sleep(150);
        onProgress?.(i / 8);
      }
      const doc: UploadedDocument = { id: randomId('doc'), name: file.name, size: file.size, uploadedAt: nowIso() };
      db.documents.push(doc);
      if (paymentId) {
        const p = db.payments.find((x) => x.id === paymentId);
        if (p) { p.documents.push(doc); p.events.push({ at: nowIso(), status: p.status, label: 'Supporting document uploaded', detail: file.name, by: user().name }); }
      }
      save();
      return clone(doc);
    },

    async reportProblem(report) {
      await wait('write');
      const p = findPayment(report.paymentId);
      const caseNumber = `CASE-${String(100000 + Math.floor(Math.random() * 899999))}`;
      p.caseNumber = caseNumber;
      p.events.push({ at: nowIso(), status: p.status, label: report.category === 'SCAM' ? 'Reported as a possible scam' : 'Problem reported', detail: `Case ${caseNumber}`, by: user().name });
      notify({ title: 'We’ve opened a case', body: `Case ${caseNumber} for ${p.reference}. Our team will be in touch.`, tone: 'info', paymentId: p.id });
      save();
      return { caseNumber };
    },

    async getScaChallenge(challengeId) {
      await wait('read');
      const c = findChallenge(challengeId);
      const locked = db.sca.lockedUntil > Date.now();
      return {
        challengeId: c.id, action: c.action, payeeName: c.payeeName, amount: c.amount, description: c.description,
        attemptsLeft: locked ? 0 : SCA.maxAttempts - db.sca.failed,
        lockedUntil: locked ? new Date(db.sca.lockedUntil).toISOString() : undefined,
      };
    },

    async resendScaCode(challengeId) {
      await wait('write');
      findChallenge(challengeId);
    },

    async verifySca(req) {
      await ready;
      const c = findChallenge(req.challengeId);
      assertNotLocked();
      if ('method' in req) {
        // Simulated push approval in the mobile app.
        if (latency) await sleep(SCA.mockPushDelayMs);
      } else {
        if (latency) await sleep(600 + Math.random() * 400);
        if (req.code !== SCA.mockCode) {
          db.sca.failed += 1;
          if (db.sca.failed >= SCA.maxAttempts) {
            db.sca.lockedUntil = Date.now() + SCA.lockMinutes * 60_000;
            save();
            throw new ApiError('SCA_LOCKED', 'Too many attempts', 'code', { lockedUntil: db.sca.lockedUntil });
          }
          save();
          throw new ApiError('SCA_INVALID_CODE', 'Incorrect code', 'code', { attemptsLeft: SCA.maxAttempts - db.sca.failed });
        }
      }
      db.sca.failed = 0;
      const resourceId = completeChallenge(c);
      save();
      return { status: 'APPROVED', action: c.action, resourceId };
    },

    async validateBulkFile(rows) {
      await wait('write');
      if (rows.length > railConfig.bulkMaxRows) throw new ApiError('VALIDATION', `A file can have up to ${railConfig.bulkMaxRows} rows`, 'file');
      return validateBulkRows(rows);
    },

    async submitBulk(req: BulkSubmitRequest) {
      await wait('write');
      assertNotLocked();
      if (req.rows.length === 0) throw new ApiError('VALIDATION', 'The batch has no rows', 'file');
      const results = validateBulkRows(req.rows);
      if (results.some((r) => r.severity === 'ERROR')) throw new ApiError('VALIDATION', 'Fix or remove the rows with errors', 'file');
      const rows: BatchRow[] = req.rows.map((r, i) => ({
        index: i,
        beneficiaryName: r.beneficiaryName.trim(),
        country: r.country.trim().toUpperCase(),
        currency: r.currency.trim().toUpperCase(),
        account: stripSpaces(r.iban).toUpperCase() || `${formatSortCode(r.sortCode)} ${stripSpaces(r.accountNumber)}`.trim(),
        amount: results[i]!.amount ?? 0,
        reference: r.reference.trim(),
        rail: r.rail,
        status: 'PENDING',
      }));
      for (const r of rows) {
        const corridor = corridorOf(r.country, r.currency);
        const allowed: RailId[] = corridor === 'UK_GBP' ? ['FPS', 'BACS', 'CHAPS', 'INTERNAL'] : corridor === 'SEPA_EUR' ? ['SEPA_CT', 'SEPA_INSTANT'] : ['SWIFT'];
        if (!allowed.includes(r.rail)) throw new ApiError('RAIL_NOT_ELIGIBLE', `Row ${r.index + 1}: rail not available`, 'rail');
        if (r.rail === 'FPS' && r.amount > railConfig.fpsMaxGbp) r.rail = 'CHAPS';
        if (!normaliseType(req.rows[r.index]!.type)) throw new ApiError('VALIDATION', `Row ${r.index + 1}: invalid type`, 'type');
      }
      const summary = summariseBatch(rows, db.balances);
      if (summary.shortfalls.length > 0) throw new ApiError('INSUFFICIENT_FUNDS', 'Not enough balance for this batch', 'file');
      const limits = computeLimits(user().role, usedToday());
      if (rows.some((r) => toGbp(r.amount, r.currency) > limits.perPayment)) throw new ApiError('LIMIT_EXCEEDED', 'A row is above the per-payment limit', 'file');
      if (summary.totalGbp > limits.remainingToday) throw new ApiError('DAILY_LIMIT_EXCEEDED', 'Above the daily limit', 'file');

      db.seq += 1;
      const scheduled = !!req.scheduledDate && req.scheduledDate > today();
      const batch: Batch = {
        id: randomId('bat'),
        reference: paymentReference(clockNow(), db.seq).replace('CBQ', 'CBB'),
        fileName: req.fileName, status: 'DRAFT', ukRail: req.ukRail, scheduledDate: scheduled ? req.scheduledDate : undefined,
        rows, summary, createdBy: who(), createdAt: nowIso(),
      };
      db.batches.unshift(batch);
      db.batches = db.batches.slice(0, MAX_BATCHES);
      const scaChallengeId = createChallenge({
        action: 'BULK', resourceId: batch.id, payeeName: `${rows.length} recipients`,
        amount: summary.debits.length === 1 ? summary.debits[0] : { amount: summary.totalGbp, currency: 'GBP' },
        description: `Bulk payment to ${rows.length} recipients (${req.fileName})`,
      });
      save();
      return { batchId: batch.id, scaChallengeId };
    },

    async listBatches() {
      await wait('read');
      return db.batches.filter((b) => b.status !== 'DRAFT').map((b) => ({ ...clone({ ...b, rows: [] as BatchRow[] }), rows: summariseRows(b) }));
    },

    async getBatch(id) {
      await wait('read');
      return clone(findBatch(id));
    },

    async listNotifications() {
      await ready;
      if (latency) await sleep(150);
      return clone(db.notifications);
    },

    async markNotificationsRead() {
      await ready;
      for (const n of db.notifications) n.read = true;
      save();
    },
  };

  /** Batch lists don't need every row; send a status-only view to keep polling light. */
  function summariseRows(b: Batch): BatchRow[] {
    return b.rows.map((r) => ({ index: r.index, beneficiaryName: '', country: r.country, currency: r.currency, account: '', amount: r.amount, reference: '', rail: r.rail, status: r.status }));
  }

  const controls: MockControls = {
    otp: SCA.mockCode,
    async getSettings() {
      await ready;
      return { ...db.settings };
    },
    async updateSettings(patch) {
      await ready;
      db.settings = { ...db.settings, ...patch };
      setClockOffset(db.settings.clockOffsetMs);
      save();
      tick();
      return { ...db.settings };
    },
    async reset() {
      await ready;
      setClockOffset(0);
      db = freshDb();
      await storage.removeItem(DB_KEY).catch(() => undefined);
      save();
    },
    async addFunds(m) {
      await ready;
      balanceOf(m.currency).available += m.amount;
      save();
    },
    dispose() {
      if (timer) clearInterval(timer);
    },
  };

  return { api, controls, tick };
}

export type { CopCheck };
