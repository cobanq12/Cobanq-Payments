/**
 * Config-driven beneficiary forms. The fields shown depend on destination
 * country + currency. Add a corridor by adding config here — no UI code changes.
 */
import { z } from 'zod';
import type { Address, BankDetailKey, BankDetails, Beneficiary, BeneficiaryInput, BeneficiaryType } from '../api/types';
import { countryInfo, countryName, usesIban } from '../lib/countries';
import { stripSpaces } from '../lib/format';
import { corridorOf, type Corridor } from './railEngine';
import {
  ibanErrorMessage, isValidAba, isValidAccountNumber, isValidBic, isValidBsb, isValidCaInstitution, isValidCaTransit,
  isValidCnaps, isValidIfsc, isValidSortCode, isValidUkAccountNumber, validateIban, validateReference,
} from './validators';

export type FieldKey =
  | 'name' | 'firstName' | 'lastName'
  | BankDetailKey
  | 'addressLine1' | 'addressCity' | 'addressPostcode' | 'addressCountry'
  | 'defaultReference';

export type FieldSection = 'who' | 'account' | 'bank' | 'address' | 'extra';
export type FieldFormat = 'text' | 'sortCode' | 'iban' | 'upper' | 'digits';
export type LookupKind = 'sortCode' | 'iban' | 'bic' | 'routingCode';

export interface FieldDef {
  key: FieldKey;
  label: string;
  section: FieldSection;
  required: boolean;
  format: FieldFormat;
  kind: 'text' | 'country';
  maxLength?: number;
  numeric?: boolean;
  placeholder?: string;
  hint?: string;
  /** Trigger a bank lookup once this field is valid. */
  lookup?: LookupKind;
  /** Returns an error message, or null when valid. Only called on non-empty values. */
  validate?: (value: string) => string | null;
}

export type BeneficiaryFormValues = Partial<Record<FieldKey, string>>;

export interface SchemaContext {
  country: string;
  currency: string;
  type: BeneficiaryType;
  /** For SEPA: BIC becomes optional once it can be derived from the IBAN. */
  bicDerivable?: boolean;
}

const f = (key: FieldKey, label: string, section: FieldSection, extra: Partial<FieldDef> = {}): FieldDef => ({
  key, label, section, required: true, format: 'text', kind: 'text', ...extra,
});

function nameFields(type: BeneficiaryType): FieldDef[] {
  if (type === 'BUSINESS') {
    return [f('name', 'Registered business name', 'who', {
      maxLength: 70, hint: 'Exactly as it appears on their bank account.',
      validate: (v) => (v.trim().length < 2 ? 'Enter the registered business name.' : null),
    })];
  }
  return [
    f('firstName', 'First name', 'who', { maxLength: 35 }),
    f('lastName', 'Last name', 'who', { maxLength: 35 }),
  ];
}

const ibanField = (country: string): FieldDef => f('iban', 'IBAN', 'account', {
  format: 'iban', maxLength: 42, lookup: 'iban',
  placeholder: `${country.toUpperCase()}…`,
  hint: countryInfo(country)?.ibanLength ? `${countryInfo(country)!.ibanLength} characters for ${countryName(country)}.` : undefined,
  validate: (v) => { const e = validateIban(v, country); return e ? ibanErrorMessage(e, country) : null; },
});

const bicField = (required: boolean): FieldDef => f('bic', 'BIC / SWIFT code', 'bank', {
  required, format: 'upper', maxLength: 11, lookup: 'bic', placeholder: 'e.g. DEUTDEFF',
  hint: required ? '8 or 11 characters.' : 'Optional — we found it from the IBAN.',
  validate: (v) => (isValidBic(v) ? null : 'Enter a valid BIC: 8 or 11 characters, starting with letters.'),
});

const accountField = (label = 'Account number'): FieldDef => f('accountNumber', label, 'account', {
  format: 'upper', maxLength: 20,
  validate: (v) => (isValidAccountNumber(v) ? null : 'Enter a valid account number (4 to 20 letters or numbers).'),
});

const bankFields = (): FieldDef[] => [
  f('bankName', 'Bank name', 'bank', { maxLength: 70 }),
  f('bankAddress', 'Bank address', 'bank', { maxLength: 140, hint: 'Branch or head office address.' }),
];

