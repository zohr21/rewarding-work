/**
 * Local-calendar date helpers. Days are identified by a local "YYYY-MM-DD" key so a
 * session at 23:30 counts for the day the user experienced it, not the UTC day.
 */
import { dateFormat } from './i18n';

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

// Made on first use, in the chosen language (it changes only with a reload). Not at load:
// storage → dates → i18n → storage is a cycle, so nothing from i18n may run before it settles.
let fmts: { day: Formatter; short: Formatter; month: Formatter } | undefined;
type Formatter = ReturnType<typeof dateFormat>;
const formats = () =>
  (fmts ??= {
    day: dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }),
    short: dateFormat({ day: 'numeric', month: 'short' }),
    month: dateFormat({ month: 'short' }),
  });

export const formatDay = (d: Date) => formats().day.format(d);
export const formatShort = (d: Date) => formats().short.format(d);
export const formatMonth = (d: Date) => formats().month.format(d);
