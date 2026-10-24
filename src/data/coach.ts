/**
 * Coach (Focus › Coach): what is in the way, a few questions, then one plan.
 * Edit freely — see README "Editing the Coach".
 *
 * How it works:
 *  - You tap what is in the way (a BLOCKER). That alone gives one technique to try now:
 *    the best scorer for that blocker, nudged by what has worked for you before.
 *  - "Make it a plan" asks the QUESTIONS below. Points from every answer are added up per
 *    technique (by slug), plus the same worked-for-you nudge.
 *  - The plan always has four steps, one technique each:
 *      When        an if-then plan (implementation intentions, the best-tested of the ten)
 *      Start with  the best scorer among START
 *      Keep going  the best scorer among SESSION
 *      Reward      Don't Break the Chain
 *  - The four laws of Atomic Habits (make it obvious, attractive, easy, satisfying) are
 *    behind the "When it goes wrong" question: each answer is one law that is missing.
 *
 * Slugs are checked at build time (Coach.astro): a typo fails `npm run build`.
 */

export interface CoachOption {
  /** Unique within its question. */
  id: string;
  label: string;
  /** technique slug → points */
  points: Record<string, number>;
}

export interface Blocker extends CoachOption {
  /** Which icon the tile shows (Coach.astro). */
  icon: 'start' | 'focus' | 'list' | 'progress' | 'energy' | 'bored';
}

export interface CoachQuestion {
  id: 'law' | 'focus' | 'when';
  question: string;
  options: CoachOption[];
}

export const BLOCKERS: Blocker[] = [
  {
    id: 'cant-start',
    label: "I can't start",
    icon: 'start',
    points: { 'two-minute-rule': 3, 'implementation-intentions': 2, pomodoro: 2, 'temptation-bundling': 1, 'eat-the-frog': 1 },
  },
  {
    id: 'lose-focus',
    label: 'I keep drifting',
    icon: 'focus',
    points: { pomodoro: 3, 'fifty-two-seventeen': 2, flowtime: 2, 'time-blocking': 1, 'implementation-intentions': 1 },
  },
  {
    id: 'too-much',
    label: 'Too much to do',
    icon: 'list',
    points: { 'time-blocking': 3, 'eat-the-frog': 2, timeboxing: 2, 'two-minute-rule': 1 },
  },
  {
    id: 'no-progress',
    label: 'Nothing feels done',
    icon: 'progress',
    points: { 'dont-break-the-chain': 3, timeboxing: 2, pomodoro: 1 },
  },
  {
    id: 'burn-out',
    label: "I'm out of energy",
    icon: 'energy',
    points: { 'fifty-two-seventeen': 2, flowtime: 3, 'temptation-bundling': 2, pomodoro: 1 },
  },
  {
    id: 'boring',
    label: "It's boring",
    icon: 'bored',
    points: { 'temptation-bundling': 3, timeboxing: 2, 'two-minute-rule': 1 },
  },
];

export const QUESTIONS: CoachQuestion[] = [
  {
    id: 'law',
    question: 'When it goes wrong, what usually happens?',
    options: [
      // Make it obvious
      { id: 'obvious', label: 'I forget, or the day fills up', points: { 'implementation-intentions': 3, 'time-blocking': 2 } },
      // Make it attractive
      { id: 'attractive', label: "I just don't feel like it", points: { 'temptation-bundling': 3, 'two-minute-rule': 1 } },
      // Make it easy
      { id: 'easy', label: 'It feels too big to begin', points: { 'two-minute-rule': 3, timeboxing: 1, 'eat-the-frog': 1 } },
      // Make it satisfying
      { id: 'satisfying', label: 'I work, but nothing feels done', points: { 'dont-break-the-chain': 3, timeboxing: 2 } },
    ],
  },
  {
    id: 'focus',
    question: 'How long can you usually focus before your mind wanders?',
    options: [
      { id: 'short', label: 'Less than 15 minutes', points: { pomodoro: 2, timeboxing: 2, 'two-minute-rule': 1 } },
      { id: 'medium', label: 'About 20–30 minutes', points: { pomodoro: 3 } },
      { id: 'long', label: '45 minutes or more', points: { 'fifty-two-seventeen': 3, flowtime: 1 } },
      { id: 'varies', label: 'It varies a lot', points: { flowtime: 3, timeboxing: 1 } },
    ],
  },
  {
    id: 'when',
    question: 'When do you usually get to it?',
    options: [
      { id: 'morning', label: 'Mornings', points: { 'eat-the-frog': 1 } },
      { id: 'afternoon', label: 'Afternoons', points: {} },
      { id: 'evening', label: 'Evenings', points: { 'temptation-bundling': 1 } },
      { id: 'varies', label: 'It changes day to day', points: { 'time-blocking': 1, 'implementation-intentions': 1 } },
    ],
  },
];

/** The moment the if-then plan hangs on, by answer to "When do you usually get to it?". Editable in the plan. */
export const CUES: Record<string, string> = {
  morning: 'After breakfast',
  afternoon: 'After lunch',
  evening: 'After dinner',
  varies: 'When I sit down to work',
};

