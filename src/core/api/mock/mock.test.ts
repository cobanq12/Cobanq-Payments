import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../adapters';
import { setClockOffset } from '../../lib/clock';
import type { ApiClient } from '../client';
import { ApiError } from '../errors';
import type { BeneficiaryInput, CreatePaymentRequest, PaymentStatus } from '../types';
import { createMockApi, type MockControls } from './index';

let api: ApiClient;
let controls: MockControls;
let tick: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T10:00:00Z')); // Wed, a UK working day
  setClockOffset(0);
  ({ api, controls, tick } = createMockApi(createMemoryStorage(), { latency: false, autoTick: false }));
});

afterEach(() => {
  controls.dispose();
  vi.useRealTimers();
});

const uk = (name: string, sortCode = '204545'): BeneficiaryInput => ({
  type: 'BUSINESS', name, country: 'GB', currency: 'GBP', details: { sortCode, accountNumber: '43219876' },
});

const draft = (amount: number, over: Partial<CreatePaymentRequest> = {}): CreatePaymentRequest => ({
  beneficiary: uk('Widget Works Ltd'), saveBeneficiary: false, payFromCurrency: 'GBP', amount: { side: 'SEND', value: amount },
  rail: 'FPS', payeeReference: 'TEST', ...over,
});

async function send(req: CreatePaymentRequest, code = '123456'): Promise<string> {
  const { paymentId, scaChallengeId } = await api.createPayment(req);
  await api.verifySca({ challengeId: scaChallengeId, code });
  return paymentId;
}

async function statusAfter(id: string, ms: number): Promise<PaymentStatus> {
  vi.advanceTimersByTime(ms);
  tick();
  return (await api.getPayment(id)).status;
}

