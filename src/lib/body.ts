/**
 * Body numbers for each day: what Health Connect sent (the `body` store HealthBody.astro keeps),
 * with what you typed in by hand on top (`body-manual`), for days the watch or phone missed.
 * A typed number wins for its field and day; clearing it brings the synced number back. A read
 * from Health Connect never touches what you typed.
 *
 * Kept on this device only, like `body`: not synced and not in the backup file.
 */
import { read, write } from './storage';
import { dayKey, isDayKey, type DayKey } from './dates';
import type { BodyDay, BodyField } from './device';

export type BodyValues = Partial<Omit<BodyDay, 'day'>>;
type ManualStore = Record<DayKey, BodyValues>;

/** The largest number each field takes by hand; anything above is a typo. */
export const MANUAL_MAX: Record<BodyField, number> = {
  sleepMin: 24 * 60,
  steps: 200_000,
  activeMin: 24 * 60,
  restingHr: 250,
  totalKcal: 20_000,
  activeKcal: 15_000,
  distanceM: 500_000,
};
const FIELDS = Object.keys(MANUAL_MAX) as BodyField[];
/** Days kept, newest first; a little over a year. */
const KEEP = 400;

/** Only fields with a number in range survive; a day left with none is dropped. */
function cleanValues(v: unknown): BodyValues | null {
  if (!v || typeof v !== 'object') return null;
  const out: BodyValues = {};
  for (const f of FIELDS) {
    const n = (v as Record<string, unknown>)[f];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MANUAL_MAX[f]) out[f] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function getManual(): ManualStore {
  const raw = read<unknown>('body-manual', null);
  const out: ManualStore = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [day, v] of Object.entries(raw)) {
    const clean = isDayKey(day) ? cleanValues(v) : null;
    if (clean) out[day] = clean;
  }
  return out;
}

export const manualFor = (day: DayKey): BodyValues => getManual()[day] ?? {};

/** Replaces what was typed for `day`; no numbers clears the day. */
export function setManual(day: DayKey, values: BodyValues): void {
  if (!isDayKey(day) || day > dayKey(new Date())) return;
  const all = getManual();
  const clean = cleanValues(values);
  if (clean) all[day] = clean;
  else delete all[day];
  const kept = Object.keys(all).sort().slice(-KEEP);
  write('body-manual', Object.fromEntries(kept.map((d) => [d, all[d]!])));
}

/** The last read from Health Connect, as stored. */
export const syncedDays = (): BodyDay[] => read<BodyDay[]>('body', []).filter((d) => d && typeof d.day === 'string');

/** `synced` with the typed numbers laid over it, a day added for each day only typed in; oldest first. */
export function withManual(synced: BodyDay[], manual: ManualStore = getManual()): BodyDay[] {
  const byDay = new Map(synced.map((d) => [d.day, d]));
  for (const [day, values] of Object.entries(manual)) byDay.set(day, { ...byDay.get(day), ...values, day });
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** Every day of body data there is, synced and typed. What the Health page and your finding read. */
export const bodyDays = (): BodyDay[] => withManual(syncedDays());
