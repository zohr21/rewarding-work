/**
 * The deeper layers of help, under the tours (src/lib/tours.ts):
 *
 * - Tips & tricks: short cards on using something well. "Show me" opens the page and puts
 *   a spotlight on the thing (`?tip=<id>`, run by Guide.astro).
 * - "Did you know?": a tip with a `when`, offered by itself at a calm moment (after a session,
 *   on Today) when what you do suggests it. One a day at most, never the same one twice,
 *   never while the timer runs, and it can be turned off.
 * - Playbooks: one goal, a few steps across screens. A step is done when the data shows it
 *   (`done`), or once its "Show me" was opened when nothing can tell.
 *
 * What was shown, put away or tried is kept in the profile (src/lib/profile.ts).
 *
 * The words are English; other languages swap them by keys made from the ids (`tip.<id>.title`,
 * `book.<id>.name`, `book.<id>.<step id>.how`…), see `helpSlots`. Guide.astro checks at build
 * time that en.ts says the same as this file.
 */
import { getChains, getDone, getExam, getSessions, getTasks, readJson, type DoneItem, type Exam, type FocusSession, type Task } from './storage';
import { getBudget } from './budget';
import { getScreen } from './screen';
import { getCoach } from './coach';
import type { ModuleId } from '../config/site';
import { AREA_MODULE, type Area } from './tours';
import { translateData, type Slot } from './i18n';

/** What help looks at to know what fits. Built once per use; cheap enough. */
export interface HelpContext {
  sessions: FocusSession[];
  tasks: Task[];
  done: DoneItem[];
  chains: number;
  exam: Exam | null;
  spend: { entries: number; fromBank: number; repeats: number; incomes: number; budgetSet: boolean };
  screenDays: number;
  healthConnected: boolean;
  coachPlan: boolean;
}

function holds(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.values(v).some(holds);
  return false;
}

export function helpContext(): HelpContext {
  const b = getBudget();
  let healthConnected = false;
  try {
    healthConnected = holds(JSON.parse(readJson('body') ?? 'null'));
  } catch {
    /* nothing read yet */
  }
  return {
    sessions: getSessions(),
    tasks: getTasks(),
    done: getDone(),
    chains: getChains().length,
    exam: getExam(),
    spend: {
      entries: b.entries.length,
      fromBank: b.entries.filter((e) => e.from).length,
      repeats: b.repeats.length,
      incomes: b.incomes.length + b.incomeRepeats.length,
      budgetSet: b.budget !== null || Object.keys(b.budgets).length > 0,
    },
    screenDays: getScreen().days.length,
    healthConnected,
    coachPlan: !!getCoach().plan,
  };
}

/** Where "Show me" goes: a page, maybe one of its tabs, maybe one thing on it. */
export interface Show {
  path: string;
  tab?: string;
  target?: string;
}

export interface Tip {
  id: string;
  area: Area;
  title: string;
  text: string;
  show?: Show;
  /** Only in the Android app (it needs the phone). */
  appOnly?: boolean;
  /** When this is worth offering by itself as "Did you know?". */
  when?: (c: HelpContext) => boolean;
  /** Why it is offered, said under it: "Because …". */
  because?: string;
}

const done = (c: HelpContext) => c.sessions.filter((s) => s.completed);
const active = (c: HelpContext) => c.tasks.filter((t) => t.status === 'active');
const onList = (c: HelpContext, list: string) => active(c).filter((t) => (t.list ?? 'next') === list);

