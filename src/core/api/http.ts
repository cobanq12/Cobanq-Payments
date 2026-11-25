/**
 * Real backend implementation of ApiClient. Used when USE_MOCK is false.
 * Each function maps to one REST endpoint; adjust paths to match the live API.
 * Errors are normalised to ApiError so the UI behaves the same as with the mock.
 */
import { ApiError } from './errors';
import type { ApiClient } from './client';
import type { ApiErrorCode, ApiErrorShape } from './types';

type Json = Record<string, unknown> | unknown[] | undefined;

function toQuery(params: object | undefined): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'ALL') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient {
  async function request<T>(method: string, path: string, body?: Json): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK', 'Network request failed');
    }
    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data ?? {}) as Partial<ApiErrorShape>;
      throw new ApiError((e.code as ApiErrorCode) ?? 'UNKNOWN', e.message ?? `Request failed (${res.status})`, e.field);
    }
    return data as T;
  }

  const get = <T>(path: string): Promise<T> => request<T>('GET', path);
  const post = <T>(path: string, body?: Json): Promise<T> => request<T>('POST', path, body ?? {});

  return {
    getAccount: () => get('/account'),
    getBalances: () => get('/balances'),
    getLimits: () => get('/limits'),

    listBeneficiaries: (query) => get(`/beneficiaries${toQuery(query)}`),
    createBeneficiary: (b) => post('/beneficiaries', { ...b }),
    updateBeneficiary: (id, b) => request('PUT', `/beneficiaries/${id}`, { ...b }),
    deleteBeneficiary: (id) => request('DELETE', `/beneficiaries/${id}`),
    lookupBank: (req) => post('/bank-lookup', { ...req }),
    checkPayee: (req) => post('/confirmation-of-payee', { ...req }),

    getRails: (input) => post('/rails', { ...input }),
    getFxQuote: (req) => post('/fx/quotes', { ...req }),
    convert: (req) => post('/fx/conversions', { ...req }),
    getRateHistory: (pair) => get(`/fx/history${toQuery({ pair })}`),
    getIndicativeRates: (base) => get(`/fx/rates${toQuery({ base })}`),

    createPayment: (draft) => post('/payments', { ...draft }),
    listPayments: (filters) => get(`/payments${toQuery(filters)}`),
    getPayment: (id) => get(`/payments/${id}`),
    approvePayment: (id) => post(`/approvals/${id}/approve`),
    rejectPayment: (id, reason) => post(`/approvals/${id}/reject`, { reason }),
    cancelPayment: (id) => post(`/payments/${id}/cancel`),
    listApprovals: () => get('/approvals'),
    // Replace with a multipart upload that carries the file bytes from the platform file adapter.
    uploadDocument: (file, paymentId) => post('/documents', { ...file, paymentId }),
    reportProblem: (report) => post(`/payments/${report.paymentId}/problems`, { ...report }),

    getScaChallenge: (id) => get(`/sca/${id}`),
    resendScaCode: (id) => post(`/sca/${id}/resend`),
    verifySca: (req) => post(`/sca/${req.challengeId}/verify`, { ...req }),

    validateBulkFile: (rows) => post('/bulk/validate', { rows }),
    submitBulk: (batch) => post('/bulk', { ...batch }),
    listBatches: () => get('/bulk'),
    getBatch: (id) => get(`/bulk/${id}`),

    listNotifications: () => get('/notifications'),
    markNotificationsRead: () => post('/notifications/read'),
  };
}
