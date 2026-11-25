import { describe, expect, it } from 'vitest';
import {
  buildIban, ibanMod97, isValidAba, isValidBic, isValidBsb, isValidIban, isValidIfsc, isValidSortCode, isValidUkAccountNumber,
  sanitiseReference, validateIban, validateReference,
} from './validators';

describe('IBAN mod-97', () => {
  it('accepts well-known valid IBANs', () => {
    for (const iban of ['GB82 WEST 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00', 'FR14 2004 1010 0505 0001 3M02 606', 'NL91 ABNA 0417 1643 00', 'PT50 0002 0123 1234 5678 9015 4', 'AE07 0331 2345 6789 0123 456']) {
      expect(ibanMod97(iban)).toBe(1);
      expect(isValidIban(iban)).toBe(true);
    }
  });

  it('rejects a wrong check digit (DE00…)', () => {
    expect(validateIban('DE00 3704 0044 0532 0130 00')).toBe('CHECKSUM');
  });

  it('rejects the wrong length for the country', () => {
    expect(validateIban('DE89 3704 0044 0532 0130 0')).toBe('LENGTH');
  });

  it('rejects an IBAN from a different country than expected', () => {
    expect(validateIban('DE89 3704 0044 0532 0130 00', 'FR')).toBe('COUNTRY');
  });

  it('rejects malformed input', () => {
    expect(validateIban('1234')).toBe('FORMAT');
    expect(validateIban('')).toBe('FORMAT');
  });

  it('buildIban produces valid IBANs', () => {
    expect(buildIban('DE', '370400440532013000')).toBe('DE89370400440532013000');
    expect(isValidIban(buildIban('GB', 'CBNQ40000031926819'))).toBe(true);
  });
});

describe('UK sort code and account number', () => {
  it('accepts 6 digits with or without dashes', () => {
    expect(isValidSortCode('12-34-56')).toBe(true);
    expect(isValidSortCode('123456')).toBe(true);
    expect(isValidSortCode('00-00-00')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isValidSortCode('12-34-5')).toBe(false);
    expect(isValidSortCode('12345a')).toBe(false);
  });
  it('account numbers have 8 digits', () => {
    expect(isValidUkAccountNumber('12345678')).toBe(true);
    expect(isValidUkAccountNumber('1234567')).toBe(false);
    expect(isValidUkAccountNumber('123456789')).toBe(false);
  });
});

describe('BIC', () => {
  it('accepts 8 or 11 characters', () => {
    expect(isValidBic('DEUTDEFF')).toBe(true);
    expect(isValidBic('DEUTDEFF500')).toBe(true);
    expect(isValidBic('chasus33')).toBe(true);
  });
  it('rejects wrong lengths and digits in the bank or country code', () => {
    expect(isValidBic('DEUTDEF')).toBe(false);
    expect(isValidBic('DEUTDEFF50')).toBe(false);
    expect(isValidBic('D3UTDEFF')).toBe(false);
    expect(isValidBic('DEUT12FF')).toBe(false);
  });
});

describe('local schemes', () => {
  it('ABA checksum', () => {
    expect(isValidAba('021000021')).toBe(true);
    expect(isValidAba('026009593')).toBe(true);
    expect(isValidAba('021000022')).toBe(false);
    expect(isValidAba('000000000')).toBe(false);
  });
  it('BSB and IFSC formats', () => {
    expect(isValidBsb('062-000')).toBe(true);
    expect(isValidBsb('06200')).toBe(false);
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc('HDFC1001234')).toBe(false);
  });
});

describe('payment reference', () => {
  it('UK rails allow 18 characters', () => {
    expect(validateReference('INV 10432', 'UK')).toBeNull();
    expect(validateReference('A'.repeat(19), 'UK')).toMatch(/18/);
  });
  it('blocks disallowed characters', () => {
    expect(validateReference('INV#10432', 'UK')).not.toBeNull();
    expect(sanitiseReference('INV#10432!', 'UK')).toBe('INV10432');
  });
  it('SEPA / SWIFT allow 140 characters', () => {
    expect(validateReference('A'.repeat(140), 'INTERNATIONAL')).toBeNull();
    expect(validateReference('A'.repeat(141), 'INTERNATIONAL')).toMatch(/140/);
  });
});
