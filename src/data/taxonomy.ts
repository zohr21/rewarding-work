/**
 * Shared vocabularies: problems, categories, evidence levels, tools.
 * The content schema (src/content.config.ts) validates technique frontmatter
 * against these lists, so a typo in a technique file fails the build.
 */

// ---------- Problems ----------
export const PROBLEM_SLUGS = ['cant-start', 'lose-focus', 'no-progress', 'too-much', 'burn-out'] as const;
export type ProblemSlug = (typeof PROBLEM_SLUGS)[number];

export interface Problem {
  slug: ProblemSlug;
  /** Card text, in the user's voice. */
  title: string;
  /** Short label for filters. */
  short: string;
  /** One line for the home page card. */
  teaser: string;
  /** 2–3 sentence explanation for the problem page. */
  explanation: string;
}

export const PROBLEMS: Record<ProblemSlug, Problem> = {
  'cant-start': {
    slug: 'cant-start',
    title: "I can't start",
    short: "Can't start",
    teaser: 'The task feels too big, vague or unpleasant to begin.',
    explanation:
      "Starting is often the hardest part. A task that feels big, vague or unpleasant creates friction, and putting it off brings short-term relief — which makes putting it off again more likely. The fix is usually to make the first step smaller, more specific, or more pleasant, not to find more willpower.",
  },
  'lose-focus': {
    slug: 'lose-focus',
    title: 'I lose focus',
    short: 'Lose focus',
    teaser: 'You start, then drift to your phone or something else.',
    explanation:
      "Attention drifts — to your phone, to a different task, to nothing in particular. Open-ended work sessions make it easy to drift because there's no clear point where you're \"allowed\" to stop. Giving the session a clear shape, a clear target and a planned break makes it easier to stay with one thing.",
  },
  'no-progress': {
    slug: 'no-progress',
    title: 'I feel no progress',
    short: 'No progress',
    teaser: 'You work hard but it feels like nothing moves.',
    explanation:
      "Long projects rarely give you a sense of being done, so effort can feel like it disappears. Seeing progress — even small, visible markers of it — is motivating in its own right. These techniques make the work you've already done visible.",
  },
  'too-much': {
    slug: 'too-much',
    title: 'Too much to do',
    short: 'Too much',
    teaser: 'Everything competes for attention and nothing gets done.',
    explanation:
      "A long list with no order makes every task compete for attention, and deciding what to do next becomes its own exhausting job. The aim here is to decide once — what matters, what comes first, and when each thing will happen — so you can stop re-deciding.",
  },
  'burn-out': {
    slug: 'burn-out',
    title: 'I burn out',
    short: 'Burn out',
    teaser: 'You run out of energy long before the work runs out.',
    explanation:
      "Working in long unbroken stretches, or only ever doing the unpleasant parts, drains energy faster than it returns. Deliberate breaks, sustainable rhythms and building some enjoyment into the work help you keep going for weeks, not just one afternoon. If exhaustion is persistent, it's worth talking to a doctor — productivity techniques are not a treatment for burnout.",
  },
};

// ---------- Categories ----------
export const CATEGORY_SLUGS = ['reward', 'visual', 'time', 'structure'] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const CATEGORIES: Record<CategorySlug, { label: string; description: string }> = {
  reward: { label: 'Reward', description: 'Make the work itself, or finishing it, feel better.' },
  visual: { label: 'Visual progress', description: 'Make effort and progress visible.' },
  time: { label: 'Time', description: 'Shape work into sessions and breaks.' },
  structure: { label: 'Structure', description: 'Decide what to do, when, and how to begin.' },
};

// ---------- Evidence ----------
export const EVIDENCE_LEVELS = ['well-researched', 'some evidence', 'popular, mostly anecdotal'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE: Record<EvidenceLevel, { label: string; key: 'strong' | 'some' | 'anecdotal'; description: string }> = {
  'well-researched': {
    label: 'Well-researched',
    key: 'strong',
    description: 'Tested in many controlled studies with fairly consistent results.',
  },
  'some evidence': {
    label: 'Some evidence',
    key: 'some',
    description: 'Some studies support it, or it rests on well-studied ideas, but direct evidence is limited.',
  },
  'popular, mostly anecdotal': {
    label: 'Mostly anecdotal',
    key: 'anecdotal',
    description: 'Widely used and may help you, but little or no direct research.',
  },
};

// ---------- Tools ----------
export const TOOL_SLUGS = ['timer', 'progress', 'chain', 'breakdown'] as const;
export type ToolSlug = (typeof TOOL_SLUGS)[number];

// ---------- Timer modes ----------
export const TIMER_MODES = ['pomodoro', '52-17', 'flowtime', 'custom'] as const;
export type TimerMode = (typeof TIMER_MODES)[number];

export const TIMER_MODE_LABELS: Record<TimerMode, string> = {
  pomodoro: 'Pomodoro',
  '52-17': '52/17',
  flowtime: 'Flowtime',
  custom: 'Custom',
};