describe('mock backend scenarios', () => {
  it('approver payment under the threshold goes Processing → Sent → Completed and debits the balance', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    const before = (await api.getBalances()).find((b) => b.currency === 'GBP')!.available;
    const id = await send(draft(100_000));
    expect((await api.getPayment(id)).status).toBe('PROCESSING');
    expect(await statusAfter(id, 2100)).toBe('SENT');
    expect(await statusAfter(id, 3000)).toBe('COMPLETED');
    const after = (await api.getBalances()).find((b) => b.currency === 'GBP')!.available;
    expect(before - after).toBe(100_050); // amount + 50p Faster Payments fee
  });

  it('maker payments wait for approval; the maker cannot approve them', async () => {
    const id = await send(draft(100_000));
    expect((await api.getPayment(id)).status).toBe('AWAITING_APPROVAL');
    await expect(api.approvePayment(id)).rejects.toMatchObject({ code: 'NOT_PERMITTED' });
    await controls.updateSettings({ role: 'APPROVER' });
    await api.approvePayment(id);
    expect((await api.getPayment(id)).status).toBe('PROCESSING');
  });

  it('payments above £25,000 need a second approver even for an approver', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    const id = await send(draft(2_600_000, { purpose: 'SUPPLIER' }));
    expect((await api.getPayment(id)).status).toBe('AWAITING_APPROVAL');
    await expect(api.approvePayment(id)).rejects.toMatchObject({ code: 'NOT_PERMITTED' });
    await controls.updateSettings({ role: 'ADMIN' });
    await api.approvePayment(id);
    expect((await api.getPayment(id)).status).toBe('PROCESSING');
  });

  it('amount ending .13 fails and is refunded', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    const before = (await api.getBalances()).find((b) => b.currency === 'GBP')!.available;
    const id = await send(draft(10_013));
    expect(await statusAfter(id, 3100)).toBe('FAILED');
    expect((await api.getBalances()).find((b) => b.currency === 'GBP')!.available).toBe(before);
  });

  it('amount ending .31 goes into review, then completes', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    const id = await send(draft(10_031));
    expect(await statusAfter(id, 2100)).toBe('IN_REVIEW');
    expect(await statusAfter(id, 22_000)).toBe('COMPLETED');
  });

  it('amount ending .77 is returned after 15 s and refunded', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    const id = await send(draft(10_077));
    expect(await statusAfter(id, 2100)).toBe('SENT');
    expect(await statusAfter(id, 13_000)).toBe('RETURNED');
    expect((await api.getPayment(id)).refunded).toBe(true);
  });

  it('TEST SANCTION names go into review, then are rejected with a generic message', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    const id = await send(draft(10_000, { beneficiary: uk('Test Sanction Trading Ltd') }));
    expect(await statusAfter(id, 2100)).toBe('IN_REVIEW');
    expect(await statusAfter(id, 12_000)).toBe('REJECTED');
    expect((await api.getPayment(id)).statusReason).toMatch(/unable to process/);
  });

  it('Confirmation of Payee magic sort codes', async () => {
    const check = (sortCode: string) => api.checkPayee({ name: 'Acme Trading Limited', sortCode, accountNumber: '12345678', accountType: 'BUSINESS' });
    expect((await check('00-00-00')).result).toBe('NO_MATCH');
    expect(await check('11-11-11')).toEqual({ result: 'CLOSE_MATCH', suggestedName: 'Acme Tradng Limited' });
    expect((await check('22-22-22')).result).toBe('UNAVAILABLE');
    expect((await check('20-45-45')).result).toBe('MATCH');
    await controls.updateSettings({ copAvailable: false });
    expect((await check('20-45-45')).result).toBe('UNAVAILABLE');
  });

  it('sort code 40-00-00 is a Cobanq account and must go as an internal transfer', async () => {
    expect((await api.lookupBank({ sortCode: '40-00-00', country: 'GB' }))?.internal).toBe(true);
    await expect(api.createPayment(draft(10_000, { beneficiary: uk('Northgate Logistics Ltd', '400000') }))).rejects.toMatchObject({ code: 'RAIL_NOT_ELIGIBLE' });
    const res = await api.createPayment(draft(10_000, { beneficiary: uk('Northgate Logistics Ltd', '400000'), rail: 'INTERNAL' }));
    expect(res.scaChallengeId).toBeTruthy();
  });

  it('OTP 000000 fails; three wrong codes lock SCA for 5 minutes', async () => {
    const { scaChallengeId } = await api.createPayment(draft(10_000));
    await expect(api.verifySca({ challengeId: scaChallengeId, code: '000000' })).rejects.toMatchObject({ code: 'SCA_INVALID_CODE', meta: { attemptsLeft: 2 } });
    await expect(api.verifySca({ challengeId: scaChallengeId, code: '000000' })).rejects.toMatchObject({ code: 'SCA_INVALID_CODE' });
    await expect(api.verifySca({ challengeId: scaChallengeId, code: '000000' })).rejects.toMatchObject({ code: 'SCA_LOCKED' });
    await expect(api.verifySca({ challengeId: scaChallengeId, code: '123456' })).rejects.toMatchObject({ code: 'SCA_LOCKED' });
    vi.advanceTimersByTime(5 * 60_000 + 1000);
    await expect(api.verifySca({ challengeId: scaChallengeId, code: '123456' })).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('Faster Payments is refused above £1,000,000; CHAPS is accepted', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    await controls.addFunds({ amount: 500_000_000, currency: 'GBP' });
    const big = draft(120_000_000, { purpose: 'SUPPLIER', sourceOfFunds: 'TRADING' });
    await expect(api.createPayment(big)).rejects.toMatchObject({ code: 'RAIL_NOT_ELIGIBLE' });
    await expect(api.createPayment({ ...big, rail: 'CHAPS' })).resolves.toBeTruthy();
  });

  it('enforces limits, balance and duplicate detection', async () => {
    await expect(api.createPayment(draft(26_000_000))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' }); // maker limit £250,000
    await controls.updateSettings({ role: 'APPROVER' });
    await expect(api.createPayment(draft(26_000_000))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    await send(draft(50_000));
    await expect(api.createPayment(draft(50_000))).rejects.toMatchObject({ code: 'DUPLICATE_SUSPECTED' });
    await expect(api.createPayment(draft(50_000, { confirmDuplicate: true }))).resolves.toBeTruthy();
  });

  it('GBP → EUR convert-and-pay uses the locked quote; expired quotes are refused', async () => {
    await controls.updateSettings({ role: 'APPROVER', fxVolatility: false });
    const ben = (await api.listBeneficiaries({ search: 'Müller' }))[0]!;
    const quote = await api.getFxQuote({ sellCurrency: 'GBP', buyCurrency: 'EUR', buyAmount: 100_000 });
    const req: CreatePaymentRequest = { beneficiaryId: ben.id, payFromCurrency: 'GBP', amount: { side: 'RECEIVE', value: 100_000 }, quoteId: quote.quoteId, rail: 'SEPA_INSTANT', payeeReference: 'RE 1', purpose: 'SUPPLIER' };
    const id = await send(req);
    const p = await api.getPayment(id);
    expect(p.receiveAmount).toEqual({ amount: 100_000, currency: 'EUR' });
    expect(p.fees.map((f) => f.kind)).toEqual(['FX', 'RAIL']);
    const stale = await api.getFxQuote({ sellCurrency: 'GBP', buyCurrency: 'EUR', buyAmount: 200_000 });
    vi.advanceTimersByTime(31_000);
    await expect(api.createPayment({ ...req, amount: { side: 'RECEIVE', value: 200_000 }, quoteId: stale.quoteId })).rejects.toMatchObject({ code: 'FX_QUOTE_EXPIRED' });
  });

  it('Portuguese IBANs are not reachable by SEPA Instant', async () => {
    const pt = (await api.listBeneficiaries({ search: 'Lisboa' }))[0]!;
    await expect(api.createPayment({ beneficiaryId: pt.id, payFromCurrency: 'EUR', amount: { side: 'SEND', value: 50_000 }, rail: 'SEPA_INSTANT', payeeReference: 'FT 1', purpose: 'SUPPLIER' }))
      .rejects.toBeInstanceOf(ApiError);
    await expect(api.createPayment({ beneficiaryId: pt.id, payFromCurrency: 'EUR', amount: { side: 'SEND', value: 50_000 }, rail: 'SEPA_CT', payeeReference: 'FT 1', purpose: 'SUPPLIER' }))
      .resolves.toBeTruthy();
  });

  it('standalone conversion moves money between balances after SCA', async () => {
    await controls.updateSettings({ fxVolatility: false });
    const q = await api.getFxQuote({ sellCurrency: 'GBP', buyCurrency: 'USD', sellAmount: 1_000_000 });
    const { scaChallengeId } = await api.convert({ quoteId: q.quoteId });
    await api.verifySca({ challengeId: scaChallengeId, method: 'push' });
    const b = await api.getBalances();
    expect(b.find((x) => x.currency === 'GBP')!.available).toBe(24_835_075 - 1_000_000 - 5_000);
    expect(b.find((x) => x.currency === 'USD')!.available).toBe(9_487_540 + q.buyAmount);
  });

  it('bulk: 1,000 UK rows by Faster Payments pay out progressively', async () => {
    await controls.updateSettings({ role: 'APPROVER' });
    await controls.addFunds({ amount: 50_000_000, currency: 'GBP' });
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      beneficiaryName: `Employee ${i + 1}`, type: 'individual', country: 'GB', currency: 'GBP', sortCode: '20-45-45',
      accountNumber: String(10_000_000 + i), iban: '', bic: '', amount: '20.00', reference: 'PAYROLL NOV', purpose: 'Payroll / salaries',
    }));
    const results = await api.validateBulkFile(rows);
    expect(results.every((r) => r.severity === 'OK' && r.rail === 'FPS')).toBe(true);
    const { batchId, scaChallengeId } = await api.submitBulk({ fileName: 'payroll.csv', ukRail: 'FPS', rows: rows.map((r) => ({ ...r, rail: 'FPS' as const })) });
    await api.verifySca({ challengeId: scaChallengeId, code: '123456' });
    expect((await api.getBatch(batchId)).status).toBe('PROCESSING'); // £20,000 total: under the approval threshold
    tick();
    const mid = await api.getBatch(batchId);
    const paid = mid.rows.filter((r) => r.status === 'COMPLETED').length;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(1000);
    for (let i = 0; i < 15; i++) tick();
    const done = await api.getBatch(batchId);
    expect(done.status).toBe('COMPLETED');
    expect(done.summary.totalFeesGbp).toBe(1000 * 50);
  });
});
