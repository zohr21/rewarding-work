/** Site-wide settings. Change the name here — it is used everywhere. */
export const SITE = {
  name: 'Rewarding Work',
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
}

/** The pages inside Focus, in the order of its tabs (FocusTabs.astro). Focus opens on the first. */
export const FOCUS_TABS: NavItem[] = [
  { label: 'Timer', href: '/timer' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Exam prep', href: '/exam' },
  { label: 'Techniques', href: '/techniques', under: ['/techniques', '/problems'] },
];

export const FOCUS: NavItem = {
  label: 'Focus',
  href: FOCUS_TABS[0]!.href,
  under: FOCUS_TABS.flatMap((tab) => tab.under ?? [tab.href]),
};

export const NAV: NavItem[] = [{ label: 'Home', href: '/' }, FOCUS, { label: 'Progress', href: '/progress' }];
