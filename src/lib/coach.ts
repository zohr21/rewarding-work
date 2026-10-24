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

export interface CoachStore {
  plan: CoachPlan | null;
  /** Started from Coach and not yet asked about. */
  tried: CoachTry | null;
  worked: Record<string, Worked>;
}

export const PLAN_DAYS = 7;

const EMPTY: CoachStore = { plan: null, tried: null, worked: {} };

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
  return {
    plan: isPlan(r.plan) ? r.plan : null,
    tried: tried && typeof tried.slug === 'string' && typeof tried.at === 'number' ? tried : null,
    worked,
  };
}

export function setCoach(patch: Partial<CoachStore>): CoachStore {
  const next = { ...getCoach(), ...patch };
  write('coach', next);
  return next;
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
