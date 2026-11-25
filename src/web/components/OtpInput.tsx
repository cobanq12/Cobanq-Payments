import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from './cn';

/** One-time code boxes: auto-advance, backspace to go back, paste a full code. */
export function OtpInput({ length, value, onChange, disabled, invalid, label }: {
  length: number; value: string; onChange: (v: string) => void; disabled?: boolean; invalid?: boolean; label: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // After a failed attempt the value is cleared: put focus back on the first box.
  useEffect(() => {
    if (value === '' && !disabled) refs.current[0]?.focus();
  }, [value, disabled]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number): void => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) onChange(value.slice(0, i));
      else if (i > 0) { onChange(value.slice(0, i - 1)); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    onChange(digits);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          data-autofocus={i === 0 ? '' : undefined}
          value={value[i] ?? ''}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            if (!digit) return;
            // Typing always fills the next empty position, so the code stays contiguous.
            const pos = Math.min(i, value.length);
            onChange((value.slice(0, pos) + digit).slice(0, length));
            refs.current[Math.min(pos + 1, length - 1)]?.focus();
          }}
          onKeyDown={(e) => onKey(e, i)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'num h-14 w-11 rounded-md border bg-surface text-center text-2xl font-semibold text-ink transition-colors focus:border-focus disabled:bg-subtle sm:w-12',
            invalid ? 'border-danger' : 'border-strong',
          )}
        />
      ))}
    </div>
  );
}
