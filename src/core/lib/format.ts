/** Display formatters for account identifiers. */

export function formatSortCode(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 6);
  return digits.replace(/(\d{2})(?=\d)/g, '$1-');
}

export function formatIban(input: string): string {
  const clean = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 34);
  return clean.replace(/(.{4})(?=.)/g, '$1 ');
}

export function stripSpaces(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** "•••• 5678" */
export function maskAccount(value: string): string {
  const clean = stripSpaces(value);
  if (clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

const countFmt = new Intl.NumberFormat('en-GB');

/** 1000 → "1,000" */
export function formatCount(n: number): string {
  return countFmt.format(n);
}

export function pluralise(n: number, singular: string, plural = `${singular}s`): string {
  return `${new Intl.NumberFormat('en-GB').format(n)} ${n === 1 ? singular : plural}`;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
