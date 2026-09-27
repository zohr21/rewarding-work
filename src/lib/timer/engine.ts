/**
 * Timer state machine — pure functions, no DOM, no storage.
 *
 * Drift-free by design: the state stores *when* the current run started
 * (`runStartedAt`, epoch ms) plus time accumulated before any pause (`elapsedMs`).
 * Remaining time is always derived from `Date.now()`; nothing counts ticks.
 * A background tab that only wakes once a minute still shows the right time,
 * and `tick()` catches up on any phases that ended in the meantime, using the
 * exact moment each phase ended (not the moment we noticed).
 */
import { TIMER_MODES, type TimerMode } from '../../data/taxonomy';
import type { FocusSession } from '../storage';

export type Phase = 'work' | 'short-break' | 'long-break';
export type Status = 'idle' | 'running' | 'paused';

export interface CustomDurations {
  workMin: number;
  breakMin: number;
}

export interface TimerState {
  mode: TimerMode;
  phase: Phase;
  status: Status;
  /** Length of this phase in ms, or null when counting up (Flowtime focus). */
  durationMs: number | null;
  /** Time accumulated before the current running segment (i.e. across pauses). */
  elapsedMs: number;
  /** Epoch ms when the current running segment began; null unless running. */
  runStartedAt: number | null;
  /** Epoch ms when this phase was first started; null while idle. */
  phaseStartedAt: number | null;
  /** Completed focus sessions in the current Pomodoro set. */
  cycle: number;
  label: string;
  custom: CustomDurations;
}

export type TimerEvent =
  | { type: 'phase-complete'; from: Phase; to: Phase; autoStarted: boolean; at: number; focusMs: number; breakMs: number; session?: FocusSession }
  | { type: 'partial-session'; session: FocusSession }
  | { type: 'too-short' };

export interface Result {
  state: TimerState;
  events: TimerEvent[];
}

// ---------- Configuration ----------

const MIN = 60_000;
export const POMODORO = { workMin: 25, shortMin: 5, longMin: 15, longEvery: 4 } as const;
export const FIFTY_TWO = { workMin: 52, breakMin: 17 } as const;
export const DEFAULT_CUSTOM: CustomDurations = { workMin: 15, breakMin: 5 };
/** Sessions shorter than this aren't logged (accidental starts). */
export const MIN_LOGGED_MS = MIN;

export const LIMITS = { workMin: [1, 240], breakMin: [0, 60] } as const;

export function clampCustom(c: Partial<CustomDurations>): CustomDurations {
  const clamp = (v: unknown, [lo, hi]: readonly [number, number], d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    workMin: clamp(c.workMin, LIMITS.workMin, DEFAULT_CUSTOM.workMin),
    breakMin: clamp(c.breakMin, LIMITS.breakMin, DEFAULT_CUSTOM.breakMin),
  };
}

export function workDurationMs(mode: TimerMode, custom: CustomDurations): number | null {
  switch (mode) {
    case 'pomodoro':
      return POMODORO.workMin * MIN;
    case '52-17':
      return FIFTY_TWO.workMin * MIN;
    case 'custom':
      return custom.workMin * MIN;
    case 'flowtime':
      return null;
  }
}

/** Flowtime suggests a break of one fifth of the focus time, rounded to a whole minute (min 1). */
export function flowtimeBreakMs(focusMs: number): number {
  return Math.max(1, Math.round(focusMs / MIN / 5)) * MIN;
}

function breakDurationMs(mode: TimerMode, custom: CustomDurations, phase: Phase, focusMs: number): number {
  switch (mode) {
    case 'pomodoro':
      return (phase === 'long-break' ? POMODORO.longMin : POMODORO.shortMin) * MIN;
    case '52-17':
      return FIFTY_TWO.breakMin * MIN;
    case 'custom':
      return custom.breakMin * MIN;
    case 'flowtime':
      return flowtimeBreakMs(focusMs);
  }
}

// ---------- Derived values ----------

export function elapsed(s: TimerState, now: number): number {
  return s.elapsedMs + (s.status === 'running' && s.runStartedAt !== null ? Math.max(0, now - s.runStartedAt) : 0);
}

/** Remaining ms, or null when counting up. */
export function remaining(s: TimerState, now: number): number | null {
  return s.durationMs === null ? null : Math.max(0, s.durationMs - elapsed(s, now));
}

/** Epoch ms at which the running phase ends, or null. */
export function endsAt(s: TimerState): number | null {
  if (s.status !== 'running' || s.durationMs === null || s.runStartedAt === null) return null;
  return s.runStartedAt + (s.durationMs - s.elapsedMs);
}

export function isBreak(phase: Phase): boolean {
  return phase !== 'work';
}

// ---------- Constructors ----------

export function createState(mode: TimerMode, custom: CustomDurations, label = '', cycle = 0): TimerState {
  return {
    mode,
    phase: 'work',
    status: 'idle',
    durationMs: workDurationMs(mode, custom),
    elapsedMs: 0,
    runStartedAt: null,
    phaseStartedAt: null,
    cycle,
    label,
    custom,
  };
}

function idleWork(s: TimerState, cycle = s.cycle): TimerState {
  return createState(s.mode, s.custom, s.label, cycle);
}

function makeSession(s: TimerState, end: number, focusMs: number, completed: boolean): FocusSession {
  const start = s.phaseStartedAt ?? end - focusMs;
  return {
    id: `s${start}`,
    start,
    end,
    focusSeconds: Math.round(focusMs / 1000),
    mode: s.mode,
    label: s.label.trim(),
    completed,
  };
}

