import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AppNotification } from '../api/types';
import { POLL, qk } from './queryKeys';

/** Payment status updates for the bell, with a callback for each new one (used for toasts). */
export function useNotifications(onNew?: (n: AppNotification) => void) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: qk.notifications, queryFn: () => api.listNotifications(), refetchInterval: POLL.notifications });
  const seen = useRef<Set<string> | null>(null);
  const callback = useRef(onNew);
  callback.current = onNew;

  useEffect(() => {
    const list = query.data;
    if (!list) return;
    if (seen.current === null) {
      // First load: don't replay old notifications as toasts.
      seen.current = new Set(list.map((n) => n.id));
      return;
    }
    const fresh = list.filter((n) => !seen.current!.has(n.id));
    for (const n of fresh.reverse()) {
      seen.current.add(n.id);
      callback.current?.(n);
    }
    if (fresh.length > 0) void qc.invalidateQueries({ queryKey: qk.balances });
  }, [query.data, qc]);

  const markRead = useMutation({
    mutationFn: () => api.markNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const notifications = query.data ?? [];
  return { notifications, unread: notifications.filter((n) => !n.read).length, markRead: markRead.mutate };
}
