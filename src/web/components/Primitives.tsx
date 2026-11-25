import type { HTMLAttributes, ReactNode } from 'react';
import {
  AlertTriangle, Ban, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, Info, Loader2, Search, Send, Undo2, UserCheck, X, XCircle,
} from 'lucide-react';
import type { PaymentStatus, RailId } from '@core/api/types';
import { flagEmoji } from '@core/lib/countries';
import { currencyInfo } from '@core/lib/currencies';
import { RAIL_NAMES } from '@core/payments/railConfig';
import { PAYMENT_STATUS, type StatusIcon, type StatusMeta, type Tone } from '@core/payments/statuses';
import { cn } from './cn';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-subtle text-muted',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', toneClasses[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const STATUS_ICONS: Record<StatusIcon, typeof Check> = {
  file: FileText, calendar: CalendarClock, 'user-check': UserCheck, loader: Loader2, search: Search, send: Send, check: Check, undo: Undo2, x: X, ban: Ban,
};

/** Status badge: icon + colour + text, so the status never relies on colour alone. */
export function StatusBadge({ meta }: { meta: StatusMeta }) {
  const Icon = STATUS_ICONS[meta.icon];
  return <Badge tone={meta.tone} icon={<Icon className={cn('h-3 w-3', meta.icon === 'loader' && 'animate-spin')} aria-hidden="true" />}>{meta.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <StatusBadge meta={PAYMENT_STATUS[status]} />;
}

export function RailBadge({ rail }: { rail: RailId }) {
  return <span className="inline-flex whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-xs font-medium text-ink">{RAIL_NAMES[rail]}</span>;
}

const alertIcon: Record<Tone, typeof Info> = { neutral: Info, info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
const alertBorder: Record<Tone, string> = {
  neutral: 'border-line', info: 'border-info/30', success: 'border-success/30', warning: 'border-warning/40', danger: 'border-danger/40',
};

export function Alert({ tone = 'info', title, children, action, className, live }: {
  tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode; className?: string; live?: boolean;
}) {
  const Icon = alertIcon[tone];
  return (
    <div role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined} className={cn('flex gap-3 rounded-lg border p-4', toneClasses[tone], alertBorder[tone], className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('text-ink', title && 'mt-1')}>{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-subtle', className)} aria-hidden="true" />;
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Round flag chip for a currency (EU flag for the euro). The code is always shown next to it. */
export function CurrencyFlag({ currency, size = 'md' }: { currency: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'h-10 w-10 text-xl' : size === 'sm' ? 'h-6 w-6 text-sm' : 'h-8 w-8 text-base';
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-subtle leading-none', s)} aria-hidden="true">
      {flagEmoji(currencyInfo(currency).flag)}
    </span>
  );
}

export function CountryFlag({ country }: { country: string }) {
  return <span aria-hidden="true" className="leading-none">{flagEmoji(country)}</span>;
}

export function Avatar({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text', className)} aria-hidden="true">
      {text}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = 'inline-flex h-9 items-center gap-1 rounded-md border border-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" aria-label="Pagination">
      <p className="text-sm text-muted num">Showing {from}–{to} of {total}</p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
        </button>
        <span className="text-sm text-muted num">Page {page} of {pages}</span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/** Definition row used in summaries and the detail drawer. */
export function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className={cn('max-w-[68%] shrink-0 break-words text-right text-ink', strong && 'font-semibold')}>{children}</dd>
    </div>
  );
}

/** Countdown ring for the FX quote lock. */
export function RingTimer({ fraction, seconds, size = 36 }: { fraction: number; seconds: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="timer" aria-label={`Rate locked for ${seconds} more seconds`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" className="stroke-line" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          className={cn('transition-[stroke-dashoffset] duration-300 ease-linear', seconds <= 5 ? 'stroke-warning' : 'stroke-accent')}
          strokeDasharray={c} strokeDashoffset={c * (1 - fraction)}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-ink num" aria-hidden="true">{seconds}</span>
    </span>
  );
}
