import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { PaymentFilters, ProblemReport } from '../api/types';
import { isFinal } from '../payments/statuses';
import { railConfig } from '../payments/railConfig';
import { evaluateCutoff, formatHm, toUkTime } from '../lib/dates';
import { POLL, qk } from './queryKeys';
import { useNow } from './useNow';

/** Recent payments with search, filters and pagination. Polls so statuses update live. */
export function usePayments(filters: PaymentFilters) {
  return useQuery({
    queryKey: qk.payments(filters),
    queryFn: () => api.listPayments(filters),
    placeholderData: keepPreviousData,
    refetchInterval: POLL.payments,
  });
}

export function usePayment(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.payment(id ?? ''),
    queryFn: () => api.getPayment(id!),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data && isFinal(query.state.data.status) ? false : 1500),
  });
}

export function useApprovals() {
  return useQuery({ queryKey: qk.approvals, queryFn: () => api.listApprovals(), refetchInterval: POLL.approvals });
}

/** Approve, reject, cancel and problem reporting. */
export function usePaymentActions() {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries();
  const approve = useMutation({ mutationFn: (id: string) => api.approvePayment(id), onSuccess: refresh });
  const reject = useMutation({ mutationFn: (v: { id: string; reason: string }) => api.rejectPayment(v.id, v.reason), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (id: string) => api.cancelPayment(id), onSuccess: refresh });
  const report = useMutation({ mutationFn: (r: ProblemReport) => api.reportProblem(r), onSuccess: refresh });
  return { approve, reject, cancel, report };
}

export interface CutoffBanner {
  minutesLeft: number;
  message: string;
}

/** Banner shown on the Payments page when the CHAPS cut-off is close. */
export function useChapsCutoffBanner(): CutoffBanner | null {
  const nowDate = useNow(20_000);
  const r = evaluateCutoff(toUkTime(nowDate), railConfig.cutoffs.CHAPS);
  if (!r.sameDay || r.minutesLeft === undefined || r.minutesLeft > railConfig.chapsBannerMinutes) return null;
  const mins = r.minutesLeft;
  return {
    minutesLeft: mins,
    message: `CHAPS payments must be confirmed by ${formatHm(railConfig.cutoffs.CHAPS)} to arrive today — ${mins} ${mins === 1 ? 'minute' : 'minutes'} left.`,
  };
}
