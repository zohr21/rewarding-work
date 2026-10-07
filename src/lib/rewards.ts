/**
 * Reward tiers: milestones derived entirely from stored data (sessions, done list,
 * chain). Pure calculations — no DOM, no storage — and nothing extra is stored, so
 * tiers need no sync, count work done before this feature existed, and can't drift
 * out of step with the data they describe.
 *
 * Framed as feedback on progress, not payment: the streak track uses the best chain
 * ever, so a missed day never takes a tier away.
 */
import { addDays, dayKey, fromDayKey, type DayKey } from './dates';
import type { Chain, DoneItem, FocusSession } from './storage';

export const TIER_NAMES = ['Seedling', 'Sprout', 'Sapling', 'Tree', 'Grove'] as const;

export type TrackId = 'focus' | 'sessions' | 'streak' | 'done';

export interface Track {
  id: TrackId;
  title: string;
  /** One threshold per tier, ascending. */
  thresholds: readonly number[];
  /** "5 hours of focus" — describes reaching `n`. */
  describe: (n: number) => string;
  /** Unit for "3 of 5 hours". */
  unit: (n: number) => string;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export const TRACKS: readonly Track[] = [
  {
    id: 'focus',
    title: 'Focus time',
    thresholds: [1, 5, 15, 40, 100],
    describe: (n) => `${n} ${plural(n, 'hour')} of focus`,
    unit: (n) => plural(n, 'hour'),
  },
  {
    id: 'sessions',
    title: 'Sessions completed',
    thresholds: [1, 10, 30, 75, 150],
    describe: (n) => `${n} completed ${plural(n, 'session')}`,
    unit: (n) => plural(n, 'session'),
  },
  {
    id: 'streak',
    title: 'Best chain',
    thresholds: [3, 7, 14, 30, 66],
    describe: (n) => `a ${n}-day chain`,
    unit: (n) => plural(n, 'day'),
  },
  {
    id: 'done',
    title: 'Things done',
    thresholds: [1, 10, 30, 75, 150],
    describe: (n) => `${n} ${plural(n, 'thing')} done`,
    unit: (n) => plural(n, 'thing'),
  },
];

export interface RewardInput {
  sessions: FocusSession[];
  done: DoneItem[];
  chainDays: DayKey[];
  /** Best-run records of deleted chains (Chain.pastBests). */
  pastBests?: [DayKey, number][];
}

export interface TrackProgress {
  track: Track;
  /** Current measure in the track's unit (focus: hours, fractional). */
  value: number;
  /** Tiers reached, 0–5. */
  level: number;
  /** When each tier was first reached (epoch ms), or null. Same length as thresholds. */
  reachedAt: (number | null)[];
}

interface Point {
  t: number;
  v: number;
}

/** Running totals over time, oldest first. `v` never decreases. */
function series(input: RewardInput, id: TrackId): Point[] {
  switch (id) {
    case 'focus': {
      let sum = 0;
      return [...input.sessions]
        .sort((a, b) => a.end - b.end)
        .map((s) => ({ t: s.end, v: (sum += s.focusSeconds / 3600) }));
    }
    case 'sessions': {
      let n = 0;
      return input.sessions
        .filter((s) => s.completed)
        .sort((a, b) => a.end - b.end)
        .map((s) => ({ t: s.end, v: ++n }));
    }
    case 'done': {
      let n = 0;
      return [...input.done].sort((a, b) => a.doneAt - b.doneAt).map((d) => ({ t: d.doneAt, v: ++n }));
    }
    case 'streak': {
      // The current chain's records and those of deleted chains, as one "best ever" line.
      const records = [...streakRecords(input.chainDays), ...(input.pastBests ?? [])]
        .map(([key, v]) => ({ t: fromDayKey(key).getTime(), v }))
        .sort((a, b) => a.t - b.t || a.v - b.v);
      const points: Point[] = [];
      for (const p of records) if (p.v > (points.at(-1)?.v ?? 0)) points.push(p);
      return points;
    }
  }
}

/** The chain part of a RewardInput. The best run counts across every chain, so further chains go in as records. */
export function chainInput(chain: Chain): Pick<RewardInput, 'chainDays' | 'pastBests'> {
  return {
    chainDays: chain.days,
    pastBests: [...(chain.pastBests ?? []), ...(chain.more ?? []).flatMap((m) => streakRecords(m.days))],
  };
}

/** [day, length] for each day the chain's best run grew, oldest first. */
export function streakRecords(days: DayKey[]): [DayKey, number][] {
  const records: [DayKey, number][] = [];
  let run = 0;
  let best = 0;
  let prev: DayKey | null = null;
  for (const key of [...new Set(days)].sort()) {
    run = prev && dayKey(addDays(fromDayKey(prev), 1)) === key ? run + 1 : 1;
    prev = key;
    if (run > best) {
      best = run;
      records.push([key, best]);
    }
  }
  return records;
}

export function trackProgress(input: RewardInput, track: Track): TrackProgress {
  const points = series(input, track.id);
  // Small epsilon so 59.99… minutes of float sums still count as the hour it is.
  const reachedAt = track.thresholds.map((n) => points.find((p) => p.v >= n - 1e-9)?.t ?? null);
  return {
    track,
    value: points.at(-1)?.v ?? 0,
    level: reachedAt.filter((t) => t !== null).length,
    reachedAt,
  };
}

export function allProgress(input: RewardInput): TrackProgress[] {
  return TRACKS.map((t) => trackProgress(input, t));
}

/** Stable id of one tier, e.g. "focus:2" (the third tier of focus time). */
export const tierId = (track: TrackId, index: number) => `${track}:${index}`;

/** Ids of every tier reached. */
export function earnedTierIds(input: RewardInput): Set<string> {
  const ids = new Set<string>();
  for (const p of allProgress(input)) {
    for (let i = 0; i < p.level; i++) ids.add(tierId(p.track.id, i));
  }
  return ids;
}

export interface TierInfo {
  id: string;
  track: Track;
  index: number;
  name: (typeof TIER_NAMES)[number];
  threshold: number;
}

export function tierInfo(id: string): TierInfo | null {
  const [trackId, indexText] = id.split(':');
  const track = TRACKS.find((t) => t.id === trackId);
  const index = Number(indexText);
  const name = TIER_NAMES[index];
  const threshold = track?.thresholds[index];
  if (!track || !name || threshold === undefined) return null;
  return { id, track, index, name, threshold };
}
