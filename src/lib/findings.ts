/**
 * Your finding on /health: what your own sleep does to your next day's focus, and a rough
 * plan for tomorrow built from your own habits.
 *
 * Each day with both a night's sleep (the `body` store, put on the day you woke up) and some
 * focus becomes one row. Rows split into two groups, long nights and short nights, and the
 * groups' average focus is compared. Nothing is said until there are enough rows on both
 * sides, and a gap only counts as "fairly sure" when it shows up in the older and the newer
 * half of the rows alike. Days with an exam are left out, and so is today, which isn't over.
 *
 * Worked out on this device; the `findings` store holds only your Helpful / Not true tap, the
 * sources you turned off and when you last asked Grovyn to forget what it learned.
 */
import { getExamStore, read, write, type FocusSession } from './storage';
import type { BodyDay } from './device';
import { minutesByDay } from './stats';
import { addDays, dayKey, type DayKey } from './dates';
import { workoutType, type Workout } from './workouts';

/** How far back rows are taken from. */
const WINDOW_DAYS = 42;
/** Rows needed before anything is said, and in each group. */
export const NEED_ROWS = 14;
const NEED_PER_GROUP = 5;
/** A night shorter than this is a nap or a missed reading, not a night. */
const MIN_NIGHT = 120;
const LONG_NIGHT = 7 * 60;
const SHORT_NIGHT = 6 * 60;
/** The gap, as a share of the smaller average, that is worth a sentence. */
const MEANINGFUL = 0.2;
/** Each half of the rows has to show at least this much of a gap, the same way round. */
const HOLDS = 0.1;
/** After "Not true for me", how many more rows before the finding is shown again. */
const RECHECK_AFTER = 7;

export interface Row {
  day: DayKey;
  sleepMin: number;
  focusMin: number;
}

export interface Group {
  label: string;
  days: number;
  avgFocusMin: number;
}

export type Finding =
  | { kind: 'learning'; rows: number; more: number }
  /** Enough rows, but nearly all on one side, so there is nothing to compare. */
  | { kind: 'one-sided'; rows: number; mostlyLong: boolean }
  | { kind: 'no-link'; rows: number; long: Group; short: Group }
  | { kind: 'link'; sure: boolean; rows: number; long: Group; short: Group; diffMin: number };

export function rows(body: BodyDay[], sessions: FocusSession[], now = new Date()): Row[] {
  const out: Row[] = [];
  if (!sourceOn('sleep') || !sourceOn('focus')) return out;
  const today = dayKey(now);
  const from = dayKey(addDays(now, -WINDOW_DAYS));
  // After "Forget", only nights after that day count.
  const forgot = forgotAt('finding');
  const after = forgot ? dayKey(forgot) : '';
  const focus = minutesByDay(sessions);
  const exams = new Set<string>();
  if (sourceOn('exams')) {
    const store = getExamStore();
    if (store.exam?.date) exams.add(store.exam.date);
    for (const p of store.past) if (p.date) exams.add(p.date);
  }
  for (const d of body) {
    if (!d || typeof d.day !== 'string' || d.day >= today || d.day < from || d.day <= after || exams.has(d.day)) continue;
    const focusMin = focus.get(d.day) ?? 0;
    // A day without any focus is a day off, not a day of bad focus.
    if (!(typeof d.sleepMin === 'number' && d.sleepMin >= MIN_NIGHT) || focusMin < 1) continue;
    out.push({ day: d.day, sleepMin: d.sleepMin, focusMin });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1));
}

const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

function split(list: Row[], shortBelow: number) {
  return { long: list.filter((r) => r.sleepMin >= LONG_NIGHT), short: list.filter((r) => r.sleepMin < shortBelow) };
}

/** Gap between the groups as a share of the smaller average; NaN when a side is empty. */
function gap(long: Row[], short: Row[]): number {
  if (!long.length || !short.length) return NaN;
  const a = avg(long.map((r) => r.focusMin));
  const b = avg(short.map((r) => r.focusMin));
  return (a - b) / Math.max(1, Math.min(a, b));
}

