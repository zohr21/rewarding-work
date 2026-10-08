/**
 * The only module that touches localStorage. Every widget goes through here.
 *
 * - Keys are namespaced and versioned: `rw:v1:<name>`.
 * - `rw:meta` records the schema version so future versions can migrate old data.
 * - Every read/write is wrapped in try/catch; reads parse JSON safely and run an
 *   optional type guard, falling back to a default on anything unexpected.
 * - If localStorage is unavailable (private mode, blocked cookies, quota), data is
 *   kept in memory for the current page so the UI still works.
 */

export const SCHEMA_VERSION = 1;

const NAMESPACE = 'rw';
const META_KEY = `${NAMESPACE}:meta`;

/** Every stored item. Add new names here so keys stay discoverable. */
export type StoreName =
  | 'theme'
  | 'appearance'
  | 'sessions'
  | 'timer'
  | 'timer-prefs'
  | 'done'
  | 'chain'
  | 'tasks'
  | 'exam'
  | 'breakdown' // legacy: moved into `tasks` on first load (see migrateBreakdown)
  | 'sound'
  | 'sync';

/** Cleared by "Delete all data". `sync` (account bookkeeping) is left alone. */
const ALL_STORES: StoreName[] = ['theme', 'appearance', 'sessions', 'timer', 'timer-prefs', 'done', 'chain', 'tasks', 'exam', 'breakdown', 'sound'];

/**
 * Stores copied to your account when you're signed in (src/lib/account).
 * The live timer and sound settings stay per device. `breakdown` stays listed only so
 * its removal (after moving into `tasks`) reaches the account too.
 */
export const SYNCED_STORES = ['sessions', 'done', 'chain', 'tasks', 'exam', 'breakdown', 'timer-prefs', 'theme', 'appearance'] as const;
export type SyncedStore = (typeof SYNCED_STORES)[number];

export function isSyncedStore(name: string): name is SyncedStore {
  return (SYNCED_STORES as readonly string[]).includes(name);
}

export function storageKey(name: StoreName, version = SCHEMA_VERSION): string {
  return `${NAMESPACE}:v${version}:${name}`;
}

// ---------- Low-level access ----------

const memory = new Map<string, string>();
let persistent: boolean | null = null;

