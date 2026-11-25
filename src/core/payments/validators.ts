/**
 * Bank identifier validators. Pure functions, unit tested.
 */
import { countryInfo } from '../lib/countries';
import type { RailId } from '../api/types';

const clean = (v: string): string => v.replace(/[\s-]/g, '').toUpperCase();

// ── IBAN ─────────────────────────────────────────────────────────────────────

export type IbanError = 'FORMAT' | 'COUNTRY' | 'LENGTH' | 'CHECKSUM';

/** ISO 13616 mod-97 check: move the first four chars to the end, map letters to numbers, remainder must be 1. */
export function ibanMod97(iban: string): number {
  const v = clean(iban);
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder;
}

export function validateIban(iban: string, expectedCountry?: string): IbanError | null {
  const v = clean(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(v)) return 'FORMAT';
  const cc = v.slice(0, 2);
  if (expectedCountry && cc !== expectedCountry.toUpperCase()) return 'COUNTRY';
  const info = countryInfo(cc);
  if (info?.ibanLength !== undefined && v.length !== info.ibanLength) return 'LENGTH';
  if (ibanMod97(v) !== 1) return 'CHECKSUM';
  return null;
}

export function isValidIban(iban: string, expectedCountry?: string): boolean {
  return validateIban(iban, expectedCountry) === null;
}

/** Build a valid IBAN from a country code and BBAN (used by mock data and tests). */
export function buildIban(country: string, bban: string): string {
  const base = clean(bban);
  const check = 98 - ibanMod97(`${country.toUpperCase()}00${base}`);
  return `${country.toUpperCase()}${String(check).padStart(2, '0')}${base}`;
}

export function ibanErrorMessage(e: IbanError, expectedCountry?: string): string {
  switch (e) {
    case 'FORMAT': return 'Enter a valid IBAN, starting with a two-letter country code.';
    case 'COUNTRY': return `This IBAN isn’t from ${countryInfo(expectedCountry ?? '')?.name ?? 'the country you chose'}.`;
    case 'LENGTH': return 'This IBAN is the wrong length for its country.';
    case 'CHECKSUM': return 'This IBAN isn’t valid. Check for a typing mistake.';
  }
}

// ── BIC / SWIFT ──────────────────────────────────────────────────────────────

/** 8 or 11 characters: 4 letters (bank) + 2 letters (country) + 2 alphanumerics (location) + optional 3 (branch). */
export function isValidBic(bic: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean(bic));
}

// ── United Kingdom ───────────────────────────────────────────────────────────

export function isValidSortCode(sortCode: string): boolean {
  return /^\d{6}$/.test(clean(sortCode));
}

export function isValidUkAccountNumber(accountNumber: string): boolean {
  return /^\d{8}$/.test(clean(accountNumber));
}

// ── Other local schemes ──────────────────────────────────────────────────────

/** US ABA routing number: 9 digits with the 3-7-1 weighted checksum. */
export function isValidAba(routing: string): boolean {
  const v = clean(routing);
  if (!/^\d{9}$/.test(v)) return false;
  const d = [...v].map(Number);
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum !== 0 && sum % 10 === 0;
}

/** Australian BSB: 6 digits. */
export function isValidBsb(bsb: string): boolean {
  return /^\d{6}$/.test(clean(bsb));
}

/** Indian IFSC: 4 letters, a zero, then 6 alphanumerics. */
export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean(ifsc));
}

/** Canadian transit (branch) number: 5 digits. */
export function isValidCaTransit(v: string): boolean {
  return /^\d{5}$/.test(clean(v));
}

/** Canadian institution number: 3 digits. */
export function isValidCaInstitution(v: string): boolean {
  return /^\d{3}$/.test(clean(v));
}

/** Chinese CNAPS code: 12 digits. */
export function isValidCnaps(v: string): boolean {
  return /^\d{12}$/.test(clean(v));
}

/** Generic local account number: 4–20 alphanumerics. */
export function isValidAccountNumber(v: string): boolean {
  return /^[A-Z0-9]{4,20}$/.test(clean(v));
}

// ── Payment reference ────────────────────────────────────────────────────────

export type ReferenceScheme = 'UK' | 'INTERNATIONAL';

export function referenceScheme(rail: RailId | null, isUkGbp: boolean): ReferenceScheme {
  if (rail === 'FPS' || rail === 'BACS' || rail === 'CHAPS') return 'UK';
  if (rail === null && isUkGbp) return 'UK';
  return 'INTERNATIONAL';
}

export const REFERENCE_RULES: Record<ReferenceScheme, { maxLength: number; allowed: RegExp; description: string }> = {
  // UK schemes: letters, digits, space and a small set of punctuation.
  UK: { maxLength: 18, allowed: /^[A-Za-z0-9 .\-/&]*$/, description: 'Letters, numbers, spaces and . - / & only' },
  // SEPA / SWIFT "X" character set.
  INTERNATIONAL: { maxLength: 140, allowed: /^[A-Za-z0-9 /\-?:().,'+]*$/, description: 'Letters, numbers, spaces and / - ? : ( ) . , \' + only' },
};

export function validateReference(reference: string, scheme: ReferenceScheme): string | null {
  const rule = REFERENCE_RULES[scheme];
  if (reference.length > rule.maxLength) return `Use ${rule.maxLength} characters or fewer.`;
  if (!rule.allowed.test(reference)) return `${rule.description}.`;
  return null;
}

/** Remove characters the scheme does not allow (used to block them as the user types). */
export function sanitiseReference(reference: string, scheme: ReferenceScheme): string {
  const rule = REFERENCE_RULES[scheme];
  return [...reference].filter((ch) => rule.allowed.test(ch)).join('').slice(0, rule.maxLength);
}
