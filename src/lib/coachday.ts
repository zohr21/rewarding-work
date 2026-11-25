/**
 * Coach's day rhythm (Focus › Coach): Plan in the morning, Now during the day, Close in the
 * evening, and a look at the week on Sunday. Design canvas:
 * https://claude.ai/artifact/3Yx7NAc7SwuQNnQrESRx27 (option B).
 *
 * The Top 3 are simply the tasks on Today (src/lib/tasks.ts), and parked thoughts are the
 * Inbox the timer's scratchpad already fills, so nothing here is a second list. What this
 * file keeps is in the `coach` store (src/lib/coach.ts, this device only): the day's energy,
 * which tasks were picked, the estimates, and when the day was planned and closed.
 *
 * Everything below is pure: it takes the stored data and the time, and says what to show.
 */
import type { CoachDay, CoachStore, Energy } from './coach';
import type { FocusSession, Task } from './storage';
import type { BodyDay } from './device';
import type { SessionPhone } from './screen';
import { addDays, dayKey, startOfDay, startOfWeek } from './dates';

export type Phase = 'plan' | 'now' | 'close' | 'week';

export const ESTIMATES = [15, 25, 50, 90] as const;

const DAY_MS = 86_400_000;

const sessionsOn = (sessions: FocusSession[], key: string) => sessions.filter((s) => !s.removedAt && dayKey(s.start) === key);

/** Focus seconds per task on one day. */
export function focusOn(sessions: FocusSession[], key: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessionsOn(sessions, key)) if (s.taskId) map.set(s.taskId, (map.get(s.taskId) ?? 0) + s.focusSeconds);
  return map;
}

export const totalOn = (sessions: FocusSession[], key: string): number => sessionsOn(sessions, key).reduce((n, s) => n + s.focusSeconds, 0);

/**
 * The hour the day usually ends: the median hour your last session of a day finished, over
 * the last two weeks, kept between 17 and 22. 19 until there are five days to go on.
 */
export function closeHour(sessions: FocusSession[], now = new Date()): number {
  const since = addDays(startOfDay(now), -14).getTime();
  const today = dayKey(now);
  const last = new Map<string, number>();
  for (const s of sessions) {
    if (s.removedAt || s.start < since || s.focusSeconds < 60) continue;
    const k = dayKey(s.start);
    if (k === today) continue;
    last.set(k, Math.max(last.get(k) ?? 0, s.end));
  }
  if (last.size < 5) return 19;
  const hours = [...last.values()].map((t) => new Date(t).getHours() + 1).sort((a, b) => a - b);
  return Math.min(22, Math.max(17, hours[Math.floor(hours.length / 2)]!));
}

/** Which part of the day Coach opens on. You can always switch by hand. */
export function phaseFor(day: CoachDay | undefined, sessions: FocusSession[], now = new Date()): Phase {
  const hour = now.getHours();
  if (now.getDay() === 0 && hour >= 12 && !day?.closedAt) return hour >= closeHour(sessions, now) ? 'close' : 'week';
  if (day?.closedAt) return now.getDay() === 0 ? 'week' : 'close';
  if (hour >= closeHour(sessions, now)) return 'close';
  if (!day?.plannedAt && hour < 14) return 'plan';
  return 'now';
}

/** The day's Top 3: what you picked, else the first three on Today. */
export function topIds(day: CoachDay | undefined, today: Task[]): string[] {
  if (day?.top?.length) return day.top;
  return today.slice(0, 3).map((t) => t.id);
}

/**
 * How far your estimates are off: the median of time taken ÷ time expected, from earlier
 * days' Top 3 tasks you put time into. Needs four of them. 1.3 means things take 30% longer.
 */
