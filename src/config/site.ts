import type { Key } from '../lib/i18n/en';

/** Site-wide settings. Change the name here — it is used everywhere. */
export const SITE = {
  name: 'Grovyn',
  /** Who owns and makes Grovyn: shown in the footer, the privacy page and the page metadata. */
  owner: 'Zohr Babazade',
  tagline: 'Small, evidence-aware techniques that make work feel worth doing — and let you try them right now.',
  description:
    'A guide and toolkit for making tasks feel rewarding: motivation techniques, visual progress, focus timers and task structuring.',
  lang: 'en',
  /** Where people write for help, privacy questions and data deletion. */
  supportEmail: 'grovyn.support@gmail.com',
} as const;

export interface NavItem {
  label: string;
  /** Its label's key in the word lists (src/lib/i18n/en.ts). */
  t: Key;
  href: string;
  /** Every path that belongs to this item, when that is more than `href` and its children. */
  under?: string[];
  /** An optional section: the item shows only while it is on (src/lib/profile.ts). */
  module?: ModuleId;
}

/** Optional sections, picked on Welcome and changed under You. Focus, Tasks and the grove are always on. */
export const MODULES = [
  { id: 'exam', label: 'Exam prep', hint: 'A study plan for one exam' },
  { id: 'health', label: 'Health', hint: 'Sleep, steps and wellbeing spend' },
  { id: 'budget', label: 'Budget', hint: 'Spending, from your bank alerts' },
  { id: 'screen', label: 'Screen time', hint: 'Phone time next to your plan' },
] as const;
export type ModuleId = (typeof MODULES)[number]['id'];
/** Sections only the Android app can do; the site leaves them out of Welcome and You. */
export const APP_ONLY_MODULES: readonly ModuleId[] = ['screen'];

/** The pages inside Focus, in the order of its tabs (FocusTabs.astro). Focus opens on the first. */
export const FOCUS_TABS: NavItem[] = [
  { label: 'Timer', t: 'nav.timer', href: '/timer' },
  { label: 'Tasks', t: 'nav.tasks', href: '/tasks' },
  { label: 'Exam prep', t: 'nav.exam', href: '/exam', module: 'exam' },
  { label: 'Coach', t: 'nav.coach', href: '/techniques', under: ['/techniques', '/problems'] },
];

export const FOCUS: NavItem = {
  label: 'Focus',
  t: 'nav.focus',
  href: FOCUS_TABS[0]!.href,
  under: FOCUS_TABS.flatMap((tab) => tab.under ?? [tab.href]),
};

/** Health and Budget, as the tabs of one "Life" place in the Android app when both are on (LifeTabs.astro). */
export const LIFE_TABS: NavItem[] = [
  { label: 'Health', t: 'nav.health', href: '/health' },
  { label: 'Budget', t: 'nav.budget', href: '/budget' },
];

export const LIFE: NavItem = { label: 'Life', t: 'nav.life', href: LIFE_TABS[0]!.href, under: LIFE_TABS.map((tab) => tab.href) };

export const NAV: NavItem[] = [
  { label: 'Today', t: 'nav.today', href: '/' },
  FOCUS,
  { label: 'Health', t: 'nav.health', href: '/health', module: 'health' },
  { label: 'Budget', t: 'nav.budget', href: '/budget', module: 'budget' },
  { label: 'Grove', t: 'nav.grove', href: '/progress' },
];