// ---------- Transitions ----------

export function start(s: TimerState, now: number): TimerState {
  if (s.status === 'running') return s;
  if (s.status === 'idle') {
    return { ...s, status: 'running', elapsedMs: 0, runStartedAt: now, phaseStartedAt: now };
  }
  return { ...s, status: 'running', runStartedAt: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', elapsedMs: elapsed(s, now), runStartedAt: null };
}

export function toggle(s: TimerState, now: number): TimerState {
  return s.status === 'running' ? pause(s, now) : start(s, now);
}

/** End the current phase at time `at` and move to the next one. */
function finishPhase(s: TimerState, at: number): Result {
  const focusMs = s.durationMs ?? elapsed(s, at);

  if (s.phase === 'work') {
    const session = makeSession(s, at, focusMs, true);
    const cycle = s.mode === 'pomodoro' ? s.cycle + 1 : s.cycle;
    const nextPhase: Phase =
      s.mode === 'pomodoro' && cycle % POMODORO.longEvery === 0 ? 'long-break' : 'short-break';
    const breakMs = breakDurationMs(s.mode, s.custom, nextPhase, focusMs);

    if (breakMs <= 0) {
      // Custom mode with no break: straight back to a ready focus session.
      return {
        state: idleWork(s, cycle),
        events: [{ type: 'phase-complete', from: 'work', to: 'work', autoStarted: false, at, focusMs, breakMs: 0, session }],
      };
    }

    // Breaks start automatically, timed from the exact end of the focus phase.
    const next: TimerState = {
      ...s,
      phase: nextPhase,
      status: 'running',
      durationMs: breakMs,
      elapsedMs: 0,
      runStartedAt: at,
      phaseStartedAt: at,
      cycle,
    };
    return {
      state: next,
      events: [{ type: 'phase-complete', from: 'work', to: nextPhase, autoStarted: true, at, focusMs, breakMs, session }],
    };
  }

  // A break ended: wait for the user to start the next focus session.
  const cycle = s.phase === 'long-break' ? 0 : s.cycle;
  return {
    state: idleWork(s, cycle),
    events: [{ type: 'phase-complete', from: s.phase, to: 'work', autoStarted: false, at, focusMs: 0, breakMs: focusMs }],
  };
}

/** Advance through any phases that have ended by `now`. Safe to call as often as you like. */
export function tick(s: TimerState, now: number): Result {
  const events: TimerEvent[] = [];
  let state = s;
  for (let guard = 0; guard < 16; guard++) {
    const end = endsAt(state);
    if (end === null || now < end) break;
    const r = finishPhase(state, end);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Flowtime: the user decides their focus is fading. Logs the session and starts the suggested break. */
export function stopFlow(s: TimerState, now: number): Result {
  if (s.phase !== 'work' || s.status === 'idle') return { state: s, events: [] };
  if (elapsed(s, now) < MIN_LOGGED_MS) return { state: idleWork(s), events: [{ type: 'too-short' }] };
  const frozen: TimerState = { ...s, elapsedMs: elapsed(s, now), runStartedAt: null, status: 'paused' };
  return finishPhase(frozen, now);
}

export function skipBreak(s: TimerState): TimerState {
  if (!isBreak(s.phase)) return s;
  return idleWork(s, s.phase === 'long-break' ? 0 : s.cycle);
}

/** Back to a ready focus session. Focus time of at least a minute is still logged (as not completed). */
export function reset(s: TimerState, now: number): Result {
  const events: TimerEvent[] = [];
  if (s.phase === 'work' && s.status !== 'idle') {
    const focusMs = elapsed(s, now);
    if (focusMs >= MIN_LOGGED_MS) events.push({ type: 'partial-session', session: makeSession(s, now, focusMs, false) });
  }
  const cycle = isBreak(s.phase) && s.phase === 'long-break' ? 0 : s.cycle;
  return { state: idleWork(s, cycle), events };
}

/** Only allowed while idle (the UI disables mode switching during a phase). */
export function setMode(s: TimerState, mode: TimerMode): TimerState {
  if (s.status !== 'idle' || s.mode === mode) return s;
  return createState(mode, s.custom, s.label, 0);
}

export function setCustom(s: TimerState, custom: CustomDurations): TimerState {
  const next = { ...s, custom };
  if (s.status === 'idle' && s.phase === 'work') next.durationMs = workDurationMs(s.mode, custom);
  return next;
}

export function setLabel(s: TimerState, label: string): TimerState {
  return { ...s, label };
}

// ---------- Validation (for state restored from storage) ----------

export function isTimerState(v: unknown): v is TimerState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const numOrNull = (x: unknown) => x === null || num(x);
  const custom = s.custom as Record<string, unknown> | null;
  return (
    (TIMER_MODES as readonly unknown[]).includes(s.mode) &&
    ['work', 'short-break', 'long-break'].includes(s.phase as string) &&
    ['idle', 'running', 'paused'].includes(s.status as string) &&
    numOrNull(s.durationMs) &&
    num(s.elapsedMs) &&
    numOrNull(s.runStartedAt) &&
    numOrNull(s.phaseStartedAt) &&
    num(s.cycle) &&
    typeof s.label === 'string' &&
    typeof custom === 'object' &&
    custom !== null &&
    num(custom.workMin) &&
    num(custom.breakMin) &&
    // A running state must know when it started.
    (s.status !== 'running' || num(s.runStartedAt))
  );
}
