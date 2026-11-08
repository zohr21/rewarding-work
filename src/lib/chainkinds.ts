/**
 * What a chain counts beyond "done or not". Each chain has a kind:
 *
 * - tick: done or not, one tap (every chain made before kinds existed).
 * - amount: a number with a goal per day (pages, glasses, km).
 * - parts: several slots in a day, such as the five prayers; each is on time, later or not
 *   yet, and the day counts once enough are done.
 * - linked: fills itself in from your focus sessions or the workouts on Health.
 *
 * The chain itself (store `chain`) still keeps only the days that count, so streaks, tiers
 * and account sync work as before. What you fill in on each day is kept here.
 *
 * This store stays on this device: prayers and workouts are personal, so it is not synced
 * and not in the backup file. Another device shows the same chains as plain ticks.
 */
import { getChains, getSessions, read, setChainDay, write, type ChainEntry, type FocusSession } from './storage';
import { addDays, dayKey, isDayKey, startOfDay, type DayKey } from './dates';
import { minutesByDay } from './stats';
import { WORKOUT_TYPES, getWorkouts, isWorkoutType, workoutsByDay, type Workout, type WorkoutType } from './workouts';
import { t, type Key } from './i18n';

export type ChainKind = 'tick' | 'amount' | 'parts' | 'linked';
export type LinkSource = 'focus' | WorkoutType;

export interface ChainSetup {
  kind: ChainKind;
  /** amount: the number a day needs. linked: km for run, walk and cycle, else minutes; 0 = any. */
  goal?: number;
  /** amount: what is counted, e.g. "pages". */
  unit?: string;
  /** parts: the slots, in order. */
  parts?: string[];
  /** parts: how many slots make the day count. */
  countAt?: number;
  /** linked: where the day is read from. */
  source?: LinkSource;
}

/** One slot of a parts chain: 0 not yet, 1 on time, 2 later. Later still counts. */
export type PartState = 0 | 1 | 2;

export interface DayEntry {
  /** amount: how much. */
  n?: number;
  /** parts: one state per slot, in the order of ChainSetup.parts. */
  parts?: PartState[];
  note?: string;
}

interface Store {
  setups: Record<string, ChainSetup>;
  log: Record<string, Record<DayKey, DayEntry>>;
}

/** Days of entries kept per chain. */
const KEEP_DAYS = 400;
export const MAX_PARTS = 8;
/** Days you can still fill in, counting today; matches the chain tracker. */
export const EDIT_DAYS = 7;

export const KINDS: { id: ChainKind; title: string; sub: string }[] = [
  { id: 'tick', title: 'Tick', sub: 'Done or not, one tap' },
  { id: 'amount', title: 'Amount', sub: 'A number with a goal: pages, glasses' },
  { id: 'parts', title: 'Parts of the day', sub: 'Several slots: prayers, meals, pills' },
  { id: 'linked', title: 'Linked', sub: 'Fills itself from Focus or Health' },
  // Shown through data-t="chain.kind.<id>" / "chain.kind.<id>Sub" (ChainTracker.astro).
];

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** The five prayers as this language names them, for a new chain's slots. */
export const prayers = (): string[] => t('chain.prayers').split(',').map((p) => p.trim());

/** Ready-made chains for the New chain form. */
export const TEMPLATES: { label: string; habit: string; setup: ChainSetup }[] = [
  { label: 'Five prayers', habit: 'Prayers', setup: { kind: 'parts', parts: PRAYERS, countAt: 5 } },
  { label: 'Run', habit: 'Run 3 km', setup: { kind: 'linked', source: 'run', goal: 3 } },
  { label: 'Read', habit: 'Read 20 pages', setup: { kind: 'amount', goal: 20, unit: 'pages' } },
  { label: 'Quran pages', habit: 'Quran', setup: { kind: 'amount', goal: 2, unit: 'pages' } },
  { label: 'Water', habit: 'Water', setup: { kind: 'amount', goal: 8, unit: 'glasses' } },
  { label: 'Focus time', habit: 'Focus 50 min', setup: { kind: 'linked', source: 'focus', goal: 50 } },
];

/**
 * Template `i` in the current language: its chip (data-t="chain.tpl.<i>"), and the name and unit
 * it fills in. Those are saved as the user's own text, so they stay in the language they were made in.
 */
export function template(i: number): { habit: string; setup: ChainSetup } | undefined {
  const tpl = TEMPLATES[i];
  if (!tpl) return undefined;
  const setup: ChainSetup = { ...tpl.setup };
  if (setup.kind === 'parts') setup.parts = prayers();
  if (setup.kind === 'amount' && setup.unit) setup.unit = t(`chain.unit.${setup.unit}` as Key);
  return { habit: t(`chain.tpl.${i}.habit` as Key), setup };
}

