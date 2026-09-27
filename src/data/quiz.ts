/**
 * The home page quiz. Edit freely — see README "Editing the quiz".
 *
 * How scoring works:
 *  - Each answer gives points to one or more techniques (by technique slug).
 *  - Points are added up across all four answers.
 *  - The top 2 techniques are recommended, plus a 3rd if it scored at least
 *    THIRD_PICK_RATIO of the top score.
 *  - Ties are broken by the order of TIE_BREAK (earlier wins).
 *
 * Slugs are checked at build time: a typo in a slug fails `npm run build`.
 */

export interface QuizOption {
  /** Unique within its question. */
  id: string;
  label: string;
  /** technique slug → points */
  points: Record<string, number>;
}

export interface QuizQuestion {
  id: string;
  question: string;
  /** Optional one-line hint under the question. */
  hint?: string;
  options: QuizOption[];
}

export const THIRD_PICK_RATIO = 0.6;

/** Used only to break ties: broadly useful, low-effort techniques first. */
export const TIE_BREAK = [
  'pomodoro',
  'two-minute-rule',
  'implementation-intentions',
  'timeboxing',
  'time-blocking',
  'eat-the-frog',
  'dont-break-the-chain',
  'temptation-bundling',
  'flowtime',
  'fifty-two-seventeen',
];

export const QUIZ: QuizQuestion[] = [
  {
    id: 'blocker',
    question: "What's getting in the way most right now?",
    options: [
      {
        id: 'start',
        label: 'Getting started',
        points: { 'two-minute-rule': 3, 'implementation-intentions': 2, pomodoro: 2, 'temptation-bundling': 1, 'eat-the-frog': 1 },
      },
      {
        id: 'focus',
        label: 'Staying focused once I start',
        points: { pomodoro: 2, 'fifty-two-seventeen': 2, flowtime: 2, 'time-blocking': 1, 'implementation-intentions': 1 },
      },
      {
        id: 'progress',
        label: "Feeling like I'm getting anywhere",
        points: { 'dont-break-the-chain': 3, timeboxing: 2, pomodoro: 1 },
      },
      {
        id: 'overload',
        label: 'Too many things at once',
        points: { 'time-blocking': 3, 'eat-the-frog': 2, timeboxing: 2, 'two-minute-rule': 1 },
      },
      {
        id: 'energy',
        label: 'Running out of energy',
        points: { 'fifty-two-seventeen': 2, flowtime: 2, 'temptation-bundling': 2, pomodoro: 1, 'time-blocking': 1 },
      },
    ],
  },
  {
    id: 'attention',
    question: 'How long can you usually focus before your mind wanders?',
    options: [
      { id: 'short', label: 'Less than 15 minutes', points: { pomodoro: 2, 'two-minute-rule': 1, timeboxing: 1 } },
      { id: 'medium', label: 'About 20–30 minutes', points: { pomodoro: 2, timeboxing: 1 } },
      { id: 'long', label: '45 minutes or more', points: { 'fifty-two-seventeen': 2, flowtime: 1 } },
      { id: 'varies', label: 'It varies a lot', points: { flowtime: 2, timeboxing: 1 } },
    ],
  },
  {
    id: 'work',
    question: 'What kind of work is it?',
    options: [
      { id: 'small', label: 'Lots of small tasks', points: { 'two-minute-rule': 2, 'time-blocking': 1, timeboxing: 1 } },
      { id: 'big', label: 'One big project', points: { 'eat-the-frog': 2, 'time-blocking': 1, 'fifty-two-seventeen': 1 } },
      { id: 'habit', label: 'Something I want to do every day', points: { 'dont-break-the-chain': 3, 'implementation-intentions': 2 } },
      { id: 'chore', label: 'Boring or unpleasant chores', points: { 'temptation-bundling': 3, timeboxing: 1, 'two-minute-rule': 1 } },
    ],
  },
  {
    id: 'help',
    question: 'What sounds most helpful?',
    options: [
      { id: 'plan', label: 'A clear plan of when and what', points: { 'implementation-intentions': 2, 'time-blocking': 2 } },
      { id: 'timer', label: 'A timer to follow', points: { pomodoro: 2, 'fifty-two-seventeen': 1, timeboxing: 1 } },
      { id: 'see', label: 'Seeing my progress build up', points: { 'dont-break-the-chain': 2, pomodoro: 1 } },
      { id: 'enjoy', label: 'Making it more enjoyable', points: { 'temptation-bundling': 3 } },
    ],
  },
];

export interface QuizPick {
  slug: string;
  score: number;
  /** Labels of the answers that gave this technique points. */
  because: string[];
}

/** Pure scoring function — shared by the page script (and easy to test). */
export function scoreQuiz(answers: Record<string, string>): QuizPick[] {
  const scores = new Map<string, QuizPick>();
  for (const q of QUIZ) {
    const option = q.options.find((o) => o.id === answers[q.id]);
    if (!option) continue;
    for (const [slug, pts] of Object.entries(option.points)) {
      const pick = scores.get(slug) ?? { slug, score: 0, because: [] };
      pick.score += pts;
      pick.because.push(option.label);
      scores.set(slug, pick);
    }
  }
  const rank = (slug: string) => {
    const i = TIE_BREAK.indexOf(slug);
    return i === -1 ? TIE_BREAK.length : i;
  };
  const sorted = [...scores.values()].sort((a, b) => b.score - a.score || rank(a.slug) - rank(b.slug));
  const top = sorted[0]?.score ?? 0;
  const picks = sorted.slice(0, 2);
  const third = sorted[2];
  if (third && third.score >= top * THIRD_PICK_RATIO) picks.push(third);
  return picks;
}
