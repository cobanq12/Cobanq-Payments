/** zod schemas for the payment wizard's amount step and small forms. */
import { z } from 'zod';
import type { RecurrenceFrequency } from '../api/types';
import { isWorkingDay, type IsoDate } from '../lib/dates';
import type { Requirements } from './rules';
import { validateReference, type ReferenceScheme } from './validators';

export interface PaymentDetailsValues {
  reference: string;
  purpose: string;
  purposeOther: string;
  purposeCode: string;
  sourceOfFunds: string;
  dateMode: 'today' | 'scheduled';
  scheduledDate: string;
  recurring: boolean;
  frequency: RecurrenceFrequency;
  endMode: 'never' | 'date' | 'count';
  endDate: string;
  count: string;
}

export interface PaymentDetailsContext {
  scheme: ReferenceScheme;
  requirements: Requirements;
  today: IsoDate;
  /** True when every rail for this corridor runs on UK working days only. */
  workingDaysOnly: boolean;
}

export function buildPaymentDetailsSchema(ctx: PaymentDetailsContext): z.ZodType<PaymentDetailsValues> {
  return z.object({
    reference: z.string(),
    purpose: z.string(),
    purposeOther: z.string(),
    purposeCode: z.string(),
    sourceOfFunds: z.string(),
    dateMode: z.enum(['today', 'scheduled']),
    scheduledDate: z.string(),
    recurring: z.boolean(),
    frequency: z.enum(['WEEKLY', 'MONTHLY']),
    endMode: z.enum(['never', 'date', 'count']),
    endDate: z.string(),
    count: z.string(),
  }).superRefine((v, c) => {
    const issue = (path: keyof PaymentDetailsValues, message: string): void => { c.addIssue({ code: z.ZodIssueCode.custom, path: [path], message }); };

    const ref = v.reference.trim();
    if (ref === '') issue('reference', 'Enter a reference so the beneficiary can recognise the payment.');
    else {
      const e = validateReference(ref, ctx.scheme);
      if (e) issue('reference', e);
    }

    if (ctx.requirements.purposeRequired && v.purpose === '') issue('purpose', 'Choose the purpose of this payment.');
    if (v.purpose === 'OTHER' && v.purposeOther.trim().length < 3) issue('purposeOther', 'Tell us what this payment is for.');
    if (ctx.requirements.purposeCodes && v.purposeCode === '') issue('purposeCode', 'Choose a purpose code. It’s required for this country.');
    if (ctx.requirements.sourceOfFundsRequired && v.sourceOfFunds === '') issue('sourceOfFunds', 'Choose the source of funds for this payment.');

    if (v.dateMode === 'scheduled') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.scheduledDate)) issue('scheduledDate', 'Choose a date.');
      else if (v.scheduledDate <= ctx.today) issue('scheduledDate', 'Choose a date after today.');
      else if (ctx.workingDaysOnly && !isWorkingDay(v.scheduledDate)) issue('scheduledDate', 'Choose a UK working day. This payment can’t be sent at weekends or on bank holidays.');
    }

    if (v.recurring) {
      const start = v.dateMode === 'scheduled' ? v.scheduledDate : ctx.today;
      if (v.endMode === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v.endDate)) issue('endDate', 'Choose an end date.');
        else if (v.endDate <= start) issue('endDate', 'The end date must be after the first payment.');
      }
      if (v.endMode === 'count') {
        const n = Number(v.count);
        if (!/^\d+$/.test(v.count) || n < 2 || n > 120) issue('count', 'Enter a number of payments between 2 and 120.');
      }
    }
  }) as z.ZodType<PaymentDetailsValues>;
}

export const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'Give a short reason so the maker knows what to fix.').max(200, 'Use 200 characters or fewer.'),
});
export type RejectValues = z.infer<typeof rejectSchema>;

export const problemSchema = z.object({
  category: z.enum(['SCAM', 'WRONG_DETAILS', 'NOT_ARRIVED', 'OTHER']),
  description: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(1000, 'Use 1,000 characters or fewer.'),
});
export type ProblemValues = z.infer<typeof problemSchema>;

export const newBeneficiaryStartSchema = z.object({
  country: z.string().length(2, 'Choose a country.'),
  currency: z.string().length(3, 'Choose a currency.'),
  type: z.enum(['BUSINESS', 'INDIVIDUAL']),
});
export type NewBeneficiaryStartValues = z.infer<typeof newBeneficiaryStartSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type SignInValues = z.infer<typeof signInSchema>;