const KIND_IDS: readonly string[] = KINDS.map((k) => k.id);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : undefined;
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function cleanSetup(v: unknown): ChainSetup | undefined {
  if (!isObj(v) || typeof v.kind !== 'string' || !KIND_IDS.includes(v.kind)) return undefined;
  const kind = v.kind as ChainKind;
  if (kind === 'amount') return { kind, goal: num(v.goal, 100_000) || 1, unit: text(v.unit, 20) };
  if (kind === 'parts') {
    const parts = (Array.isArray(v.parts) ? v.parts : []).map((p) => text(p, 24)).filter((p): p is string => !!p).slice(0, MAX_PARTS);
    if (parts.length < 2) return undefined;
    const countAt = Math.min(parts.length, Math.max(1, Math.round(num(v.countAt, MAX_PARTS) ?? parts.length)));
    return { kind, parts, countAt };
  }
  if (kind === 'linked') {
    const source: LinkSource = v.source === 'focus' || isWorkoutType(v.source) ? v.source : 'focus';
    return { kind, source, goal: num(v.goal, 10_000) ?? 0 };
  }
  return { kind };
}

function cleanEntry(v: unknown): DayEntry | undefined {
  if (!isObj(v)) return undefined;
  const e: DayEntry = {};
  const n = num(v.n, 100_000);
  if (n) e.n = n;
  if (Array.isArray(v.parts) && v.parts.some((p) => p === 1 || p === 2))
    e.parts = v.parts.slice(0, MAX_PARTS).map((p) => (p === 1 || p === 2 ? p : 0));
  const note = text(v.note, 200);
  if (note) e.note = note;
  return Object.keys(e).length ? e : undefined;
}

function getStore(): Store {
  const raw = read<unknown>('chain-detail', null);
  const out: Store = { setups: {}, log: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.setups))
    for (const [id, s] of Object.entries(raw.setups)) {
      const clean = cleanSetup(s);
      if (clean) out.setups[id] = clean;
    }
  if (isObj(raw.log))
    for (const [id, days] of Object.entries(raw.log)) {
      if (!isObj(days)) continue;
      const kept: Record<DayKey, DayEntry> = {};
      for (const [key, entry] of Object.entries(days)) {
        const clean = isDayKey(key) ? cleanEntry(entry) : undefined;
        if (clean) kept[key] = clean;
      }
      if (Object.keys(kept).length) out.log[id] = kept;
    }
  return out;
}

export function getSetup(id: string): ChainSetup {
  return getStore().setups[id] ?? { kind: 'tick' };
}

export function saveSetup(id: string, setup: ChainSetup): void {
  const s = getStore();
  const clean = cleanSetup(setup);
  if (!clean || clean.kind === 'tick') delete s.setups[id];
  else s.setups[id] = clean;
  write<Store>('chain-detail', s);
  recount(id);
}

export function getEntry(id: string, key: DayKey): DayEntry {
  return getStore().log[id]?.[key] ?? {};
}

/** Saves a day and marks or unmarks it on the chain. Returns whether the day now counts. */
export function saveEntry(id: string, key: DayKey, entry: DayEntry): boolean {
  const s = getStore();
  const clean = cleanEntry(entry);
  const days = { ...(s.log[id] ?? {}) };
  if (clean) days[key] = clean;
  else delete days[key];
  const oldest = dayKey(addDays(startOfDay(new Date()), -KEEP_DAYS));
  for (const k of Object.keys(days)) if (k < oldest) delete days[k];
  s.log[id] = days;
  write<Store>('chain-detail', s);
  const counted = dayOf(s.setups[id] ?? { kind: 'tick' }, clean ?? {}, key).counted;
  setChainDay(key, id, counted);
  return counted;
}

/** One slot of today's parts chain, flipped between not yet and on time. */
export function togglePart(id: string, key: DayKey, part: number): boolean {
  const setup = getSetup(id);
  const entry = getEntry(id, key);
  const parts: PartState[] = Array.from({ length: setup.parts?.length ?? 0 }, (_, i) => entry.parts?.[i] ?? 0);
  if (part >= parts.length) return false;
  parts[part] = parts[part] ? 0 : 1;
  return saveEntry(id, key, { ...entry, parts });
}

/** Forget a deleted chain's kind and entries; its id may be used again for a new chain. */
export function removeDetail(id: string): void {
  const s = getStore();
  if (!s.setups[id] && !s.log[id]) return;
  delete s.setups[id];
  delete s.log[id];
  write<Store>('chain-detail', s);
}

// ---------- What a day shows ----------

export interface DayView {
  counted: boolean;
  /** Something done, but not enough to count. */
  partial: boolean;
  /** Short progress for the tick button and day squares: "3/5", "2.1", "34′". */
  short: string;
  /** Plain words: "3 of 5", "2.1 of 3 km". */
  long: string;
  /** 0 to 1. */
  share: number;
}

