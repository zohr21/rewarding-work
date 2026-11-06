/**
 * First run and optional sections. Welcome (src/pages/welcome.astro) is shown once; there
 * you pick which optional sections you want. Focus, Tasks and your grove are always on.
 *
 * Kept per device, like the timer settings. The inline script in BaseLayout reads the same
 * key before first paint to hide sections that are off (html[data-mod-<name>]) and to send
 * a brand-new user from Today to Welcome; keep the two in step.
 */
import { MODULES, type ModuleId } from '../config/site';
import { read, readJson, write, type StoreName } from './storage';

export interface Profile {
  /** Welcome was seen (or skipped by someone who already had data). */
  welcomed: boolean;
  modules: Record<ModuleId, boolean>;
  /** The short tours (src/lib/tours.ts). Missing on profiles saved before tours existed. */
  tours?: TourPrefs;
}

export interface TourPrefs {
  /** Tours already shown here (started, finished or skipped): they don't start by themselves again. */
  seen: string[];
  /** The person turned off tours starting by themselves on new screens. */
  off?: boolean;
  /** "Sprig's first quests" on Today was put away. */
  questsHidden?: boolean;
  /** "Did you know?" tips already shown and put away (src/lib/help.ts): never shown again. */
  tips?: string[];
  /** Today's "Did you know?" tip: one a day at most. */
  nudge?: { day: string; id: string };
  /** The person turned "Did you know?" tips off. */
  nudgesOff?: boolean;
  /** Playbook steps opened with "Show me", which count as done when nothing else can tell. */
  tried?: string[];
}

const ALL_ON = Object.fromEntries(MODULES.map((m) => [m.id, true])) as Record<ModuleId, boolean>;
const ALL_OFF = Object.fromEntries(MODULES.map((m) => [m.id, false])) as Record<ModuleId, boolean>;

function isProfile(v: unknown): v is Profile {
  if (!v || typeof v !== 'object') return false;
  const p = v as Profile;
  return typeof p.welcomed === 'boolean' && !!p.modules && typeof p.modules === 'object';
}

/** Anything a person made before Welcome existed: they keep every section they had. */
const DATA_STORES: StoreName[] = ['sessions', 'tasks', 'done', 'chain', 'exam', 'health'];

/** An empty store still holds its shape ({ items: [] }, { habit: '', days: [] }); look for a list with something in it. */
function holdsSomething(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.values(v).some(holdsSomething);
  return false;
}

export function hasOwnData(): boolean {
  return DATA_STORES.some((name) => {
    try {
      return holdsSomething(JSON.parse(readJson(name) ?? 'null'));
    } catch {
      return false;
    }
  });
}

export function getProfile(): Profile {
  const stored = read<Profile | null>('profile', null, (v): v is Profile | null => v === null || isProfile(v));
  if (stored) return { welcomed: stored.welcomed, modules: { ...ALL_OFF, ...stored.modules }, tours: toursOf(stored.tours) };
  return hasOwnData() ? { welcomed: true, modules: { ...ALL_ON } } : { welcomed: false, modules: { ...ALL_OFF } };
}

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string').slice(-max) : [];
}

/** Hand-edited or old data reads as "nothing seen yet". */
function toursOf(v: unknown): TourPrefs {
  const t = (v && typeof v === 'object' ? v : {}) as Partial<TourPrefs>;
  return {
    seen: strings(t.seen, 100),
    off: t.off === true,
    questsHidden: t.questsHidden === true,
    tips: strings(t.tips, 200),
    nudge: t.nudge && typeof t.nudge.day === 'string' && typeof t.nudge.id === 'string' ? { day: t.nudge.day, id: t.nudge.id } : undefined,
    nudgesOff: t.nudgesOff === true,
    tried: strings(t.tried, 200),
  };
}

export function getTours(): TourPrefs {
  return toursOf(getProfile().tours);
}

export function setTours(change: Partial<TourPrefs>): void {
  const p = getProfile();
  setProfile({ ...p, tours: { ...toursOf(p.tours), ...change } });
}

export function setProfile(profile: Profile): void {
  write('profile', profile);
  applyModules(profile);
}

export function setModule(id: ModuleId, on: boolean): void {
  const p = getProfile();
  setProfile({ ...p, modules: { ...p.modules, [id]: on } });
}

/** Mirror the sections onto <html> so CSS can show or hide their tabs and links. */
export function applyModules(profile: Profile = getProfile()): void {
  const root = document.documentElement;
  for (const m of MODULES) {
    if (profile.modules[m.id]) root.setAttribute(`data-mod-${m.id}`, '');
    else root.removeAttribute(`data-mod-${m.id}`);
  }
}
