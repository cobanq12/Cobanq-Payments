import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { POLL, qk } from './queryKeys';

export function useAccount() {
  return useQuery({ queryKey: qk.account, queryFn: () => api.getAccount() });
}

export function useBalances() {
  return useQuery({ queryKey: qk.balances, queryFn: () => api.getBalances(), refetchInterval: POLL.balances });
}

export function useLimits() {
  return useQuery({ queryKey: qk.limits, queryFn: () => api.getLimits(), refetchInterval: POLL.balances });
}
