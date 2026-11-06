/**
 * Short tours: two to four tips that point at the real thing on a screen. In the app a tour
 * starts by itself the first time someone opens that screen, or that tab of it; anywhere, the
 * ? button in the header (Guide.astro) replays it, and You › Help & guides lists them all.
 *
 * A step's `target` is a CSS selector; the first visible match is used, and a step whose
 * target isn't on the page (a section off, an empty list) is left out. `tap` steps end when
 * the person taps the thing itself, so the last tip is something to do, not to read.
 * Which tours were seen is kept in the profile (src/lib/profile.ts). Tips & tricks and
 * playbooks, the deeper layers, are in src/lib/help.ts.
 */
import type { ModuleId } from '../config/site';

export interface TourStep {
  target: string;
  title: string;
  text: string;
  /** Tapping the target moves on, and the Next button is left out. */
  tap?: boolean;
}

/** The areas help is grouped by, in the order the guides list shows them. */
export const AREAS = ['Today', 'Timer', 'Tasks', 'Exam prep', 'Coach', 'Grove', 'Health', 'Budget', 'Screen time', 'You'] as const;
export type Area = (typeof AREAS)[number];

/** Areas that belong to an optional section. */
export const AREA_MODULE: Partial<Record<Area, ModuleId>> = {
  'Exam prep': 'exam',
  Health: 'health',
  Budget: 'budget',
  'Screen time': 'screen',
};

export interface Tour {
  id: string;
  /** Name in the guides list. */
  name: string;
  area: Area;
  /** Page it runs on, without the base path. */
  path: string;
  /** A tour for one tab of the page: the tab's button. It runs when that tab is opened. */
  tab?: string;
  /** Only while this optional section is on. */
  module?: ModuleId;
  steps: TourStep[];
  /** Quick answers in the ? sheet for this screen. */
  faq: [string, string][];
}

