import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const base = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  accent: 'bg-accent text-accent-fg hover:brightness-95',
  secondary: 'border border-strong bg-surface text-ink hover:bg-subtle',
  ghost: 'text-accent-text hover:bg-accent-soft',
  danger: 'bg-danger text-white hover:brightness-110 dark:text-[#2A0B08]',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, block, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ to, state, variant = 'primary', size = 'md', icon, block, className, children }: {
  to: To; state?: unknown; variant?: Variant; size?: Size; icon?: ReactNode; block?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <Link to={to} state={state} className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
