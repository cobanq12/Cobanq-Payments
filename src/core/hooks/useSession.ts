import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAdapters } from '../adapters';
import { SESSION } from '../config';

const AUTH_KEY = 'cobanq.session';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SessionValue {
  status: SessionStatus;
  /** Why the last session ended, shown on the sign-in screen. */
  signedOutReason: 'idle' | 'manual' | null;
  signIn(): Promise<void>;
  signOut(reason?: 'idle' | 'manual'): Promise<void>;
  /** True once the user has been idle long enough to warn them. */
  idleWarning: boolean;
  /** Seconds until automatic sign-out, while the warning shows. */
  secondsToLogout: number;
  /** Report user activity (the platform wires this to its input events). */
  touch(): void;
  /** Keep the session going from the idle warning. */
  stay(): void;
  /** Test helper: pretend the user has been idle for `ms`. */
  simulateIdle(ms: number): void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Mock session with an idle timeout: warn after 10 minutes without activity,
 * sign out at 15. Payment drafts live in storage, so they survive the sign-out.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { storage } = useAdapters();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [signedOutReason, setReason] = useState<'idle' | 'manual' | null>(null);
  const [idleMs, setIdleMs] = useState(0);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    storage.getItem(AUTH_KEY).then(
      (v) => { if (alive) setStatus(v === 'out' ? 'signedOut' : 'signedIn'); },
      () => { if (alive) setStatus('signedIn'); },
    );
    return () => { alive = false; };
  }, [storage]);

  const signIn = useCallback(async () => {
    lastActivity.current = Date.now();
    setIdleMs(0);
    setReason(null);
    setStatus('signedIn');
    await storage.setItem(AUTH_KEY, 'in').catch(() => undefined);
  }, [storage]);

  const signOut = useCallback(async (reason: 'idle' | 'manual' = 'manual') => {
    setReason(reason);
    setStatus('signedOut');
    await storage.setItem(AUTH_KEY, 'out').catch(() => undefined);
  }, [storage]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      setIdleMs(idle);
      if (idle >= SESSION.logoutAfterMs) void signOut('idle');
    }, 1000);
    return () => clearInterval(id);
  }, [status, signOut]);

  const idleWarning = status === 'signedIn' && idleMs >= SESSION.warnAfterMs;

  const touch = useCallback(() => {
    // Once the warning is showing, only an explicit "Stay signed in" resets the timer.
    if (Date.now() - lastActivity.current < SESSION.warnAfterMs) lastActivity.current = Date.now();
  }, []);

  const stay = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleMs(0);
  }, []);

  const simulateIdle = useCallback((ms: number) => {
    lastActivity.current = Date.now() - ms;
    setIdleMs(ms);
  }, []);

  const value = useMemo<SessionValue>(() => ({
    status, signedOutReason, signIn, signOut, idleWarning,
    secondsToLogout: Math.max(0, Math.ceil((SESSION.logoutAfterMs - idleMs) / 1000)),
    touch, stay, simulateIdle,
  }), [status, signedOutReason, signIn, signOut, idleWarning, idleMs, touch, stay, simulateIdle]);

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('SessionProvider is missing');
  return ctx;
}