/** Data the linked chains read; pass it in when drawing many days so it is read once. */
export interface LinkData {
  focus: Map<DayKey, number>;
  workouts: Map<DayKey, Workout[]>;
}

export function linkData(sessions: FocusSession[] = getSessions(), workouts: Workout[] = getWorkouts()): LinkData {
  return { focus: minutesByDay(sessions), workouts: workoutsByDay(workouts) };
}

const usesKm = (source: LinkSource | undefined) => !!source && source !== 'focus' && WORKOUT_TYPES.find((t) => t.id === source)!.distance;

export function linkUnit(setup: ChainSetup): string {
  return usesKm(setup.source) ? t('unit.km') : t('unit.minShort');
}

/** Workouts of the linked type on a day. */
export function linkedWorkouts(setup: ChainSetup, key: DayKey, data: LinkData): Workout[] {
  return (data.workouts.get(key) ?? []).filter((w) => w.type === setup.source);
}

/** The linked number for a day: focus minutes, km, or workout minutes. */
export function linkedValue(setup: ChainSetup, key: DayKey, data: LinkData): number {
  if (setup.source === 'focus') return Math.floor(data.focus.get(key) ?? 0);
  const list = linkedWorkouts(setup, key, data);
  return usesKm(setup.source) ? list.reduce((t, w) => t + (w.distanceM ?? 0), 0) / 1000 : list.reduce((t, w) => t + w.minutes, 0);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * How a day stands. `marked` is whether the chain has the day, which is all a tick chain
 * knows (and all a chain shows on a device without its entries).
 */
export function dayOf(setup: ChainSetup, entry: DayEntry, key: DayKey, data?: LinkData, marked = false): DayView {
  if (setup.kind === 'amount') {
    const n = entry.n ?? 0;
    const goal = setup.goal || 1;
    return { counted: n >= goal, partial: n > 0 && n < goal, short: fmt(n), long: t('chain.nOfGoal', { n: fmt(n), goal: fmt(goal), unit: setup.unit ?? '' }).trim(), share: Math.min(1, n / goal) };
  }
  if (setup.kind === 'parts') {
    const total = setup.parts?.length ?? 0;
    const done = (entry.parts ?? []).slice(0, total).filter(Boolean).length;
    const need = setup.countAt ?? total;
    return { counted: done >= need, partial: done > 0 && done < need, short: `${done}/${total}`, long: t('chain.nOf', { n: done, total }), share: total ? done / total : 0 };
  }
  if (setup.kind === 'linked') {
    const value = linkedValue(setup, key, data ?? linkData());
    const goal = setup.goal ?? 0;
    const unit = linkUnit(setup);
    const counted = goal > 0 ? value >= goal : value > 0;
    const km = usesKm(setup.source);
    const amount = km ? fmt(Math.floor(value * 10) / 10) : String(Math.floor(value));
    const short = km ? amount : `${amount}′`;
    const long = goal > 0 ? t('chain.nOfGoal', { n: amount, goal: fmt(goal), unit }) : value > 0 ? `${amount} ${unit}` : t('chain.nothingYet');
    return { counted, partial: !counted && value > 0, short, long, share: goal > 0 ? Math.min(1, value / goal) : counted ? 1 : 0 };
  }
  return { counted: marked, partial: false, short: '', long: marked ? t('chain.done') : t('chain.notYet'), share: marked ? 1 : 0 };
}

/** dayOf for a chain as the tracker lists it. */
export function chainDay(ch: ChainEntry, key: DayKey, data?: LinkData): DayView {
  return dayOf(getSetup(ch.id), getEntry(ch.id, key), key, data, ch.days.includes(key));
}

/** Mark the days a chain's entries say count, over the days that can still change. */
function recount(id: string, data?: LinkData): void {
  const ch = getChains().find((c) => c.id === id);
  const setup = getSetup(id);
  if (!ch || setup.kind === 'tick') return;
  const now = startOfDay(new Date());
  for (let i = 0; i < EDIT_DAYS; i++) {
    const key = dayKey(addDays(now, -i));
    const counted = dayOf(setup, getEntry(id, key), key, data).counted;
    if (counted !== ch.days.includes(key)) setChainDay(key, id, counted);
  }
}

/**
 * Linked chains follow your focus sessions and workouts: over the last EDIT_DAYS days, a day
 * is marked when it reaches the goal and unmarked when it no longer does (a workout deleted).
 * Older days are kept as they are. Writes only when something changed.
 */
export function syncLinked(): void {
  const linked = getChains().filter((ch) => getSetup(ch.id).kind === 'linked');
  if (!linked.length) return;
  const data = linkData();
  for (const ch of linked) recount(ch.id, data);
}

export const unitWord = (setup: ChainSetup) => (setup.kind === 'amount' ? setup.unit ?? '' : setup.kind === 'linked' ? linkUnit(setup) : '');
export { WORKOUT_TYPES };
