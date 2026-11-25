import type { ApiErrorCode, ApiErrorShape } from './types';

/** The single typed error every API function throws. */
export class ApiError extends Error implements ApiErrorShape {
  readonly code: ApiErrorCode;
  readonly field?: string;
  /** Extra machine-readable context (e.g. attempts left, lock expiry). */
  readonly meta?: Record<string, string | number>;

  constructor(code: ApiErrorCode, message: string, field?: string, meta?: Record<string, string | number>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.field = field;
    this.meta = meta;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Friendly copy per error code. The UI shows these, never raw server text. */
const FRIENDLY: Record<ApiErrorCode, string> = {
  VALIDATION: 'Some details need another look. Check the highlighted fields.',
  NOT_FOUND: 'We couldn’t find that. It may have been removed.',
  INSUFFICIENT_FUNDS: 'There isn’t enough available balance for this payment.',
  LIMIT_EXCEEDED: 'This is above your limit for a single payment.',
  DAILY_LIMIT_EXCEEDED: 'This would take you over your daily limit.',
  FX_QUOTE_EXPIRED: 'The rate has updated. Review the new rate and confirm again.',
  RAIL_NOT_ELIGIBLE: 'That way of sending isn’t available for this payment. Choose another.',
  DUPLICATE_SUSPECTED: 'This looks like a payment you made earlier today.',
  SCA_INVALID_CODE: 'That code isn’t right. Check it and try again.',
  SCA_LOCKED: 'Too many incorrect codes. Try again in a few minutes.',
  SCA_EXPIRED: 'This approval request has expired. Start again.',
  NOT_PERMITTED: 'You don’t have permission to do that.',
  COP_UNAVAILABLE: 'We couldn’t check this name right now.',
  FILE_TOO_LARGE: 'That file is too large. The maximum is 10 MB.',
  FILE_TYPE: 'That file type isn’t supported. Upload a PDF or JPG.',
  NETWORK: 'We couldn’t reach Cobanq. Check your connection and try again.',
  UNKNOWN: 'Something went wrong. Try again.',
};

export function friendlyError(e: unknown): string {
  if (isApiError(e)) return FRIENDLY[e.code] ?? e.message;
  return FRIENDLY.UNKNOWN;
}

export function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  return new ApiError('UNKNOWN', e instanceof Error ? e.message : 'Unknown error');
}
