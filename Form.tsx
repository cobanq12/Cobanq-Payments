import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { currencyInfo } from '@core/lib/currencies';
import { cn } from './cn';

const control = 'w-full rounded-md border bg-surface px-3 text-ink placeholder:text-muted/70 transition-colors disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted';
const borderOk = 'border-strong hover:border-ink/60 focus:border-focus';
const borderBad = 'border-danger';

export interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Extra content on the label row, e.g. a character counter. */
  aside?: ReactNode;
  /** Content under the control, e.g. the resolved bank name. */
  below?: ReactNode;
}

/** Label + hint + error wiring shared by every control. Errors are announced via aria-live. */
export function FieldShell({ id, label, hint, error, optional, className, aside, below, children }: FieldShellProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
        </label>
        {aside && <span className="text-xs text-muted num">{aside}</span>}
      </div>
      {children}
      {below}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      <div aria-live="polite">
        {error && (
          <p id={`${id}-error`} className="flex items-start gap-1.5 text-xs font-medium text-danger">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>, FieldShellProps {
  numeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, className, aside, below, numeric, ...rest }, ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className} aside={aside} below={below}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        inputMode={numeric ? 'numeric' : rest.inputMode}
        className={cn(control, 'h-11', numeric && 'num', error ? borderBad : borderOk)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>, FieldShellProps {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, className, aside, below, options, placeholder, ...rest }, ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className} aside={aside} below={below}>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, 'h-11 pr-8', error ? borderBad : borderOk)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
});

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>, FieldShellProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, className, aside, below, ...rest }, ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className} aside={aside} below={below}>
      <textarea
        ref={ref}
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, 'py-2.5', error ? borderBad : borderOk)}
        {...rest}
      />
    </FieldShell>
  );
});

export function Checkbox({ checked, onChange, children, error, disabled }: {
  checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; error?: string | null; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={error ? true : undefined}
            className={cn('peer h-5 w-5 cursor-pointer appearance-none rounded border bg-surface checked:border-primary checked:bg-primary disabled:cursor-not-allowed', error ? 'border-danger' : 'border-strong')}
          />
          <Check className="pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 text-primary-fg peer-checked:block" strokeWidth={3} aria-hidden="true" />
        </span>
        <label htmlFor={id} className="cursor-pointer text-sm text-ink">{children}</label>
      </div>
      <div aria-live="polite">{error && <p className="mt-1 pl-8 text-xs font-medium text-danger">{error}</p>}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <span id={id} className="text-sm font-medium text-ink">{label}</span>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors', checked ? 'border-primary bg-primary' : 'border-strong bg-subtle')}
      >
        <span className={cn('absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all', checked ? 'left-[22px] bg-primary-fg' : 'left-0.5 bg-muted')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

/** Large, confident amount field with the currency shown alongside. */
export function AmountInput({ label, currency, value, onChange, error, hint, disabled, loading, autoFocus, flash, aside }: {
  label: string; currency: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: ReactNode;
  disabled?: boolean; loading?: boolean; autoFocus?: boolean; flash?: boolean; aside?: ReactNode;
}) {
  const id = useId();
  const decimals = currencyInfo(currency).decimals;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} aside={aside}>
      <div className={cn('flex h-16 items-center rounded-lg border bg-surface transition-colors focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/40', error ? borderBad : 'border-strong', flash && 'animate-flash')}>
        <input
          id={id}
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          inputMode={decimals === 0 ? 'numeric' : 'decimal'}
          autoComplete="off"
          placeholder={decimals === 0 ? '0' : '0.00'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className={cn('num h-full min-w-0 flex-1 rounded-lg bg-transparent px-4 text-2xl font-semibold text-ink outline-none placeholder:text-muted/50 focus-visible:outline-none', loading && 'text-muted')}
        />
        <span className="mr-4 shrink-0 text-base font-semibold text-muted">{currency}</span>
      </div>
    </FieldShell>
  );
}
