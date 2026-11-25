/**
 * Bulk row validation. Pure, so the browser can re-check a row instantly
 * while the customer edits it, and the server can run the same rules.
 */
import type { BulkColumn, BulkRowInput, BulkRowResult, RailId } from '../api/types';
import { countryInfo, usesIban } from '../lib/countries';
import { currencyInfo, CURRENCIES } from '../lib/currencies';
import { stripSpaces } from '../lib/format';
import { parseAmount } from '../lib/money';
import { toGbp } from '../fx/rates';
import { PURPOSES } from '../payments/purposes';
import { corridorOf } from '../payments/railEngine';
import { railConfig as defaultConfig, type RailConfig } from '../payments/railConfig';
import {
  ibanErrorMessage, isValidAccountNumber, isValidBic, isValidSortCode, isValidUkAccountNumber, validateIban, validateReference,
} from '../payments/validators';

export const INTERNAL_SORT_CODE = '400000';

export function normalisePurpose(input: string): string | null {
  const key = input.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return null;
  const hit = PURPOSES.find((p) => p.value.toLowerCase().replace(/[^a-z]/g, '') === key || p.label.toLowerCase().replace(/[^a-z]/g, '') === key);
  return hit?.value ?? null;
}

export function normaliseType(input: string): 'BUSINESS' | 'INDIVIDUAL' | null {
  const v = input.trim().toLowerCase();
  if (v === 'business' || v === 'company') return 'BUSINESS';
  if (v === 'individual' || v === 'personal' || v === 'person') return 'INDIVIDUAL';
  return null;
}

export function validateBulkRow(row: BulkRowInput, index: number, cfg: RailConfig = defaultConfig): BulkRowResult {
  const errors: Partial<Record<BulkColumn, string>> = {};
  const warnings: Partial<Record<BulkColumn, string>> = {};
  let note: string | undefined;

  if (row.beneficiaryName.trim().length < 2) errors.beneficiaryName = 'Enter the beneficiary name.';
  if (!normaliseType(row.type)) errors.type = 'Use "business" or "individual".';

  const country = row.country.trim().toUpperCase();
  const countryOk = countryInfo(country) !== undefined;
  if (!countryOk) errors.country = 'Use a two-letter country code, e.g. GB.';

  const currency = row.currency.trim().toUpperCase();
  const currencyOk = currency in CURRENCIES;
  if (!currencyOk) errors.currency = 'Use a three-letter currency code, e.g. GBP.';

  let amount: number | undefined;
  if (currencyOk) {
    const parsed = parseAmount(row.amount, currency);
    if (!parsed.ok) {
      errors.amount = parsed.error === 'TOO_MANY_DECIMALS'
        ? `Use up to ${currencyInfo(currency).decimals} decimal places for ${currency}.`
        : 'Enter an amount, e.g. 1250.00.';
    } else if (parsed.minor <= 0) errors.amount = 'The amount must be more than zero.';
    else amount = parsed.minor;
  } else if (row.amount.trim() === '') errors.amount = 'Enter an amount.';

  let rail: RailId | undefined;
  if (countryOk && currencyOk) {
    const corridor = corridorOf(country, currency);
    const iban = stripSpaces(row.iban);
    const bic = stripSpaces(row.bic);
    if (corridor === 'UK_GBP') {
      if (!isValidSortCode(row.sortCode)) errors.sortCode = 'Enter a 6-digit sort code.';
      if (!isValidUkAccountNumber(row.accountNumber)) errors.accountNumber = 'Enter an 8-digit account number.';
      rail = stripSpaces(row.sortCode) === INTERNAL_SORT_CODE ? 'INTERNAL' : 'FPS';
      if (amount !== undefined && rail === 'FPS' && amount > cfg.fpsMaxGbp) {
        rail = 'CHAPS';
        warnings.amount = 'Over £1,000,000 — this row will be sent by CHAPS.';
        note = 'Sent by CHAPS (over the Faster Payments limit)';
      }
    } else if (corridor === 'SEPA_EUR') {
      const e = validateIban(iban, country);
      if (e) errors.iban = ibanErrorMessage(e, country);
      if (bic && !isValidBic(bic)) errors.bic = 'Enter a valid BIC (8 or 11 characters).';
      rail = 'SEPA_CT';
    } else {
      if (usesIban(country)) {
        const e = validateIban(iban, country);
        if (e) errors.iban = ibanErrorMessage(e, country);
      } else if (!isValidAccountNumber(row.accountNumber)) {
        errors.accountNumber = 'Enter the account number.';
      }
      if (!isValidBic(bic)) errors.bic = 'Enter a valid BIC (8 or 11 characters).';
      rail = 'SWIFT';
    }

    const scheme = corridor === 'UK_GBP' ? 'UK' : 'INTERNATIONAL';
    if (row.reference.trim() === '') errors.reference = 'Enter a reference.';
    else {
      const refError = validateReference(row.reference, scheme);
      if (refError) errors.reference = refError;
    }

    const purpose = normalisePurpose(row.purpose);
    const international = corridor !== 'UK_GBP';
    const large = amount !== undefined && toGbp(amount, currency) >= cfg.purposeRequiredFromGbp;
    if (row.purpose.trim() !== '' && !purpose) errors.purpose = 'Use one of the listed purposes, e.g. "Supplier / goods".';
    else if (!purpose && (international || large)) errors.purpose = international ? 'Purpose is required for international payments.' : 'Purpose is required for payments of £10,000 or more.';
  } else if (row.reference.trim() === '') {
    errors.reference = 'Enter a reference.';
  }

  const severity = Object.keys(errors).length > 0 ? 'ERROR' : Object.keys(warnings).length > 0 ? 'WARNING' : 'OK';
  return { index, severity, errors, warnings, amount, rail: severity === 'ERROR' ? undefined : rail, note };
}

/** Validate a whole file and flag rows that look like duplicates of an earlier row. */
export function validateBulkRows(rows: BulkRowInput[], cfg: RailConfig = defaultConfig): BulkRowResult[] {
  const seen = new Map<string, number>();
  return rows.map((row, i) => {
    const result = validateBulkRow(row, i, cfg);
    if (result.severity !== 'ERROR') {
      const key = [stripSpaces(row.sortCode), stripSpaces(row.accountNumber), stripSpaces(row.iban).toUpperCase(), row.amount.trim(), row.reference.trim().toLowerCase()].join('|');
      const first = seen.get(key);
      if (first !== undefined) {
        result.warnings.reference = `Looks like a duplicate of row ${first + 1}.`;
        result.severity = 'WARNING';
      } else seen.set(key, i);
    }
    return result;
  });
}
