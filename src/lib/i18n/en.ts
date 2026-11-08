/**
 * English: the source every other language translates. Keys are `area.thing`.
 *
 * - `{name}` is filled in by `t(key, { name })`.
 * - A plural is an object of Intl.PluralRules categories, used through `tn(key, n)`;
 *   `{n}` is the number. English needs `one` and `other`; Russian also `few` and `many`.
 * - A key missing from another language shows in English, so a half-done list still works.
 */
export const en = {
  // Navigation (src/config/site.ts, AppNav, FocusTabs)
  'nav.main': 'Main',
  'nav.today': 'Today',
  'nav.focus': 'Focus',
  'nav.health': 'Health',
  'nav.budget': 'Budget',
  'nav.grove': 'Grove',
  'nav.you': 'You',
  'nav.timer': 'Timer',
  'nav.tasks': 'Tasks',
  'nav.exam': 'Exam prep',
  'nav.coach': 'Coach',
  'nav.skip': 'Skip to content',

  // Language picker (You › Preferences)
  'lang.label': 'Language',
  'lang.beta': 'beta',
  'lang.betaNote': 'Russian and Azerbaijani are new. Parts of Grovyn are still in English while we translate them.',

  // Today (Today.astro)
  'today.title': 'Today',
  'today.seedTitle': 'Plant your first seed',
  'today.seedText': 'One focus session starts your grove. Twenty-five minutes is plenty.',
  'today.startFocus': 'Start focus',
  'today.addTaskFirst': 'Add a task first',
  'today.emptyTitle': 'Nothing on Today yet',
  'today.emptyText': 'Pick one thing that matters and put it first, or just start the timer.',
  'today.chooseTask': 'Choose a task',
  'today.startSession': 'Start a focus session',
  'today.firstUp': 'First up',
  'today.moreOnToday': { one: '{n} more on Today', other: '{n} more on Today' },
  'today.stepsDone': '{done} of {total} steps done',
  'today.noSteps': 'No steps yet',
  'today.focusedSoFar': '{time} focused so far',
  'today.notStarted': 'Not started yet',
  'today.nextStep': 'Next step: {step}',
  'today.startFocusing': 'Start focusing',
  'today.questsTitle': "Sprig's first quests",
  'today.questsCount': '{done} of {total}',
  'today.questsHide': 'Put away (it stays under You › Help)',
  'today.questWelcome': 'Pick what to grow',
  'today.questSession': 'Finish one focus session',
  'today.questTask': 'Add one task',
  'today.questSplit': 'Split a task into small steps',
  'today.questGrove': 'Visit your grove',
  'today.questDone': '(done)',
  'today.showMe': 'Show me',
  'today.showMeLabel': 'Show me: {quest}',
  'today.focusToday': 'Focus today',
  'today.focusBars': 'Focus minutes for the last seven days, ending today',
  'today.chain': 'Chain',
  'today.chainNamed': 'Chain · {habit}',
  'today.chainNone': 'None yet',
  'today.chainHint': 'Pick a daily habit to mark',
  'today.chainDays': { one: '{n} day', other: '{n} days' },
  'today.weekMarked': 'This week, today is marked',
  'today.weekOpen': 'This week, today is still open',
  'today.cheer': 'Nice session!',
  'today.welcomeBack': 'Welcome back!',
  'today.toTier': '{amount} to a {tier} in your grove',
} as const;

export type Key = keyof typeof en;
/** One plural form per Intl.PluralRules category; `other` is always there. */
export type Plural = { other: string } & Partial<Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>>;
/** Another language's list: any subset of the keys, plurals with that language's own forms. */
export type Messages = { [K in Key]?: (typeof en)[K] extends string ? string : Plural };