export function estimateRatio(store: Pick<CoachStore, 'days'>, sessions: FocusSession[], now = new Date()): number | undefined {
  const today = dayKey(now);
  const ratios: number[] = [];
  for (const [key, day] of Object.entries(store.days)) {
    if (key >= today || !day.est) continue;
    const focus = focusOn(sessions, key);
    for (const [id, est] of Object.entries(day.est)) {
      const sec = focus.get(id);
      if (sec && sec >= 300) ratios.push(sec / 60 / est);
    }
  }
  if (ratios.length < 4) return undefined;
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  return Math.round(median * 10) / 10;
}

/** Minutes with your usual overrun added, rounded to 5. Unchanged unless you run over by 15% or more. */
export function padded(min: number, ratio: number | undefined): number {
  if (!ratio || ratio < 1.15) return min;
  return Math.round((min * Math.min(ratio, 2.5)) / 5) * 5;
}

/** Last night's sleep in minutes (put on the day you woke up), when Health has it. */
export function lastNight(body: BodyDay[], now = new Date()): number | undefined {
  const min = body.find((d) => d.day === dayKey(now))?.sleepMin;
  return min && min > 60 ? min : undefined;
}

/** A suggested energy from sleep: under 6 hours low, 7½ or more good. */
export function energyFromSleep(min: number | undefined): Energy | undefined {
  if (min === undefined) return undefined;
  return min < 360 ? 'low' : min >= 450 ? 'good' : 'ok';
}

// ---------- The one suggestion in Now ----------

export type SignalId = 'stuck' | 'short-stops' | 'peak-now' | 'phone' | 'low-energy' | 'next';

export interface Signal {
  id: SignalId;
  /** Task the Start button is for. */
  taskId?: string;
  /** Values for the words: {task}, {days}, {min}, {part}, {app}, {n}. */
  vars: Record<string, string | number>;
  /** Timer mode and, for custom, minutes. */
  mode: string;
  min?: number;
}

export interface SignalInput {
  now: Date;
  day: CoachDay | undefined;
  muted: string[];
  /** Open Today tasks in order. */
  today: Task[];
  sessions: FocusSession[];
  /** Your best two-hour window's first hour (findings.focusHours), when known. */
  peak?: number;
  /** Screen time per focus session, when that module is on. */
  phone?: Record<string, SessionPhone>;
}

