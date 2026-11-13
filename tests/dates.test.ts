import { describe, expect, it } from 'vitest';
import { addDays, dayKey, fromDayKey, isDayKey, startOfDay, startOfWeek } from '../src/lib/dates';

describe('day keys', () => {
  it('names a day by the local calendar, not UTC', () => {
    expect(dayKey(new Date(2026, 10, 14, 23, 30))).toBe('2026-11-14');
    expect(dayKey(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });

  it('goes to a date and back', () => {
    const d = fromDayKey('2026-03-09');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 9, 0]);
    expect(dayKey(d)).toBe('2026-03-09');
  });

  it('tells a day key from other text', () => {
    expect(isDayKey('2026-11-14')).toBe(true);
    expect(isDayKey('14.11.2026')).toBe(false);
    expect(isDayKey(20261114)).toBe(false);
  });
});

describe('weeks and days', () => {
  it('starts the week on Monday', () => {
    // 14 Nov 2026 is a Saturday, 15 Nov a Sunday, 16 Nov a Monday.
    expect(dayKey(startOfWeek(new Date(2026, 10, 14, 18)))).toBe('2026-11-09');
    expect(dayKey(startOfWeek(new Date(2026, 10, 15)))).toBe('2026-11-09');
    expect(dayKey(startOfWeek(new Date(2026, 10, 16)))).toBe('2026-11-16');
  });

  it('adds days across a month and a year end', () => {
    expect(dayKey(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
    expect(dayKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
    expect(dayKey(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
  });

  it('finds local midnight without changing the date given', () => {
    const noon = new Date(2026, 5, 3, 12, 45);
    const start = startOfDay(noon);
    expect([start.getHours(), start.getMinutes(), start.getDate()]).toEqual([0, 0, 3]);
    expect(noon.getHours()).toBe(12);
  });
});
