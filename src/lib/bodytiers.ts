/**
 * The days behind the body markers (BODY_TRACKS in src/lib/rewards.ts): nights of 7 hours'
 * sleep, days of 7,000 steps, weeks of 150 active minutes, and workouts logged.
 *
 * - Goals, not totals: a 12-hour night or a 30,000-step day counts once, like any other.
 *   Calories, weight and the app's own estimates never count.
 * - Health Connect days are kept 90 days and typed ones 400, so once a day is LOCK_DAYS old
 *   it is written into `body-tiers` and counts for good: a tier never goes back when old
 *   days age out. Newer days stay live, so fixing a typo still takes the day back.
 * - Only with Health on (Welcome or You); off, there are no body markers at all.
 *
 * Kept on this device only, like the body data it comes from.
 */
import { read, write } from './storage';
import { addDays, dayKey, fromDayKey, isDayKey, startOfWeek, type DayKey } from './dates';
import { bodyDays } from './body';
import { getWorkouts } from './workouts';
import { getProfile } from './profile';
import type { BodyInput } from './rewards';

export const REST_MIN = 7 * 60;
export const STEP_GOAL = 7_000;
export const ACTIVE_WEEK_MIN = 150;
/** Days this old are kept in `body-tiers`. */
const LOCK_DAYS = 14;
/** Most days kept per track; past the top tier with room to spare. */
const KEEP = 1000;

type Locked = Pick<BodyInput, 'rest' | 'move' | 'active'>;
const KEYS = ['rest', 'move', 'active'] as const;

function getLocked(): Locked {
  const raw = read<unknown>('body-tiers', null);
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(isDayKey) : []);
  return { rest: list(v.rest), move: list(v.move), active: list(v.active) };
}

const union = (a: DayKey[], b: DayKey[]) => [...new Set([...a, ...b])].sort();

export const bodyMarkersOn = (): boolean => getProfile().modules.health;

/** Active minutes per day: the larger of what the phone counted and the workouts logged, so one run isn't counted twice. */
function activeByDay(): Map<DayKey, number> {
  const days = new Map<DayKey, number>();
  for (const d of bodyDays()) days.set(d.day, d.activeMin ?? 0);
  const logged = new Map<DayKey, number>();
  for (const w of getWorkouts()) {
    const key = dayKey(w.start);
    logged.set(key, (logged.get(key) ?? 0) + w.minutes);
  }
  for (const [key, min] of logged) days.set(key, Math.max(days.get(key) ?? 0, min));
  return days;
}

/** The body part of a RewardInput, or undefined with Health off. Keeps days old enough on the way. */
export function bodyInput(): BodyInput | undefined {
  if (!bodyMarkersOn()) return undefined;
  const days = bodyDays();
  const weeks = new Map<DayKey, number>();
  for (const [key, min] of activeByDay()) {
    const week = dayKey(startOfWeek(fromDayKey(key)));
    weeks.set(week, (weeks.get(week) ?? 0) + min);
  }
  const now: Locked = {
    rest: days.filter((d) => (d.sleepMin ?? 0) >= REST_MIN).map((d) => d.day),
    move: days.filter((d) => (d.steps ?? 0) >= STEP_GOAL).map((d) => d.day),
    active: [...weeks].filter(([, min]) => min >= ACTIVE_WEEK_MIN).map(([week]) => week),
  };

  const locked = getLocked();
  const merged = Object.fromEntries(KEYS.map((k) => [k, union(locked[k], now[k])])) as Locked;
  // A week is kept once its Sunday is old enough, like a day.
  const cutoff = dayKey(addDays(new Date(), -LOCK_DAYS));
  const old = (k: (typeof KEYS)[number], key: DayKey) => (k === 'active' ? dayKey(addDays(fromDayKey(key), 6)) : key) < cutoff;
  const keep = Object.fromEntries(KEYS.map((k) => [k, merged[k].filter((key) => old(k, key)).slice(-KEEP)])) as Locked;
  if (KEYS.some((k) => keep[k].length !== locked[k].length)) write<Locked>('body-tiers', keep);

  return { ...merged, workouts: getWorkouts().map((w) => w.start) };
}
