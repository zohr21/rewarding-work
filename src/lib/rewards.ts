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
import { t, tn, type Key } from './i18n';

/** English names, also the count of tiers. Show tierName(i) instead. */
export const TIER_NAMES = ['Seedling', 'Sprout', 'Sapling', 'Tree', 'Grove'] as const;
/** What each tier's coin is made of: gold is the best regular tier, diamond is for the hardest thresholds. */
export const TIER_MATERIALS = ['Green', 'Bronze', 'Silver', 'Gold', 'Diamond'] as const;

/** "Sapling", in the current language. */
export const tierName = (index: number) => t(`tier.name.${index}` as Key);
/** "Silver", in the current language. */
export const tierMaterial = (index: number) => t(`tier.material.${index}` as Key);

/** "Silver Sapling" — the tier at `index` with its material. One key each, since some languages make the two agree. */
export const tierLabel = (index: number) => t(`tier.label.${index}` as Key);

export type TrackId = 'focus' | 'sessions' | 'streak' | 'done' | 'rest' | 'move' | 'active' | 'workouts';

export interface Track {
  id: TrackId;
  /** Focus tracks always count; body ones only with Health on (src/lib/bodytiers.ts). */
  group: 'focus' | 'body';
  title: string;
  /** What counts, in a sentence, for the marker sheet. */
  how: string;
  /** One threshold per tier, ascending. */
  thresholds: readonly number[];
  /** "5 hours of focus" — describes reaching `n`. */
  describe: (n: number) => string;
  /** Unit for "3 of 5 hours". */
  unit: (n: number) => string;
}

export const TRACKS: readonly Track[] = [
  {
    id: 'focus',
    group: 'focus',
    get how() {
      return t('tier.focus.how');
    },
    get title() {
      return t('tier.focus.title');
    },
    thresholds: [1, 5, 15, 40, 100],
    describe: (n) => tn('tier.focus.describe', n),
    unit: (n) => tn('tier.focus.unit', n),
  },
  {
    id: 'sessions',
    group: 'focus',
    get how() {
      return t('tier.sessions.how');
    },
    get title() {
      return t('tier.sessions.title');
    },
    thresholds: [1, 10, 30, 75, 150],
    describe: (n) => tn('tier.sessions.describe', n),
    unit: (n) => tn('tier.sessions.unit', n),
  },
  {
    id: 'streak',
    group: 'focus',
    get how() {
      return t('tier.streak.how');
    },
    get title() {
      return t('tier.streak.title');
    },
    thresholds: [3, 7, 14, 30, 66],
    describe: (n) => tn('tier.streak.describe', n),
    unit: (n) => tn('tier.streak.unit', n),
  },
  {
    id: 'done',
    group: 'focus',
    get how() {
      return t('tier.done.how');
    },
    get title() {
      return t('tier.done.title');
    },
    thresholds: [1, 10, 30, 75, 150],
    describe: (n) => tn('tier.done.describe', n),
    unit: (n) => tn('tier.done.unit', n),
  },
];

/**
 * Body markers count days you looked after yourself, never how hard you pushed: a night of
 * enough sleep, a day of enough steps, a week of enough activity. Thresholds and goals are in
 * src/lib/bodytiers.ts, which also gathers the days.
 */
export const BODY_TRACKS: readonly Track[] = [
  {
    id: 'rest',
    group: 'body',
    get title() {
      return t('tier.rest.title');
    },
    get how() {
      return t('tier.rest.how');
    },
    thresholds: [3, 10, 30, 75, 150],
    describe: (n) => tn('tier.rest.describe', n),
    unit: (n) => tn('tier.rest.unit', n),
  },
  {
    id: 'move',
    group: 'body',
    get title() {
      return t('tier.move.title');
    },
    get how() {
      return t('tier.move.how');
    },
    thresholds: [3, 10, 30, 75, 150],
    describe: (n) => tn('tier.move.describe', n),
    unit: (n) => tn('tier.move.unit', n),
  },
  {
    id: 'active',
    group: 'body',
    get title() {
      return t('tier.active.title');
    },
    get how() {
      return t('tier.active.how');
    },
    thresholds: [1, 4, 12, 26, 52],
    describe: (n) => tn('tier.active.describe', n),
    unit: (n) => tn('tier.active.unit', n),
  },
  {
    id: 'workouts',
    group: 'body',
    get title() {
      return t('tier.workouts.title');
    },
    get how() {
      return t('tier.workouts.how');
    },
    thresholds: [1, 10, 30, 75, 150],
    describe: (n) => tn('tier.workouts.describe', n),
    unit: (n) => tn('tier.workouts.unit', n),
  },
];

