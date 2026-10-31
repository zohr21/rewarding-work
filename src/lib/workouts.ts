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
  return { items: Array.isArray(s.items) ? s.items.filter(isWorkout) : [], lastType: isWorkoutType(s.lastType) ? s.lastType : undefined };
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
  const items = getStore().items.filter((x) => x.id !== w.id);
  items.push(w);
  items.sort((a, b) => a.start - b.start);
  write<WorkoutStore>('workouts', { items: items.slice(-KEEP), lastType: w.type });
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

export const EFFORT_WORDS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Fairly hard', 'Hard', 'Very hard', 'Near max', 'All out'];
