/**
 * What Focus › Coach remembers: your plan, the technique you last started from it (so it
 * can ask whether it helped), and how often each technique helped you. Kept per device,
 * like the timer settings. The scoring is in src/data/coach.ts.
 */
import type { PlanPicks, Worked } from '../data/coach';
import { read, write } from './storage';

export interface CoachPlan extends PlanPicks {
  /** Epoch ms. The plan runs for the 7 days from this one. */
  created: number;
  blocker: string;
  answers: Record<string, string>;
  /** The "When" line: "<cue>, I open <task>." */
  cue: string;
  task: string;
  taskId?: string;
}

export interface CoachTry {
  slug: string;
  at: number;
}

export type Energy = 'low' | 'ok' | 'good';

/** One day of the day rhythm (src/lib/coachday.ts), under its local "YYYY-MM-DD". */
export interface CoachDay {
  energy?: Energy;
  /** The tasks picked for the day's Top 3, in order. Kept after they are finished. */
  top?: string[];
  /** Minutes you expected each task to take, by task id. */
  est?: Record<string, number>;
  /** Epoch ms you finished planning (or skipped it). */
  plannedAt?: number;
  /** Epoch ms you closed the day. */
  closedAt?: number;
  /** Suggestions put off with "Not now", for this day only. */
  snoozed?: string[];
}

/** Sunday's look ahead (WOOP): a wish, its best outcome, the obstacle, and an if-then plan. */
export interface Woop {
  /** Local "YYYY-MM-DD" of the Monday of the week it was written for. */
  week: string;
  wish: string;
  outcome: string;
  obstacle: string;
  plan: string;
}

export interface CoachStore {
  plan: CoachPlan | null;
  /** Started from Coach and not yet asked about. */
  tried: CoachTry | null;
  worked: Record<string, Worked>;
  /** The day rhythm, newest days kept (DAYS_KEPT). Missing in stores saved before it. */
  days: Record<string, CoachDay>;
  /** Suggestions you said aren't true; never shown again. */
  muted: string[];
  woop: Woop | null;
}

export const PLAN_DAYS = 7;

export const DAYS_KEPT = 60;

const EMPTY: CoachStore = { plan: null, tried: null, worked: {}, days: {}, muted: [], woop: null };

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readDay(v: unknown): CoachDay | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  const out: CoachDay = {};
  if (d.energy === 'low' || d.energy === 'ok' || d.energy === 'good') out.energy = d.energy;
  if (Array.isArray(d.top)) out.top = d.top.filter(isStr).slice(0, 3);
  if (d.est && typeof d.est === 'object') {
    const est: Record<string, number> = {};
    for (const [id, m] of Object.entries(d.est as Record<string, unknown>)) if (isNum(m) && m > 0 && m <= 600) est[id] = Math.round(m);
    out.est = est;
  }
  if (isNum(d.plannedAt)) out.plannedAt = d.plannedAt;
  if (isNum(d.closedAt)) out.closedAt = d.closedAt;
  if (Array.isArray(d.snoozed)) out.snoozed = d.snoozed.filter(isStr);
  return out;
}

function readWoop(v: unknown): Woop | null {
  if (!v || typeof v !== 'object') return null;
  const w = v as Record<string, unknown>;
  return ['week', 'wish', 'outcome', 'obstacle', 'plan'].every((k) => isStr(w[k])) ? (w as unknown as Woop) : null;
}

function isPlan(v: unknown): v is CoachPlan {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.created === 'number' &&
    typeof p.cue === 'string' &&
    typeof p.task === 'string' &&
    ['when', 'start', 'session', 'reward', 'blocker'].every((k) => typeof p[k] === 'string') &&
    !!p.answers &&
    typeof p.answers === 'object'
  );
}

/** Reads the store, dropping anything malformed rather than breaking the page. */
export function getCoach(): CoachStore {
  const raw = read<unknown>('coach', null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const r = raw as Record<string, unknown>;
  const tried = r.tried as CoachTry | null;
  const worked: Record<string, Worked> = {};
  if (r.worked && typeof r.worked === 'object') {
    for (const [slug, w] of Object.entries(r.worked as Record<string, Worked>)) {
      if (w && typeof w.helped === 'number' && typeof w.tries === 'number') worked[slug] = { helped: w.helped, tries: w.tries };
    }
  }
  const days: Record<string, CoachDay> = {};
  if (r.days && typeof r.days === 'object') {
    for (const [k, v] of Object.entries(r.days as Record<string, unknown>)) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(k) ? readDay(v) : null;
      if (d) days[k] = d;
    }
  }
  return {
    plan: isPlan(r.plan) ? r.plan : null,
    tried: tried && typeof tried.slug === 'string' && typeof tried.at === 'number' ? tried : null,
    worked,
    days,
    muted: Array.isArray(r.muted) ? r.muted.filter(isStr) : [],
    woop: readWoop(r.woop),
  };
}

export function setCoach(patch: Partial<CoachStore>): CoachStore {
  const next = { ...getCoach(), ...patch };
  // Only the newest days are kept.
  const keys = Object.keys(next.days).sort();
  if (keys.length > DAYS_KEPT) next.days = Object.fromEntries(keys.slice(-DAYS_KEPT).map((k) => [k, next.days[k]!]));
  write('coach', next);
  return next;
}

/** Change one day of the rhythm. */
export function setDay(key: string, change: (day: CoachDay) => CoachDay): CoachDay {
  const c = getCoach();
  const day = change({ ...(c.days[key] ?? {}) });
  setCoach({ days: { ...c.days, [key]: day } });
  return day;
}

/** Remember that you started this technique, so Coach can ask how it went. */
export function markTried(slug: string): void {
  setCoach({ tried: { slug, at: Date.now() } });
}

/** Your answer to "Did it help?": 1 yes, 0.5 a bit, 0 no. */
export function answerTried(helped: number): void {
  const c = getCoach();
  if (!c.tried) return;
  const w = c.worked[c.tried.slug] ?? { helped: 0, tries: 0 };
  setCoach({ tried: null, worked: { ...c.worked, [c.tried.slug]: { helped: w.helped + helped, tries: w.tries + 1 } } });
}
