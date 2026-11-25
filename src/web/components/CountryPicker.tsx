import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { COUNTRIES, countryInfo, flagEmoji } from '@core/lib/countries';
import { cn } from './cn';
import { FieldShell } from './Form';
import { useDismiss } from './Overlay';

/** Searchable country picker with flags. "United Kingdom" is pinned at the top. */
export function CountryPicker({ label, value, onChange, error, hint }: {
  label: string; value: string; onChange: (code: string) => void; error?: string | null; hint?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  useDismiss(wrap, open, () => setOpen(false));

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [COUNTRIES[0]!, ...COUNTRIES.slice(1).sort((a, b) => a.name.localeCompare(b.name))];
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || c.currency.toLowerCase() === q) : sorted;
  }, [query]);

  const selected = countryInfo(value);

  const choose = (code: string): void => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) choose(o.code); }
  };

  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <div ref={wrap} className="relative">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={error ? true : undefined}
          onClick={() => { setOpen((o) => !o); setActive(0); setTimeout(() => search.current?.focus(), 0); }}
          className={cn('flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left text-ink', error ? 'border-danger' : 'border-strong hover:border-ink/60')}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true">{flagEmoji(selected.code)}</span>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : <span className="text-muted">Choose a country</span>}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg animate-fade-in">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="h-4 w-4 text-muted" aria-hidden="true" />
              <input
                ref={search}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKey}
                placeholder="Search countries"
                aria-label="Search countries"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={options[active] ? `${id}-opt-${options[active]!.code}` : undefined}
                className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-none"
              />
            </div>
            <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto py-1 scrollbar-thin">
              {options.length === 0 && <li className="px-3 py-3 text-sm text-muted">No countries match “{query}”.</li>}
              {options.map((c, i) => (
                <li
                  key={c.code}
                  id={`${id}-opt-${c.code}`}
                  role="option"
                  aria-selected={c.code === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(c.code); }}
                  className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink', i === active && 'bg-subtle', i === 0 && !query && 'border-b border-line')}
                >
                  <span aria-hidden="true">{flagEmoji(c.code)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted">{c.currency}</span>
                  {c.code === value && <Check className="h-4 w-4 text-accent-text" aria-hidden="true" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FieldShell>
  );
}