const ALL_TRACKS = [...TRACKS, ...BODY_TRACKS];

/** The days behind the body markers (src/lib/bodytiers.ts). */
export interface BodyInput {
  rest: DayKey[];
  move: DayKey[];
  /** The Monday of each active week. */
  active: DayKey[];
  /** When each workout started, epoch ms. */
  workouts: number[];
}

export interface RewardInput {
  sessions: FocusSession[];
  done: DoneItem[];
  chainDays: DayKey[];
  /** Best-run records of deleted chains (Chain.pastBests). */
  pastBests?: [DayKey, number][];
  /** Left out when Health is off: then there are no body markers. */
  body?: BodyInput;
}

export interface TrackProgress {
  track: Track;
  /** Current measure in the track's unit (focus: hours, fractional). */
  value: number;
  /** Tiers reached, 0–5. */
  level: number;
  /** When each tier was first reached (epoch ms), or null. Same length as thresholds. */
  reachedAt: (number | null)[];
  /** How much the value grew in the last PACE_DAYS days, for "at your pace". */
  recent: number;
}

/** "At your pace" looks back this far. */
export const PACE_DAYS = 14;

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
    case 'rest':
    case 'move':
    case 'active': {
      let n = 0;
      return [...new Set(input.body?.[id] ?? [])]
        .sort()
        .map((key) => ({ t: fromDayKey(key).getTime(), v: ++n }));
    }
    case 'workouts': {
      let n = 0;
      return [...(input.body?.workouts ?? [])].sort((a, b) => a - b).map((t) => ({ t, v: ++n }));
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
  const value = points.at(-1)?.v ?? 0;
  const since = Date.now() - PACE_DAYS * 86_400_000;
  const before = points.filter((p) => p.t < since).at(-1)?.v ?? 0;
  return {
    track,
    value,
    level: reachedAt.filter((t) => t !== null).length,
    reachedAt,
    recent: value - before,
  };
}

/** Every track, the body ones only when `input.body` is there. */
export function allProgress(input: RewardInput): TrackProgress[] {
  return (input.body ? ALL_TRACKS : TRACKS).map((t) => trackProgress(input, t));
}

export interface NextTier {
  p: TrackProgress;
  /** The next tier's threshold. */
  next: number;
  /** How far from the last tier to the next one, 0–1. */
  share: number;
  /** What is left, rounded the way the track counts. */
  left: number;
}

/** The tiers closest to being reached, closest first; tracks with every tier reached drop out. */
export function closestTiers(progress: TrackProgress[], count = 3): NextTier[] {
  return progress
    .flatMap((p) => {
      const next = p.track.thresholds[p.level];
      if (next === undefined) return [];
      const prev = p.level ? p.track.thresholds[p.level - 1]! : 0;
      const share = Math.min(1, Math.max(0, (p.value - prev) / (next - prev)));
      const left = p.track.id === 'focus' ? Math.ceil((next - p.value) * 10) / 10 : Math.ceil(next - p.value);
      return [{ p, next, share, left }];
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, count);
}

/**
 * Days to the next tier at the pace of the last PACE_DAYS days, or null when nothing grew.
 * The chain has no pace: it is as many days as are left, in a row.
 */
export function daysToNext({ p, left }: NextTier): number | null {
  if (p.track.id === 'streak') return left;
  if (p.recent <= 0) return null;
  return Math.max(1, Math.round(left / (p.recent / PACE_DAYS)));
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
  const track = ALL_TRACKS.find((t) => t.id === trackId);
  const index = Number(indexText);
  const name = TIER_NAMES[index];
  const threshold = track?.thresholds[index];
  if (!track || !name || threshold === undefined) return null;
  return { id, track, index, name, threshold };
}
