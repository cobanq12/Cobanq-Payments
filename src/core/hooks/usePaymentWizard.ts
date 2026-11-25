/**
 * All logic for the payment wizard. Screens only render what this returns,
 * so the same hook drives the web wizard and the mobile wizard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdapters, type PickedFile } from '../adapters';
import { api } from '../api/client';
import { friendlyError, isApiError } from '../api/errors';
import type {
  BankLookupResult, Beneficiary, BeneficiaryInput, BeneficiaryType, ChargeOption, CopCheck, CreatePaymentRequest, CurrencyCode,
  Payment, RailId, RailInput, RailOption, RecurrenceFrequency, UploadedDocument,
} from '../api/types';
import { toGbp } from '../fx/rates';
import { countryInfo } from '../lib/countries';
import { currencyInfo } from '../lib/currencies';
import { addWorkingDays, daysBetween, formatDayShort, isWorkingDay, isoToUkDate, toUkTime } from '../lib/dates';
import { stripSpaces } from '../lib/format';
import { minorToInput, parseAmount } from '../lib/money';
import {
  beneficiaryToValues, getBeneficiaryFields, valuesToBeneficiaryInput, type BeneficiaryFormValues, type FieldDef, type LookupKind, type SchemaContext,
} from '../payments/beneficiarySchemas';
import { computeBreakdown, type Breakdown } from '../payments/fees';
import { railConfig } from '../payments/railConfig';
import { corridorOf, selectRails, type Corridor } from '../payments/railEngine';
import { checkAmount, requirementsFor, scamWarningFor, type AmountIssue, type Requirements, type ScamWarning } from '../payments/rules';
import { buildPaymentDetailsSchema, type PaymentDetailsValues } from '../payments/schemas';
import { referenceScheme, sanitiseReference, type ReferenceScheme } from '../payments/validators';
import { qk } from './queryKeys';
import { useBalances, useLimits } from './useAccount';
import { useFxQuote } from './useFxQuote';
import { useNow } from './useNow';

export type WizardStep = 'who' | 'details' | 'amount' | 'rail' | 'review' | 'result';

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'who', label: 'Beneficiary' },
  { id: 'details', label: 'Bank details' },
  { id: 'amount', label: 'Amount' },
  { id: 'rail', label: 'How to send' },
  { id: 'review', label: 'Review' },
  { id: 'result', label: 'Done' },
];

export interface WizardDraft extends PaymentDetailsValues {
  step: WizardStep;
  mode: 'saved' | 'new';
  beneficiaryId?: string;
  country: string;
  currency: CurrencyCode;
  type: BeneficiaryType;
  values: BeneficiaryFormValues;
  save: boolean;
  nickname: string;
  bank?: BankLookupResult | null;
  cop?: CopCheck;
  /** Identifies the details the CoP result belongs to. */
  copKey?: string;
  payFrom?: CurrencyCode;
  sendAmount: string;
  receiveAmount: string;
  lastEdited: 'send' | 'receive';
  documents: UploadedDocument[];
  rail?: RailId;
  chargeOption: ChargeOption;
  scamAck: boolean;
  paymentId?: string;
  updatedAt: string;
}

export const WIZARD_DRAFT_KEY = 'cobanq.wizard.draft';

function emptyDraft(): WizardDraft {
  return {
    step: 'who', mode: 'saved', country: 'GB', currency: 'GBP', type: 'BUSINESS', values: {}, save: true, nickname: '',
    sendAmount: '', receiveAmount: '', lastEdited: 'send', documents: [], chargeOption: 'SHA', scamAck: false,
    reference: '', purpose: '', purposeOther: '', purposeCode: '', sourceOfFunds: '',
    dateMode: 'today', scheduledDate: '', recurring: false, frequency: 'MONTHLY', endMode: 'never', endDate: '', count: '',
    updatedAt: new Date().toISOString(),
  };
}

export interface WizardStart {
  beneficiary?: Beneficiary;
  payFrom?: CurrencyCode;
  repeat?: Payment;
}

export interface UploadState {
  name: string;
  progress: number;
  error?: string;
}

export type ConfirmOutcome =
  | { kind: 'sca'; challengeId: string; paymentId: string }
  | { kind: 'duplicate' }
  | { kind: 'error'; message: string };

function copKeyOf(name: string, sortCode: string, accountNumber: string, type: BeneficiaryType): string {
  return [name.trim().toLowerCase(), stripSpaces(sortCode), stripSpaces(accountNumber), type].join('|');
}

