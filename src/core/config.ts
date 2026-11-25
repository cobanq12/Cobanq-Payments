/**
 * App-wide configuration shared by web and mobile.
 * USE_MOCK switches the API client between the in-memory mock and the real HTTP backend.
 */
export const USE_MOCK = true;

/** Base URL of the real backend, used only when USE_MOCK is false. */
export const API_BASE_URL = '/api/v1';

export const ENTITY = {
  tradingName: 'Cobanq',
  legalName: 'COBANQ LTD',
  address: 'Level39, One Canada Square, Canary Wharf, London E14 5AB',
  /** TODO: replace with the firm reference number before go-live. */
  frn: 'TBC',
} as const;

export function regulatoryLine(): string {
  return `${ENTITY.legalName}, ${ENTITY.address}. Authorised by the Financial Conduct Authority as an Authorised Payment Institution, FRN ${ENTITY.frn}.`;
}

export const SESSION = {
  /** Show the idle warning after this many ms without activity. */
  warnAfterMs: 10 * 60 * 1000,
  /** Sign the user out after this many ms without activity. */
  logoutAfterMs: 15 * 60 * 1000,
} as const;

export const SCA = {
  codeLength: 6,
  resendAfterSeconds: 30,
  maxAttempts: 3,
  lockMinutes: 5,
  /** Mock only: simulated push approval delay. */
  mockPushDelayMs: 4000,
  /** Mock only: the one-time code that always works. */
  mockCode: '123456',
} as const;
