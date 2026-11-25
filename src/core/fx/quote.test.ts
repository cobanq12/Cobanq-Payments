import { describe, expect, it } from 'vitest';
import { buildQuote, isQuoteExpired, quoteFractionLeft, quoteSecondsLeft } from './quote';

const T0 = Date.parse('2026-11-25T10:00:00Z');

describe('FX quote', () => {
  it('builds a quote from the sell side with a separate 0.5% fee', () => {
    const q = buildQuote({ sellCurrency: 'GBP', buyCurrency: 'EUR', sellAmount: 1_000_000 }, 1.17243, T0, 'q1');
    expect(q.rate).toBe(1.17243);
    expect(q.buyAmount).toBe(1_172_430);
    expect(q.fee).toEqual({ amount: 5_000, currency: 'GBP' });
    expect(q.inverseRate).toBeCloseTo(0.852929, 6);
  });

  it('builds a quote from the buy side', () => {
    const q = buildQuote({ sellCurrency: 'GBP', buyCurrency: 'EUR', buyAmount: 1_172_430 }, 1.17243, T0, 'q2');
    expect(q.buyAmount).toBe(1_172_430);
    expect(q.sellAmount).toBe(1_000_000);
  });

  it('handles zero-decimal currencies', () => {
    const q = buildQuote({ sellCurrency: 'GBP', buyCurrency: 'JPY', sellAmount: 10_000 }, 196.31, T0, 'q3');
    expect(q.buyAmount).toBe(19_631); // £100.00 → ¥19,631
  });

  it('locks for 30 seconds', () => {
    const q = buildQuote({ sellCurrency: 'GBP', buyCurrency: 'EUR', sellAmount: 100 }, 1.17, T0, 'q4');
    expect(quoteSecondsLeft(q, T0)).toBe(30);
    expect(quoteSecondsLeft(q, T0 + 12_400)).toBe(18);
    expect(quoteFractionLeft(q, T0 + 15_000)).toBeCloseTo(0.5);
    expect(isQuoteExpired(q, T0 + 29_999)).toBe(false);
  });

  it('expires at exactly 30 seconds and never goes negative', () => {
    const q = buildQuote({ sellCurrency: 'GBP', buyCurrency: 'EUR', sellAmount: 100 }, 1.17, T0, 'q5');
    expect(isQuoteExpired(q, T0 + 30_000)).toBe(true);
    expect(quoteSecondsLeft(q, T0 + 45_000)).toBe(0);
    expect(quoteFractionLeft(q, T0 + 45_000)).toBe(0);
  });
});