const addressFields = (allRequired: boolean): FieldDef[] => [
  f('addressLine1', 'Street address', 'address', { required: allRequired, maxLength: 70 }),
  f('addressCity', 'Town or city', 'address', { required: allRequired, maxLength: 35 }),
  f('addressPostcode', 'Postcode', 'address', { required: allRequired, maxLength: 16 }),
  f('addressCountry', 'Country', 'address', { kind: 'country' }),
];

/** Local account fields for non-GBP, non-SEPA payments, by destination country. */
function localAccountFields(country: string): FieldDef[] {
  switch (country.toUpperCase()) {
    case 'US':
      return [
        f('routingNumber', 'ABA routing number', 'account', {
          format: 'digits', numeric: true, maxLength: 9, lookup: 'routingCode', hint: '9 digits.',
          validate: (v) => (isValidAba(v) ? null : 'Enter a valid 9-digit ABA routing number.'),
        }),
        accountField(),
      ];
    case 'CA':
      return [
        f('transitNumber', 'Transit number', 'account', {
          format: 'digits', numeric: true, maxLength: 5, hint: '5 digits.',
          validate: (v) => (isValidCaTransit(v) ? null : 'Enter the 5-digit transit number.'),
        }),
        f('institutionNumber', 'Institution number', 'account', {
          format: 'digits', numeric: true, maxLength: 3, hint: '3 digits.',
          validate: (v) => (isValidCaInstitution(v) ? null : 'Enter the 3-digit institution number.'),
        }),
        accountField(),
      ];
    case 'AU':
      return [
        f('bsb', 'BSB', 'account', {
          format: 'digits', numeric: true, maxLength: 6, hint: '6 digits.',
          validate: (v) => (isValidBsb(v) ? null : 'Enter the 6-digit BSB.'),
        }),
        accountField(),
      ];
    case 'IN':
      return [
        f('ifsc', 'IFSC', 'account', {
          format: 'upper', maxLength: 11, hint: '11 characters, e.g. HDFC0001234.',
          validate: (v) => (isValidIfsc(v) ? null : 'Enter a valid IFSC: 4 letters, a zero, then 6 characters.'),
        }),
        accountField(),
      ];
    case 'CN':
      return [
        accountField(),
        f('cnaps', 'CNAPS code', 'account', {
          required: false, format: 'digits', numeric: true, maxLength: 12, hint: 'Optional. 12 digits.',
          validate: (v) => (isValidCnaps(v) ? null : 'A CNAPS code has 12 digits.'),
        }),
      ];
    default:
      return usesIban(country) ? [ibanField(country)] : [accountField()];
  }
}

export function getBeneficiaryFields(ctx: SchemaContext): FieldDef[] {
  const corridor: Corridor = corridorOf(ctx.country, ctx.currency);
  const who = nameFields(ctx.type);
  switch (corridor) {
    case 'UK_GBP':
      return [
        ...who,
        f('sortCode', 'Sort code', 'account', {
          format: 'sortCode', numeric: true, maxLength: 8, lookup: 'sortCode', placeholder: '12-34-56',
          validate: (v) => (isValidSortCode(v) ? null : 'Enter a 6-digit sort code.'),
        }),
        f('accountNumber', 'Account number', 'account', {
          format: 'digits', numeric: true, maxLength: 8, placeholder: '8 digits',
          validate: (v) => (isValidUkAccountNumber(v) ? null : 'Enter an 8-digit account number.'),
        }),
        f('defaultReference', 'Reference', 'extra', {
          required: false, maxLength: 18, hint: 'Optional. We’ll suggest it each time you pay them.',
          validate: (v) => validateReference(v, 'UK'),
        }),
      ];
    case 'SEPA_EUR':
      return [...who, ibanField(ctx.country), bicField(!ctx.bicDerivable), ...addressFields(false)];
    case 'INTL_GBP':
      return [
        ...who,
        usesIban(ctx.country) ? ibanField(ctx.country) : accountField(),
        bicField(true), ...bankFields(), ...addressFields(true),
      ];
    case 'INTL':
      return [...who, ...localAccountFields(ctx.country), bicField(true), ...bankFields(), ...addressFields(true)];
  }
}

export const SECTION_TITLES: Record<FieldSection, string> = {
  who: 'Who they are',
  account: 'Account details',
  bank: 'Their bank',
  address: 'Beneficiary address',
  extra: 'Optional',
};

