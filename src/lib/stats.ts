/** Pure calculations over stored data. No DOM, no storage access. */
import { addDays, dayKey, fromDayKey, startOfDay, startOfWeek, type DayKey } from './dates';
import type { FocusSession } from './storage';

/** Focus minutes per local day. */
export function minutesByDay(sessions: FocusSession[]): Map<DayKey, number> {
  const map = new Map<DayKey, number>();
  for (const s of sessions) {
    const key = dayKey(s.start);
    map.set(key, (map.get(key) ?? 0) + s.focusSeconds / 60);
  }
  return map;
}

export interface Totals {
  todayMin: number;
  weekMin: number;
  completedSessions: number;
  weekSessions: number;
}

export function totals(sessions: FocusSession[], now = new Date()): Totals {
  const today = startOfDay(now).getTime();
  const week = startOfWeek(now).getTime();
  let todaySec = 0;
  let weekSec = 0;
  let weekSessions = 0;
  for (const s of sessions) {
    if (s.start >= today) todaySec += s.focusSeconds;
    if (s.start >= week) {
      weekSec += s.focusSeconds;
      if (s.completed) weekSessions++;
    }
  }
  return {
    todayMin: Math.round(todaySec / 60),
    weekMin: Math.round(weekSec / 60),
    completedSessions: sessions.filter((s) => s.completed).length,
    weekSessions,
  };
}

// ---------- Heatmap ----------

export interface HeatCell {
  key: DayKey;
  date: Date;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/** Bucket thresholds in minutes: 0 | <25 | <60 | <120 | 120+. Fixed so colours mean the same thing every week. */
export const HEAT_THRESHOLDS = [1, 25, 60, 120] as const;

export function heatLevel(minutes: number): HeatCell['level'] {
  if (minutes < HEAT_THRESHOLDS[0]) return 0;
  if (minutes < HEAT_THRESHOLDS[1]) return 1;
  if (minutes < HEAT_THRESHOLDS[2]) return 2;
  if (minutes < HEAT_THRESHOLDS[3]) return 3;
  return 4;
}

/** `weeks` columns of 7 days (Mon–Sun), ending with the current week. */
export function heatmapWeeks(sessions: FocusSession[], weeks = 12, now = new Date()): HeatCell[][] {
  const byDay = minutesByDay(sessions);
  const today = startOfDay(now);
  const first = addDays(startOfWeek(now), -7 * (weeks - 1));
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const key = dayKey(date);
      const minutes = Math.round(byDay.get(key) ?? 0);
      col.push({ key, date, minutes, level: heatLevel(minutes), future: date > today });
    }
    cols.push(col);
  }
  return cols;
}

// ---------- Chain ----------

export interface ChainStats {
  current: number;
  best: number;
  total: number;
  doneToday: boolean;
}

/**
 * Current chain = consecutive marked days ending today — or ending yesterday, because
 * today isn't over yet and an unmarked today shouldn't read as a broken chain.
 */
export function chainStats(days: DayKey[], now = new Date()): ChainStats {
  const set = new Set(days);
  const todayKey = dayKey(now);
  const doneToday = set.has(todayKey);

  let current = 0;
  let cursor = doneToday ? startOfDay(now) : addDays(startOfDay(now), -1);
  while (set.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of [...set].sort()) {
    const date = fromDayKey(key);
    run = prev && dayKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }

  return { current, best, total: set.size, doneToday };
}