function amountError(result: ReturnType<typeof parseAmount>, currency: CurrencyCode): string | null {
  if (result.ok) return result.minor > 0 ? null : 'Enter an amount more than zero.';
  switch (result.error) {
    case 'EMPTY': return 'Enter an amount.';
    case 'TOO_MANY_DECIMALS': {
      const d = currencyInfo(currency).decimals;
      return d === 0 ? `${currencyInfo(currency).name} amounts can’t have decimal places.` : `Use up to ${d} decimal places.`;
    }
    case 'TOO_LARGE': return 'That amount is too large.';
    default: return 'Enter a valid amount, using numbers only.';
  }
}

export function usePaymentWizard() {
  const { storage } = useAdapters();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<null | 'selecting' | 'checking' | 'confirming'>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptedAmount, setAttemptedAmount] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [resultPayment, setResultPayment] = useState<string | null>(null);
  const nowDate = useNow(20_000);
  const today = toUkTime(nowDate).date;

  // ── Persistence: the draft survives refresh, exit and sign-out ─────────────
  useEffect(() => {
    let alive = true;
    storage.getItem(WIZARD_DRAFT_KEY).then((raw) => {
      if (!alive) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as WizardDraft;
          if (parsed.step !== 'result') setDraft({ ...emptyDraft(), ...parsed });
        } catch { /* ignore a corrupt draft */ }
      }
      setReady(true);
    }, () => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [storage]);

  const persist = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (persist.current) clearTimeout(persist.current);
    persist.current = setTimeout(() => {
      if (draft.step === 'result') void storage.removeItem(WIZARD_DRAFT_KEY).catch(() => undefined);
      else void storage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft)).catch(() => undefined);
    }, 250);
    return () => { if (persist.current) clearTimeout(persist.current); };
  }, [draft, ready, storage]);

  const update = useCallback((patch: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...patch, updatedAt: new Date().toISOString() }));
  }, []);

  const goTo = useCallback((step: WizardStep) => { setError(null); update({ step }); }, [update]);

  // ── Data ───────────────────────────────────────────────────────────────────
  const balancesQuery = useBalances();
  const limitsQuery = useLimits();
  const beneficiariesQuery = useQuery({ queryKey: qk.beneficiaries({}), queryFn: () => api.listBeneficiaries({}) });
  const balances = useMemo(() => balancesQuery.data ?? [], [balancesQuery.data]);
  const saved = draft.mode === 'saved' ? beneficiariesQuery.data?.find((b) => b.id === draft.beneficiaryId) : undefined;

  // ── Beneficiary ────────────────────────────────────────────────────────────
  const country = saved?.country ?? draft.country;
  const receiveCurrency = saved?.currency ?? draft.currency;
  const type = saved?.type ?? draft.type;
  const corridor: Corridor = corridorOf(country, receiveCurrency);
  const schemaContext: SchemaContext = useMemo(
    () => ({ country: draft.country, currency: draft.currency, type: draft.type, bicDerivable: !!draft.bank?.bic }),
    [draft.country, draft.currency, draft.type, draft.bank?.bic],
  );
  const fields: FieldDef[] = useMemo(() => getBeneficiaryFields(schemaContext), [schemaContext]);

  const payee: BeneficiaryInput | null = useMemo(() => {
    if (draft.mode === 'saved') return saved ?? null;
    const input = valuesToBeneficiaryInput(draft.values, schemaContext, draft.nickname);
    if (!input.details.bic && draft.bank?.bic && corridor === 'SEPA_EUR') input.details.bic = draft.bank.bic;
    return input.name ? input : null;
  }, [draft.mode, draft.values, draft.nickname, draft.bank, saved, schemaContext, corridor]);

  const resolvedBank = saved?.resolvedBank ?? draft.bank?.bankName ?? payee?.details.bankName;
  const internal = saved?.internal ?? draft.bank?.internal ?? false;
  const isNewBeneficiary = draft.mode === 'new' || (!!saved && !saved.lastPaidAt);

  // ── Amounts and FX ─────────────────────────────────────────────────────────
  const payFrom: CurrencyCode = draft.payFrom ?? receiveCurrency;
  const fxNeeded = payFrom !== receiveCurrency;
  const parsedSend = parseAmount(draft.sendAmount, payFrom);
  const parsedReceive = parseAmount(draft.receiveAmount, receiveCurrency);
  const activeParsed = draft.lastEdited === 'send' ? parsedSend : parsedReceive;
  const onAmountSteps = draft.step === 'amount' || draft.step === 'rail' || draft.step === 'review';

  const fx = useFxQuote({
    sellCurrency: payFrom,
    buyCurrency: receiveCurrency,
    sellAmount: draft.lastEdited === 'send' && parsedSend.ok && parsedSend.minor > 0 ? parsedSend.minor : undefined,
    buyAmount: draft.lastEdited === 'receive' && parsedReceive.ok && parsedReceive.minor > 0 ? parsedReceive.minor : undefined,
    enabled: fxNeeded && onAmountSteps && busy !== 'confirming',
  });
  const quote = fx.quote;

  // Fill the linked field from the quote.
  useEffect(() => {
    if (!quote) return;
    setDraft((d) => {
      if (d.lastEdited === 'send') {
        const v = minorToInput(quote.buyAmount, quote.buyCurrency);
        return d.receiveAmount === v ? d : { ...d, receiveAmount: v };
      }
      const v = minorToInput(quote.sellAmount, quote.sellCurrency);
      return d.sendAmount === v ? d : { ...d, sendAmount: v };
    });
  }, [quote]);

  const sendMinor: number | null = fxNeeded ? quote?.sellAmount ?? null : parsedSend.ok && parsedSend.minor > 0 ? parsedSend.minor : null;
  const receiveMinor: number | null = fxNeeded ? quote?.buyAmount ?? null : parsedSend.ok && parsedSend.minor > 0 ? parsedSend.minor : null;
  const amountGbp = sendMinor !== null ? toGbp(sendMinor, payFrom) : 0;

  const setSendAmount = useCallback((v: string) => {
    setDraft((d) => {
      const same = (d.payFrom ?? receiveCurrency) === receiveCurrency;
      return { ...d, sendAmount: v, lastEdited: 'send', receiveAmount: same ? v : v.trim() === '' ? '' : d.receiveAmount, updatedAt: new Date().toISOString() };
    });
  }, [receiveCurrency]);

  const setReceiveAmount = useCallback((v: string) => {
    setDraft((d) => {
      const same = (d.payFrom ?? receiveCurrency) === receiveCurrency;
      return { ...d, receiveAmount: v, lastEdited: same ? 'send' : 'receive', sendAmount: same ? v : v.trim() === '' ? '' : d.sendAmount, updatedAt: new Date().toISOString() };
    });
  }, [receiveCurrency]);

  const setPayFrom = useCallback((c: CurrencyCode) => {
    setDraft((d) => {
      // Keep the amount the beneficiary receives; the send side is re-quoted.
      if (c === receiveCurrency) return { ...d, payFrom: c, sendAmount: d.receiveAmount, lastEdited: 'send' };
      return { ...d, payFrom: c, lastEdited: d.receiveAmount.trim() ? 'receive' : 'send', sendAmount: d.receiveAmount.trim() ? '' : d.sendAmount };
    });
  }, [receiveCurrency]);

  // Default pay-from: the balance in the beneficiary's currency if it has funds, otherwise GBP.
  useEffect(() => {
    if (draft.step !== 'amount' || draft.payFrom || balances.length === 0) return;
    const sameCcy = balances.find((b) => b.currency === receiveCurrency);
    update({ payFrom: sameCcy && sameCcy.available > 0 ? receiveCurrency : 'GBP' });
  }, [draft.step, draft.payFrom, balances, receiveCurrency, update]);

  // ── Rails ──────────────────────────────────────────────────────────────────
  const scheduled = draft.dateMode === 'scheduled' && draft.scheduledDate > today;
  const paymentDate = scheduled ? draft.scheduledDate : today;
  const railInput: Omit<RailInput, 'now'> = useMemo(() => ({
    destinationCountry: country, receiveCurrency, payFromCurrency: payFrom, amountGbp, receiveAmount: receiveMinor ?? 0,
    paymentDate, scheduled, beneficiaryType: type, isBulk: false, internal,
    sepaInstantReachable: draft.bank?.sepaInstantReachable,
  }), [country, receiveCurrency, payFrom, amountGbp, receiveMinor, paymentDate, scheduled, type, internal, draft.bank?.sepaInstantReachable]);

  const localRails = useMemo(() => selectRails({ ...railInput, now: nowDate }), [railInput, nowDate]);
  const railsQuery = useQuery({
    queryKey: qk.rails({ ...railInput, minute: Math.floor(nowDate.getTime() / 60_000) }),
    queryFn: () => api.getRails(railInput),
    enabled: (draft.step === 'rail' || draft.step === 'review') && receiveMinor !== null,
    placeholderData: (prev) => prev,
  });
  const rails = railsQuery.data ?? localRails;
  const selectedRail: RailOption | null =
    rails.options.find((o) => o.rail === draft.rail && o.eligible)
    ?? rails.options.find((o) => o.rail === rails.recommended)
    ?? null;
  const chargeOption: ChargeOption | undefined = selectedRail?.chargeOptions ? draft.chargeOption : undefined;

  const breakdown: Breakdown | null = useMemo(() => {
    if (sendMinor === null || receiveMinor === null || !selectedRail) return null;
    return computeBreakdown({
      payFromCurrency: payFrom, receiveCurrency, sendAmount: sendMinor, receiveAmount: receiveMinor,
      rail: selectedRail.rail, chargeOption, fxFeeAmount: fxNeeded ? quote?.fee.amount : undefined,
    });
  }, [sendMinor, receiveMinor, selectedRail, payFrom, receiveCurrency, chargeOption, fxNeeded, quote]);

  // ── Rules ──────────────────────────────────────────────────────────────────
  const requirements: Requirements = useMemo(() => requirementsFor(country, receiveCurrency, amountGbp), [country, receiveCurrency, amountGbp]);
  const scheme: ReferenceScheme = referenceScheme(draft.step === 'amount' ? null : selectedRail?.rail ?? null, corridor === 'UK_GBP');
  const workingDaysOnly = corridor === 'INTL' || corridor === 'INTL_GBP';
  const available = balances.find((b) => b.currency === payFrom)?.available ?? 0;
  const limits = limitsQuery.data;

  const amountIssues: AmountIssue[] = useMemo(() => {
    if (!limits || !breakdown || balancesQuery.data === undefined) return [];
    return checkAmount({ amountGbp, totalDebit: breakdown.totalDebit.amount, payFromCurrency: payFrom, available, limits });
  }, [limits, breakdown, balancesQuery.data, amountGbp, payFrom, available]);

  const detailErrors: Partial<Record<keyof PaymentDetailsValues, string>> = useMemo(() => {
    const schema = buildPaymentDetailsSchema({ scheme: referenceScheme(null, corridor === 'UK_GBP'), requirements, today, workingDaysOnly });
    const result = schema.safeParse(draft);
    if (result.success) return {};
    const out: Partial<Record<keyof PaymentDetailsValues, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof PaymentDetailsValues;
      if (!out[key]) out[key] = issue.message;
    }
    return out;
  }, [draft, corridor, requirements, today, workingDaysOnly]);

  const amountFieldError = amountError(activeParsed, draft.lastEdited === 'send' ? payFrom : receiveCurrency);
  const amountStepValid = amountFieldError === null && amountIssues.length === 0 && Object.keys(detailErrors).length === 0
    && sendMinor !== null && receiveMinor !== null && uploads.every((u) => u.progress >= 1 || u.error);

  const scamWarning: ScamWarning | null = scamWarningFor(draft.purpose || undefined, isNewBeneficiary, amountGbp);
  const needsCoolingConfirm = isNewBeneficiary && amountGbp > railConfig.newBeneficiaryCoolingGbp;

  /** Hint shown when a scheduled date falls on a non-working day. */
  const scheduleHint: string | null = draft.dateMode === 'scheduled' && draft.scheduledDate && !isWorkingDay(draft.scheduledDate)
    ? `That’s not a UK working day. Faster Payments will still go on the day; CHAPS and Bacs would be sent on ${formatDayShort(addWorkingDays(draft.scheduledDate, 0))}.`
    : null;

  // ── Actions: beneficiary ───────────────────────────────────────────────────
  const runCop = useCallback(async (name: string, sortCode: string, accountNumber: string, accountType: BeneficiaryType): Promise<CopCheck> => {
    try {
      const res = await api.checkPayee({ name, sortCode: stripSpaces(sortCode), accountNumber: stripSpaces(accountNumber), accountType });
      return { result: res.result, suggestedName: res.suggestedName, accountTypeMismatch: res.accountTypeMismatch, checkedAt: new Date().toISOString() };
    } catch {
      return { result: 'UNAVAILABLE', checkedAt: new Date().toISOString() };
    }
  }, []);

  const lookupFor = useCallback(async (b: BeneficiaryInput): Promise<BankLookupResult | null> => {
    try {
      if (b.details.sortCode) return await api.lookupBank({ sortCode: b.details.sortCode, country: b.country });
      if (b.details.iban) return await api.lookupBank({ iban: b.details.iban, country: b.country });
      if (b.details.routingNumber) return await api.lookupBank({ routingCode: b.details.routingNumber, country: b.country });
      if (b.details.bic) return await api.lookupBank({ bic: b.details.bic, country: b.country });
    } catch { /* lookup is a convenience; carry on without it */ }
    return null;
  }, []);

  /** Pick a saved beneficiary. Skips to the amount step, re-running CoP when the last check is stale. */
  const selectSaved = useCallback(async (b: Beneficiary) => {
    setBusy('selecting');
    setError(null);
    try {
      const bank = await lookupFor(b);
      const patch: Partial<WizardDraft> = {
        mode: 'saved', beneficiaryId: b.id, bank, cop: b.cop, copKey: undefined, payFrom: undefined, rail: undefined, scamAck: false,
        reference: draft.beneficiaryId === b.id ? draft.reference : sanitiseReference(b.defaultReference ?? '', 'UK'),
      };
      const isUk = corridorOf(b.country, b.currency) === 'UK_GBP';
      const stale = !b.cop || daysBetween(isoToUkDate(b.cop.checkedAt), toUkTime(new Date()).date) > railConfig.copMaxAgeDays;
      if (isUk && stale && b.details.sortCode && b.details.accountNumber) {
        const cop = await runCop(b.name, b.details.sortCode, b.details.accountNumber, b.type);
        const clean = cop.result === 'MATCH' && !cop.accountTypeMismatch;
        update({ ...patch, cop, copKey: copKeyOf(b.name, b.details.sortCode, b.details.accountNumber, b.type), step: clean ? 'amount' : 'details' });
      } else {
        update({ ...patch, step: 'amount' });
      }
    } finally {
      setBusy(null);
    }
  }, [draft.beneficiaryId, draft.reference, lookupFor, runCop, update]);

  /** Start a new beneficiary: where is the account, what currency, business or individual. */
  const startNew = useCallback((v: { country: string; currency: CurrencyCode; type: BeneficiaryType }) => {
    setDraft((d) => {
      const corridorChanged = d.mode !== 'new' || d.country !== v.country || d.currency !== v.currency;
      return {
        ...d, mode: 'new', beneficiaryId: undefined, country: v.country, currency: v.currency, type: v.type,
        values: corridorChanged ? { addressCountry: v.country } : d.values,
        bank: corridorChanged ? undefined : d.bank, cop: undefined, copKey: undefined,
        payFrom: corridorChanged ? undefined : d.payFrom, rail: undefined, scamAck: false, step: 'details', updatedAt: new Date().toISOString(),
      };
    });
    setError(null);
  }, []);

  /** Bank lookup as the customer types a valid sort code, IBAN, BIC or routing number. */
  const lookupSeq = useRef(0);
  const lookupBank = useCallback(async (kind: LookupKind, value: string) => {
    const mine = ++lookupSeq.current;
    try {
      const req = kind === 'sortCode' ? { sortCode: value } : kind === 'iban' ? { iban: value } : kind === 'bic' ? { bic: value } : { routingCode: value };
      const res = await api.lookupBank({ ...req, country: draft.country });
      if (lookupSeq.current !== mine) return;
      // A BIC lookup must not wipe what the IBAN lookup found (reachability, internal flag).
      setDraft((d) => ({ ...d, bank: kind === 'bic' && d.bank ? { ...d.bank, ...(res ?? {}), bic: res?.bic ?? d.bank.bic, internal: d.bank.internal, sepaInstantReachable: d.bank.sepaInstantReachable } : res }));
    } catch { /* ignore */ }
  }, [draft.country]);

  const resetBank = useCallback(() => { lookupSeq.current++; setDraft((d) => (d.bank ? { ...d, bank: undefined } : d)); }, []);

  /** Submit the bank-details form. For UK GBP this runs Confirmation of Payee before moving on. */
  const submitDetails = useCallback(async (values: BeneficiaryFormValues, opts: { save: boolean; nickname: string }) => {
    setError(null);
    const input = valuesToBeneficiaryInput(values, schemaContext, opts.nickname);
    const base: Partial<WizardDraft> = { values, save: opts.save, nickname: opts.nickname };
    if (corridor !== 'UK_GBP') { update({ ...base, step: 'amount' }); return; }

    const key = copKeyOf(input.name, input.details.sortCode ?? '', input.details.accountNumber ?? '', input.type);
    if (draft.cop && draft.copKey === key) {
      const ok = (draft.cop.result === 'MATCH' && !draft.cop.accountTypeMismatch) || draft.cop.acknowledged;
      update({ ...base, step: ok ? 'amount' : 'details' });
      return;
    }
    setBusy('checking');
    try {
      const [cop, bank] = await Promise.all([
        runCop(input.name, input.details.sortCode ?? '', input.details.accountNumber ?? '', input.type),
        lookupFor(input),
      ]);
      // Always show the outcome (including a match) before moving on, as UK banks do.
      update({ ...base, cop, copKey: key, bank, step: 'details' });
    } finally {
      setBusy(null);
    }
  }, [schemaContext, corridor, draft.cop, draft.copKey, runCop, lookupFor, update]);

  /** Close match: use the name the bank returned. */
  const acceptSuggestedName = useCallback(() => {
    const suggested = draft.cop?.suggestedName;
    if (!suggested) return;
    const source = draft.mode === 'saved' && saved ? beneficiaryToValues(saved) : draft.values;
    const srcType = draft.mode === 'saved' && saved ? saved.type : draft.type;
    const values: BeneficiaryFormValues = { ...source };
    if (srcType === 'BUSINESS') values.name = suggested;
    else {
      const [first = '', ...rest] = suggested.split(' ');
      values.firstName = first;
      values.lastName = rest.join(' ');
    }
    const cop: CopCheck = { result: 'MATCH', checkedAt: new Date().toISOString() };
    update({
      mode: 'new', beneficiaryId: undefined, values, type: srcType,
      country: saved?.country ?? draft.country, currency: saved?.currency ?? draft.currency,
      save: draft.mode === 'saved' ? false : draft.save,
      cop, copKey: copKeyOf(suggested, values.sortCode ?? '', values.accountNumber ?? '', srcType), step: 'amount',
    });
  }, [draft, saved, update]);

  /** The bank says the account type differs: switch business ↔ individual. */
  const switchAccountType = useCallback(() => {
    if (draft.mode !== 'new') return;
    const nextType: BeneficiaryType = draft.type === 'BUSINESS' ? 'INDIVIDUAL' : 'BUSINESS';
    const v = { ...draft.values };
    if (nextType === 'INDIVIDUAL') {
      const [first = '', ...rest] = (v.name ?? '').split(' ');
      v.firstName = first; v.lastName = rest.join(' ');
    } else v.name = `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim();
    update({ type: nextType, values: v, cop: undefined, copKey: undefined });
  }, [draft.mode, draft.type, draft.values, update]);

  /** No match / unavailable / type warning: continue after ticking the acknowledgement. */
  const continueDespiteCop = useCallback(() => {
    if (!draft.cop) return;
    update({ cop: { ...draft.cop, acknowledged: true }, step: 'amount' });
  }, [draft.cop, update]);

  /** Go back to edit the details of a saved beneficiary as a one-off new beneficiary. */
  const editSavedDetails = useCallback(() => {
    if (!saved) { update({ cop: undefined, copKey: undefined }); return; }
    update({
      mode: 'new', beneficiaryId: undefined, country: saved.country, currency: saved.currency, type: saved.type,
      values: beneficiaryToValues(saved), save: false, nickname: '', cop: undefined, copKey: undefined, step: 'details',
    });
  }, [saved, update]);

  const clearCop = useCallback(() => update({ cop: undefined, copKey: undefined }), [update]);

  // ── Actions: amount, documents, rail ───────────────────────────────────────
  const setReference = useCallback((v: string) => {
    update({ reference: sanitiseReference(v, referenceScheme(null, corridor === 'UK_GBP')) });
  }, [corridor, update]);

  const continueFromAmount = useCallback((): boolean => {
    setAttemptedAmount(true);
    if (!amountStepValid) return false;
    setAttemptedAmount(false);
    goTo('rail');
    return true;
  }, [amountStepValid, goTo]);

  const uploadDocument = useCallback(async (file: PickedFile) => {
    setUploads((u) => [...u.filter((x) => x.name !== file.name), { name: file.name, progress: 0 }]);
    try {
      const doc = await api.uploadDocument({ name: file.name, size: file.size, type: file.type }, undefined, (fraction) => {
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: fraction } : x)));
      });
      setUploads((u) => u.filter((x) => x.name !== file.name));
      setDraft((d) => ({ ...d, documents: [...d.documents, doc] }));
    } catch (e) {
      setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error: friendlyError(e) } : x)));
    }
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDraft((d) => ({ ...d, documents: d.documents.filter((x) => x.id !== id) }));
  }, []);

  const dismissUpload = useCallback((name: string) => setUploads((u) => u.filter((x) => x.name !== name)), []);

  const chooseRail = useCallback((rail: RailId) => update({ rail }), [update]);
  const chooseChargeOption = useCallback((c: ChargeOption) => update({ chargeOption: c }), [update]);

  const continueFromRail = useCallback(() => {
    if (!selectedRail) return;
    update({ rail: selectedRail.rail, step: 'review' });
  }, [selectedRail, update]);

  // ── Actions: confirm ───────────────────────────────────────────────────────
  const canConfirm = !!payee && !!selectedRail && sendMinor !== null && receiveMinor !== null && amountIssues.length === 0
    && (!scamWarning?.requiresAck || draft.scamAck) && (!fxNeeded || fx.locked);

  const confirm = useCallback(async (opts: { confirmDuplicate?: boolean } = {}): Promise<ConfirmOutcome> => {
    if (!payee || !selectedRail || sendMinor === null || receiveMinor === null) return { kind: 'error', message: 'Some details are missing.' };
    setBusy('confirming');
    setError(null);
    const req: CreatePaymentRequest = {
      beneficiaryId: draft.mode === 'saved' ? draft.beneficiaryId : undefined,
      beneficiary: draft.mode === 'new' ? { ...payee, cop: draft.cop } : undefined,
      saveBeneficiary: draft.mode === 'new' ? draft.save : undefined,
      payFromCurrency: payFrom,
      amount: draft.lastEdited === 'receive' && fxNeeded ? { side: 'RECEIVE', value: receiveMinor } : { side: 'SEND', value: sendMinor },
      quoteId: fxNeeded ? quote?.quoteId : undefined,
      rail: selectedRail.rail,
      chargeOption,
      scheduledDate: scheduled ? draft.scheduledDate : undefined,
      recurrence: draft.recurring && corridor === 'UK_GBP'
        ? { frequency: draft.frequency as RecurrenceFrequency, endDate: draft.endMode === 'date' ? draft.endDate : undefined, count: draft.endMode === 'count' ? Number(draft.count) : undefined }
        : undefined,
      payeeReference: draft.reference.trim(),
      purpose: draft.purpose || undefined,
      purposeOther: draft.purpose === 'OTHER' ? draft.purposeOther.trim() : undefined,
      purposeCode: requirements.purposeCodes ? draft.purposeCode : undefined,
      sourceOfFunds: requirements.sourceOfFundsRequired ? draft.sourceOfFunds : undefined,
      documentIds: draft.documents.map((d) => d.id),
      cop: corridor === 'UK_GBP' ? draft.cop : undefined,
      confirmDuplicate: opts.confirmDuplicate,
    };
    try {
      const res = await api.createPayment(req);
      return { kind: 'sca', challengeId: res.scaChallengeId, paymentId: res.paymentId };
    } catch (e) {
      setBusy(null);
      if (isApiError(e) && e.code === 'DUPLICATE_SUSPECTED') return { kind: 'duplicate' };
      if (isApiError(e) && e.code === 'FX_QUOTE_EXPIRED') void fx.refresh();
      const message = friendlyError(e);
      setError(message);
      return { kind: 'error', message };
    }
  }, [payee, selectedRail, sendMinor, receiveMinor, draft, payFrom, fxNeeded, quote, chargeOption, scheduled, corridor, requirements, fx]);

  /** SCA approved: show the result. */
  const completed = useCallback((paymentId: string) => {
    setBusy(null);
    setResultPayment(paymentId);
    update({ step: 'result', paymentId });
    void qc.invalidateQueries();
  }, [update, qc]);

  /** SCA dialog closed without approving: withdraw the pending payment, keep the draft. */
  const abandoned = useCallback(async (paymentId: string) => {
    setBusy(null);
    try { await api.cancelPayment(paymentId); } catch { /* already gone */ }
  }, []);

  const reset = useCallback(() => {
    setDraft(emptyDraft());
    setAttemptedAmount(false);
    setUploads([]);
    setError(null);
    setResultPayment(null);
    setBusy(null);
    void storage.removeItem(WIZARD_DRAFT_KEY).catch(() => undefined);
  }, [storage]);

  /** Start pre-filled: "Pay" from Beneficiaries, "Convert and pay", or "Repeat payment". */
  const startWith = useCallback(async (start: WizardStart) => {
    const fresh = emptyDraft();
    if (start.repeat) {
      const p = start.repeat;
      const list = await qc.fetchQuery({ queryKey: qk.beneficiaries({}), queryFn: () => api.listBeneficiaries({}) });
      const existing = p.beneficiary.id ? list.find((b) => b.id === p.beneficiary.id) : undefined;
      const common: Partial<WizardDraft> = {
        payFrom: p.payFromCurrency, receiveAmount: minorToInput(p.receiveAmount.amount, p.receiveAmount.currency),
        sendAmount: p.payFromCurrency === p.receiveAmount.currency ? minorToInput(p.receiveAmount.amount, p.receiveAmount.currency) : '',
        lastEdited: p.payFromCurrency === p.receiveAmount.currency ? 'send' : 'receive',
        reference: p.payeeReference, purpose: p.purpose ?? '', purposeOther: p.purposeOther ?? '', purposeCode: p.purposeCode ?? '',
        sourceOfFunds: p.sourceOfFunds ?? '', chargeOption: p.chargeOption ?? 'SHA', step: 'amount',
      };
      if (existing) {
        const bank = await lookupFor(existing);
        setDraft({ ...fresh, ...common, mode: 'saved', beneficiaryId: existing.id, cop: existing.cop, bank });
      } else {
        const b = p.beneficiary;
        const input: BeneficiaryInput = { type: b.type, name: b.name, country: b.country, currency: b.currency, details: b.details, address: b.address };
        const bank = await lookupFor(input);
        setDraft({ ...fresh, ...common, mode: 'new', country: b.country, currency: b.currency, type: b.type, values: beneficiaryToValues(input), save: false, cop: p.cop, bank, step: 'details' });
      }
      return;
    }
    if (start.beneficiary) {
      setDraft({ ...fresh, payFrom: start.payFrom });
      await selectSaved(start.beneficiary);
      if (start.payFrom) update({ payFrom: start.payFrom });
      return;
    }
    setDraft({ ...fresh, payFrom: start.payFrom });
  }, [qc, lookupFor, selectSaved, update]);

  const back = useCallback(() => {
    const order: WizardStep[] = ['who', 'details', 'amount', 'rail', 'review'];
    const i = order.indexOf(draft.step);
    if (i <= 0) return;
    // A saved beneficiary with a clean CoP result never saw the details step.
    const skipDetails = draft.step === 'amount' && draft.mode === 'saved' && !(draft.cop && draft.copKey);
    goTo(skipDetails ? 'who' : order[i - 1]!);
  }, [draft.step, draft.mode, draft.cop, draft.copKey, goTo]);

  const hasProgress = draft.step !== 'who' || !!draft.beneficiaryId;
  const countryDefaultCurrency = useCallback((cc: string): CurrencyCode => countryInfo(cc)?.currency ?? 'USD', []);

  return {
    ready, draft, update, goTo, back, reset, startWith, hasProgress, busy, error, setError, today,
    // beneficiary
    beneficiaries: beneficiariesQuery.data ?? [], beneficiariesLoading: beneficiariesQuery.isLoading,
    saved, payee, country, receiveCurrency, type, corridor, fields, schemaContext, resolvedBank, internal, isNewBeneficiary,
    selectSaved, startNew, lookupBank, resetBank, submitDetails, acceptSuggestedName, switchAccountType, continueDespiteCop, editSavedDetails, clearCop,
    countryDefaultCurrency,
    // amount
    balances, balancesLoading: balancesQuery.isLoading, limits, payFrom, setPayFrom, fxNeeded, fx, quote,
    setSendAmount, setReceiveAmount, sendMinor, receiveMinor, amountGbp, available,
    amountFieldError, amountIssues, detailErrors, attemptedAmount, amountStepValid, continueFromAmount,
    requirements, scheme, workingDaysOnly, scheduleHint, setReference, scheduled, paymentDate,
    uploads, uploadDocument, removeDocument, dismissUpload,
    // rail
    rails, railsLoading: railsQuery.isFetching && !railsQuery.data, selectedRail, chargeOption, chooseRail, chooseChargeOption, continueFromRail, breakdown,
    // review & confirm
    scamWarning, needsCoolingConfirm, canConfirm, confirm, completed, abandoned, resultPayment,
  };
}

export type PaymentWizard = ReturnType<typeof usePaymentWizard>;

/** Lightweight read of the stored draft, for the "Resume draft" card on the Payments page. */
export function useStoredWizardDraft() {
  const { storage } = useAdapters();
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    storage.getItem(WIZARD_DRAFT_KEY).then((raw) => {
      let parsed: WizardDraft | null = null;
      if (raw) {
        try {
          const d = JSON.parse(raw) as WizardDraft;
          if (d.step !== 'who' && d.step !== 'result') parsed = d;
        } catch { /* ignore */ }
      }
      setDraft(parsed);
      setLoaded(true);
    }, () => setLoaded(true));
  }, [storage]);

  useEffect(load, [load]);

  const discard = useCallback(async () => {
    await storage.removeItem(WIZARD_DRAFT_KEY).catch(() => undefined);
    setDraft(null);
  }, [storage]);

  return { draft, loaded, discard, reload: load };
}
