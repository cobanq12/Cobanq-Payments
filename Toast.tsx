import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './cn';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface ToastInput { title: string; body?: string; tone?: ToastTone; action?: { label: string; onClick: () => void } }
interface ToastItem extends ToastInput { id: number }

const ToastContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

const ICONS = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info } as const;
const COLOURS: Record<ToastTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info' };

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((t: ToastInput) => {
    const id = nextId++;
    setItems((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:flex-col-reverse sm:items-end" aria-live="polite" aria-atomic="false">
        {items.map((t) => {
          const tone = t.tone ?? 'info';
          const Icon = ICONS[tone];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-lg animate-fade-in">
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', COLOURS[tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm text-muted">{t.body}</p>}
                {t.action && (
                  <button type="button" className="mt-2 text-sm font-semibold text-accent-text hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" aria-label="Dismiss" className="rounded p-1 text-muted hover:bg-subtle hover:text-ink" onClick={() => dismiss(t.id)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): { push: (t: ToastInput) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider is missing');
  return ctx;
}
