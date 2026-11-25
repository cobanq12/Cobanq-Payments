/**
 * UK working-day and cut-off logic. Everything works on UK wall-clock time
 * (Europe/London) via Intl, so it behaves the same on web and mobile.
 */

/** Calendar date in ISO form, e.g. "2026-11-25". */
export type IsoDate = string;

export interface UkTime {
  date: IsoDate;
  /** Minutes since midnight, UK time. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

/** England & Wales bank holidays. Extend yearly (published by gov.uk). */
export const UK_BANK_HOLIDAYS: ReadonlySet<IsoDate> = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
]);

const ukParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function toUkTime(d: Date): UkTime {
  const parts: Record<string, string> = {};
  for (const p of ukParts.formatToParts(d)) parts[p.type] = p.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: weekdayOf(date) };
}

/** Build the instant for a UK wall-clock date and time (handles GMT/BST). */
export function fromUkWallTime(date: IsoDate, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  for (let i = 0; i < 2; i++) {
    const uk = toUkTime(new Date(guess));
    const diffDays = daysBetween(uk.date, date);
    const diffMinutes = diffDays * 1440 + (minutes - uk.minutes);
    if (diffMinutes === 0) break;
    guess += diffMinutes * 60_000;
  }
  return new Date(guess);
}

function parts(date: IsoDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

export function weekdayOf(date: IsoDate): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(date);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function isWeekend(date: IsoDate): boolean {
  const wd = weekdayOf(date);
  return wd === 0 || wd === 6;
}

export function isBankHoliday(date: IsoDate): boolean {
  return UK_BANK_HOLIDAYS.has(date);
}

export function isWorkingDay(date: IsoDate): boolean {
  return !isWeekend(date) && !isBankHoliday(date);
}

/** The date itself if it is a working day, otherwise the next one. */
export function onOrNextWorkingDay(date: IsoDate): IsoDate {
  let d = date;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

export function nextWorkingDay(date: IsoDate): IsoDate {
  return onOrNextWorkingDay(addDays(date, 1));
}

/** Add n working days (n ≥ 0). addWorkingDays(d, 0) rolls d forward to a working day. */
export function addWorkingDays(date: IsoDate, n: number): IsoDate {
  let d = onOrNextWorkingDay(date);
  for (let i = 0; i < n; i++) d = nextWorkingDay(d);
  return d;
}

/** "15:30" → 930 */
export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** "15:30" → "3:30pm" */
export function formatHm(hm: string): string {
  const mins = parseHm(hm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export interface CutoffResult {
  /** True when a payment confirmed now can be processed the same working day. */
  sameDay: boolean;
  /** The working day the payment will be processed on. */
  processingDate: IsoDate;
  /** Minutes left before today's cut-off (only when sameDay). */
  minutesLeft?: number;
}

/**
 * Cut-off logic for rails that only run on UK working days (CHAPS, Bacs, SEPA CT, SWIFT).
 * @param cutoffHm UK local cut-off, e.g. "15:30".
 */
export function evaluateCutoff(nowUk: UkTime, cutoffHm: string): CutoffResult {
  const cutoff = parseHm(cutoffHm);
  if (isWorkingDay(nowUk.date) && nowUk.minutes < cutoff) {
    return { sameDay: true, processingDate: nowUk.date, minutesLeft: cutoff - nowUk.minutes };
  }
  return { sameDay: false, processingDate: nextWorkingDay(nowUk.date) };
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' });

function isoToUtc(date: IsoDate): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Mon 30 Nov" */
export function formatDayShort(date: IsoDate): string {
  return dayFmt.format(isoToUtc(date)).replace(',', '');
}

/** "30 Nov 2026" */
export function formatDate(date: IsoDate): string {
  return longFmt.format(isoToUtc(date));
}

/** ISO timestamp → "25 Nov 2026, 14:05" in UK time. */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

const dateTimeSecondsFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London',
});

/** ISO timestamp → "25 Nov 2026, 14:05:09" in UK time, for timelines where seconds matter. */
export function formatDateTimeSeconds(iso: string): string {
  return dateTimeSecondsFmt.format(new Date(iso));
}

/** ISO timestamp → "14:05:09" in UK time. */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** ISO timestamp → UK calendar date. */
export function isoToUkDate(iso: string): IsoDate {
  return toUkTime(new Date(iso)).date;
}
