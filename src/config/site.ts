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
}

export const NAV: NavItem[] = [
  { label: 'Techniques', href: '/techniques' },
  { label: 'Timer', href: '/timer' },
  { label: 'Progress', href: '/progress' },
];