export const TIPS: Tip[] = [
  // Timer
  {
    id: 'timer-rhythm',
    area: 'Timer',
    title: 'Pick a rhythm that fits the work',
    text: 'Pomodoro (25/5) to get going. 52/17 for long, deep work. Flowtime counts up with no bell and checks in now and then.',
    show: { path: '/timer', target: '[data-rhythm-menu]' },
    when: (c) => done(c).length >= 5 && done(c).every((s) => s.mode === 'pomodoro'),
    because: 'Because all your sessions so far were Pomodoros: longer blocks may suit you now.',
  },
  {
    id: 'timer-jot',
    area: 'Timer',
    title: 'Catch a thought without losing focus',
    text: 'Tap Jot a thought and keep going. It lands in Tasks › Inbox, to sort after the session.',
    show: { path: '/timer', target: '[data-jot-open]' },
    when: (c) => done(c).length >= 3 && !c.tasks.some((t) => t.list === 'inbox'),
    because: 'Because you have not jotted a thought yet.',
  },
  {
    id: 'timer-task',
    area: 'Timer',
    title: 'Count the minutes toward a task',
    text: 'Pick a task before you start. Its minutes add up on the task, and Today shows how long it has had.',
    show: { path: '/timer', target: '[data-task-picks], [data-label]' },
    when: (c) => done(c).length >= 3 && active(c).length > 0 && !c.sessions.some((s) => s.taskId),
    because: 'Because your sessions are not linked to a task yet.',
  },
  {
    id: 'timer-log',
    area: 'Timer',
    title: 'Leave a note for future you',
    text: 'When a session ends, write what you did and the next step. Tomorrow starts from there, not from zero.',
    when: (c) => c.sessions.filter((s) => s.taskId).length >= 2 && !c.tasks.some((t) => t.log?.some((l) => l.next)),
    because: 'Because you focus on tasks but have not left a next step yet.',
  },
  {
    id: 'timer-sound',
    area: 'Timer',
    title: 'Sound to keep you in',
    text: 'The headphones at the top play rain, noise or music, and keep playing as you move around the app.',
    show: { path: '/timer', target: '.sound__button' },
  },
  // Tasks
  {
    id: 'tasks-today',
    area: 'Tasks',
    title: 'Plan Today with one to three tasks',
    text: 'A short list gets done. The rest waits in Next or Someday, without the guilt.',
    show: { path: '/tasks', target: '[data-tl-tabs]' },
    when: (c) => onList(c, 'today').length > 5,
    because: 'Because Today has more than 5 tasks on it.',
  },
  {
    id: 'tasks-frog',
    area: 'Tasks',
    title: 'Put the one you avoid first',
    text: 'The task you would most like to skip goes to the top of Today. Once it is done, the day gets lighter.',
    show: { path: '/tasks', target: '[data-tl-tabs]' },
  },
  {
    id: 'tasks-steps',
    area: 'Tasks',
    title: 'Split big tasks into small steps',
    text: 'Open a task and add steps you could each finish in one session. Focus starts on the step you tap.',
    show: { path: '/tasks', target: '[data-task-list] li' },
    when: (c) => active(c).length >= 3 && !c.tasks.some((t) => t.steps.length > 0),
    because: 'Because none of your tasks has steps yet.',
  },
  {
    id: 'tasks-inbox',
    area: 'Tasks',
    title: 'Empty the Inbox now and then',
    text: 'Move each jotted thought to a list, or let it go. An empty Inbox means nothing is nagging you.',
    show: { path: '/tasks', target: '[data-tl-tabs]' },
    when: (c) => onList(c, 'inbox').length >= 5,
    because: 'Because 5 or more thoughts are waiting in your Inbox.',
  },
  // Exam prep
  {
    id: 'exam-hours',
    area: 'Exam prep',
    title: 'Plan hours per chapter',
    text: 'Give each chapter the hours you think it needs. You can see at a glance which ones are behind.',
    show: { path: '/exam', target: '[data-exam-chapters]' },
    when: (c) => !!c.exam && c.exam.chapters.length > 0 && c.exam.chapters.every((ch) => !ch.plannedHours),
    because: 'Because your chapters have no planned hours yet.',
  },
  {
    id: 'exam-import',
    area: 'Exam prep',
    title: 'Practise with your own questions',
    text: 'Import multiple-choice questions from a .csv or .json file and match them to your chapters. The import window has a template.',
    show: { path: '/exam', target: '[data-eb-import-open]' },
    when: (c) => !!c.exam && c.exam.chapters.length > 0 && c.exam.questions.length === 0,
    because: 'Because your exam has chapters but no practice questions.',
  },
  {
    id: 'exam-practice',
    area: 'Exam prep',
    title: 'Practise in short rounds',
    text: 'A round asks a few questions. Mark the hard ones "Ask me this again" and they come back.',
    show: { path: '/exam', target: '[data-eb-start], [data-exam-bank]' },
    when: (c) => !!c.exam && c.exam.questions.length > 0 && c.exam.rounds.length === 0,
    because: 'Because you have questions but have not practised a round yet.',
  },
  // Coach
  {
    id: 'coach-way',
    area: 'Coach',
    title: 'Something in the way?',
    text: 'Tell Coach what makes it hard (too big, boring, tired…) and get one technique to try in the next few minutes.',
    show: { path: '/techniques', target: '[data-coach]' },
    when: (c) => c.sessions.slice(-10).filter((s) => !s.completed).length >= 3,
    because: 'Because a few of your recent sessions stopped early.',
  },
  {
    id: 'coach-plan',
    area: 'Coach',
    title: 'A plan for the week',
    text: 'Pick one technique and a cue for when to use it. After seven days Coach asks if it helped, and remembers what works for you.',
    show: { path: '/techniques', target: '[data-coach]' },
    when: (c) => done(c).length >= 15 && !c.coachPlan,
    because: 'Because you focus often: a weekly plan helps it stick.',
  },
  // Grove
  {
    id: 'grove-heatmap',
    area: 'Grove',
    title: 'Read your 12 weeks at a glance',
    text: 'Grove › Stats › heatmap: darker days had more focus. Flat to read a day, 3D for the shape, or a table if you like numbers.',
    show: { path: '/progress', tab: '[data-grove-tab="stats"]', target: '[data-heatmap]' },
    when: (c) => done(c).length >= 10,
    because: 'Because you have enough sessions to see a pattern.',
  },
  {
    id: 'grove-done',
    area: 'Grove',
    title: 'Count the small wins too',
    text: 'Grove › Done: add things you finished without the timer. Seeing them is part of the reward.',
    show: { path: '/progress', tab: '[data-grove-open="done"]', target: '[data-done-form]' },
    when: (c) => done(c).length >= 3 && c.done.length === 0,
    because: 'Because your Done list is still empty.',
  },
  {
    id: 'grove-chain',
    area: 'Grove',
    title: 'Keep a small chain going',
    text: 'Grove › Chains: one small thing a day, ticked on Today. Start from a ready-made one if you are not sure.',
    show: { path: '/progress', tab: '[data-grove-tab="chains"]', target: '[data-chain-form]' },
    when: (c) => done(c).length >= 7 && c.chains === 0,
    because: 'Because you show up often: a chain makes it visible.',
  },
  {
    id: 'grove-board',
    area: 'Grove',
    title: 'Grow with friends',
    text: 'Grove › Board: a weekly board of focus minutes. Join as a guest and add friends by code.',
    show: { path: '/progress', tab: '[data-grove-tab="board"]', target: '[data-board]' },
  },
  // Health
  {
    id: 'health-sleep',
    area: 'Health',
    title: 'See how sleep shapes your focus',
    text: 'Health › Sleep and focus puts your nights next to your focus time, so you can see what a good night is worth.',
    show: { path: '/health', target: '[data-hb-chart]' },
    when: (c) => c.healthConnected && done(c).length >= 10,
    because: 'Because you have both sleep and focus data now.',
  },
  {
    id: 'health-hand',
    area: 'Health',
    title: 'Fill a missed day by hand',
    text: 'When the phone missed a night or a walk, add it yourself. It counts the same.',
    show: { path: '/health', target: '[data-ht-log]' },
  },
  // Budget
  {
    id: 'budget-bank',
    area: 'Budget',
    title: 'Let bank alerts do the typing',
    text: 'Allow notification access once, and payments your bank texts you become expenses. You can bring in past SMS too.',
    show: { path: '/budget', target: '[data-bk-open-access], [data-bk-setup]' },
    appOnly: true,
    when: (c) => c.spend.entries >= 5 && c.spend.fromBank === 0,
    because: 'Because you type every expense in yourself.',
  },
  {
    id: 'budget-repeat',
    area: 'Budget',
    title: 'Add bills once',
    text: 'Rent, phone, subscriptions: add them as repeating, and they are added for you on their day each month.',
    show: { path: '/budget', target: '[data-bv-add-repeat]' },
    when: (c) => c.spend.entries >= 10 && c.spend.repeats === 0,
    because: 'Because you have no repeating bills yet.',
  },
  {
    id: 'budget-plan',
    area: 'Budget',
    title: 'Plan the month from your income',
    text: 'Add income, and it is split into needs, wants and savings. Savings go to your goals first.',
    show: { path: '/budget', target: '[data-bplan] [data-sheet-open="income"]' },
    when: (c) => c.spend.entries >= 10 && c.spend.incomes === 0,
    because: 'Because Budget knows your spending but not your income.',
  },
  {
    id: 'budget-private',
    area: 'Budget',
    title: 'Keep amounts private',
    text: 'The eye hides amounts on screen. The lock asks before Budget opens at all.',
    show: { path: '/budget', target: '[data-bl-eye]' },
  },
  // Screen time
  {
    id: 'screen-access',
    area: 'Screen time',
    title: 'See where your phone time goes',
    text: 'Switch on Usage access once. Grovyn reads phone time on this phone only, and shows it next to your plan.',
    show: { path: '/', target: '[data-screen-setup-open]' },
    when: (c) => c.screenDays === 0,
    because: 'Because Screen time is on but has no data yet.',
  },
  {
    id: 'screen-during',
    area: 'Screen time',
    title: 'Your phone during focus',
    text: 'After each session you see how much the phone was used while the timer ran. Fewer pickups, deeper focus.',
    show: { path: '/progress', tab: '[data-grove-tab="stats"]', target: '[data-screen-stats]' },
  },
  // You
  {
    id: 'you-backup',
    area: 'You',
    title: 'Keep a backup',
    text: 'You › This device: save a backup file now and then, or sign in so your focus and tasks follow you.',
    show: { path: '/account', target: '#acc-device, #acc-data' },
    when: (c) => done(c).length >= 25,
    because: 'Because you have a lot of focus history worth keeping.',
  },
  {
    id: 'you-sections',
    area: 'You',
    title: 'Only what you use',
    text: 'Turn sections on or off under You › Sections. Off means hidden, not deleted.',
    show: { path: '/account', target: '#acc-sections' },
  },
];

