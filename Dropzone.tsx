import { useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import type { PickedFile } from '@core/adapters';
import { useAdapters } from '@core/adapters';
import { toPickedFile } from '../adapters/files';
import { cn } from './cn';

/** Drag-and-drop area that also opens the file picker on click or Enter. */
export function Dropzone({ accept, onFile, title, hint, busy, compact }: {
  accept: string[]; onFile: (file: PickedFile) => void; title: string; hint?: ReactNode; busy?: boolean; compact?: boolean;
}) {
  const { filePicker } = useAdapters();
  const [over, setOver] = useState(false);

  const pick = async (): Promise<void> => {
    const file = await filePicker.pickFile({ accept });
    if (file) onFile(file);
  };

  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(toPickedFile(file));
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => { void pick(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors',
        compact ? 'px-4 py-5' : 'px-6 py-12',
        over ? 'border-accent bg-accent-soft' : 'border-strong bg-surface hover:bg-subtle',
        busy && 'cursor-wait opacity-60',
      )}
    >
      <UploadCloud className={cn('text-muted', compact ? 'h-6 w-6' : 'h-9 w-9')} aria-hidden="true" />
      <span className="text-sm font-semibold text-ink">{busy ? 'Reading file…' : title}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  );
}
