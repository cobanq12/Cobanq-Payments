/** Identifier helpers. Math.random is fine here: these are mock IDs, not secrets. */

export function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Cobanq payment reference, e.g. CBQ-2026-11-000123 */
export function paymentReference(date: Date, sequence: number): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `CBQ-${y}-${m}-${String(sequence).padStart(6, '0')}`;
}

/** UETR: a UUID v4 used to track SWIFT payments end to end. */
export function uetr(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