export function finding(list: Row[]): Finding {
  if (list.length < NEED_ROWS) {
    return { kind: 'learning', rows: list.length, more: NEED_ROWS - list.length };
  }
  // Short means under 6h when there are enough such nights, otherwise anything under 7h.
  let shortBelow = SHORT_NIGHT;
  let { long, short } = split(list, shortBelow);
  if (short.length < NEED_PER_GROUP) {
    shortBelow = LONG_NIGHT;
    ({ long, short } = split(list, shortBelow));
  }
  if (long.length < NEED_PER_GROUP || short.length < NEED_PER_GROUP) {
    return { kind: 'one-sided', rows: list.length, mostlyLong: long.length >= short.length };
  }
  const group = (rs: Row[], label: string): Group => ({ label, days: rs.length, avgFocusMin: Math.round(avg(rs.map((r) => r.focusMin))) });
  const longG = group(long, '7h or more');
  const shortG = group(short, shortBelow === SHORT_NIGHT ? 'Under 6h' : 'Under 7h');
  const whole = gap(long, short);
  if (Math.abs(whole) < MEANINGFUL) return { kind: 'no-link', rows: list.length, long: longG, short: shortG };

  const half = Math.floor(list.length / 2);
  const holds = [list.slice(0, half), list.slice(half)].every((part) => {
    const s = split(part, shortBelow);
    const g = gap(s.long, s.short);
    return Number.isFinite(g) && Math.sign(g) === Math.sign(whole) && Math.abs(g) >= HOLDS;
  });
  return { kind: 'link', sure: holds, rows: list.length, long: longG, short: shortG, diffMin: longG.avgFocusMin - shortG.avgFocusMin };
}

