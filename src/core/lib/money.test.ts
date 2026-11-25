import { describe, expect, it } from 'vitest';
import { bps, convertMinor, convertMinorInverse, formatMoney, formatRate, minorToInput, parseAmount } from './money';

describe('money', () => {
  it('parses input into minor units without floating point', () => {
    expect(parseAmount('1,234.56', 'GBP')).toEqual({ ok: true, minor: 123_456 });
    expect(parseAmount('0.1', 'GBP')).toEqual({ ok: true, minor: 10 });
    expect(parseAmount('1000', 'JPY')).toEqual({ ok: true, minor: 1000 });
    expect(parseAmount('.5', 'GBP')).toEqual({ ok: true, minor: 50 });
  });
  it('rejects too many decimal places', () => {
    expect(parseAmount('1.234', 'GBP')).toEqual({ ok: false, error: 'TOO_MANY_DECIMALS' });
    expect(parseAmount('100.5', 'JPY')).toEqual({ ok: false, error: 'TOO_MANY_DECIMALS' });
  });
  it('rejects junk', () => {
    expect(parseAmount('', 'GBP')).toEqual({ ok: false, error: 'EMPTY' });
    expect(parseAmount('abc', 'GBP')).toEqual({ ok: false, error: 'INVALID' });
  });
  it('converts with exact rounding', () => {
    expect(convertMinor(100, 'GBP', 'EUR', 1.1724)).toBe(117);
    expect(convertMinorInverse(117, 'GBP', 'EUR', 1.1724)).toBe(100);
    expect(convertMinor(1_250_000, 'JPY', 'GBP', 1 / 196.31)).toBe(636_748);
  });
  it('formats', () => {
    expect(formatMoney({ amount: 24_835_075, currency: 'GBP' })).toBe('£248,350.75');
    expect(formatMoney({ amount: 1_250_000, currency: 'JPY' }, { code: true })).toBe('1,250,000 JPY');
    expect(minorToInput(123_450, 'GBP')).toBe('1234.50');
    expect(formatRate(1.17243)).toBe('1.17243');
    expect(formatRate(196.31)).toBe('196.310');
    expect(bps(200_000, 50)).toBe(1000);
  });
});