export const TOURS: Tour[] = [
  {
    id: 'today',
    name: 'Today',
    area: 'Today',
    path: '/',
    steps: [
      { target: '[data-td-first]', title: 'What to do next', text: 'The one thing to work on now, with a button to start.' },
      { target: '[data-td-steps]', title: 'First quests', text: 'A few things to try first. Each one can show you how.' },
      { target: '[data-screen-today]', title: 'Your phone yesterday', text: 'Phone time next to what you planned. It stays on this phone.' },
      { target: '.app-nav', title: 'Getting around', text: 'Focus has the timer and tasks, Grove shows what you have grown, You has settings and help.' },
    ],
    faq: [
      ['Where do I start a focus session?', 'Tap Start focusing here, or open Focus in the bar below.'],
      ['Can I change what shows up here?', 'Yes. Turn sections on or off under You › Sections.'],
    ],
  },
  {
    id: 'timer',
    name: 'Focus timer',
    area: 'Timer',
    path: '/timer',
    steps: [
      { target: '[data-dial]', title: 'Your focus time', text: '25 minutes is a good first try. Every minute counts, even if you stop early.' },
      { target: '[data-rhythm-menu]', title: 'Pick a rhythm', text: 'Pomodoro to get going, 52/17 for deep work, Flowtime to count up with no bell.' },
      { target: '[data-jot-open]', title: 'A thought popped up?', text: 'Jot it here and keep going. It waits in Tasks › Inbox.' },
      { target: '[data-action="toggle"]', title: 'Now you try', text: 'Tap Start. Every minute you focus helps Sprig grow.', tap: true },
    ],
    faq: [
      ['What counts as a focus minute?', 'Every minute the timer runs. Pausing stops the count; nothing is lost.'],
      ['Can I change the 25 minutes?', 'Yes. Pick another rhythm, or set your own lengths under Custom.'],
      ['Where do jotted thoughts go?', 'To Tasks › Inbox, so you can sort them after the session.'],
    ],
  },
  {
    id: 'tasks',
    name: 'Tasks and steps',
    area: 'Tasks',
    path: '/tasks',
    steps: [
      { target: '[data-tl-form]', title: 'Add a task', text: 'Type what you want to do and press Enter.' },
      { target: '[data-tl-tabs]', title: 'Your lists', text: 'Today is a short plan, Next comes after, Someday is for one day. Inbox holds thoughts jotted on the timer, to sort.' },
      { target: '[data-task-list] li', title: 'Small steps', text: 'Open a task to split it into small steps, then focus on one at a time.' },
    ],
    faq: [
      ['How do I split a task into steps?', 'Open the task and add steps. Focus starts on the step you pick.'],
      ['What is the Inbox for?', 'Thoughts you jot on the timer land there. Move each one to a list, or let it go.'],
      ['Where do finished tasks go?', 'They fold into "finished" at the bottom, and into Grove › Done.'],
    ],
  },
  {
    id: 'exam',
    name: 'Exam prep',
    area: 'Exam prep',
    path: '/exam',
    module: 'exam',
    steps: [
      { target: '[data-eg-hero], [data-eg-form]', title: 'Your exam', text: 'The exam, its date, and how far along you are. Edit it any time.' },
      { target: '[data-exam-chapters]', title: 'Chapters', text: 'Add the parts to study, with the hours you plan for each. Start a session on one from here.' },
      { target: '[data-exam-bank]', title: 'Practice questions', text: 'Import multiple-choice questions, then practise in short rounds.' },
      { target: '[data-exam-past]', title: 'Past exams', text: 'Finished exams and how they went stay here.' },
    ],
    faq: [
      ['What file can I import questions from?', 'A .csv or .json of multiple-choice questions. The import window has a CSV template.'],
      ['Can I prepare for two exams?', 'One plan at a time. Finish or delete it to start the next; finished ones stay under Past exams.'],
    ],
  },
  {
    id: 'coach',
    name: 'Coach techniques',
    area: 'Coach',
    path: '/techniques',
    steps: [
      { target: '[data-coach]', title: 'Stuck?', text: "Say what's in the way, and the coach picks a technique to try now." },
      { target: '[data-library]', title: 'All techniques', text: 'Every technique, with how strong the evidence for it is.' },
    ],
    faq: [
      ['Which technique should I try?', 'Start with what is in the way today; the coach suggests one and asks later if it helped.'],
      ['What is a plan for the week?', 'One technique, a cue for when to use it, and a check-in after seven days.'],
    ],
  },
  {
    id: 'grove',
    name: 'Grove and tiers',
    area: 'Grove',
    path: '/progress',
    steps: [
      { target: '[data-tiers-sprig], [data-tiers-seed]', title: 'This is Sprig', text: 'Sprig grows with your focus, from a seed to a whole grove.' },
      { target: '[data-tiers-list]', title: 'Tiers', text: 'Seedling, Sprout, Sapling, Tree, Grove. A slow day never takes one away.' },
      { target: '[data-grove-tabs]', title: 'More to see', text: 'Your stats, finished things and chains each have a tab here.' },
    ],
    faq: [
      ["Why didn't Sprig grow today?", 'Sprig grows with your focus tier, over days. A short day never takes growth away.'],
      ['How do I reach the next tier?', 'Keep focusing. The tier card shows how far the next one is.'],
    ],
  },
  {
    id: 'grove-stats',
    name: 'Grove › Stats',
    area: 'Grove',
    path: '/progress',
    tab: '[data-grove-tab="stats"]',
    steps: [
      { target: '[data-progress-stats]', title: 'This week', text: 'Minutes this week and sessions so far.' },
      { target: '[data-focus-trend]', title: 'Focus over time', text: 'Switch between 14 days, 30 days and 12 weeks.' },
      { target: '[data-heatmap]', title: 'Twelve weeks at a glance', text: 'Each square is a day; darker means more focus. Flat reads a day, 3D shows the shape.' },
      { target: '[data-screen-stats]', title: 'Focus and phone', text: 'How much the phone was used during focus, and your top apps this week.' },
      { target: '[data-technique-donut]', title: 'Time by technique', text: 'Which ways of working you actually use.' },
    ],
    faq: [['Why are my charts empty?', 'They fill in after your first finished session.']],
  },
  {
    id: 'grove-done',
    name: 'Grove › Done',
    area: 'Grove',
    path: '/progress',
    tab: '[data-grove-tab="done"]',
    steps: [
      { target: '[data-done-form]', title: 'Count the small wins', text: 'Add something you finished, even without the timer. Small things count.' },
      { target: '[data-done-groups], [data-done-empty]', title: 'Your Done list', text: 'Finished tasks and steps show up here by themselves.' },
    ],
    faq: [['Can I remove something from Done?', 'Yes. Untick it, or untick the step it came from.']],
  },
  {
    id: 'grove-chains',
    name: 'Grove › Chains',
    area: 'Grove',
    path: '/progress',
    tab: '[data-grove-tab="chains"]',
    steps: [
      { target: '[data-chain-form]', title: 'One small thing a day', text: 'Name it, or start from a ready-made one. Small is the point.' },
      { target: '[data-chain-cal]', title: 'Mark the day', text: 'Tick each day you did it. The calendar shows your chain.' },
      { target: '[data-chain-best]', title: 'Your best chain', text: 'Your longest run so far. A missed day starts a new chain, not a failure.' },
    ],
    faq: [['Can I have more than one chain?', 'Yes. Each one shows on Today with its own day boxes.']],
  },
  {
    id: 'grove-board',
    name: 'Grove › Board',
    area: 'Grove',
    path: '/progress',
    tab: '[data-grove-tab="board"]',
    steps: [
      { target: '[data-board]', title: 'Grow with friends', text: 'A weekly board of focus minutes. Join as a guest, no account needed.' },
      { target: '[data-board-code], [data-board-add]', title: 'Add friends', text: 'Share your code, or add a friend’s, to compare with just them.' },
    ],
    faq: [['What do others see?', 'Your nickname, tier and minutes this week. Nothing about your tasks.']],
  },
  {
    id: 'health',
    name: 'Health',
    area: 'Health',
    path: '/health',
    module: 'health',
    steps: [
      { target: '[data-ht-rings]', title: 'Your day', text: 'Sleep, steps and movement for today, at a glance.' },
      { target: '[data-ht-cal]', title: 'Another day', text: 'Pick any day to see it.' },
      { target: '[data-ht-log]', title: 'Add it yourself', text: 'Add something by hand when the phone missed it.' },
      { target: '[data-ht-garden]', title: 'Your garden', text: 'What you looked after today grows here.' },
    ],
    faq: [
      ['Where do my steps come from?', 'From your phone, through Health Connect. You can also add them by hand.'],
      ['Why are my steps old?', 'The app that counts them (Samsung Health, Mi Fitness…) has to write to Health Connect. Open it once to sync.'],
    ],
  },
  {
    id: 'budget',
    name: 'Budget',
    area: 'Budget',
    path: '/budget',
    module: 'budget',
    steps: [
      { target: '[data-bv-meter]', title: 'This month', text: 'What is left of your plan, and how fast it is going.' },
      { target: '[data-bv-add]', title: 'Add an expense', text: 'Add one by hand. Bank alerts can add them for you too.' },
      { target: '[data-bk-setup]', title: 'Bank alerts', text: 'Set up once: payments your bank texts you become expenses.' },
      { target: '[data-bplan] [data-sheet-open="income"]', title: 'Plan from your income', text: 'Add income, and it is split into needs, wants and savings.' },
      { target: '[data-bl-eye]', title: 'Keep it private', text: 'Hide the amounts with the eye, or lock Budget.' },
    ],
    faq: [
      ['Can I hide the amounts?', 'Yes. Tap the eye to hide amounts on this screen.'],
      ['Does changing the currency convert my expenses?', 'No. It only changes the sign shown in front of amounts.'],
    ],
  },
  {
    id: 'you',
    name: 'You and settings',
    area: 'You',
    path: '/account',
    steps: [
      { target: '#acc-sections', title: 'Your sections', text: 'Turn Exam prep, Health, Budget and Screen time on or off.' },
      { target: '#acc-prefs', title: 'Make it yours', text: 'Look, sound and timer preferences.' },
      { target: '#acc-device, #acc-data', title: 'Your data', text: 'Save a backup, bring one back, or delete everything.' },
      { target: '#acc-help', title: 'Help any time', text: 'Tours, tips and playbooks, all in one place.' },
    ],
    faq: [
      ['Is my data synced?', 'When you sign in, focus, tasks, chains, exam prep and Budget sync. Steps, sleep and phone time stay on this phone.'],
      ['How do I move to a new phone?', 'Sign in on both, or save a backup here and open it on the new one.'],
    ],
  },
];

/** The page path without the base, from `location.pathname` (which may end in index.html). */
export function pathOf(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const inside = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return inside.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
}

/** The page's own tour (not a tab's). */
export function tourFor(pathname: string): Tour | undefined {
  const path = pathOf(pathname);
  return TOURS.find((t) => t.path === path && !t.tab);
}

/** The page's tab tours. */
export function tabToursFor(pathname: string): Tour[] {
  const path = pathOf(pathname);
  return TOURS.filter((t) => t.path === path && t.tab);
}

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
