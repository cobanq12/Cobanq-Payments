import type { BeneficiaryQuery, PaymentFilters } from '../api/types';

export const qk = {
  account: ['account'] as const,
  balances: ['balances'] as const,
  limits: ['limits'] as const,
  beneficiaries: (q?: BeneficiaryQuery) => ['beneficiaries', q ?? {}] as const,
  payments: (f?: PaymentFilters) => ['payments', f ?? {}] as const,
  payment: (id: string) => ['payment', id] as const,
  approvals: ['approvals'] as const,
  batches: ['batches'] as const,
  batch: (id: string) => ['batch', id] as const,
  notifications: ['notifications'] as const,
  rails: (key: unknown) => ['rails', key] as const,
  rateHistory: (pair: string) => ['rateHistory', pair] as const,
  indicativeRates: (base: string) => ['indicativeRates', base] as const,
  testSettings: ['testSettings'] as const,
};

/** Polling intervals (ms). With a real backend these would be replaced by push/webhooks. */
export const POLL = { payments: 2500, balances: 4000, notifications: 2500, approvals: 4000, batch: 1000 } as const;
