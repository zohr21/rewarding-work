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
export type StoreName = 'theme' | 'appearance' | 'sessions' | 'timer' | 'timer-prefs' | 'done' | 'chain' | 'breakdown' | 'sound' | 'sync';

/** Cleared by "Delete all data". `sync` (account bookkeeping) is left alone. */
const ALL_STORES: StoreName[] = ['theme', 'appearance', 'sessions', 'timer', 'timer-prefs', 'done', 'chain', 'breakdown', 'sound'];

/**
 * Stores copied to your account when you're signed in (src/lib/account).
 * The live timer and sound settings stay per device.
 */
export const SYNCED_STORES = ['sessions', 'done', 'chain', 'breakdown', 'timer-prefs', 'theme', 'appearance'] as const;
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

/** Light unless the user picked dark or auto (follow the system). */
export function getTheme(): ThemeChoice {
  const v = read<unknown>('theme', 'light');
  return v === 'dark' || v === 'auto' ? v : 'light';
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

/** Sounds synthesised in the browser (src/lib/sound) — no audio files, work offline. */
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
    typeof s.completed === 'boolean'
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

// ---------- Done list ----------

export interface DoneItem {
  id: string;
  text: string;
  /** Epoch ms. */
  doneAt: number;
  /** Set when the item came from a breakdown step, so unticking the step removes it. */
  source?: string;
}

export function isDoneItem(v: unknown): v is DoneItem {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    typeof v.doneAt === 'number' &&
    (v.source === undefined || typeof v.source === 'string')
  );
}

/** Newest first. */
export function getDone(): DoneItem[] {
  const raw = read<unknown>('done', []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isDoneItem).sort((a, b) => b.doneAt - a.doneAt);
}

export function addDone(text: string, source?: string): DoneItem | null {
  const clean = text.trim().slice(0, 200);
  if (!clean) return null;
  const item: DoneItem = { id: newId('d'), text: clean, doneAt: Date.now(), ...(source ? { source } : {}) };
  write('done', [item, ...getDone()]);
  return item;
}

export function removeDone(id: string): void {
  write('done', getDone().filter((d) => d.id !== id));
}

export function removeDoneBySource(source: string): void {
  write('done', getDone().filter((d) => d.source !== source));
}

// ---------- Chain ----------

export interface Chain {
  habit: string;
  /** Local YYYY-MM-DD keys of days marked done. */
  days: string[];
}

export const EMPTY_CHAIN: Chain = { habit: '', days: [] };

export function isChain(v: unknown): v is Chain {
  return isObj(v) && typeof v.habit === 'string' && Array.isArray(v.days) && v.days.every(isDayKey);
}

export function getChain(): Chain {
  const c = read<Chain>('chain', EMPTY_CHAIN, isChain);
  return { habit: c.habit, days: [...new Set(c.days)].sort() };
}

export function setChain(chain: Chain): void {
  write('chain', { habit: chain.habit.trim().slice(0, 80), days: [...new Set(chain.days)].sort() });
}

export function toggleChainDay(key: string): boolean {
  const chain = getChain();
  const has = chain.days.includes(key);
  setChain({ ...chain, days: has ? chain.days.filter((d) => d !== key) : [...chain.days, key] });
  return !has;
}

// ---------- Task breakdown ----------

export interface BreakdownStep {
  id: string;
  text: string;
  done: boolean;
}

export interface Breakdown {
  task: string;
  steps: BreakdownStep[];
}

export const EMPTY_BREAKDOWN: Breakdown = { task: '', steps: [] };

export function isBreakdown(v: unknown): v is Breakdown {
  return (
    isObj(v) &&
    typeof v.task === 'string' &&
    Array.isArray(v.steps) &&
    v.steps.every((s) => isObj(s) && typeof s.id === 'string' && typeof s.text === 'string' && typeof s.done === 'boolean')
  );
}

export function getBreakdown(): Breakdown {
  return read<Breakdown>('breakdown', EMPTY_BREAKDOWN, isBreakdown);
}

export function setBreakdown(b: Breakdown): void {
  write('breakdown', b);
}

// ---------- Export / import ----------

export const BACKUP_APP_ID = 'rewarding-work';

/** Everything worth backing up. The live timer state is deliberately left out. */
export interface BackupData {
  sessions: FocusSession[];
  done: DoneItem[];
  chain: Chain;
  breakdown: Breakdown;
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
      done: getDone(),
      chain: getChain(),
      breakdown: getBreakdown(),
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
    breakdown: isBreakdown(d.breakdown) ? d.breakdown : EMPTY_BREAKDOWN,
    timerPrefs: isObj(d.timerPrefs) ? d.timerPrefs : null,
    theme: d.theme === 'dark' || d.theme === 'auto' ? d.theme : 'light',
    appearance: isAppearance(d.appearance) ? d.appearance : DEFAULT_APPEARANCE,
  };
  return { ok: true, data, skipped };
}

/**
 * merge: keeps everything you have and adds what's new (by id / by day).
 * replace: your current data is swapped for the file's contents.
 */
export function applyBackup(data: BackupData, mode: 'merge' | 'replace'): void {
  if (mode === 'replace') {
    write('sessions', [...data.sessions].sort((a, b) => a.start - b.start));
    write('done', data.done);
    setChain(data.chain);
    setBreakdown(data.breakdown);
    if (data.timerPrefs) write('timer-prefs', data.timerPrefs);
    setTheme(data.theme);
    setAppearance(data.appearance);
    return;
  }

  const sessions = new Map(getSessions().map((s) => [s.id, s]));
  data.sessions.forEach((s) => sessions.has(s.id) || sessions.set(s.id, s));
  write('sessions', [...sessions.values()].sort((a, b) => a.start - b.start));

  const done = new Map(getDone().map((d) => [d.id, d]));
  data.done.forEach((d) => done.has(d.id) || done.set(d.id, d));
  write('done', [...done.values()].sort((a, b) => b.doneAt - a.doneAt));

  const chain = getChain();
  setChain({ habit: chain.habit || data.chain.habit, days: [...chain.days, ...data.chain.days] });

  const breakdown = getBreakdown();
  if (!breakdown.task && !breakdown.steps.length) setBreakdown(data.breakdown);
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
