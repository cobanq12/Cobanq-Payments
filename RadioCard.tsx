import type { ReactNode } from 'react';
import { cn } from './cn';

/** Selectable card with radio semantics, used for rails, charge options and bulk choices. */
export function RadioCard({ name, value, checked, onChange, disabled, title, badge, children, className }: {
  name: string; value: string; checked: boolean; onChange: () => void; disabled?: boolean; title: ReactNode; badge?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <label className={cn(
      'relative flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
      checked ? 'border-primary bg-accent-soft/50 ring-1 ring-primary' : 'border-line bg-surface hover:border-strong',
      disabled && 'cursor-not-allowed opacity-60 hover:border-line',
      className,
    )}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', checked ? 'border-primary' : 'border-strong')} aria-hidden="true">
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {badge}
        </span>
        {children}
      </span>
    </label>
  );
}
