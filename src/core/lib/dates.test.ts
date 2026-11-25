import { describe, expect, it } from 'vitest';
import {
  addMonths, addWorkingDays, evaluateCutoff, formatHm, fromUkWallTime, isWorkingDay, nextWorkingDay, toUkTime,
} from './dates';

describe('UK time', () => {
  it('converts instants to UK wall time in winter (GMT) and summer (BST)', () => {
    expect(toUkTime(new Date('2026-11-25T15:29:00Z'))).toMatchObject({ date: '2026-11-25', minutes: 15 * 60 + 29, weekday: 3 });
    expect(toUkTime(new Date('2026-07-01T14:30:00Z'))).toMatchObject({ date: '2026-07-01', minutes: 15 * 60 + 30 });
  });
  it('round-trips wall time', () => {
    expect(fromUkWallTime('2026-07-01', 15 * 60 + 30).toISOString()).toBe('2026-07-01T14:30:00.000Z');
    expect(fromUkWallTime('2026-11-25', 9 * 60).toISOString()).toBe('2026-11-25T09:00:00.000Z');
  });
});

describe('working days', () => {
  it('knows weekends and bank holidays', () => {
    expect(isWorkingDay('2026-11-25')).toBe(true);
    expect(isWorkingDay('2026-11-28')).toBe(false);
    expect(isWorkingDay('2026-12-25')).toBe(false);
    expect(isWorkingDay('2026-12-28')).toBe(false); // Boxing Day substitute
  });
  it('finds the next working day', () => {
    expect(nextWorkingDay('2026-11-27')).toBe('2026-11-30');
    expect(nextWorkingDay('2026-12-24')).toBe('2026-12-29');
  });
  it('adds working days', () => {
    expect(addWorkingDays('2026-11-26', 2)).toBe('2026-11-30');
    expect(addWorkingDays('2026-11-28', 0)).toBe('2026-11-30');
  });
  it('adds months, clamping to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('cut-off logic', () => {
  const at = (date: string, hm: number) => toUkTime(fromUkWallTime(date, hm));

  it('is same-day one minute before the cut-off', () => {
    const r = evaluateCutoff(at('2026-11-25', 15 * 60 + 29), '15:30');
    expect(r).toEqual({ sameDay: true, processingDate: '2026-11-25', minutesLeft: 1 });
  });
  it('rolls to the next working day at the cut-off', () => {
    expect(evaluateCutoff(at('2026-11-25', 15 * 60 + 30), '15:30')).toEqual({ sameDay: false, processingDate: '2026-11-26' });
  });
  it('rolls Friday evening to Monday', () => {
    expect(evaluateCutoff(at('2026-11-27', 17 * 60), '15:30').processingDate).toBe('2026-11-30');
  });
  it('rolls weekends and bank holidays forward even before the cut-off time', () => {
    expect(evaluateCutoff(at('2026-11-28', 10 * 60), '15:30')).toEqual({ sameDay: false, processingDate: '2026-11-30' });
    expect(evaluateCutoff(at('2026-12-25', 10 * 60), '15:30').processingDate).toBe('2026-12-29');
  });
  it('formats cut-off times', () => {
    expect(formatHm('15:30')).toBe('3:30pm');
    expect(formatHm('14:00')).toBe('2pm');
  });
});
