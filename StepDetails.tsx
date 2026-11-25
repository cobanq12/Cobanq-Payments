import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { PaymentWizard } from '@core/hooks/usePaymentWizard';
import { countryName } from '@core/lib/countries';
import { buildBeneficiarySchema, type BeneficiaryFormValues } from '@core/payments/beneficiarySchemas';
import { COP_ACK_TEXT, COP_UNAVAILABLE_ACK_TEXT } from '@core/payments/rules';
import { Button } from '../../../components/Button';
import { Checkbox, Input } from '../../../components/Form';
import { Alert, CountryFlag, Row } from '../../../components/Primitives';
import { BeneficiaryFields, defaultsFor } from '../../beneficiaries/BeneficiaryFields';
import { AccountRows } from '../PaymentBits';

/** Step 2b — Confirmation of Payee outcome, shown the way UK banks show it. */
function CopPanel({ wizard, onEdit }: { wizard: PaymentWizard; onEdit: () => void }) {
  const cop = wizard.draft.cop;
  const [ack, setAck] = useState(false);
  useEffect(() => setAck(false), [cop?.checkedAt]);
  if (!cop) return null;
  const isNew = wizard.draft.mode === 'new';
  const otherType = wizard.type === 'BUSINESS' ? 'personal' : 'business';
  const chosenType = wizard.type === 'BUSINESS' ? 'business' : 'individual';

  if (cop.result === 'MATCH' && !cop.accountTypeMismatch) {
    return (
      <Alert tone="success" title="Details match" live>
        <p className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden="true" />The name matches the account.</p>
      </Alert>
    );
  }

  if (cop.result === 'MATCH' && cop.accountTypeMismatch) {
    return (
      <Alert tone="warning" title={`This is a ${otherType} account`} live
        action={<>
          {isNew && <Button size="sm" onClick={wizard.switchAccountType}>Change to {otherType === 'personal' ? 'individual' : 'business'}</Button>}
          <Button size="sm" variant="secondary" onClick={onEdit}>Edit details</Button>
          <Button size="sm" variant="secondary" disabled={!ack} onClick={wizard.continueDespiteCop}>Continue anyway</Button>
        </>}>
        <p>The name matches, but the account is a {otherType} account and you selected {chosenType}. Check you have the right details.</p>
        <div className="mt-3"><Checkbox checked={ack} onChange={setAck}>I’ve checked and these details are correct.</Checkbox></div>
      </Alert>
    );
  }

  if (cop.result === 'CLOSE_MATCH') {
    return (
      <Alert tone="warning" title="The name is similar, but not the same" live
        action={<>
          <Button size="sm" onClick={wizard.acceptSuggestedName}>Use this name</Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>Edit details</Button>
        </>}>
        <p>The name is similar to the account name: <span className="font-semibold">{cop.suggestedName}</span>.</p>
        <p className="mt-1 text-muted">If this is who you mean to pay, use this name. If not, check the details with the beneficiary.</p>
      </Alert>
    );
  }

  if (cop.result === 'NO_MATCH') {
    return (
      <Alert tone="danger" title="The name doesn’t match the account holder" live
        action={<>
          <Button size="sm" onClick={onEdit}>Edit details</Button>
          <Button size="sm" variant="secondary" disabled={!ack} onClick={wizard.continueDespiteCop}>Continue anyway</Button>
        </>}>
        <p className="flex items-start gap-1.5"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Check the name, sort code and account number with the beneficiary, using contact details you trust. <strong>If you continue and this turns out to be a scam, you may not get your money back.</strong></span>
        </p>
        <div className="mt-3"><Checkbox checked={ack} onChange={setAck}>{COP_ACK_TEXT}</Checkbox></div>
      </Alert>
    );
  }

  return (
    <Alert tone="neutral" title="We couldn’t check this name right now" live
      action={<>
        <Button size="sm" variant="secondary" onClick={onEdit}>Edit details</Button>
        <Button size="sm" disabled={!ack} onClick={wizard.continueDespiteCop}>Continue</Button>
      </>}>
      <p className="flex items-start gap-1.5"><ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>The name-checking service isn’t available, or the beneficiary’s bank doesn’t support it. Double-check the details before you continue.</span>
      </p>
      <div className="mt-3"><Checkbox checked={ack} onChange={setAck}>{COP_UNAVAILABLE_ACK_TEXT}</Checkbox></div>
    </Alert>
  );
}