export const hm = (min: number) => {
  const m = Math.round(Math.abs(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** The finding as one sentence. */
export function sentence(f: Finding): string {
  switch (f.kind) {
    case 'learning':
      return 'Grovyn is still learning how sleep and focus go together for you.';
    case 'one-sided':
      return f.mostlyLong
        ? 'Your nights are almost all 7 hours or more, so there are no short nights to compare them with. That is good news.'
        : 'Your nights are almost all short, so there are no long nights to compare them with yet.';
    case 'no-link':
      return `So far, how long you sleep makes little difference to your focus the next day.`;
    case 'link':
      return `After 7 hours of sleep or more, you focus about ${hm(f.diffMin)} ${f.diffMin > 0 ? 'longer' : 'less'} the next day.`;
  }
}

/** The finding in a few words, for the row on the page. */
export function short(f: Finding): string {
  switch (f.kind) {
    case 'learning':
      return `${f.more} more ${f.more === 1 ? 'night' : 'nights'} to go`;
    case 'one-sided':
      return f.mostlyLong ? 'Nearly every night is 7h+' : 'Nearly every night is short';
    case 'no-link':
      return 'Sleep makes little difference so far';
    case 'link':
      return `After 7h+ sleep, ~${hm(f.diffMin)} ${f.diffMin > 0 ? 'more' : 'less'} focus`;
  }
}

// ---- Your taps and settings ----------------------------------------------------------------

/** What the finding and the plan may learn from; each can be turned off on the You page. */
export const SOURCES = [
  { id: 'sleep', label: 'Sleep', where: 'Health Connect · stays on this phone' },
  { id: 'focus', label: 'Focus sessions', where: 'Your focus history' },
  { id: 'workouts', label: 'Workouts', where: 'Your log · on this phone' },
  { id: 'exams', label: 'Exam dates', where: 'So exam days are left out' },
] as const;
export type Source = (typeof SOURCES)[number]['id'];

/** The things Grovyn has learned, each of which can be forgotten on its own. */
export type FactId = 'finding' | 'focusHours' | 'workoutTime';

interface Vote {
  /** Which finding it was about: its kind and which way the gap went. */
  key: string;
  vote: 'yes' | 'no';
  /** Rows there were at the time, so a set-aside finding comes back once there are more. */
  rows: number;
}

interface FindingsStore {
  vote?: Vote;
  /** Sources turned off. */
  off?: Partial<Record<Source, boolean>>;
  /** When each fact was last forgotten (epoch ms): it is learned again only from what came after. */
  forgot?: Partial<Record<FactId, number>>;
}

function getStore(): FindingsStore {
  const s = read<FindingsStore | null>('findings', null);
  if (!s || typeof s !== 'object') return {};
  const v = s.vote;
  return {
    vote: v && typeof v.key === 'string' && (v.vote === 'yes' || v.vote === 'no') && typeof v.rows === 'number' ? v : undefined,
    off: s.off && typeof s.off === 'object' ? s.off : undefined,
    forgot: s.forgot && typeof s.forgot === 'object' ? s.forgot : undefined,
  };
}

function setStore(patch: FindingsStore): void {
  write<FindingsStore>('findings', { ...getStore(), ...patch });
}

export function sourceOn(s: Source): boolean {
  return !getStore().off?.[s];
}

export function setSourceOn(s: Source, on: boolean): void {
  setStore({ off: { ...getStore().off, [s]: !on } });
}

function forgotAt(id: FactId): number {
  return getStore().forgot?.[id] ?? 0;
}

/** Learning starts again from now; the sleep, sessions and workouts themselves stay. */
export function forget(id: FactId): void {
  setStore({ forgot: { ...getStore().forgot, [id]: Date.now() }, ...(id === 'finding' ? { vote: undefined } : {}) });
}

export function forgetAll(): void {
  const now = Date.now();
  setStore({ forgot: { finding: now, focusHours: now, workoutTime: now }, vote: undefined });
}

export const findingKey = (f: Finding) => (f.kind === 'link' ? `sleep-focus:${Math.sign(f.diffMin)}` : `sleep-focus:${f.kind}`);

export function voteFor(f: Finding): 'yes' | 'no' | undefined {
  const v = getStore().vote;
  return v && v.key === findingKey(f) ? v.vote : undefined;
}

/** True while a "Not true for me" holds: the same finding, and not enough new rows since. */
export function setAside(f: Finding): boolean {
  const v = getStore().vote;
  return !!v && v.vote === 'no' && v.key === findingKey(f) && f.rows < v.rows + RECHECK_AFTER;
}

export function saveVote(f: Finding, vote: 'yes' | 'no'): void {
  setStore({ vote: { key: findingKey(f), vote, rows: f.rows } });
}

// ---- Habits -------------------------------------------------------------------------------

/** The two-hour window with the most focus, starting at or after `from`, as its first hour. */
function bestWindow(byHour: number[], from: number, to: number): number | undefined {
  let best: number | undefined;
  let bestMin = 0;
  for (let h = from; h + 1 <= to; h++) {
    const m = byHour[h]! + byHour[h + 1]!;
    if (m > bestMin) {
      best = h;
      bestMin = m;
    }
  }
  return best;
}

/** Your best and next best focus hours over the last four weeks, from 5 sessions or more. */
export function focusHours(sessions: FocusSession[], now = new Date()): { first: number; second?: number; sessions: number } | undefined {
  if (!sourceOn('focus')) return undefined;
  const since = Math.max(addDays(now, -28).getTime(), forgotAt('focusHours'));
  const recent = sessions.filter((s) => s.start >= since);
  if (recent.length < 5) return undefined;
  const byHour = Array<number>(24).fill(0);
  for (const s of recent) byHour[new Date(s.start).getHours()]! += s.focusSeconds / 60;
  const first = bestWindow(byHour, 6, 22);
  if (first === undefined) return undefined;
  const second = bestWindow(byHour, first + 3, 22);
  return { first, second: second !== undefined && byHour[second]! + byHour[second + 1]! >= 30 ? second : undefined, sessions: recent.length };
}

/** The hour you usually work out and what you do most, from 3 workouts or more in four weeks. */
export function usualWorkout(workouts: Workout[], now = new Date()): { hour: number; type: Workout['type']; count: number } | undefined {
  if (!sourceOn('workouts')) return undefined;
  const since = Math.max(addDays(now, -28).getTime(), forgotAt('workoutTime'));
  const recent = workouts.filter((w) => w.start >= since);
  if (recent.length < 3) return undefined;
  const hours = recent.map((w) => new Date(w.start).getHours()).sort((a, b) => a - b);
  const count = new Map<Workout['type'], number>();
  for (const w of recent) count.set(w.type, (count.get(w.type) ?? 0) + 1);
  const type = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return { hour: hours[Math.floor(hours.length / 2)]!, type, count: recent.length };
}

export interface Fact {
  id: FactId;
  text: string;
  from: string;
}

const hourFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function atHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return hourFmt.format(d);
}

/** What Grovyn has learned about you so far, in plain words. */
export function learned(f: Finding, sessions: FocusSession[], workouts: Workout[]): Fact[] {
  const out: Fact[] = [];
  if (f.kind === 'link' || f.kind === 'no-link') out.push({ id: 'finding', text: short(f), from: `From ${f.rows} nights` });
  const hours = focusHours(sessions);
  if (hours) out.push({ id: 'focusHours', text: `Best focus: ${atHour(hours.first)} to ${atHour(hours.first + 2)}`, from: `From ${hours.sessions} sessions` });
  const usual = usualWorkout(workouts);
  if (usual) out.push({ id: 'workoutTime', text: `${workoutType(usual.type).label} mostly around ${atHour(usual.hour)}`, from: `From ${usual.count} workouts` });
  return out;
}

// ---- Tomorrow -----------------------------------------------------------------------------

export interface PlanItem {
  hour: number;
  kind: 'focus' | 'walk' | 'workout' | 'sleep';
  title: string;
  why: string;
  color?: string;
}

/**
 * A rough plan for tomorrow from your last four weeks: when you focus best, when you usually
 * work out, and what the finding says about tonight. Only what there is data for is in it.
 */
export function plan(sessions: FocusSession[], workouts: Workout[], f: Finding, now = new Date()): PlanItem[] {
  const items: PlanItem[] = [];
  const hours = focusHours(sessions, now);
  if (hours) {
    items.push({ hour: hours.first, kind: 'focus', title: 'Deep focus · 90 min', why: 'When your focus has run longest lately' });
    items.push({ hour: hours.first + 2, kind: 'walk', title: 'Walk break · 10 min', why: 'A pause before the next block' });
    if (hours.second !== undefined) items.push({ hour: hours.second, kind: 'focus', title: 'Focus · 50 min', why: 'Your next best hours' });
  }
  const usual = usualWorkout(workouts, now);
  if (usual && !items.some((i) => i.hour === usual.hour)) {
    const t = workoutType(usual.type);
    items.push({ hour: usual.hour, kind: 'workout', title: t.label, why: 'When you usually work out', color: t.color });
  }
  if (f.kind === 'link' && f.sure && f.diffMin > 0) {
    items.push({ hour: 23, kind: 'sleep', title: 'Bed for 7h+', why: 'Your finding: longer nights, longer focus' });
  }
  return items.sort((a, b) => a.hour - b.hour);
}

/** Days until the current exam, when it is still ahead. */
export function examIn(now = new Date()): { title: string; days: number } | undefined {
  const exam = getExamStore().exam;
  if (!sourceOn('exams') || !exam?.date) return undefined;
  const today = dayKey(now);
  if (exam.date < today) return undefined;
  const days = Math.round((new Date(`${exam.date}T12:00`).getTime() - new Date(`${today}T12:00`).getTime()) / 86_400_000);
  return { title: exam.title, days };
}

/** Everything the finding and the plan use, and what came of it, as one file to keep. */
export function exportFile(body: BodyDay[], sessions: FocusSession[], workouts: Workout[], now = new Date()) {
  const list = rows(body, sessions, now);
  const f = finding(list);
  return {
    app: 'Grovyn',
    kind: 'finding',
    exportedAt: now.toISOString(),
    sources: Object.fromEntries(SOURCES.map((s) => [s.id, sourceOn(s.id)])),
    rows: list,
    finding: { ...f, sentence: sentence(f) },
    learned: learned(f, sessions, workouts),
    tomorrow: plan(sessions, workouts, f, now),
  };
}
