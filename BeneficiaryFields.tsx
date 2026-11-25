import { useEffect, useMemo, useRef } from 'react';
import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form';
import { BadgeCheck, Building2 } from 'lucide-react';
import type { BankLookupResult } from '@core/api/types';
import {
  formatFieldValue, SECTION_TITLES, type BeneficiaryFormValues, type FieldDef, type FieldSection, type LookupKind,
} from '@core/payments/beneficiarySchemas';
import { CountryPicker } from '../../components/CountryPicker';
import { Input } from '../../components/Form';

const SECTION_ORDER: FieldSection[] = ['who', 'account', 'bank', 'address', 'extra'];
const LOOKUP_PRIORITY: LookupKind[] = ['sortCode', 'iban', 'routingCode', 'bic'];

/** Default values for every field in the schema, so inputs are always controlled. */
export function defaultsFor(fields: FieldDef[], values: BeneficiaryFormValues, country: string): BeneficiaryFormValues {
  const out: BeneficiaryFormValues = {};
  for (const f of fields) out[f.key] = values[f.key] ?? (f.key === 'addressCountry' ? country : '');
  return out;
}

/**
 * Renders a config-driven beneficiary form. The fields come from
 * core/payments/beneficiarySchemas.ts; this component only draws them,
 * applies input formatting and triggers bank lookups.
 */
export function BeneficiaryFields({ fields, control, errors, bank, onLookup, onResetBank }: {
  fields: FieldDef[];
  control: Control<BeneficiaryFormValues>;
  errors: FieldErrors<BeneficiaryFormValues>;
  bank?: BankLookupResult | null;
  onLookup: (kind: LookupKind, value: string) => void;
  onResetBank: () => void;
}) {
  // The lookup that decides the bank shown: sort code, IBAN or routing number first; BIC only if it is the sole identifier.
  const lookupField = useMemo(() => {
    for (const kind of LOOKUP_PRIORITY) {
      const hit = fields.find((f) => f.lookup === kind);
      if (hit) return hit;
    }
    return undefined;
  }, [fields]);

  const lookupValue = useWatch({ control, name: lookupField?.key ?? 'name' }) ?? '';
  const lastLookup = useRef('');
  const onLookupRef = useRef(onLookup);
  onLookupRef.current = onLookup;
  const onClearRef = useRef(onResetBank);
  onClearRef.current = onResetBank;

  useEffect(() => {
    if (!lookupField?.lookup) return;
    const value = String(lookupValue).trim();
    const valid = value !== '' && (lookupField.validate?.(value) ?? null) === null;
    const key = `${lookupField.key}:${value}`;
    if (!valid) {
      if (lastLookup.current !== '') { lastLookup.current = ''; onClearRef.current(); }
      return;
    }
    if (lastLookup.current === key) return;
    lastLookup.current = key;
    const kind = lookupField.lookup;
    const id = setTimeout(() => onLookupRef.current(kind, value), 350);
    return () => clearTimeout(id);
  }, [lookupField, lookupValue]);

  const sections = SECTION_ORDER.map((s) => ({ id: s, fields: fields.filter((f) => f.section === s) })).filter((s) => s.fields.length > 0);

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <fieldset key={section.id}>
          <legend className="mb-3 text-sm font-semibold text-ink">{SECTION_TITLES[section.id]}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              const wide = field.key === 'name' || field.key === 'iban' || field.key === 'bankAddress' || field.key === 'addressLine1' || field.key === 'bankName';
              const error = errors[field.key]?.message as string | undefined;
              const showBank = bank && lookupField?.key === field.key && !error;
              return (
                <div key={field.key} className={wide ? 'sm:col-span-2' : undefined}>
                  <Controller
                    control={control}
                    name={field.key}
                    render={({ field: rhf }) => field.kind === 'country' ? (
                      <CountryPicker label={field.label} value={rhf.value ?? ''} onChange={rhf.onChange} error={error} hint={field.hint} />
                    ) : (
                      <Input
                        label={field.label}
                        optional={!field.required}
                        value={rhf.value ?? ''}
                        onChange={(e) => rhf.onChange(formatFieldValue(field, e.target.value))}
                        onBlur={rhf.onBlur}
                        ref={rhf.ref}
                        name={rhf.name}
                        error={error}
                        hint={field.hint}
                        placeholder={field.placeholder}
                        maxLength={field.maxLength}
                        numeric={field.numeric}
                        autoComplete="off"
                        spellCheck={false}
                        className={field.format === 'iban' || field.format === 'sortCode' || field.numeric ? '[&_input]:tracking-wide' : undefined}
                        below={showBank ? (
                          <p className="flex items-center gap-1.5 text-sm text-ink" role="status">
                            {bank.internal ? <Building2 className="h-4 w-4 text-accent-text" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4 text-success" aria-hidden="true" />}
                            <span>{bank.bankName}{bank.branch ? ` — ${bank.branch}` : ''}</span>
                            {bank.internal && <span className="text-muted">· instant, free transfer</span>}
                          </p>
                        ) : undefined}
                      />
                    )}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
