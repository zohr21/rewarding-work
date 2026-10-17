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
  if (stored) return { welcomed: stored.welcomed, modules: { ...ALL_OFF, ...stored.modules } };
  return hasOwnData() ? { welcomed: true, modules: { ...ALL_ON } } : { welcomed: false, modules: { ...ALL_OFF } };
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
