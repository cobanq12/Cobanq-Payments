import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { friendlyError } from '../api/errors';
import type { BankLookupResult, Beneficiary, BeneficiaryInput, BeneficiaryQuery, BeneficiaryType, CopCheck, CurrencyCode } from '../api/types';
import { countryInfo } from '../lib/countries';
import {
  beneficiaryToValues, getBeneficiaryFields, valuesToBeneficiaryInput, type BeneficiaryFormValues, type LookupKind,
} from '../payments/beneficiarySchemas';
import { corridorOf } from '../payments/railEngine';
import { qk } from './queryKeys';

/** Saved beneficiaries with search and filters, plus create / update / delete. */
export function useBeneficiaries(query: BeneficiaryQuery = {}) {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: ['beneficiaries'] });

  const list = useQuery({ queryKey: qk.beneficiaries(query), queryFn: () => api.listBeneficiaries(query) });
  const create = useMutation({ mutationFn: (b: BeneficiaryInput) => api.createBeneficiary(b), onSuccess: refresh });
  /** Resolves with an SCA challenge when bank details changed. */
  const update = useMutation({ mutationFn: (v: { id: string; input: BeneficiaryInput }) => api.updateBeneficiary(v.id, v.input), onSuccess: refresh });
  /** Always resolves with an SCA challenge. */
  const remove = useMutation({ mutationFn: (id: string) => api.deleteBeneficiary(id) });

  return { list, beneficiaries: list.data ?? [], isLoading: list.isLoading, create, update, remove, refresh };
}

export function useBeneficiaryHistory(beneficiaryId: string | null) {
  return useQuery({
    queryKey: ['beneficiaryHistory', beneficiaryId],
    queryFn: () => api.listPayments({ beneficiaryId: beneficiaryId!, pageSize: 50 }),
    enabled: !!beneficiaryId,
  });
}

// ── Add / edit form logic ────────────────────────────────────────────────────

export interface EditorContext { country: string; currency: CurrencyCode; type: BeneficiaryType }

export type SaveOutcome =
  | { kind: 'saved'; beneficiary: Beneficiary }
  | { kind: 'sca'; challengeId: string }
  | { kind: 'cop'; cop: CopCheck }
  | { kind: 'error'; message: string };

/** Logic for the add / edit beneficiary form: dynamic fields, bank lookup, name check and save. */
export function useBeneficiaryEditor(existing: Beneficiary | null) {
  const qc = useQueryClient();
  const [ctx, setCtxState] = useState<EditorContext>({
    country: existing?.country ?? 'GB', currency: existing?.currency ?? 'GBP', type: existing?.type ?? 'BUSINESS',
  });
  const [bank, setBank] = useState<BankLookupResult | null>(null);
  const [cop, setCop] = useState<CopCheck | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const fields = useMemo(() => getBeneficiaryFields({ ...ctx, bicDerivable: !!bank?.bic }), [ctx, bank?.bic]);
  const corridor = corridorOf(ctx.country, ctx.currency);

  const setCtx = useCallback((patch: Partial<EditorContext>) => {
    setCtxState((c) => {
      const next = { ...c, ...patch };
      if (patch.country && patch.country !== c.country && !patch.currency) next.currency = countryInfo(patch.country)?.currency ?? c.currency;
      return next;
    });
    if (patch.country || patch.currency) setBank(null);
    setCop(undefined);
  }, []);

  const lookup = useCallback(async (kind: LookupKind, value: string) => {
    const mine = ++seq.current;
    try {
      const req = kind === 'sortCode' ? { sortCode: value } : kind === 'iban' ? { iban: value } : kind === 'bic' ? { bic: value } : { routingCode: value };
      const res = await api.lookupBank({ ...req, country: ctx.country });
      if (seq.current === mine) setBank(res);
    } catch { /* lookup is a convenience */ }
  }, [ctx.country]);

  const resetBank = useCallback(() => { seq.current++; setBank(null); }, []);
  const clearCop = useCallback(() => setCop(undefined), []);

  /** Save. For UK accounts the name is checked first; a warning comes back as `cop` unless `acceptCop` is set. */
  const save = useCallback(async (values: BeneficiaryFormValues, nickname: string, opts: { acceptCop?: boolean } = {}): Promise<SaveOutcome> => {
    setSaving(true);
    try {
      const input = valuesToBeneficiaryInput(values, { ...ctx, bicDerivable: !!bank?.bic }, nickname);
      if (!input.details.bic && bank?.bic && corridor === 'SEPA_EUR') input.details.bic = bank.bic;
      if (corridor === 'UK_GBP') {
        let check = cop;
        if (!check) {
          try {
            const res = await api.checkPayee({ name: input.name, sortCode: input.details.sortCode ?? '', accountNumber: input.details.accountNumber ?? '', accountType: input.type });
            check = { result: res.result, suggestedName: res.suggestedName, accountTypeMismatch: res.accountTypeMismatch, checkedAt: new Date().toISOString() };
          } catch {
            check = { result: 'UNAVAILABLE', checkedAt: new Date().toISOString() };
          }
          setCop(check);
        }
        const clean = check.result === 'MATCH' && !check.accountTypeMismatch;
        if (!clean && !opts.acceptCop) return { kind: 'cop', cop: check };
        input.cop = clean ? check : { ...check, acknowledged: true };
      }
      if (existing) {
        const res = await api.updateBeneficiary(existing.id, input);
        if (res.scaChallengeId) return { kind: 'sca', challengeId: res.scaChallengeId };
        await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
        return { kind: 'saved', beneficiary: res.beneficiary! };
      }
      const created = await api.createBeneficiary(input);
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      return { kind: 'saved', beneficiary: created };
    } catch (e) {
      return { kind: 'error', message: friendlyError(e) };
    } finally {
      setSaving(false);
    }
  }, [ctx, bank, corridor, cop, existing, qc]);

  return { ctx, setCtx, fields, corridor, bank, lookup, resetBank, cop, clearCop, save, saving, initialValues: existing ? beneficiaryToValues(existing) : {} };
}