/** Saved beneficiary whose name check needs attention: show the details read-only with the result. */
function SavedReview({ wizard }: { wizard: PaymentWizard }) {
  const b = wizard.saved;
  if (!b) return null;
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line p-4">
        <dl>
          <Row label="Name" strong>{b.name}</Row>
          <AccountRows details={b.details} />
          {b.resolvedBank && <Row label="Bank">{b.resolvedBank}</Row>}
        </dl>
      </div>
      <p className="text-sm text-muted">It’s been more than 30 days since we last checked this name, so we checked it again.</p>
      <CopPanel wizard={wizard} onEdit={wizard.editSavedDetails} />
      <div className="flex justify-between border-t border-line pt-4">
        <Button variant="secondary" onClick={() => wizard.goTo('who')}>Back</Button>
      </div>
    </div>
  );
}

/** Step 2 — Beneficiary bank details. The form is built from the corridor's field config. */
export function StepDetails({ wizard }: { wizard: PaymentWizard }) {
  const { draft, fields } = wizard;
  const resolver = useMemo(() => zodResolver(buildBeneficiarySchema(fields)), [fields]);
  const form = useForm<BeneficiaryFormValues>({
    resolver,
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: defaultsFor(fields, draft.values, draft.country),
  });
  const [save, setSave] = useState(draft.save);
  const [nickname, setNickname] = useState(draft.nickname);

  // The business/individual switch changes which name fields exist: load the converted values.
  useEffect(() => {
    form.reset(defaultsFor(fields, draft.values, draft.country));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.type]);

  // Editing the name or account after a name check makes the result stale.
  const hasCop = !!draft.cop;
  const { clearCop } = wizard;
  useEffect(() => {
    if (!hasCop) return;
    const sub = form.watch((_values, info) => {
      if (info.type === 'change' && info.name && ['name', 'firstName', 'lastName', 'sortCode', 'accountNumber'].includes(info.name)) clearCop();
    });
    return () => sub.unsubscribe();
  }, [form, hasCop, clearCop]);

  if (draft.mode === 'saved') {
    return (
      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Check the beneficiary’s details</h2>
        <SavedReview wizard={wizard} />
      </div>
    );
  }

  const focusFirst = (): void => { wizard.clearCop(); form.setFocus(draft.type === 'BUSINESS' ? 'name' : 'firstName'); };
  const copBlocking = !!draft.cop && !(draft.cop.result === 'MATCH' && !draft.cop.accountTypeMismatch);

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => wizard.submitDetails(values, { save, nickname }))}>
      <h2 className="text-xl font-semibold text-ink">Beneficiary bank details</h2>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <CountryFlag country={draft.country} />
        <span>{countryName(draft.country)} · {draft.currency} · {draft.type === 'BUSINESS' ? 'Business' : 'Individual'}</span>
        <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => wizard.goTo('who')}>Change</button>
      </p>

      <div className="mt-6">
        <BeneficiaryFields
          fields={fields}
          control={form.control}
          errors={form.formState.errors}
          bank={draft.bank}
          onLookup={(kind, value) => { void wizard.lookupBank(kind, value); }}
          onResetBank={wizard.resetBank}
        />
      </div>

      <div className="mt-6 space-y-3 rounded-lg bg-subtle p-4">
        <Checkbox checked={save} onChange={setSave}>Save this beneficiary</Checkbox>
        {save && (
          <Input label="Nickname" optional value={nickname} maxLength={30} onChange={(e) => setNickname(e.target.value)} hint="Only you see this. It helps you find them next time." className="max-w-sm" />
        )}
      </div>

      {wizard.corridor === 'UK_GBP' && draft.cop && <div className="mt-6"><CopPanel wizard={wizard} onEdit={focusFirst} /></div>}

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="secondary" onClick={() => wizard.goTo('who')}>Back</Button>
        {!copBlocking && (
          <Button type="submit" size="lg" loading={wizard.busy === 'checking'}>
            {wizard.busy === 'checking' ? 'Checking name' : wizard.corridor === 'UK_GBP' && !draft.cop ? 'Check and continue' : 'Continue'}
          </Button>
        )}
      </div>
      {wizard.corridor === 'UK_GBP' && !draft.cop && (
        <p className="mt-2 text-right text-xs text-muted">We’ll check the name against the account before you continue (Confirmation of Payee).</p>
      )}
    </form>
  );
}
