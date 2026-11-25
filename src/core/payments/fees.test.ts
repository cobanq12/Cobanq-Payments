import { describe, expect, it } from 'vitest';
import { computeBreakdown, fxFee, railFee } from './fees';

describe('fee calculator', () => {
  it('uses the configured rail fees', () => {
    expect(railFee('INTERNAL', undefined).amount).toBe(0);
    expect(railFee('FPS', undefined)).toEqual({ amount: 50, currency: 'GBP' });
    expect(railFee('BACS', undefined).amount).toBe(25);
    expect(railFee('CHAPS', undefined).amount).toBe(1500);
    expect(railFee('SEPA_INSTANT', undefined)).toEqual({ amount: 100, currency: 'EUR' });
    expect(railFee('SEPA_CT', undefined)).toEqual({ amount: 50, currency: 'EUR' });
    expect(railFee('SWIFT', 'SHA').amount).toBe(1000);
    expect(railFee('SWIFT', 'OUR').amount).toBe(2500);
    expect(railFee('SWIFT', 'BEN').amount).toBe(0);
  });

  it('FX fee is 0.5% of the sell amount, rounded half up', () => {
    expect(fxFee(1_000_000)).toBe(5_000);
    expect(fxFee(101)).toBe(1); // 0.505 → 1
    expect(fxFee(99)).toBe(0); // 0.495 → 0
  });

  it('FPS: total debit is the amount plus 50p', () => {
    const b = computeBreakdown({ payFromCurrency: 'GBP', receiveCurrency: 'GBP', sendAmount: 100_000, receiveAmount: 100_000, rail: 'FPS' });
    expect(b.totalDebit).toEqual({ amount: 100_050, currency: 'GBP' });
    expect(b.receives.amount).toBe(100_000);
    expect(b.lines).toHaveLength(1);
  });

  it('shows the FX fee as its own line', () => {
    const b = computeBreakdown({ payFromCurrency: 'GBP', receiveCurrency: 'EUR', sendAmount: 1_000_000, receiveAmount: 1_172_400, rail: 'SEPA_CT', fxFeeAmount: 5_000 }, undefined, () => 0.85);
    expect(b.lines.map((l) => l.kind)).toEqual(['FX', 'RAIL']);
    // €0.50 SEPA fee converted to GBP at 0.85 = 42.5p → 43p
    expect(b.lines[1]!.amount).toEqual({ amount: 43, currency: 'GBP' });
    expect(b.totalDebit.amount).toBe(1_000_000 + 5_000 + 43);
  });

  it('SWIFT OUR charges the higher fee and delivers the full amount', () => {
    const b = computeBreakdown({ payFromCurrency: 'GBP', receiveCurrency: 'GBP', sendAmount: 500_000, receiveAmount: 500_000, rail: 'SWIFT', chargeOption: 'OUR' });
    expect(b.totalFees.amount).toBe(2500);
    expect(b.receives.amount).toBe(500_000);
  });

  it('SWIFT BEN deducts charges from the amount received', () => {
    const b = computeBreakdown({ payFromCurrency: 'GBP', receiveCurrency: 'GBP', sendAmount: 500_000, receiveAmount: 500_000, rail: 'SWIFT', chargeOption: 'BEN' });
    expect(b.totalDebit.amount).toBe(500_000);
    expect(b.receives.amount).toBe(499_000);
    expect(b.deducted).toEqual({ amount: 1000, currency: 'GBP' });
  });
});
