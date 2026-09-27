/**
 * Local-calendar date helpers. Days are identified by a local "YYYY-MM-DD" key so a
 * session at 23:30 counts for the day the user experienced it, not the UTC day.
 */

export type DayKey = string; // YYYY-MM-DD

export function dayKey(date: Date | number): DayKey {
  const d = typeof date === 'number' ? new Date(date) : date;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isDayKey(v: unknown): v is DayKey {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Local midnight of the given day. */
export function startOfDay(date: Date | number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Adds calendar days (DST-safe: works on the date, not on milliseconds). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday 00:00 of the week containing `date`. */
export function startOfWeek(date: Date | number): Date {
  const d = startOfDay(date);
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(d, -offset);
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

export const formatDay = (d: Date) => dayFmt.format(d);
export const formatShort = (d: Date) => shortFmt.format(d);
export const formatMonth = (d: Date) => monthFmt.format(d);