/** Build the zod schema for a set of fields. */
export function buildBeneficiarySchema(fields: FieldDef[]): z.ZodType<BeneficiaryFormValues> {
  return z.record(z.string(), z.string().optional()).superRefine((values, ctx) => {
    for (const field of fields) {
      const raw = (values[field.key] ?? '').trim();
      if (raw === '') {
        if (field.required) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.key], message: `Enter ${article(field.label)} ${lowerFirst(field.label)}.` });
        }
        continue;
      }
      const error = field.validate?.(raw) ?? null;
      if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.key], message: error });
    }
  }) as z.ZodType<BeneficiaryFormValues>;
}

function lowerFirst(s: string): string {
  if (/^(IBAN|BIC|BSB|IFSC|ABA|CNAPS)/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function article(label: string): string {
  if (/^(IBAN|IFSC)/.test(label)) return 'an';
  if (/^(BIC|BSB|CNAPS)/.test(label)) return 'a';
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

/** Apply a field's input format as the user types. */
export function formatFieldValue(field: FieldDef, value: string): string {
  switch (field.format) {
    case 'sortCode': {
      const digits = value.replace(/\D/g, '').slice(0, 6);
      return digits.replace(/(\d{2})(?=\d)/g, '$1-');
    }
    case 'iban': {
      const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 34);
      return clean.replace(/(.{4})(?=.)/g, '$1 ');
    }
    case 'upper':
      return value.toUpperCase().replace(/\s/g, '');
    case 'digits':
      return value.replace(/\D/g, '');
    default:
      return value;
  }
}

const BANK_KEYS: BankDetailKey[] = [
  'sortCode', 'accountNumber', 'iban', 'bic', 'routingNumber', 'transitNumber', 'institutionNumber', 'bsb', 'ifsc', 'cnaps', 'bankName', 'bankAddress',
];

export function valuesToBeneficiaryInput(values: BeneficiaryFormValues, ctx: SchemaContext, nickname?: string): BeneficiaryInput {
  const get = (k: FieldKey): string => (values[k] ?? '').trim();
  const details: BankDetails = {};
  for (const key of BANK_KEYS) {
    const v = get(key);
    if (v) details[key] = key === 'bankName' || key === 'bankAddress' ? v : stripSpaces(v).toUpperCase();
  }
  const name = ctx.type === 'BUSINESS' ? get('name') : `${get('firstName')} ${get('lastName')}`.trim();
  let address: Address | undefined;
  if (get('addressCountry') || get('addressLine1')) {
    address = { line1: get('addressLine1'), city: get('addressCity'), postcode: get('addressPostcode'), country: get('addressCountry') || ctx.country };
  }
  return {
    type: ctx.type,
    name,
    firstName: ctx.type === 'INDIVIDUAL' ? get('firstName') : undefined,
    lastName: ctx.type === 'INDIVIDUAL' ? get('lastName') : undefined,
    nickname: nickname?.trim() || undefined,
    country: ctx.country,
    currency: ctx.currency,
    details,
    address,
    defaultReference: get('defaultReference') || undefined,
  };
}

export function beneficiaryToValues(b: BeneficiaryInput): BeneficiaryFormValues {
  const values: BeneficiaryFormValues = {
    name: b.type === 'BUSINESS' ? b.name : '',
    firstName: b.firstName ?? (b.type === 'INDIVIDUAL' ? b.name.split(' ')[0] : ''),
    lastName: b.lastName ?? (b.type === 'INDIVIDUAL' ? b.name.split(' ').slice(1).join(' ') : ''),
    addressLine1: b.address?.line1 ?? '',
    addressCity: b.address?.city ?? '',
    addressPostcode: b.address?.postcode ?? '',
    addressCountry: b.address?.country ?? b.country,
    defaultReference: b.defaultReference ?? '',
  };
  for (const key of BANK_KEYS) values[key] = b.details[key] ?? '';
  return values;
}

/** Bank-detail fields changed between two beneficiaries (these need SCA to edit). */
export function bankDetailsChanged(a: BeneficiaryInput, b: BeneficiaryInput): boolean {
  if (a.country !== b.country || a.currency !== b.currency || a.name !== b.name) return true;
  return BANK_KEYS.some((k) => (a.details[k] ?? '') !== (b.details[k] ?? ''));
}

/** The main account identifier for display, masked. */
export function primaryAccount(b: Pick<Beneficiary, 'details'>): { label: string; value: string } {
  if (b.details.iban) return { label: 'IBAN', value: b.details.iban };
  return { label: 'Account', value: b.details.accountNumber ?? '' };
}
