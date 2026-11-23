/**
 * When a task is for: an optional day (`Task.due`, local "YYYY-MM-DD") and an optional repeat
 * (`Task.repeat`). On its day a task shows on Today by itself (`listOf` in tasks.ts); finishing a
 * repeating one adds the next copy (`finishTask`). This file holds the pure date work: the next
 * day of a repeat, the words quick add understands, and the short labels.
 */
import { addDays, dayKey, fromDayKey, startOfDay, type DayKey } from './dates';
import { dateFormat, t } from './i18n';
import type { Task, TaskRepeat } from './storage';

export const todayKeyOf = (now = Date.now()): DayKey => dayKey(now);

/** True when the task has a day and that day has come (today or earlier). */
export const isDue = (task: Pick<Task, 'due'>, now = Date.now()): boolean => task.due !== undefined && task.due <= todayKeyOf(now);

/** Midnight at the start of the task's day (epoch ms). */
export const dueStart = (due: DayKey): number => fromDayKey(due).getTime();

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** `months` calendar months after `from`, on the same day of the month or the month's last day. */
function addMonths(from: Date, months: number): Date {
  const y = from.getFullYear();
  const m = from.getMonth() + months;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(from.getDate(), last));
}

/**
 * The next day a repeat lands on, after `today`. It counts from `base` (the day the task was
 * for, or the day it was finished), so "every week" from a Friday stays on Fridays even when
 * finished on a Sunday; repeats missed while it waited are skipped, not piled up.
 */
export function nextDue(base: DayKey, repeat: TaskRepeat, today: DayKey): DayKey {
  const start = fromDayKey(base);
  const step = (d: Date, k: number): Date => {
    switch (repeat) {
      case 'day':
        return addDays(start, k);
      case 'week':
        return addDays(start, 7 * k);
      case 'month':
        return addMonths(start, k);
      case 'weekdays': {
        let next = addDays(d, 1);
        while (isWeekend(next)) next = addDays(next, 1);
        return next;
      }
    }
  };
  let d = start;
  for (let k = 1; k < 5000; k++) {
    d = step(d, k);
    if (dayKey(d) > today) return dayKey(d);
  }
  return dayKey(addDays(fromDayKey(today), 1));
}

// ---------- Quick picks ----------

/** The next `weekday` (0 = Sunday) from `now`, today included. */
export function nextWeekday(weekday: number, now = Date.now()): DayKey {
  const d = startOfDay(now);
  return dayKey(addDays(d, (weekday - d.getDay() + 7) % 7));
}

export const QUICK_DAYS = ['today', 'tomorrow', 'weekend', 'nextWeek'] as const;
export type QuickDay = (typeof QUICK_DAYS)[number];

/** The day a quick pick in the When sheet means. "This weekend" on a Sunday is today. */
export function quickDay(pick: QuickDay, now = Date.now()): DayKey {
  const d = startOfDay(now);
  switch (pick) {
    case 'today':
      return dayKey(d);
    case 'tomorrow':
      return dayKey(addDays(d, 1));
    case 'weekend':
      return d.getDay() === 0 ? dayKey(d) : nextWeekday(6, now);
    case 'nextWeek':
      return dayKey(addDays(d, ((8 - d.getDay()) % 7) || 7));
  }
}

// ---------- Labels ----------

let fmts: { weekday: ReturnType<typeof dateFormat>; date: ReturnType<typeof dateFormat>; long: ReturnType<typeof dateFormat> } | undefined;
const formats = () =>
  (fmts ??= {
    weekday: dateFormat({ weekday: 'short' }),
    date: dateFormat({ day: 'numeric', month: 'short' }),
    long: dateFormat({ weekday: 'long', day: 'numeric', month: 'long' }),
  });

/** "Today", "Tomorrow", "Fri" within the coming week, else "3 Dec". */
export function dayLabel(due: DayKey, now = Date.now()): string {
  const today = startOfDay(now);
  const day = fromDayKey(due);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return t('when.today');
  if (diff === 1) return t('when.tomorrow');
  if (diff > 1 && diff < 7) return formats().weekday.format(day);
  return formats().date.format(day);
}

/** "Friday, 27 November", for the sheet and screen readers. */
export const longDay = (due: DayKey): string => formats().long.format(fromDayKey(due));

/** "every week", in the chosen language. */
export const repeatLabel = (repeat: TaskRepeat): string => t(`when.repeat.${repeat}`);
/** "weekly", short enough for the row's button. */
export const repeatShort = (repeat: TaskRepeat): string => t(`when.repeatShort.${repeat}`);

/** What the row's When button says: "When", "Fri", "Fri · ↻ weekly", "↻ daily". */
export function whenLabel(task: Pick<Task, 'due' | 'repeat'>, now = Date.now()): string {
  const parts: string[] = [];
  if (task.due) parts.push(dayLabel(task.due, now));
  if (task.repeat) parts.push(`↻ ${repeatShort(task.repeat)}`);
  return parts.length ? parts.join(' · ') : t('when.when');
}

