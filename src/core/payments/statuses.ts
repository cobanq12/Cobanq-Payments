import type { BatchRowStatus, BatchStatus, CopResult, PaymentStatus } from '../api/types';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Icon names are abstract; each platform maps them to its own icon set. */
export type StatusIcon = 'file' | 'calendar' | 'user-check' | 'loader' | 'search' | 'send' | 'check' | 'undo' | 'x' | 'ban';

export interface StatusMeta { label: string; tone: Tone; icon: StatusIcon }

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'file' },
  SCHEDULED: { label: 'Scheduled', tone: 'info', icon: 'calendar' },
  AWAITING_APPROVAL: { label: 'Awaiting approval', tone: 'warning', icon: 'user-check' },
  PROCESSING: { label: 'Processing', tone: 'info', icon: 'loader' },
  IN_REVIEW: { label: 'In review', tone: 'warning', icon: 'search' },
  SENT: { label: 'Sent', tone: 'info', icon: 'send' },
  COMPLETED: { label: 'Completed', tone: 'success', icon: 'check' },
  RETURNED: { label: 'Returned', tone: 'danger', icon: 'undo' },
  FAILED: { label: 'Failed', tone: 'danger', icon: 'x' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'ban' },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: 'x' },
};

export const PAYMENT_STATUS_ORDER: PaymentStatus[] = [
  'DRAFT', 'SCHEDULED', 'AWAITING_APPROVAL', 'PROCESSING', 'IN_REVIEW', 'SENT', 'COMPLETED', 'RETURNED', 'FAILED', 'CANCELLED', 'REJECTED',
];

export const BATCH_STATUS: Record<BatchStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'file' },
  AWAITING_APPROVAL: { label: 'Awaiting approval', tone: 'warning', icon: 'user-check' },
  SCHEDULED: { label: 'Scheduled', tone: 'info', icon: 'calendar' },
  PROCESSING: { label: 'Processing', tone: 'info', icon: 'loader' },
  COMPLETED: { label: 'Completed', tone: 'success', icon: 'check' },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: 'x' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'ban' },
};

export const BATCH_ROW_STATUS: Record<BatchRowStatus, StatusMeta> = {
  PENDING: { label: 'Waiting', tone: 'neutral', icon: 'file' },
  SCHEDULED: { label: 'Scheduled', tone: 'info', icon: 'calendar' },
  PROCESSING: { label: 'Processing', tone: 'info', icon: 'loader' },
  SENT: { label: 'Sent', tone: 'info', icon: 'send' },
  COMPLETED: { label: 'Paid', tone: 'success', icon: 'check' },
  FAILED: { label: 'Failed', tone: 'danger', icon: 'x' },
};

export const COP_META: Record<CopResult, { label: string; tone: Tone }> = {
  MATCH: { label: 'Name matched', tone: 'success' },
  CLOSE_MATCH: { label: 'Close match', tone: 'warning' },
  NO_MATCH: { label: 'Name not matched', tone: 'danger' },
  UNAVAILABLE: { label: 'Name not checked', tone: 'neutral' },
};

export function canCancel(status: PaymentStatus): boolean {
  return status === 'SCHEDULED' || status === 'AWAITING_APPROVAL';
}

export function isFinal(status: PaymentStatus): boolean {
  return status === 'COMPLETED' || status === 'RETURNED' || status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED';
}

/** Statuses whose amount counts towards the daily limit. */
export function countsTowardsLimit(status: PaymentStatus): boolean {
  return status !== 'DRAFT' && status !== 'FAILED' && status !== 'CANCELLED' && status !== 'REJECTED' && status !== 'RETURNED';
}