/** Techniques that make the first step happen. */
export const START = ['two-minute-rule', 'temptation-bundling', 'eat-the-frog', 'timeboxing'];
/** Techniques that shape the session once you've started. */
export const SESSION = ['pomodoro', 'fifty-two-seventeen', 'flowtime', 'timeboxing'];
export const WHEN = 'implementation-intentions';
export const REWARD = 'dont-break-the-chain';

/** Used only to break ties: broadly useful, low-effort techniques first. */
export const TIE_BREAK = [
  'two-minute-rule',
  'pomodoro',
  'implementation-intentions',
  'timeboxing',
  'temptation-bundling',
  'time-blocking',
  'eat-the-frog',
  'dont-break-the-chain',
  'flowtime',
  'fifty-two-seventeen',
];

/** The timer mode a technique starts, if it is one the timer runs. The Two-Minute Rule uses Flowtime: start, and stop whenever you like. */
export const TIMER_FOR: Record<string, string> = {
  pomodoro: 'pomodoro',
  'fifty-two-seventeen': '52-17',
  flowtime: 'flowtime',
  timeboxing: 'custom',
  'two-minute-rule': 'flowtime',
};

/** The plan's heading, by blocker; {task} is the task's name (or "it"). */
export const PLAN_TITLES: Record<string, string> = {
  'cant-start': 'Make {task} too small to skip',
  'lose-focus': 'Stay with {task}',
  'too-much': 'Give {task} its own time',
  'no-progress': 'Watch {task} move forward',
  'burn-out': 'Do {task} without running dry',
  boring: 'Make {task} less of a slog',
};

/** What each plan step asks you to do, by technique. The When step is the cue line itself. */
export const START_TEXT: Record<string, string> = {
  'two-minute-rule': 'Do just two minutes. Then you may stop.',
  'temptation-bundling': 'Pair it with something you enjoy, like a favourite playlist.',
  'eat-the-frog': 'Do the hardest part first, before anything else.',
  timeboxing: 'Give it a fixed box of time, and stop when it ends.',
};
export const SESSION_TEXT: Record<string, string> = {
  pomodoro: 'If it flows, run a 25-minute Pomodoro.',
  'fifty-two-seventeen': 'If it flows, work 52 minutes, then rest 17.',
  flowtime: 'If it flows, keep going until your focus fades, then rest.',
  timeboxing: 'If it flows, set a timebox and stop when it ends.',
};
export const REWARD_TEXT = 'Tick today on your chain.';

/** How often a technique helped when you tried it from Coach. "A bit" counts as half. */
export interface Worked {
  helped: number;
  tries: number;
}

/** Points added for your own history: up to +4 for things that keep helping, down to -4 for ones that don't. */
export function workedBonus(w: Worked | undefined): number {
  if (!w || !w.tries) return 0;
  const missed = w.tries - w.helped;
  return Math.max(-4, Math.min(4, (w.helped - missed) * 1.5));
}

export interface Scored {
  slug: string;
  score: number;
}

function rank(slug: string): number {
  const i = TIE_BREAK.indexOf(slug);
  return i === -1 ? TIE_BREAK.length : i;
}

/** Every technique that got points, best first. */
export function score(options: CoachOption[], worked: Record<string, Worked>): Scored[] {
  const totals = new Map<string, number>();
  for (const o of options) for (const [slug, pts] of Object.entries(o.points)) totals.set(slug, (totals.get(slug) ?? 0) + pts);
  for (const slug of totals.keys()) totals.set(slug, totals.get(slug)! + workedBonus(worked[slug]));
  return [...totals]
    .map(([slug, s]) => ({ slug, score: s }))
    .sort((a, b) => b.score - a.score || rank(a.slug) - rank(b.slug));
}

/** One tap: the techniques for this blocker, best first. */
export function forBlocker(blockerId: string, worked: Record<string, Worked>): string[] {
  const b = BLOCKERS.find((x) => x.id === blockerId);
  return b ? score([b], worked).map((s) => s.slug) : [];
}

export interface PlanPicks {
  when: string;
  start: string;
  session: string;
  reward: string;
}

/** The four steps of a plan from the blocker and the answers (question id → option id). */
export function makePlan(blockerId: string, answers: Record<string, string>, worked: Record<string, Worked>): PlanPicks {
  const chosen: CoachOption[] = [];
  const b = BLOCKERS.find((x) => x.id === blockerId);
  if (b) chosen.push(b);
  for (const q of QUESTIONS) {
    const o = q.options.find((x) => x.id === answers[q.id]);
    if (o) chosen.push(o);
  }
  const ranked = score(chosen, worked).map((s) => s.slug);
  const best = (pool: string[], fallback: string, not?: string) => ranked.find((s) => pool.includes(s) && s !== not) ?? fallback;
  const start = best(START, 'two-minute-rule');
  // Timeboxing can be either; never both steps.
  const session = best(SESSION, 'pomodoro', start);
  return { when: WHEN, start, session, reward: REWARD };
}
