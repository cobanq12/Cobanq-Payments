import { useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, addMonths, formatDate, isBankHoliday, isWeekend, weekdayOf, type IsoDate } from '@core/lib/dates';
import { cn } from './cn';
import { FieldShell } from './Form';
import { useDismiss } from './Overlay';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Calendar date picker. Can disable weekends and UK bank holidays for working-day rails. */
export function DatePicker({ label, value, onChange, min, error, hint, workingDaysOnly }: {
  label: string; value: IsoDate; onChange: (d: IsoDate) => void; min: IsoDate; error?: string | null; hint?: string; workingDaysOnly?: boolean;
}) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<IsoDate>(() => `${(value || min).slice(0, 7)}-01`);
  useDismiss(wrap, open, () => setOpen(false));

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const lead = (weekdayOf(month) + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (IsoDate | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(month, i))];
  const canGoBack = month > `${min.slice(0, 7)}-01`;

  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <div ref={wrap} className="relative">
        <button
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          onClick={() => setOpen((o) => !o)}
          className={cn('flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left', error ? 'border-danger' : 'border-strong hover:border-ink/60')}
        >
          <span className={cn('num', value ? 'text-ink' : 'text-muted')}>{value ? formatDate(value) : 'Choose a date'}</span>
          <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
        </button>
        {open && (
          <div role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className="absolute z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-3 shadow-lg animate-fade-in">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Previous month" disabled={!canGoBack} onClick={() => setMonth(addMonths(month, -1))} className="rounded p-1.5 text-muted hover:bg-subtle disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-sm font-semibold text-ink" aria-live="polite">{MONTHS[monthIndex]} {year}</span>
              <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="rounded p-1.5 text-muted hover:bg-subtle">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {DAYS.map((d) => <span key={d} className="py-1 text-[11px] font-medium text-muted" aria-hidden="true">{d}</span>)}
              {cells.map((d, i) => {
                if (!d) return <span key={`e${i}`} />;
                const offDay = isWeekend(d) || isBankHoliday(d);
                const disabled = d < min || (workingDaysOnly === true && offDay);
                const selected = d === value;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    aria-label={`${formatDate(d)}${isBankHoliday(d) ? ', bank holiday' : ''}`}
                    aria-pressed={selected}
                    onClick={() => { onChange(d); setOpen(false); }}
                    className={cn(
                      'num h-9 rounded text-sm',
                      selected ? 'bg-primary font-semibold text-primary-fg' : 'text-ink hover:bg-subtle',
                      offDay && !selected && 'text-muted',
                      disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                    )}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
            {workingDaysOnly && <p className="mt-2 text-xs text-muted">Weekends and UK bank holidays aren’t available for this payment.</p>}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