export type PartOfDay = 'morning' | 'afternoon' | 'evening';
export const partOf = (hour: number): PartOfDay => (hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening');

/** A task on Today since before `days` days ago with no focus on it since. */
function stuckTask(today: Task[], sessions: FocusSession[], now: Date): { task: Task; days: number } | undefined {
  for (const task of today) {
    const since = task.todayAt ?? task.createdAt;
    const days = Math.floor((startOfDay(now).getTime() - startOfDay(since).getTime()) / DAY_MS);
    if (days < 3) continue;
    if (sessions.some((s) => s.taskId === task.id && s.start >= since && s.focusSeconds >= 60)) continue;
    return { task, days };
  }
  return undefined;
}

/** In this part of the day you often stop early: median minutes of sessions not finished. */
function shortStops(sessions: FocusSession[], now: Date): number | undefined {
  const part = partOf(now.getHours());
  const since = addDays(startOfDay(now), -14).getTime();
  const here = sessions.filter((s) => !s.removedAt && s.start >= since && s.focusSeconds >= 60 && partOf(new Date(s.start).getHours()) === part);
  if (here.length < 5) return undefined;
  const stopped = here.filter((s) => !s.completed);
  if (stopped.length / here.length < 0.6) return undefined;
  const mins = stopped.map((s) => s.focusSeconds / 60).sort((a, b) => a - b);
  const median = mins[Math.floor(mins.length / 2)]!;
  return median < 20 ? Math.round(median) : undefined;
}

/** The app that came up in the most focus sessions this past week, if in three or more. */
function phoneApp(phone: Record<string, SessionPhone> | undefined, sessions: FocusSession[], now: Date): { app: string; n: number } | undefined {
  if (!phone) return undefined;
  const since = addDays(now, -7).getTime();
  const count = new Map<string, number>();
  for (const s of sessions) {
    if (s.start < since) continue;
    const p = phone[s.id];
    if (!p) continue;
    for (const a of new Set(p.apps.filter((x) => x.ms >= 30_000).map((x) => x.label))) count.set(a, (count.get(a) ?? 0) + 1);
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 ? { app: best[0], n: best[1] } : undefined;
}

/** The one thing Coach suggests now, most useful first; skips what you put off or said isn't true. */
export function signal(input: SignalInput): Signal | undefined {
  const { now, day, today, sessions } = input;
  const off = new Set([...input.muted, ...(day?.snoozed ?? [])]);
  const key = dayKey(now);
  const doneToday = focusOn(sessions, key);
  const next = today.find((t) => !doneToday.has(t.id)) ?? today[0];
  const name = (t: Task) => t.title;
  const out: Signal[] = [];

  const stuck = stuckTask(today, sessions, now);
  if (stuck) out.push({ id: 'stuck', taskId: stuck.task.id, vars: { task: name(stuck.task), days: stuck.days }, mode: 'flowtime' });

  if (day?.energy === 'low' && next) out.push({ id: 'low-energy', taskId: next.id, vars: { task: name(next) }, mode: 'custom', min: 15 });

  const stop = shortStops(sessions, now);
  if (stop !== undefined && next) {
    const box = Math.min(25, Math.max(10, Math.ceil((stop + 3) / 5) * 5));
    out.push({ id: 'short-stops', taskId: next.id, vars: { task: name(next), min: stop, box, part: partOf(now.getHours()) }, mode: 'custom', min: box });
  }

  const hour = now.getHours();
  if (input.peak !== undefined && hour >= input.peak && hour < input.peak + 2 && next && !doneToday.has(next.id)) {
    out.push({ id: 'peak-now', taskId: next.id, vars: { task: name(next) }, mode: 'pomodoro' });
  }

  const app = phoneApp(input.phone, sessions, now);
  if (app) out.push({ id: 'phone', taskId: next?.id, vars: { app: app.app, n: app.n }, mode: 'pomodoro' });

  if (next) out.push({ id: 'next', taskId: next.id, vars: { task: name(next) }, mode: 'pomodoro' });

  return out.find((s) => !off.has(s.id));
}

// ---------- The week ----------

export interface WeekSummary {
  /** Monday's key. */
  week: string;
  planned: number;
  done: number;
  closed: number;
  focusSeconds: number;
  /** Days before today this week with no focus at all. */
  quietDays: number;
  daysSoFar: number;
}

/** This week so far (Monday to today). */
export function weekSummary(store: Pick<CoachStore, 'days'>, sessions: FocusSession[], tasks: Task[], now = new Date()): WeekSummary {
  const monday = startOfWeek(now);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const s: WeekSummary = { week: dayKey(monday), planned: 0, done: 0, closed: 0, focusSeconds: 0, quietDays: 0, daysSoFar: 0 };
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (d.getTime() > now.getTime()) break;
    const key = dayKey(d);
    s.daysSoFar += 1;
    const day = store.days[key];
    const total = totalOn(sessions, key);
    s.focusSeconds += total;
    // Today isn't over, so it doesn't count as a quiet day yet.
    if (!total && key !== dayKey(now)) s.quietDays += 1;
    if (day?.closedAt) s.closed += 1;
    for (const id of day?.top ?? []) {
      s.planned += 1;
      const t = byId.get(id);
      if (t?.status === 'done' && t.doneAt !== undefined && dayKey(t.doneAt) <= key) s.done += 1;
    }
  }
  return s;
}

/** The Monday a review written now is for: on Sunday, the coming week. */
export function woopWeek(now = new Date()): string {
  const base = now.getDay() === 0 ? addDays(startOfDay(now), 1) : now;
  return dayKey(startOfWeek(base));
}