function hasLocalStorage(): boolean {
  if (persistent !== null) return persistent;
  try {
    const probe = `${NAMESPACE}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    persistent = true;
  } catch {
    persistent = false;
  }
  return persistent;
}

function getRaw(key: string): string | null {
  if (hasLocalStorage()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory.get(key) ?? null;
}

function setRaw(key: string, value: string): boolean {
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      /* quota exceeded or blocked — keep it in memory for this page */
    }
  }
  memory.set(key, value);
  return false;
}

function removeRaw(key: string): void {
  memory.delete(key);
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function safeParse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** True when data is actually persisted (false in private mode etc.). */
export function isPersistent(): boolean {
  return hasLocalStorage();
}

// ---------- Migrations ----------

/**
 * MIGRATIONS[n] upgrades stored data from schema version n to n + 1.
 * Example for a future v2:
 *   1: () => { const s = read raw 'rw:v1:sessions'; transform; write 'rw:v2:sessions'; }
 */
const MIGRATIONS: Record<number, () => void> = {};

function migrate(): void {
  const meta = safeParse(getRaw(META_KEY)) as { schemaVersion?: unknown } | undefined;
  let version = typeof meta?.schemaVersion === 'number' ? meta.schemaVersion : SCHEMA_VERSION;
  while (version < SCHEMA_VERSION) {
    try {
      MIGRATIONS[version]?.();
    } catch {
      /* a failed migration must never break the page; old keys are left untouched */
    }
    version++;
  }
  setRaw(META_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION }));
}

let migrated = false;
function ensureMigrated(): void {
  if (migrated || typeof window === 'undefined') return;
  migrated = true;
  migrate();
  try {
    migrateBreakdown();
  } catch {
    /* never break the page; it is retried on the next load */
  }
}

// ---------- Typed read / write ----------

export type Guard<T> = (value: unknown) => value is T;

export function read<T>(name: StoreName, fallback: T, guard?: Guard<T>): T {
  ensureMigrated();
  const value = safeParse(getRaw(storageKey(name)));
  if (value === undefined) return fallback;
  if (guard && !guard(value)) return fallback;
  return value as T;
}

/** Returns true if persisted to localStorage, false if only kept in memory. */
export function write<T>(name: StoreName, value: T): boolean {
  ensureMigrated();
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return false;
  }
  const ok = setRaw(storageKey(name), json);
  notifyLocal(name);
  notifyWrite(name);
  return ok;
}

export function remove(name: StoreName): void {
  ensureMigrated();
  removeRaw(storageKey(name));
  notifyLocal(name);
  notifyWrite(name);
}

// ---------- Raw access for account sync ----------

type WriteListener = (name: StoreName) => void;
const writeListeners = new Set<WriteListener>();

function notifyWrite(name: StoreName): void {
  writeListeners.forEach((fn) => {
    try {
      fn(name);
    } catch {
      /* a listener must never break a write */
    }
  });
}

/** Called after every local write/remove on this page (not for other tabs, not for writeJsonFromSync). */
export function onWrite(fn: WriteListener): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

/** The stored JSON text of a store, or null. */
export function readJson(name: StoreName): string | null {
  ensureMigrated();
  return getRaw(storageKey(name));
}

/** Store JSON that came from your account. Widgets are notified; it doesn't count as a local change. */
export function writeJsonFromSync(name: StoreName, json: string | null): void {
  ensureMigrated();
  if (json === null) removeRaw(storageKey(name));
  else setRaw(storageKey(name), json);
  notifyLocal(name);
}

// ---------- Change notifications ----------

const LOCAL_EVENT = 'rw:storage';

function notifyLocal(name: StoreName): void {
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { name } }));
  } catch {
    /* ignore */
  }
}

/**
 * Call `callback` when `name` changes — in another tab (native `storage` event) and,
 * unless `otherTabsOnly`, also when another widget on this page writes it.
 * Returns an unsubscribe function.
 */
export function subscribe(name: StoreName, callback: () => void, { otherTabsOnly = false } = {}): () => void {
  const key = storageKey(name);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) callback();
  };
  const onLocal = (e: Event) => {
    if ((e as CustomEvent<{ name: StoreName }>).detail?.name === name) callback();
  };
  window.addEventListener('storage', onStorage);
  if (!otherTabsOnly) window.addEventListener(LOCAL_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onLocal);
  };
}

// ---------- Theme ----------

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** Dark unless the user picked light or auto (follow the system). */
export function getTheme(): ThemeChoice {
  const v = read<unknown>('theme', 'dark');
  return v === 'light' || v === 'auto' ? v : 'dark';
}

export function setTheme(choice: ThemeChoice): void {
  write('theme', choice);
}

// ---------- Appearance (ambient background) ----------

/** Soft CSS glows (cheap, always available). */
export const GLOWS = ['sunrise', 'meadow', 'lavender'] as const;
/** WebGL scenes (src/lib/scene). Fall back to the Sunrise glow where WebGL is unavailable. */
export const SCENES = ['aurora', 'lights', 'water', 'hills'] as const;
export const BACKDROPS = [...GLOWS, ...SCENES, 'plain'] as const;
export type Backdrop = (typeof BACKDROPS)[number];
export type SceneId = (typeof SCENES)[number];

export function isScene(bg: string): bg is SceneId {
  return (SCENES as readonly string[]).includes(bg);
}

export interface Appearance {
  bg: Backdrop;
  /** Gentle background motion. CSS also stops it under prefers-reduced-motion. */
  motion: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = { bg: 'sunrise', motion: true };

export function isAppearance(v: unknown): v is Appearance {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (BACKDROPS as readonly unknown[]).includes(a.bg) && typeof a.motion === 'boolean';
}

export function getAppearance(): Appearance {
  return read<Appearance>('appearance', DEFAULT_APPEARANCE, isAppearance);
}

export function setAppearance(a: Appearance): void {
  write('appearance', a);
}

// ---------- Background sound ----------

/** Built-in sounds (src/lib/sound): recordings with 3D details, or synthesised in the browser. */
export const SOUNDS = ['rain', 'waves', 'wind', 'fire', 'brown', 'pink', 'pads', 'piano'] as const;
export type SoundId = (typeof SOUNDS)[number];
export type SoundSource = SoundId | 'youtube';

export interface SoundPrefs {
  source: SoundSource;
  /** 0–1. */
  volume: number;
  /** Last YouTube link the user pasted. */
  youtube: string;
}

export const DEFAULT_SOUND: SoundPrefs = { source: 'rain', volume: 0.5, youtube: '' };

export function isSoundPrefs(v: unknown): v is SoundPrefs {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    ((SOUNDS as readonly unknown[]).includes(p.source) || p.source === 'youtube') &&
    typeof p.volume === 'number' &&
    p.volume >= 0 &&
    p.volume <= 1 &&
    typeof p.youtube === 'string'
  );
}

export function getSoundPrefs(): SoundPrefs {
  return read<SoundPrefs>('sound', DEFAULT_SOUND, isSoundPrefs);
}

export function setSoundPrefs(p: SoundPrefs): void {
  write('sound', p);
}

// ---------- Focus sessions ----------

export interface FocusSession {
  /** Stable id derived from the phase start time, so duplicate writes (two tabs) collapse. */
  id: string;
  /** Epoch ms. */
  start: number;
  end: number;
  /** Focused time, excluding pauses. */
  focusSeconds: number;
  mode: string;
  label: string;
  /** false when the session was reset part-way (still counts towards focus minutes). */
  completed: boolean;
  /** The task this session was for, when the label matched one. */
  taskId?: string;
}

export function isFocusSession(v: unknown): v is FocusSession {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.start === 'number' &&
    typeof s.end === 'number' &&
    typeof s.focusSeconds === 'number' &&
    s.focusSeconds >= 0 &&
    typeof s.mode === 'string' &&
    typeof s.label === 'string' &&
    typeof s.completed === 'boolean' &&
    (s.taskId === undefined || typeof s.taskId === 'string')
  );
}

/** All sessions, oldest first. Malformed entries are dropped rather than breaking the page. */
export function getSessions(): FocusSession[] {
  const raw = read<unknown>('sessions', []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isFocusSession).sort((a, b) => a.start - b.start);
}

export function addSession(session: FocusSession): void {
  const all = getSessions().filter((s) => s.id !== session.id);
  all.push(session);
  all.sort((a, b) => a.start - b.start);
  write('sessions', all);
}

// ---------- Helpers ----------

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Deletion markers (done items, tasks) older than this are dropped; by then every device has long since synced. */
const TOMBSTONE_MS = 180 * 86_400_000;

// ---------- Done list ----------

export interface DoneItem {
  id: string;
  text: string;
  /** Epoch ms. */
  doneAt: number;
  /** Set when the item came from a task step (or a whole task), so unticking removes it. */
  source?: string;
  /** The task it belongs to. */
  taskId?: string;
  /**
   * Set when the item was removed: a marker (text, source and task stripped) that stays
   * in the store so the removal reaches other devices instead of the item coming back.
   */
  deletedAt?: number;
}

export function isDoneItem(v: unknown): v is DoneItem {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    typeof v.doneAt === 'number' &&
    (v.source === undefined || typeof v.source === 'string') &&
    (v.taskId === undefined || typeof v.taskId === 'string') &&
    (v.deletedAt === undefined || typeof v.deletedAt === 'number')
  );
}

const byDoneAt = (a: DoneItem, b: DoneItem) => b.doneAt - a.doneAt;

/** Everything stored, including deletion markers (for sync and backups). Newest first. */
export function getDoneStore(): DoneItem[] {
  const raw = read<unknown>('done', []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isDoneItem).sort(byDoneAt);
}

/** Live (not removed) items, newest first. */
export function getDone(): DoneItem[] {
  return getDoneStore().filter((d) => d.deletedAt === undefined);
}

function writeDone(items: DoneItem[]): void {
  const cutoff = Date.now() - TOMBSTONE_MS;
  write('done', items.filter((d) => d.deletedAt === undefined || d.deletedAt > cutoff).sort(byDoneAt));
}

export function addDone(text: string, link: { source?: string; taskId?: string } = {}): DoneItem | null {
  const clean = text.trim().slice(0, 200);
  if (!clean) return null;
  const item: DoneItem = {
    id: newId('d'),
    text: clean,
    doneAt: Date.now(),
    ...(link.source ? { source: link.source } : {}),
    ...(link.taskId ? { taskId: link.taskId } : {}),
  };
  writeDone([item, ...getDoneStore()]);
  return item;
}

/** Replace every live item matching `hit` with a deletion marker. */
function markDoneRemoved(hit: (d: DoneItem) => boolean): void {
  const all = getDoneStore();
  if (!all.some((d) => d.deletedAt === undefined && hit(d))) return;
  const now = Date.now();
  writeDone(
    all.map((d) => (d.deletedAt === undefined && hit(d) ? { id: d.id, text: '', doneAt: d.doneAt, deletedAt: now } : d)),
  );
}

export function removeDone(id: string): void {
  markDoneRemoved((d) => d.id === id);
}

export function removeDoneBySource(source: string): void {
  markDoneRemoved((d) => d.source === source);
}

/**
 * Combine two copies of the done list (account sync, backup import). Items are never
 * edited, only added or removed, so per id a deletion marker beats the live copy.
 */
export function mergeDoneLists(a: DoneItem[], b: DoneItem[]): DoneItem[] {
  const byId = new Map(a.map((d) => [d.id, d]));
  for (const d of b) {
    const mine = byId.get(d.id);
    if (!mine || (d.deletedAt !== undefined && (mine.deletedAt === undefined || d.deletedAt < mine.deletedAt))) {
      byId.set(d.id, d);
    }
  }
  return [...byId.values()].sort(byDoneAt);
}

// ---------- Chain ----------

/** A chain beyond the first one. */
export interface ExtraChain {
  id: string;
  habit: string;
  /** Local YYYY-MM-DD keys of days marked done. */
  days: string[];
  /** Index into the chain colours (ChainTracker.astro). */
  color?: number;
  /** When it was deleted (epoch ms). Kept as an empty marker, so it doesn't come back from another device. */
  deletedAt?: number;
}

export interface Chain {
  habit: string;
  /** Local YYYY-MM-DD keys of days marked done. */
  days: string[];
  /**
   * When the chain was last deleted (epoch ms). Merging keeps the copy with the later
   * reset whole, so a deleted chain's days don't come back from another device.
   */
  resetAt?: number;
  /**
   * Best-run records of deleted chains: [day, length] for each day a new best was set.
   * Kept so the Best chain tier (which counts your best run ever) survives a delete.
   */
  pastBests?: [string, number][];
  /** Further chains. The first chain stays in `habit`/`days`, as it was before there could be several. */
  more?: ExtraChain[];
}

/** One chain as the tracker shows it: the first chain (id MAIN_CHAIN) or one of `more`. */
export interface ChainEntry {
  id: string;
  habit: string;
  days: string[];
  color: number;
}

export const MAIN_CHAIN = 'main';
export const MAX_CHAINS = 8;
/** Chain colours, by ChainEntry.color. The first chain keeps the accent green. */
export const CHAIN_COLORS = ['var(--color-accent)', 'var(--cat-reward)', 'var(--cat-visual)', 'var(--cat-time)', 'var(--cat-rest)'];

const isBestRecord = (v: unknown): v is [string, number] =>
  Array.isArray(v) && v.length === 2 && isDayKey(v[0]) && typeof v[1] === 'number';

const isExtraChain = (v: unknown): v is ExtraChain =>
  isObj(v) &&
  typeof v.id === 'string' &&
  typeof v.habit === 'string' &&
  Array.isArray(v.days) &&
  v.days.every(isDayKey) &&
  (v.color === undefined || typeof v.color === 'number') &&
  (v.deletedAt === undefined || typeof v.deletedAt === 'number');

/** Records from both lists, oldest first, without repeats. */
function joinBests(a: [string, number][] = [], b: [string, number][] = []): [string, number][] {
  const seen = new Map([...a, ...b].map((r) => [`${r[0]}:${r[1]}`, r] as const));
  return [...seen.values()].sort((x, y) => (x[0] === y[0] ? x[1] - y[1] : x[0] < y[0] ? -1 : 1));
}

export const EMPTY_CHAIN: Chain = { habit: '', days: [] };

export function isChain(v: unknown): v is Chain {
  return (
    isObj(v) &&
    typeof v.habit === 'string' &&
    Array.isArray(v.days) &&
    v.days.every(isDayKey) &&
    (v.resetAt === undefined || typeof v.resetAt === 'number') &&
    (v.pastBests === undefined || (Array.isArray(v.pastBests) && v.pastBests.every(isBestRecord))) &&
    (v.more === undefined || (Array.isArray(v.more) && v.more.every(isExtraChain)))
  );
}

const cleanHabit = (habit: string) => habit.trim().slice(0, 80);
const cleanDays = (days: string[]) => [...new Set(days)].sort();

function cleanChain(c: Chain): Chain {
  const more = (c.more ?? []).map(
    (m): ExtraChain =>
      m.deletedAt
        ? { id: m.id, habit: '', days: [], deletedAt: m.deletedAt }
        : { id: m.id, habit: cleanHabit(m.habit), days: cleanDays(m.days), ...(m.color === undefined ? {} : { color: m.color }) },
  );
  return {
    habit: cleanHabit(c.habit),
    days: cleanDays(c.days),
    ...(c.resetAt ? { resetAt: c.resetAt } : {}),
    ...(c.pastBests?.length ? { pastBests: c.pastBests } : {}),
    ...(more.length ? { more } : {}),
  };
}

export function getChain(): Chain {
  return cleanChain(read<Chain>('chain', EMPTY_CHAIN, isChain));
}

export function setChain(chain: Chain): void {
  write('chain', cleanChain(chain));
}

/** Every chain in a stored record that has a habit, the first chain first. */
export function chainsOf(c: Chain): ChainEntry[] {
  return [
    ...(c.habit ? [{ id: MAIN_CHAIN, habit: c.habit, days: c.days, color: 0 }] : []),
    ...(c.more ?? []).filter((m) => !m.deletedAt).map((m) => ({ id: m.id, habit: m.habit, days: m.days, color: m.color ?? 1 })),
  ];
}

export function getChains(): ChainEntry[] {
  return chainsOf(getChain());
}

/** Start a chain for a habit. Returns its id, or null when the name is empty or there are MAX_CHAINS already. */
export function addChain(habit: string): string | null {
  const name = cleanHabit(habit);
  const c = getChain();
  const live = getChains();
  if (!name || live.length >= MAX_CHAINS) return null;
  if (!c.habit) {
    setChain({ ...c, habit: name });
    return MAIN_CHAIN;
  }
  const used = new Set(live.map((l) => l.color));
  const color = CHAIN_COLORS.findIndex((_, i) => !used.has(i));
  const id = newId('chain');
  setChain({ ...c, more: [...(c.more ?? []), { id, habit: name, days: [], color: color < 0 ? live.length % CHAIN_COLORS.length : color }] });
  return id;
}

export function renameChain(id: string, habit: string): void {
  const name = cleanHabit(habit);
  const c = getChain();
  if (!name) return;
  if (id === MAIN_CHAIN) setChain({ ...c, habit: name });
  else setChain({ ...c, more: (c.more ?? []).map((m) => (m.id === id && !m.deletedAt ? { ...m, habit: name } : m)) });
}

/**
 * Delete the first chain's habit and every marked day. `bests` are the deleted chain's
 * best-run records (see Chain.pastBests), kept so its tier isn't lost.
 */
export function resetChain(bests: [string, number][] = []): void {
  const old = getChain();
  setChain({
    ...EMPTY_CHAIN,
    resetAt: Math.max(Date.now(), (old.resetAt ?? 0) + 1),
    pastBests: joinBests(old.pastBests, bests),
    more: old.more,
  });
}

/** Delete one chain and its marked days; `bests` as for resetChain. */
export function deleteChain(id: string, bests: [string, number][] = []): void {
  if (id === MAIN_CHAIN) return resetChain(bests);
  const c = getChain();
  setChain({
    ...c,
    pastBests: joinBests(c.pastBests, bests),
    more: (c.more ?? []).map((m) => (m.id === id ? { id, habit: '', days: [], deletedAt: Date.now() } : m)),
  });
}

/** Further chains from both copies, matched by id: days are joined, and a deletion on either side wins. */
function mergeExtras(a: ExtraChain[] = [], b: ExtraChain[] = []): ExtraChain[] {
  const byId = new Map(a.map((m) => [m.id, m]));
  for (const m of b) {
    const mine = byId.get(m.id);
    if (!mine) byId.set(m.id, m);
    else if (mine.deletedAt || m.deletedAt) {
      byId.set(m.id, { id: m.id, habit: '', days: [], deletedAt: Math.max(mine.deletedAt ?? 0, m.deletedAt ?? 0) });
    } else byId.set(m.id, { ...mine, habit: mine.habit || m.habit, days: cleanDays([...mine.days, ...m.days]) });
  }
  return [...byId.values()];
}

/**
 * Combine two copies of the chain (account sync, backup import): marked days are joined,
 * unless one copy was deleted more recently than the other — then that copy wins whole.
 */
export function mergeChains(a: Chain, b: Chain): Chain {
  const ra = a.resetAt ?? 0;
  const rb = b.resetAt ?? 0;
  const pastBests = joinBests(a.pastBests, b.pastBests);
  const more = mergeExtras(a.more, b.more);
  const withRest = (c: Chain): Chain => ({ ...c, ...(pastBests.length ? { pastBests } : {}), ...(more.length ? { more } : {}) });
  if (ra !== rb) return withRest(ra > rb ? a : b);
  return withRest({ habit: a.habit || b.habit, days: cleanDays([...a.days, ...b.days]), ...(ra ? { resetAt: ra } : {}) });
}

/** Mark or unmark a day on one chain. Returns whether the day is now marked. */
export function toggleChainDay(key: string, id: string = MAIN_CHAIN): boolean {
  const c = getChain();
  const flip = (days: string[]) => (days.includes(key) ? days.filter((d) => d !== key) : [...days, key]);
  const days = id === MAIN_CHAIN ? c.days : c.more?.find((m) => m.id === id && !m.deletedAt)?.days;
  if (!days) return false;
  if (id === MAIN_CHAIN) setChain({ ...c, days: flip(c.days) });
  else setChain({ ...c, more: (c.more ?? []).map((m) => (m.id === id ? { ...m, days: flip(m.days) } : m)) });
  return !days.includes(key);
}

// ---------- Tasks ----------

export interface TaskStep {
  id: string;
  text: string;
  done: boolean;
}

/** A note left when a focus session on the task ended ("what I did / what's next"). */
export interface TaskLogEntry {
  id: string;
  /** Epoch ms. */
  at: number;
  did: string;
  next: string;
  focusSeconds: number;
}

export const NOTES_MAX = 5000;
export const LOG_MAX = 30;
export const LOG_TEXT_MAX = 200;

/**
 * Which list an open task is on. `inbox` holds thoughts jotted on the timer's scratchpad,
 * waiting to be sorted. Tasks from before lists existed have none and count as `next`.
 */
export const TASK_LISTS = ['inbox', 'today', 'next', 'someday'] as const;
export type TaskList = (typeof TASK_LISTS)[number];

export interface Task {
  id: string;
  title: string;
  list?: TaskList;
  /** When the task was put on Today (epoch ms): shows when it was planned for an earlier day. */
  todayAt?: number;
  /** Position on Today, lowest first ("first up"); falls back to `todayAt`. */
  todayOrder?: number;
  steps: TaskStep[];
  /** Free-form notes. */
  notes?: string;
  /** Session log, oldest first, at most LOG_MAX entries. */
  log?: TaskLogEntry[];
  status: 'active' | 'done';
  /** Epoch ms. */
  createdAt: number;
  /** Bumped on every change; account sync keeps the newer copy of each task. */
  updatedAt: number;
  doneAt?: number;
  /**
   * Set when the task is deleted. The entry stays (without title or steps) so the
   * deletion reaches your other devices instead of the task coming back from them.
   */
  deletedAt?: number;
}

export interface TaskStore {
  items: Task[];
  /** The task the breakdown tool shows. */
  current: string | null;
  /** When `current` was last changed (for account sync). */
  currentAt: number;
}

export const EMPTY_TASKS: TaskStore = { items: [], current: null, currentAt: 0 };

export function isTaskStep(v: unknown): v is TaskStep {
  return isObj(v) && typeof v.id === 'string' && typeof v.text === 'string' && typeof v.done === 'boolean';
}

export function isTaskLogEntry(v: unknown): v is TaskLogEntry {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.at === 'number' &&
    typeof v.did === 'string' &&
    typeof v.next === 'string' &&
    typeof v.focusSeconds === 'number'
  );
}

export function isTask(v: unknown): v is Task {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.steps) &&
    v.steps.every(isTaskStep) &&
    (v.notes === undefined || typeof v.notes === 'string') &&
    (v.list === undefined || (TASK_LISTS as readonly unknown[]).includes(v.list)) &&
    (v.todayAt === undefined || typeof v.todayAt === 'number') &&
    (v.todayOrder === undefined || typeof v.todayOrder === 'number') &&
    (v.log === undefined || (Array.isArray(v.log) && v.log.every(isTaskLogEntry))) &&
    (v.status === 'active' || v.status === 'done') &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number' &&
    (v.doneAt === undefined || typeof v.doneAt === 'number') &&
    (v.deletedAt === undefined || typeof v.deletedAt === 'number')
  );
}

export function isTaskStore(v: unknown): v is TaskStore {
  return (
    isObj(v) &&
    Array.isArray(v.items) &&
    (v.current === null || typeof v.current === 'string') &&
    typeof v.currentAt === 'number'
  );
}

/** Tolerant: malformed tasks are dropped, not the whole store. */
export function normaliseTasks(v: unknown): TaskStore {
  if (!isTaskStore(v)) return EMPTY_TASKS;
  return { items: v.items.filter(isTask), current: v.current, currentAt: v.currentAt };
}

/** Everything stored, including deletion markers (for sync and backups). */
export function getTaskStore(): TaskStore {
  return normaliseTasks(read<unknown>('tasks', null));
}

/** Live (not deleted) tasks, newest first. */
export function getTasks(): Task[] {
  return getTaskStore()
    .items.filter((t) => t.deletedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getTask(id: string): Task | null {
  return getTasks().find((t) => t.id === id) ?? null;
}

/** The current task, if it still exists. */
export function getCurrentTask(): Task | null {
  const { current } = getTaskStore();
  return current ? getTask(current) : null;
}

function writeTasks(store: TaskStore): void {
  const cutoff = Date.now() - TOMBSTONE_MS;
  write('tasks', { ...store, items: store.items.filter((t) => t.deletedAt === undefined || t.deletedAt > cutoff) });
}

const cleanTitle = (title: string) => title.trim().slice(0, 120);

/** A copy of `task` stamped as changed now (always later than its previous stamp). */
function touched(task: Task, patch: Partial<Task>): Task {
  return { ...task, ...patch, updatedAt: Math.max(Date.now(), task.updatedAt + 1) };
}

export function setCurrentTask(id: string | null): void {
  const store = getTaskStore();
  if (store.current === id) return;
  writeTasks({ ...store, current: id, currentAt: Math.max(Date.now(), store.currentAt + 1) });
}

export function createTask(title: string, { makeCurrent = true, list }: { makeCurrent?: boolean; list?: TaskList } = {}): Task {
  const now = Date.now();
  const task: Task = { id: newId('t'), title: cleanTitle(title), steps: [], status: 'active', createdAt: now, updatedAt: now };
  if (list && list !== 'next') task.list = list;
  if (list === 'today') task.todayAt = now;
  const store = getTaskStore();
  writeTasks({
    items: [...store.items, task],
    current: makeCurrent ? task.id : store.current,
    currentAt: makeCurrent ? Math.max(now, store.currentAt + 1) : store.currentAt,
  });
  return task;
}

/** Apply `change` to one live task. Returns the updated task, or null if it doesn't exist. */
export function updateTask(id: string, change: (task: Task) => Partial<Task>): Task | null {
  const store = getTaskStore();
  const old = store.items.find((t) => t.id === id && t.deletedAt === undefined);
  if (!old) return null;
  const next = touched(old, change(old));
  next.title = cleanTitle(next.title);
  writeTasks({ ...store, items: store.items.map((t) => (t.id === id ? next : t)) });
  return next;
}

export function deleteTask(id: string): void {
  const store = getTaskStore();
  const old = store.items.find((t) => t.id === id);
  if (!old || old.deletedAt !== undefined) return;
  const now = Date.now();
  const { notes: _notes, log: _log, ...rest } = touched(old, { deletedAt: now });
  const marker: Task = { ...rest, title: '', steps: [] };
  writeTasks({
    items: store.items.map((t) => (t.id === id ? marker : t)),
    current: store.current === id ? null : store.current,
    currentAt: store.current === id ? Math.max(now, store.currentAt + 1) : store.currentAt,
  });
}

/**
 * Combine two copies of the task store (account sync, backup import).
 * Per task the newer `updatedAt` wins, so a deletion beats an older edit and a
 * newer edit beats an older deletion. The newer `current` choice wins.
 */
export function mergeTaskStores(a: TaskStore, b: TaskStore): TaskStore {
  const byId = new Map(a.items.map((t) => [t.id, t]));
  for (const t of b.items) {
    const mine = byId.get(t.id);
    if (!mine || t.updatedAt > mine.updatedAt || (t.updatedAt === mine.updatedAt && t.deletedAt !== undefined)) {
      byId.set(t.id, t);
    }
  }
  const newer = b.currentAt > a.currentAt ? b : a;
  return {
    items: [...byId.values()].sort((x, y) => x.createdAt - y.createdAt),
    current: newer.current,
    currentAt: newer.currentAt,
  };
}

// ---------- Exam prep ----------

/** A chapter or part of the exam. Focus sessions are linked to it through `FocusSession.taskId`. */
export interface ExamChapter {
  id: string;
  name: string;
  plannedHours?: number;
  done: boolean;
  notes?: string;
}

export interface ExamQuestion {
  id: string;
  chapterId?: string;
  text: string;
  options: string[];
  /** Indexes into `options` of the right answer(s). */
  answer: number[];
  explanation?: string;
  /** Times answered in practice, and how many of those were right. */
  seen: number;
  correct: number;
  /** "Ask me again": comes first in the next round. */
  again?: boolean;
}

export interface ExamRound {
  /** Epoch ms. */
  at: number;
  total: number;
  correct: number;
}

export interface Exam {
  title: string;
  /** Local YYYY-MM-DD of the exam, when known. */
  date?: string;
  targetHours?: number;
  chapters: ExamChapter[];
  questions: ExamQuestion[];
  /** Practice rounds, oldest first, at most ROUNDS_MAX. */
  rounds: ExamRound[];
  createdAt: number;
}

export const EXAM_RESULTS = ['passed', 'failed', 'finished'] as const;
export type ExamResult = (typeof EXAM_RESULTS)[number];

/** An exam you've taken: a short record of how the preparation went. */
export interface PastExam {
  id: string;
  title: string;
  date?: string;
  result: ExamResult;
  /** Epoch ms. */
  finishedAt: number;
  studiedSeconds: number;
  chaptersDone: number;
  chaptersTotal: number;
  /**
   * Kept when you didn't pass, so "Prepare again" can start a new plan with the same
   * chapters and questions. Dropped once used.
   */
  retry?: { chapters: ExamChapter[]; questions: ExamQuestion[] };
}

export interface ExamStore {
  /** The exam you're preparing for now. */
  exam: Exam | null;
  /** Exams you've taken, oldest first, at most PAST_MAX. */
  past: PastExam[];
  /** Bumped on every change; account sync keeps the newer copy whole. */
  updatedAt: number;
}

export const EMPTY_EXAM: ExamStore = { exam: null, past: [], updatedAt: 0 };
export const CHAPTERS_MAX = 60;
export const QUESTIONS_MAX = 2000;
export const ROUNDS_MAX = 50;
export const PAST_MAX = 30;

const isHours = (v: unknown) => v === undefined || (typeof v === 'number' && v > 0 && v <= 10000);

export function isExamChapter(v: unknown): v is ExamChapter {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isHours(v.plannedHours) &&
    typeof v.done === 'boolean' &&
    (v.notes === undefined || typeof v.notes === 'string')
  );
}

export function isExamQuestion(v: unknown): v is ExamQuestion {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    (v.chapterId === undefined || typeof v.chapterId === 'string') &&
    typeof v.text === 'string' &&
    Array.isArray(v.options) &&
    v.options.length >= 2 &&
    v.options.every((o) => typeof o === 'string') &&
    Array.isArray(v.answer) &&
    v.answer.length >= 1 &&
    v.answer.every((a) => Number.isInteger(a) && a >= 0 && a < (v.options as unknown[]).length) &&
    (v.explanation === undefined || typeof v.explanation === 'string') &&
    typeof v.seen === 'number' &&
    typeof v.correct === 'number' &&
    (v.again === undefined || typeof v.again === 'boolean')
  );
}

const isExamRound = (v: unknown): v is ExamRound =>
  isObj(v) && typeof v.at === 'number' && typeof v.total === 'number' && typeof v.correct === 'number';

export function isPastExam(v: unknown): v is PastExam {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    (v.date === undefined || isDayKey(v.date)) &&
    (EXAM_RESULTS as readonly unknown[]).includes(v.result) &&
    typeof v.finishedAt === 'number' &&
    typeof v.studiedSeconds === 'number' &&
    typeof v.chaptersDone === 'number' &&
    typeof v.chaptersTotal === 'number' &&
    (v.retry === undefined ||
      (isObj(v.retry) &&
        Array.isArray(v.retry.chapters) &&
        v.retry.chapters.every(isExamChapter) &&
        Array.isArray(v.retry.questions) &&
        v.retry.questions.every(isExamQuestion)))
  );
}

/** Tolerant: malformed chapters, questions, rounds and past exams are dropped, not the whole store. */
export function normaliseExam(v: unknown): ExamStore {
  if (!isObj(v) || typeof v.updatedAt !== 'number') return EMPTY_EXAM;
  const past = Array.isArray(v.past) ? v.past.filter(isPastExam) : [];
  const e = v.exam;
  if (!isObj(e) || typeof e.title !== 'string' || typeof e.createdAt !== 'number') return { exam: null, past, updatedAt: v.updatedAt };
  return {
    exam: {
      title: e.title,
      ...(isDayKey(e.date) ? { date: e.date } : {}),
      ...(typeof e.targetHours === 'number' && isHours(e.targetHours) ? { targetHours: e.targetHours } : {}),
      chapters: Array.isArray(e.chapters) ? e.chapters.filter(isExamChapter) : [],
      questions: Array.isArray(e.questions) ? e.questions.filter(isExamQuestion) : [],
      rounds: Array.isArray(e.rounds) ? e.rounds.filter(isExamRound) : [],
      createdAt: e.createdAt,
    },
    past,
    updatedAt: v.updatedAt,
  };
}

export function getExamStore(): ExamStore {
  return normaliseExam(read<unknown>('exam', null));
}

export function getExam(): Exam | null {
  return getExamStore().exam;
}

/** Change the current exam, the past exams, or both. */
export function setExamStore(patch: Partial<Pick<ExamStore, 'exam' | 'past'>>): void {
  const old = getExamStore();
  write('exam', { exam: old.exam, past: old.past, ...patch, updatedAt: Math.max(Date.now(), old.updatedAt + 1) });
}

/** Replace the exam (null deletes it; the store stays so the deletion reaches your other devices). */
export function setExam(exam: Exam | null): void {
  setExamStore({ exam });
}

/** Apply `change` to the exam. Returns the updated exam, or null if there isn't one. */
export function updateExam(change: (exam: Exam) => Partial<Exam>): Exam | null {
  const old = getExam();
  if (!old) return null;
  const next = { ...old, ...change(old) };
  setExam(next);
  return next;
}

/** Combine two copies (account sync, backup import): the one changed last wins whole. */
export function mergeExamStores(a: ExamStore, b: ExamStore): ExamStore {
  return b.updatedAt > a.updatedAt ? b : a;
}

// ---------- Legacy: the single task breakdown (before tasks existed) ----------

export interface Breakdown {
  task: string;
  steps: TaskStep[];
}

export function isBreakdown(v: unknown): v is Breakdown {
  return isObj(v) && typeof v.task === 'string' && Array.isArray(v.steps) && v.steps.every(isTaskStep);
}

/**
 * Same id on every device, so a breakdown converted on two devices becomes one task
 * when their data meets in your account.
 */
export const LEGACY_TASK_ID = 'tlegacy';

/** The old breakdown as a task, or null if it was empty. */
export function breakdownToTask(b: Breakdown, now = Date.now()): Task | null {
  if (!b.task.trim() && !b.steps.length) return null;
  return {
    id: LEGACY_TASK_ID,
    title: cleanTitle(b.task),
    steps: b.steps.map((s) => ({ id: s.id, text: s.text, done: s.done })),
    status: 'active',
    createdAt: now,
    // Older than any real edit, so a copy another device has already changed wins.
    updatedAt: 1,
  };
}

/** One-time: move the old single breakdown into the tasks store. */
function migrateBreakdown(): void {
  const legacy = safeParse(getRaw(storageKey('breakdown')));
  if (legacy === undefined) return;
  const task = isBreakdown(legacy) ? breakdownToTask(legacy) : null;
  const store = getTaskStore();
  if (task && !store.items.some((t) => t.id === task.id)) {
    writeTasks({ items: [...store.items, task], current: store.current ?? task.id, currentAt: store.currentAt || 1 });
  }
  remove('breakdown');
  // Make sure both changes reach your account even though the sync code isn't listening yet.
  const meta = getSyncMeta();
  if (meta.uid) setSyncMeta({ ...meta, dirty: [...meta.dirty, 'tasks', 'breakdown'] });
}

// ---------- Export / import ----------

export const BACKUP_APP_ID = 'rewarding-work';

/** Everything worth backing up. The live timer state is deliberately left out. */
export interface BackupData {
  sessions: FocusSession[];
  done: DoneItem[];
  chain: Chain;
  tasks: TaskStore;
  exam: ExamStore;
  timerPrefs: unknown;
  theme: ThemeChoice;
  appearance: Appearance;
}

export interface Backup {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export function exportBackup(): Backup {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      sessions: getSessions(),
      done: getDoneStore(),
      chain: getChain(),
      tasks: getTaskStore(),
      exam: getExamStore(),
      timerPrefs: read<unknown>('timer-prefs', null),
      theme: getTheme(),
      appearance: getAppearance(),
    },
  };
}

export type ParseResult =
  | { ok: true; data: BackupData; skipped: number }
  | { ok: false; error: string };

/**
 * Validate a backup file. Unknown or malformed entries are skipped (and counted)
 * rather than rejecting the whole file.
 */
export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (!isObj(json) || json.app !== BACKUP_APP_ID || !isObj(json.data)) {
    return { ok: false, error: "This doesn't look like a Rewarding Work export." };
  }
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'This export comes from a newer version of the site. Reload the page and try again.' };
  }

  const d = json.data;
  let skipped = 0;
  const pick = <T>(arr: unknown, guard: (v: unknown) => v is T): T[] => {
    if (!Array.isArray(arr)) return [];
    const good = arr.filter(guard);
    skipped += arr.length - good.length;
    return good;
  };

  const data: BackupData = {
    sessions: pick(d.sessions, isFocusSession),
    done: pick(d.done, isDoneItem),
    chain: isChain(d.chain) ? d.chain : EMPTY_CHAIN,
    tasks: parseBackupTasks(d, (n) => (skipped += n)),
    // Exports made before exam prep existed have none.
    exam: normaliseExam(d.exam),
    timerPrefs: isObj(d.timerPrefs) ? d.timerPrefs : null,
    theme: d.theme === 'light' || d.theme === 'auto' ? d.theme : 'dark',
    appearance: isAppearance(d.appearance) ? d.appearance : DEFAULT_APPEARANCE,
  };
  return { ok: true, data, skipped };
}

/** Tasks from a backup; exports made before tasks existed carry a single `breakdown`. */
function parseBackupTasks(d: Record<string, unknown>, skip: (n: number) => void): TaskStore {
  if (isTaskStore(d.tasks)) {
    const store = normaliseTasks(d.tasks);
    skip(d.tasks.items.length - store.items.length);
    return store;
  }
  const legacy = isBreakdown(d.breakdown) ? breakdownToTask(d.breakdown) : null;
  return legacy ? { items: [legacy], current: legacy.id, currentAt: 1 } : EMPTY_TASKS;
}

/**
 * merge: keeps everything you have and adds what's new (by id / by day); a removal
 *   recorded on either side (done item, task) wins over the live copy.
 * replace: your current data is swapped for the file's contents.
 */
export function applyBackup(data: BackupData, mode: 'merge' | 'replace'): void {
  if (mode === 'replace') {
    write('sessions', [...data.sessions].sort((a, b) => a.start - b.start));
    writeDone(data.done);
    setChain(data.chain);
    writeTasks(data.tasks);
    write('exam', data.exam);
    if (data.timerPrefs) write('timer-prefs', data.timerPrefs);
    setTheme(data.theme);
    setAppearance(data.appearance);
    return;
  }

  const sessions = new Map(getSessions().map((s) => [s.id, s]));
  data.sessions.forEach((s) => sessions.has(s.id) || sessions.set(s.id, s));
  write('sessions', [...sessions.values()].sort((a, b) => a.start - b.start));

  writeDone(mergeDoneLists(getDoneStore(), data.done));

  setChain(mergeChains(getChain(), data.chain));

  writeTasks(mergeTaskStores(getTaskStore(), data.tasks));

  const exam = mergeExamStores(getExamStore(), data.exam);
  if (exam.updatedAt) write('exam', exam);
}

/** Remove everything this site stores under the current schema version (including the live timer). */
export function clearAll(): void {
  ALL_STORES.forEach((name) => remove(name));
}

// ---------- Account sync bookkeeping ----------

export interface SyncMeta {
  /** The account the data in this browser belongs to (null: not linked to any account yet). */
  uid: string | null;
  /** Signed in on this device — loads the account code on every page. */
  active: boolean;
  /** Stores changed here that haven't reached the account yet. */
  dirty: SyncedStore[];
}

const EMPTY_SYNC: SyncMeta = { uid: null, active: false, dirty: [] };

function isSyncMeta(v: unknown): v is SyncMeta {
  return (
    isObj(v) &&
    (v.uid === null || typeof v.uid === 'string') &&
    typeof v.active === 'boolean' &&
    Array.isArray(v.dirty) &&
    v.dirty.every((d) => typeof d === 'string' && isSyncedStore(d))
  );
}

export function getSyncMeta(): SyncMeta {
  return read<SyncMeta>('sync', EMPTY_SYNC, isSyncMeta);
}

export function setSyncMeta(meta: SyncMeta): void {
  write('sync', { ...meta, dirty: [...new Set(meta.dirty)] });
}
