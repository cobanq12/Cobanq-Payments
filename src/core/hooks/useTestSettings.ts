import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMockControls } from '../api/client';
import type { TestSettings } from '../api/mock';
import type { Money } from '../api/types';
import { getClockOffset, now } from '../lib/clock';
import { fromUkWallTime, toUkTime, type IsoDate } from '../lib/dates';
import { qk } from './queryKeys';

/** Test-panel state. Everything here is a no-op when the real backend is in use. */
export function useTestSettings() {
  const controls = getMockControls();
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries();

  const query = useQuery({
    queryKey: qk.testSettings,
    queryFn: () => controls!.getSettings(),
    enabled: !!controls,
  });

  const update = useMutation({
    mutationFn: (patch: Partial<TestSettings>) => controls!.updateSettings(patch),
    onSuccess: refresh,
  });

  const reset = useMutation({ mutationFn: () => controls!.reset(), onSuccess: refresh });
  const addFunds = useMutation({ mutationFn: (m: Money) => controls!.addFunds(m), onSuccess: refresh });

  /** Set the mock clock to a UK wall-clock date and time. Time keeps running from there. */
  const setUkTime = (date: IsoDate, minutes: number): void => {
    const target = fromUkWallTime(date, minutes).getTime();
    update.mutate({ clockOffsetMs: target - Date.now() });
  };

  const useRealTime = (): void => update.mutate({ clockOffsetMs: 0 });

  return {
    available: !!controls,
    settings: query.data,
    otp: controls?.otp ?? '',
    update: update.mutate,
    reset: reset.mutateAsync,
    addFunds: addFunds.mutate,
    setUkTime,
    useRealTime,
    ukNow: toUkTime(now()),
    timeShifted: getClockOffset() !== 0,
  };
}