export interface PlaybookStep {
  id: string;
  title: string;
  how: string;
  /** "Show me": a tour (`?tour=`) or a tip (`?tip=`) on a page. */
  go: { tour?: string; tip?: string; path: string };
  done?: (c: HelpContext) => boolean;
}

export interface Playbook {
  id: string;
  name: string;
  /** One line under the name. */
  sub: string;
  module?: ModuleId;
  /** "Why this works", with the technique pages it rests on. */
  why: string;
  techniques: { slug: string; name: string }[];
  steps: PlaybookStep[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'avoid',
    name: 'Finish a big task you keep avoiding',
    sub: 'Tasks, steps and the timer',
    why: 'Doing the hard thing first, in short timed blocks, makes starting smaller than the dread.',
    techniques: [
      { slug: 'eat-the-frog', name: 'Eat the frog' },
      { slug: 'pomodoro', name: 'Pomodoro' },
    ],
    steps: [
      { id: 'avoid-today', title: 'Put it on Today, first', how: 'Tasks › Today. The one you would most like to avoid goes on top.', go: { path: '/tasks', tour: 'tasks' }, done: (c) => onList(c, 'today').length > 0 },
      { id: 'avoid-steps', title: 'Split it into small steps', how: 'Open the task and add steps you could each finish in one session.', go: { path: '/tasks', tip: 'tasks-steps' }, done: (c) => c.tasks.some((t) => t.steps.length > 0) },
      { id: 'avoid-focus', title: 'Focus on the first step', how: 'Tap the step, then Start. The minutes count toward the task.', go: { path: '/timer', tip: 'timer-task' }, done: (c) => c.sessions.some((s) => s.taskId) },
      { id: 'avoid-jot', title: 'Jot thoughts, don’t follow them', how: 'Tap Jot a thought on the timer. They wait in Tasks › Inbox.', go: { path: '/timer', tip: 'timer-jot' }, done: (c) => c.tasks.some((t) => t.list === 'inbox') },
      { id: 'avoid-next', title: 'Write the next step', how: 'When the session ends, note what you did and what comes next.', go: { path: '/timer', tour: 'timer' }, done: (c) => c.tasks.some((t) => t.log?.some((l) => l.next)) },
    ],
  },
  {
    id: 'exam',
    name: 'Study for an exam',
    sub: 'Exam prep, practice and the timer',
    module: 'exam',
    why: 'A date, a plan per chapter and testing yourself beat rereading. Practice questions show what you really know.',
    techniques: [
      { slug: 'time-blocking', name: 'Time blocking' },
      { slug: 'implementation-intentions', name: 'Implementation intentions' },
    ],
    steps: [
      { id: 'exam-set', title: 'Set the exam and its date', how: 'Exam prep › Set your goal.', go: { path: '/exam', tour: 'exam' }, done: (c) => !!c.exam },
      { id: 'exam-hours', title: 'Add chapters with hours', how: 'One chapter per part to study, with the hours you plan for it.', go: { path: '/exam', tip: 'exam-hours' }, done: (c) => !!c.exam?.chapters.some((ch) => ch.plannedHours) },
      { id: 'exam-import', title: 'Bring in practice questions', how: 'Import a .csv or .json of multiple-choice questions.', go: { path: '/exam', tip: 'exam-import' }, done: (c) => !!c.exam && c.exam.questions.length > 0 },
      { id: 'exam-round', title: 'Practise one round', how: 'Answer a few, and mark the hard ones to come back.', go: { path: '/exam', tip: 'exam-practice' }, done: (c) => !!c.exam && c.exam.rounds.length > 0 },
      { id: 'exam-focus', title: 'Focus on a chapter', how: 'Start a session from a chapter, so its hours fill up.', go: { path: '/exam', tour: 'exam' } },
    ],
  },
  {
    id: 'habit',
    name: 'Build a small daily habit',
    sub: 'Chains and Today',
    why: 'A tiny action at the same moment each day, made visible as a chain, is easier to keep than a big goal.',
    techniques: [
      { slug: 'dont-break-the-chain', name: 'Don’t break the chain' },
      { slug: 'two-minute-rule', name: 'Two-minute rule' },
    ],
    steps: [
      { id: 'habit-tiny', title: 'Make it tiny', how: 'Small enough to do on a bad day: one page, two minutes, one glass of water.', go: { path: '/techniques/two-minute-rule' } },
      { id: 'habit-chain', title: 'Start a chain', how: 'Grove › Chains. Name it, or pick a ready-made one.', go: { path: '/progress', tour: 'grove-chains' }, done: (c) => c.chains > 0 },
      { id: 'habit-today', title: 'Tick it on Today', how: 'Your chain shows on Today. Tick the day when it is done.', go: { path: '/', tour: 'today' } },
      { id: 'habit-miss', title: 'Missed a day? Start again', how: 'A broken chain is a new start. Your best chain stays.', go: { path: '/progress', tip: 'grove-chain' } },
    ],
  },
  {
    id: 'phone',
    name: 'Focus with the phone out of the way',
    sub: 'Screen time and the timer',
    module: 'screen',
    why: 'Seeing your phone time next to your plan, and during focus, makes the pull of the phone easier to notice and resist.',
    techniques: [{ slug: 'temptation-bundling', name: 'Temptation bundling' }],
    steps: [
      { id: 'phone-access', title: 'Turn on Usage access', how: 'Once. It stays on this phone.', go: { path: '/', tip: 'screen-access' }, done: (c) => c.screenDays > 0 },
      { id: 'phone-yesterday', title: 'Look at yesterday', how: 'Today shows your phone time next to what you planned.', go: { path: '/', tour: 'today' } },
      { id: 'phone-focus', title: 'Do one session, phone face down', how: 'Start a session and leave the phone alone until the bell.', go: { path: '/timer', tour: 'timer' }, done: (c) => done(c).length > 0 },
      { id: 'phone-during', title: 'See your phone during focus', how: 'Grove › Stats › Focus and phone.', go: { path: '/progress', tip: 'screen-during' } },
    ],
  },
  {
    id: 'budget',
    name: 'Keep a budget without typing',
    sub: 'Bank alerts, bills and the month’s plan',
    module: 'budget',
    why: 'The less you type, the longer you keep it up. A plan from your income tells you what is safe to spend.',
    techniques: [],
    steps: [
      { id: 'budget-month', title: 'Set a budget for the month', how: 'Budget › Edit budgets. One total, or one per category.', go: { path: '/budget', tour: 'budget' }, done: (c) => c.spend.budgetSet },
      { id: 'budget-bank', title: 'Let bank alerts add expenses', how: 'Allow notification access once.', go: { path: '/budget', tip: 'budget-bank' }, done: (c) => c.spend.fromBank > 0 },
      { id: 'budget-repeat', title: 'Add your bills once', how: 'Repeating bills are added on their day each month.', go: { path: '/budget', tip: 'budget-repeat' }, done: (c) => c.spend.repeats > 0 },
      { id: 'budget-plan', title: 'Plan the month from income', how: 'Needs, wants and savings; savings go to goals first.', go: { path: '/budget', tip: 'budget-plan' }, done: (c) => c.spend.incomes > 0 },
      { id: 'budget-private', title: 'Keep it private', how: 'Hide amounts with the eye, or lock Budget.', go: { path: '/budget', tip: 'budget-private' } },
    ],
  },
  {
    id: 'sleep',
    name: 'Sleep better, focus better',
    sub: 'Health and Stats',
    module: 'health',
    why: 'Focus follows sleep. Seeing both side by side shows what a good night is worth to you.',
    techniques: [],
    steps: [
      { id: 'sleep-connect', title: 'Connect Health Connect', how: 'Health › Connect. Sleep and steps come in by themselves.', go: { path: '/health', tour: 'health' }, done: (c) => c.healthConnected },
      { id: 'sleep-hand', title: 'Fill missed nights by hand', how: 'When the phone missed one, add it yourself.', go: { path: '/health', tip: 'health-hand' } },
      { id: 'sleep-focus', title: 'Compare sleep and focus', how: 'Health › Sleep and focus, after a week or two.', go: { path: '/health', tip: 'health-sleep' } },
      { id: 'sleep-same', title: 'Focus at the same time each day', how: 'A regular start time helps both sleep and focus. Grove › Stats shows when you focus.', go: { path: '/progress', tour: 'grove-stats' } },
    ],
  },
];