// ---------- Quick add words ----------

export interface ParsedWhen {
  title: string;
  due?: DayKey;
  repeat?: TaskRepeat;
}

/** Word edges that work for Cyrillic and Azerbaijani letters too. */
const word = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'iu');

/** Weekday names (0 = Sunday) in English, Russian (any case) and Azerbaijani. */
const WEEKDAYS: string[] = [
  'sun|sunday|воскресенье|вс|bazar günü',
  'mon|monday|понедельник|пн|bazar ertəsi',
  'tue|tues|tuesday|вторник|вт|çərşənbə axşamı',
  'wed|wednesday|сред[аеу]|ср|çərşənbə',
  'thu|thur|thurs|thursday|четверг|чт|cümə axşamı',
  'fri|friday|пятниц[аеу]|пт|cümə',
  'sat|saturday|суббот[аеу]|сб|şənbə',
];
/** "Sun" and "Sat" alone are too often other words ("Sun cream", "SAT prep"): they need "on" or "every". */
const BARE = WEEKDAYS.map((w) => w.split('|').filter((x) => x !== 'sun' && x !== 'sat').join('|'));
/** Longer names first, so "cümə axşamı" isn't read as "cümə". */
const WEEKDAY_ORDER = [4, 2, 1, 0, 3, 5, 6];

const REPEATS: [TaskRepeat, string][] = [
  ['weekdays', 'every weekday|по будням|каждый будний день|hər iş günü'],
  ['day', 'every day|каждый день|hər gün'],
  ['week', 'every week|каждую неделю|hər həftə'],
  ['month', 'every month|каждый месяц|hər ay'],
];
/** Single words that also name things ("Weekly review"): a repeat only at the end of the text. */
const REPEAT_WORDS: [TaskRepeat, string][] = [
  ['weekdays', 'weekdays|iş günləri'],
  ['day', 'daily|ежедневно'],
  ['week', 'weekly|еженедельно'],
  ['month', 'monthly|ежемесячно'],
];

/** "every fri", "каждую пятницу", "hər cümə". */
const EVERY = 'every|кажд(?:ый|ую|ое|ая)|hər';
/** "on fri", "в пятницу", "во вторник". */
const ON = '(?:on|в|во)\\s+';

function cut(text: string, re: RegExp): { text: string; hit: boolean } {
  const m = re.exec(text);
  if (!m) return { text, hit: false };
  return { text: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`, hit: true };
}

/**
 * Pick a day and a repeat out of a new task's text, in English, Russian or Azerbaijani:
 * "Weekly review fri every week" → due on the coming Friday, repeat weekly, title
 * "Weekly review". One day and one repeat at most; words it doesn't know stay in the title.
 */
export function parseWhen(text: string, now = Date.now()): ParsedWhen {
  let rest = text;
  let due: DayKey | undefined;
  let repeat: TaskRepeat | undefined;
  const take = (re: RegExp) => {
    const r = cut(rest, re);
    rest = r.text;
    return r.hit;
  };

  for (const wd of WEEKDAY_ORDER) {
    if (take(word(`(?:${EVERY})\\s+(?:${WEEKDAYS[wd]})`))) {
      repeat = 'week';
      due = nextWeekday(wd, now);
      break;
    }
  }
  if (!repeat) for (const [r, words] of REPEATS) if (take(word(words))) {
    repeat = r;
    break;
  }

  if (!due) {
    const days: [RegExp, () => DayKey][] = [
      [word('day after tomorrow|послезавтра|birigün'), () => dayKey(addDays(startOfDay(now), 2))],
      [word('today|сегодня|bu gün'), () => quickDay('today', now)],
      [word('tomorrow|tmrw|завтра|sabah'), () => quickDay('tomorrow', now)],
      [word('next week|на следующей неделе|gələn həftə'), () => quickDay('nextWeek', now)],
      [word('this weekend|weekend|на выходных|в выходные|həftə sonu'), () => quickDay('weekend', now)],
    ];
    for (const [re, day] of days) if (take(re)) {
      due = day();
      break;
    }
  }
  if (!due) {
    for (const wd of WEEKDAY_ORDER) {
      if (take(word(`${ON}(?:${WEEKDAYS[wd]})`)) || take(word(BARE[wd]!))) {
        due = nextWeekday(wd, now);
        break;
      }
    }
  }

  if (!repeat) for (const [r, words] of REPEAT_WORDS) if (take(new RegExp(`${word(words).source}(?=[\s.!]*$)`, 'iu'))) {
    repeat = r;
    break;
  }

  const title = rest.replace(/\s+/g, ' ').trim();
  // Only date words: keep the text as the title rather than add a task with no name.
  if (!title) return { title: text.trim() };
  const out: ParsedWhen = { title };
  if (due) out.due = due;
  if (repeat) out.repeat = repeat;
  return out;
}
