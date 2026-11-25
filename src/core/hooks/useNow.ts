import { useEffect, useState } from 'react';
import { now } from '../lib/clock';

/** The (mockable) current time, refreshed on an interval so cut-offs and countdowns stay accurate. */
export function useNow(intervalMs = 30_000): Date {
  const [value, setValue] = useState<Date>(() => now());
  useEffect(() => {
    const id = setInterval(() => setValue(now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return value;
}

/** Real epoch ms, ticking. For countdowns tied to server timestamps (quote locks, SCA resend). */
export function useTicker(intervalMs = 250, enabled = true): number {
  const [value, setValue] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setValue(Date.now());
    const id = setInterval(() => setValue(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return value;
}
