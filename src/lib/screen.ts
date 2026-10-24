/**
 * Screen time, in the Android app: how long other apps were on screen each day, and which
 * ones came up during a focus session. Read from the phone's usage events (UsageData.java)
 * once Usage access is on.
 *
 * Kept on this device only: never synced or put in the backup, because which apps someone
 * uses is personal. Android forgets the detail after about a week, so the days read are
 * kept here as the history.
 */
import { usageAccess, usageBetween, usageDays, type UsageDay } from './device';
import { read, write } from './storage';
import { addDays, dayKey } from './dates';
import type { FocusSession } from './storage';

export type ScreenDay = UsageDay;

/** Other apps during one focus session. No pick-ups means a phone-free session: a bonus leaf. */
export interface SessionPhone {
  ms: number;
  pickups: number;
  apps: { label: string; ms: number }[];
  /** When, as [start, end] in epoch ms, for the session's timeline. */
  spans: [number, number][];
}

export interface ScreenStore {
  days: ScreenDay[];
  /** By focus session id. */
  sessions: Record<string, SessionPhone>;
}

const KEEP_DAYS = 90;
const KEEP_SESSIONS = 300;
/** How far back the phone is asked; it has about a week. */
const READ_DAYS = 8;

const EMPTY: ScreenStore = { days: [], sessions: {} };

function isStore(v: unknown): v is ScreenStore {
  if (!v || typeof v !== 'object') return false;
  const s = v as ScreenStore;
  return Array.isArray(s.days) && !!s.sessions && typeof s.sessions === 'object';
}

export function getScreen(): ScreenStore {
  const s = read<ScreenStore>('screen', EMPTY, isStore);
  return { days: s.days.filter((d) => d && typeof d.day === 'string' && typeof d.totalMin === 'number'), sessions: s.sessions };
}

function save(store: ScreenStore): void {
  const days = [...store.days].sort((a, b) => a.day.localeCompare(b.day)).slice(-KEEP_DAYS);
  const ids = Object.keys(store.sessions).sort().slice(-KEEP_SESSIONS);
  write('screen', { days, sessions: Object.fromEntries(ids.map((id) => [id, store.sessions[id]!])) });
}

/** true or false in the app; null on the site. */
export const hasAccess = usageAccess;

/**
 * Read the last week from the phone into the history. A day the phone has forgotten comes
 * back as zero and leaves the kept one alone. false when Usage access is off.
 */
export async function refreshDays(): Promise<boolean> {
  const fresh = await usageDays(READ_DAYS);
  if (!fresh) return false;
  const store = getScreen();
  const byDay = new Map(store.days.map((d) => [d.day, d]));
  for (const d of fresh) {
    if (d.totalMin > 0 || !byDay.has(d.day)) byDay.set(d.day, d);
  }
  save({ ...store, days: [...byDay.values()] });
  return true;
}

/** What other apps did during `session`, kept with it. null without Usage access. */
export async function checkSession(session: Pick<FocusSession, 'id' | 'start' | 'end'>): Promise<SessionPhone | null> {
  const had = getScreen().sessions[session.id];
  if (had) return had;
  const used = await usageBetween(session.start, session.end);
  if (!used) return null;
  const phone: SessionPhone = {
    ms: used.ms,
    pickups: used.pickups,
    apps: used.apps.map((a) => ({ label: a.label, ms: a.ms })),
    spans: used.spans.map((s) => [s.start, s.end]),
  };
  const store = getScreen();
  save({ ...store, sessions: { ...store.sessions, [session.id]: phone } });
  return phone;
}

/** Fill in the focus sessions of the last week that were never checked (they ended while the app was closed). */
export async function checkRecentSessions(sessions: FocusSession[], now = Date.now()): Promise<void> {
  const since = now - 7 * 86_400_000;
  const kept = getScreen().sessions;
  for (const s of sessions) {
    if (s.start >= since && s.focusSeconds >= 60 && !s.removedAt && !kept[s.id]) {
      if (!(await checkSession(s))) return;
    }
  }
}

export function dayOf(store: ScreenStore, key: string): ScreenDay | undefined {
  return store.days.find((d) => d.day === key);
}

/** The last `n` days ending `end` (today by default), oldest first; a day with nothing kept is undefined. */
export function lastDays(store: ScreenStore, n: number, end = new Date()): { day: string; data?: ScreenDay }[] {
  return Array.from({ length: n }, (_, i) => {
    const key = dayKey(addDays(end, i - n + 1));
    return { day: key, data: dayOf(store, key) };
  });
}

/** Average minutes over the kept days of the week before `day`; null with fewer than three to go on. */
export function weekAverage(store: ScreenStore, day: Date): number | null {
  const before = lastDays(store, 7, addDays(day, -1)).flatMap((d) => (d.data && d.data.totalMin > 0 ? [d.data.totalMin] : []));
  if (before.length < 3) return null;
  return Math.round(before.reduce((a, b) => a + b, 0) / before.length);
}

/** Sum each app over `days`, most used first. */
export function topApps(days: (ScreenDay | undefined)[], n: number): { label: string; min: number }[] {
  const sums = new Map<string, { label: string; min: number }>();
  for (const d of days) {
    for (const a of d?.apps ?? []) {
      const had = sums.get(a.pkg);
      sums.set(a.pkg, { label: a.label, min: (had?.min ?? 0) + a.min });
    }
  }
  return [...sums.values()].sort((a, b) => b.min - a.min).slice(0, n);
}

/** "3 h 40 m", "58 m", "2 h". */
export function formatPhone(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} m`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m / 60} h`;
}

/** For a sentence: "42 min", "1 h 5 min", "1 h". */
export function formatMinutes(min: number): string {
  return formatPhone(min).replace(/ m$/, ' min');
}

/** "3 min", "less than a minute". */
export function formatShort(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? 'less than a minute' : `${m} min`;
}