/** Every line of the tips and playbooks, with its key. */
export function helpSlots(): Slot[] {
  const slots: Slot[] = [];
  for (const tip of TIPS) {
    slots.push([tip, 'title', `tip.${tip.id}.title`], [tip, 'text', `tip.${tip.id}.text`]);
    if (tip.because) slots.push([tip, 'because', `tip.${tip.id}.because`]);
  }
  for (const p of PLAYBOOKS) {
    slots.push([p, 'name', `book.${p.id}.name`], [p, 'sub', `book.${p.id}.sub`], [p, 'why', `book.${p.id}.why`]);
    for (const s of p.steps) slots.push([s, 'title', `book.${p.id}.${s.id}.title`], [s, 'how', `book.${p.id}.${s.id}.how`]);
    for (const tech of p.techniques) slots.push([tech, 'name', `book.tech.${tech.slug}`]);
  }
  return slots;
}

translateData(helpSlots());

export function tipById(id: string): Tip | undefined {
  return TIPS.find((t) => t.id === id);
}

export function playbookById(id: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.id === id);
}

/** Is this area's section on (and, for app-only tips, are we in the app)? */
export function areaOn(area: Area, modules: Record<ModuleId, boolean>): boolean {
  const m = AREA_MODULE[area];
  return !m || modules[m];
}

export function stepDone(step: PlaybookStep, c: HelpContext, tried: string[]): boolean {
  return (step.done ? step.done(c) : false) || tried.includes(step.id);
}

/**
 * Today's "Did you know?": the one already picked today (unless put away), else the first tip
 * whose `when` holds and that was never shown. Returns the pick, and whether it is new today.
 */
export function pickNudge(
  c: HelpContext,
  prefs: { tips?: string[]; nudge?: { day: string; id: string }; nudgesOff?: boolean },
  modules: Record<ModuleId, boolean>,
  today: string,
  app: boolean,
): Tip | null {
  if (prefs.nudgesOff) return null;
  const put = prefs.tips ?? [];
  if (prefs.nudge?.day === today) {
    return put.includes(prefs.nudge.id) ? null : (tipById(prefs.nudge.id) ?? null);
  }
  return (
    TIPS.find((t) => {
      if (!t.when || put.includes(t.id) || !areaOn(t.area, modules) || (t.appOnly && !app)) return false;
      try {
        return t.when(c);
      } catch {
        return false;
      }
    }) ?? null
  );
}
