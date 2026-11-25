import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { friendlyError, isApiError } from '../api/errors';
import type { ScaChallenge, VerifyScaResponse } from '../api/types';
import { SCA } from '../config';
import { useTicker } from './useNow';

export type ScaMethod = 'code' | 'push';
export type ScaStatus = 'closed' | 'loading' | 'ready' | 'verifying' | 'waitingPush' | 'approved' | 'locked';

export interface UseScaOptions {
  onApproved?: (res: VerifyScaResponse) => void;
  /** Called when the customer closes the dialog without approving. */
  onCancelled?: (challengeId: string) => void;
}

/**
 * Strong customer authentication flow: one-time code with auto-submit,
 * resend countdown, three attempts then a five-minute lock, and a push-approval alternative.
 */
export function useSca(options: UseScaOptions = {}) {
  const qc = useQueryClient();
  const [challenge, setChallenge] = useState<ScaChallenge | null>(null);
  const [status, setStatus] = useState<ScaStatus>('closed');
  const [method, setMethodState] = useState<ScaMethod>('code');
  const [code, setCodeState] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(SCA.maxAttempts);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number>(0);
  const opts = useRef(options);
  opts.current = options;
  const session = useRef(0);
  /** Set as soon as the server approves, so closing afterwards is never treated as a cancel. */
  const approved = useRef(false);

  const active = status !== 'closed';
  const nowMs = useTicker(500, active);
  const lockedSeconds = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - nowMs) / 1000)) : 0;
  const resendIn = Math.max(0, Math.ceil((resendAt - nowMs) / 1000));

  // Unlock automatically when the lock runs out.
  useEffect(() => {
    if (status === 'locked' && lockedUntil && lockedSeconds === 0) {
      setLockedUntil(null);
      setAttemptsLeft(SCA.maxAttempts);
      setError(null);
      setStatus('ready');
    }
  }, [status, lockedUntil, lockedSeconds]);

  const open = useCallback(async (challengeId: string) => {
    const mine = ++session.current;
    approved.current = false;
    setStatus('loading');
    setCodeState('');
    setError(null);
    setMethodState('code');
    setResendAt(Date.now() + SCA.resendAfterSeconds * 1000);
    try {
      const c = await api.getScaChallenge(challengeId);
      if (session.current !== mine) return;
      setChallenge(c);
      setAttemptsLeft(c.attemptsLeft);
      if (c.lockedUntil) {
        setLockedUntil(new Date(c.lockedUntil).getTime());
        setStatus('locked');
      } else setStatus('ready');
    } catch (e) {
      if (session.current !== mine) return;
      setError(friendlyError(e));
      setStatus('ready');
    }
  }, []);

  const close = useCallback(() => {
    session.current++;
    const id = challenge?.challengeId;
    const wasApproved = approved.current || status === 'approved';
    setStatus('closed');
    setChallenge(null);
    setCodeState('');
    setError(null);
    if (id && !wasApproved) opts.current.onCancelled?.(id);
  }, [challenge, status]);

  const handleFailure = useCallback((e: unknown) => {
    if (isApiError(e) && e.code === 'SCA_LOCKED') {
      setLockedUntil(Number(e.meta?.lockedUntil ?? Date.now() + SCA.lockMinutes * 60_000));
      setAttemptsLeft(0);
      setStatus('locked');
      setError(null);
    } else if (isApiError(e) && e.code === 'SCA_INVALID_CODE') {
      const left = Number(e.meta?.attemptsLeft ?? 0);
      setAttemptsLeft(left);
      setError(`That code isn’t right. You have ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`);
      setStatus('ready');
    } else {
      setError(friendlyError(e));
      setStatus('ready');
    }
    setCodeState('');
  }, []);

  const handleApproved = useCallback(async (res: VerifyScaResponse) => {
    approved.current = true;
    setStatus('approved');
    await qc.invalidateQueries();
    opts.current.onApproved?.(res);
  }, [qc]);

  const submit = useCallback(async (value?: string) => {
    const c = challenge;
    const entered = value ?? code;
    if (!c || entered.length !== SCA.codeLength || status === 'verifying') return;
    const mine = session.current;
    setStatus('verifying');
    setError(null);
    try {
      const res = await api.verifySca({ challengeId: c.challengeId, code: entered });
      if (session.current !== mine) return;
      await handleApproved(res);
    } catch (e) {
      if (session.current !== mine) return;
      handleFailure(e);
    }
  }, [challenge, code, status, handleApproved, handleFailure]);

  const setCode = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, SCA.codeLength);
    setCodeState(digits);
    if (error) setError(null);
    if (digits.length === SCA.codeLength) void submit(digits);
  }, [error, submit]);

  const approveWithPush = useCallback(async () => {
    const c = challenge;
    if (!c || status === 'waitingPush') return;
    const mine = session.current;
    setStatus('waitingPush');
    setError(null);
    try {
      const res = await api.verifySca({ challengeId: c.challengeId, method: 'push' });
      if (session.current !== mine) return;
      await handleApproved(res);
    } catch (e) {
      if (session.current !== mine) return;
      handleFailure(e);
    }
  }, [challenge, status, handleApproved, handleFailure]);

  const setMethod = useCallback((m: ScaMethod) => {
    if (status === 'verifying' || status === 'waitingPush' || status === 'approved') return;
    setMethodState(m);
    setError(null);
  }, [status]);

  const resend = useCallback(async () => {
    if (!challenge || resendIn > 0) return;
    setResendAt(Date.now() + SCA.resendAfterSeconds * 1000);
    try { await api.resendScaCode(challenge.challengeId); } catch (e) { setError(friendlyError(e)); }
  }, [challenge, resendIn]);

  return {
    isOpen: active, status, challenge, method, setMethod, code, setCode, submit, approveWithPush,
    error, attemptsLeft, lockedSeconds, resendIn, resend, open, close, codeLength: SCA.codeLength,
  };
}

export type ScaController = ReturnType<typeof useSca>;
