/** Site-wide settings. Change the name here — it is used everywhere. */
export const SITE = {
  name: 'Grovyn',
  tagline: 'Small, evidence-aware techniques that make work feel worth doing — and let you try them right now.',
  description:
    'A guide and toolkit for making tasks feel rewarding: motivation techniques, visual progress, focus timers and task structuring.',
  lang: 'en',
} as const;

export interface NavItem {
  label: string;
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
] as const;
export type ModuleId = (typeof MODULES)[number]['id'];

/** The pages inside Focus, in the order of its tabs (FocusTabs.astro). Focus opens on the first. */
export const FOCUS_TABS: NavItem[] = [
  { label: 'Timer', href: '/timer' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Exam prep', href: '/exam', module: 'exam' },
  { label: 'Coach', href: '/techniques', under: ['/techniques', '/problems'] },
];

export const FOCUS: NavItem = {
  label: 'Focus',
  href: FOCUS_TABS[0]!.href,
  under: FOCUS_TABS.flatMap((tab) => tab.under ?? [tab.href]),
};

export const NAV: NavItem[] = [
  { label: 'Today', href: '/' },
  FOCUS,
  { label: 'Health', href: '/health', module: 'health' },
  { label: 'Budget', href: '/budget', module: 'budget' },
  { label: 'Grove', href: '/progress' },
];
