import { Check } from 'lucide-react';
import { cn } from './cn';

export interface StepItem { id: string; label: string }

/** Progress stepper. Completed steps are buttons, so the customer can jump back. */
export function Stepper({ steps, current, onSelect }: { steps: StepItem[]; current: string; onSelect?: (id: string) => void }) {
  const index = steps.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Progress">
      <p className="mb-2 text-sm font-medium text-muted sm:hidden">
        Step {index + 1} of {steps.length} · <span className="text-ink">{steps[index]?.label}</span>
      </p>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {steps.map((s, i) => {
          const done = i < index;
          const active = i === index;
          const dot = (
            <span className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold num',
              done && 'border-primary bg-primary text-primary-fg',
              active && 'border-primary bg-surface text-ink ring-2 ring-primary/20',
              !done && !active && 'border-line bg-surface text-muted',
            )}>
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
            </span>
          );
          const text = <span className={cn('hidden text-sm sm:inline', active ? 'font-semibold text-ink' : 'text-muted')}>{s.label}</span>;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? 'step' : undefined}>
              {done && onSelect ? (
                <button type="button" onClick={() => onSelect(s.id)} className="flex items-center gap-2 rounded-md hover:opacity-80" aria-label={`Go back to ${s.label}`}>
                  {dot}{text}
                </button>
              ) : (
                <span className="flex items-center gap-2">{dot}{text}<span className="sr-only sm:hidden">{s.label}</span></span>
              )}
              {i < steps.length - 1 && <span className={cn('h-px min-w-2 flex-1', done ? 'bg-primary' : 'bg-line')} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
