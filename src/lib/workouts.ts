/**
 * Workouts you log by hand on /health: a run, a swim, a gym session. They sit on the day
 * next to your focus sessions, so the page can say whether a workout fits around them.
 *
 * Kept on this device for now: not in SYNCED_STORES (that needs the store allowed in
 * firestore.rules first) and not in the backup file.
 */
import { read, write, type FocusSession } from './storage';
import { dayKey, type DayKey } from './dates';

export const WORKOUT_TYPES = [
  { id: 'run', label: 'Run', color: 'var(--cat-reward)', distance: true },
  { id: 'swim', label: 'Swim', color: 'var(--cat-visual)', distance: false },
  { id: 'walk', label: 'Walk', color: 'var(--cat-structure)', distance: true },
  { id: 'cycle', label: 'Cycle', color: 'var(--ev-some)', distance: true },
  { id: 'gym', label: 'Gym', color: 'var(--cat-time)', distance: false },
  { id: 'yoga', label: 'Yoga', color: 'var(--cat-rest)', distance: false },
] as const;

export type WorkoutType = (typeof WORKOUT_TYPES)[number]['id'];

export interface Workout {
  id: string;
  type: WorkoutType;
  /** Epoch ms. */
  start: number;
  minutes: number;
  /** Run, walk and cycle. */
  distanceM?: number;
  /** Swim: laps of a pool of `poolM`. */
  laps?: number;
  poolM?: number;
  /** 1 (very easy) to 10 (all out). */
  effort: number;
  note?: string;
}

interface WorkoutStore {
  items: Workout[];
  /** The type picked last, so the form opens on it. */
  lastType?: WorkoutType;
  /** For the calorie estimate. */
  weightKg?: number;
  /** Distances in miles instead of km. */
  miles?: boolean;
}

const KEEP = 2000;
const TYPE_IDS: readonly string[] = WORKOUT_TYPES.map((t) => t.id);

export const isWorkoutType = (v: unknown): v is WorkoutType => typeof v === 'string' && TYPE_IDS.includes(v);

function isWorkout(v: unknown): v is Workout {
  if (!v || typeof v !== 'object') return false;
  const w = v as Workout;
  return typeof w.id === 'string' && isWorkoutType(w.type) && typeof w.start === 'number' && typeof w.minutes === 'number' && w.minutes > 0 && typeof w.effort === 'number';
}

function getStore(): WorkoutStore {
  const raw = read<unknown>('workouts', null);
  if (!raw || typeof raw !== 'object') return { items: [] };
  const s = raw as WorkoutStore;
  return {
    items: Array.isArray(s.items) ? s.items.filter(isWorkout) : [],
    lastType: isWorkoutType(s.lastType) ? s.lastType : undefined,
    weightKg: typeof s.weightKg === 'number' && s.weightKg >= 20 && s.weightKg <= 300 ? s.weightKg : undefined,
    miles: s.miles === true || undefined,
  };
}

/** All workouts, oldest first. */
export function getWorkouts(): Workout[] {
  return getStore().items.sort((a, b) => a.start - b.start);
}

export function lastWorkoutType(): WorkoutType {
  return getStore().lastType ?? 'run';
}

/** Adds the workout, or replaces the one with the same id. */
export function saveWorkout(w: Workout): void {
  const s = getStore();
  const items = s.items.filter((x) => x.id !== w.id);
  items.push(w);
  items.sort((a, b) => a.start - b.start);
  write<WorkoutStore>('workouts', { ...s, items: items.slice(-KEEP), lastType: w.type });
}

export function removeWorkout(id: string): void {
  const s = getStore();
  write<WorkoutStore>('workouts', { ...s, items: s.items.filter((x) => x.id !== id) });
}

export const workoutType = (id: WorkoutType) => WORKOUT_TYPES.find((t) => t.id === id)!;

export function workoutsByDay(items: Workout[]): Map<DayKey, Workout[]> {
  const out = new Map<DayKey, Workout[]>();
  for (const w of items) {
    const k = dayKey(w.start);
    const list = out.get(k);
    if (list) list.push(w);
    else out.set(k, [w]);
  }
  return out;
}

/** The first focus session that shares time with this span, if any. */
export function overlappingSession(start: number, minutes: number, sessions: FocusSession[]): FocusSession | undefined {
  const end = start + minutes * 60_000;
  return sessions.find((s) => s.start < end && s.end > start);
}

/**
 * Rough numbers for the estimates: MET (energy per kg per hour, from the Compendium of Physical
 * Activities) from very easy to all out, speed in km/h over the same range, and for the types
 * that cover ground, kcal per kg per km, which holds better than MET once the distance is known.
 */
const ROUGH: Record<WorkoutType, { met: [number, number]; kmh?: [number, number]; kcalPerKgKm?: number }> = {
  run: { met: [7, 12.5], kmh: [8, 14], kcalPerKgKm: 1 },
  walk: { met: [2.8, 5], kmh: [3.5, 6.5], kcalPerKgKm: 0.5 },
  cycle: { met: [4, 12], kmh: [12, 28], kcalPerKgKm: 0.28 },
  swim: { met: [5, 10] },
  gym: { met: [3.5, 6] },
  yoga: { met: [2, 4] },
};

const along = ([lo, hi]: [number, number], effort: number) => lo + ((hi - lo) * (Math.min(10, Math.max(1, effort)) - 1)) / 9;

/** Typical speed in km/h at this effort, for run, walk and cycle. */
export function roughKmh(type: WorkoutType, effort: number): number | undefined {
  const kmh = ROUGH[type].kmh;
  return kmh && along(kmh, effort);
}

/** Metres covered at a typical speed for this effort, for run, walk and cycle. */
export function roughDistanceM(type: WorkoutType, minutes: number, effort: number): number | undefined {
  const kmh = roughKmh(type, effort);
  return kmh && Math.round((kmh * minutes * 1000) / 60);
}

/** Calories burned, rounded to 5: from the distance when there is one, otherwise from time and effort. */
export function roughKcal(w: Pick<Workout, 'type' | 'minutes' | 'effort' | 'distanceM'>, kg: number): number {
  const r = ROUGH[w.type];
  const kcal = r.kcalPerKgKm && w.distanceM ? r.kcalPerKgKm * kg * (w.distanceM / 1000) : (along(r.met, w.effort) * kg * w.minutes) / 60;
  return Math.round(kcal / 5) * 5;
}

/** Body weight for the calorie estimate; the form asks once. */
export const DEFAULT_KG = 70;

export function weightKg(): number | undefined {
  return getStore().weightKg;
}

export function saveWeightKg(kg: number): void {
  write<WorkoutStore>('workouts', { ...getStore(), weightKg: kg });
}

/** Distances show in km unless miles were picked in the log form. */
export function usesMiles(): boolean {
  return getStore().miles === true;
}

export function saveUsesMiles(miles: boolean): void {
  write<WorkoutStore>('workouts', { ...getStore(), miles: miles || undefined });
}

export const EFFORT_WORDS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Fairly hard', 'Hard', 'Very hard', 'Near max', 'All out'];
