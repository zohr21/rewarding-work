/**
 * A task's steps drawn like an installer: each step is done, the one you're on now, or
 * waiting. The step you're on is the first open one; it turns (a spinner, with the glow)
 * only while a focus session runs on its task, and is a still ring otherwise.
 * Shared by the task rows (TaskList.astro) and the full steps view (BreakdownTool.astro).
 */
import { t } from './i18n';
import { read, type Task, type TaskStep } from './storage';
import { endsAt, isTimerState, type TimerState } from './timer/engine';

export type StepState = 'done' | 'now' | 'live' | 'waiting';

/** The task a focus session is running on right now, if any. */
export function liveTaskId(): string | null {
  const t = read<TimerState | null>('timer', null, (v): v is TimerState | null => v === null || isTimerState(v));
  if (!t || !t.taskId || t.status !== 'running' || t.phase !== 'work') return null;
  const end = endsAt(t);
  // A session that ran out while no timer page was open doesn't count.
  return end === null || end > Date.now() ? t.taskId : null;
}

/** The step you're on: the first one not done. */
export function currentStep(steps: TaskStep[]): TaskStep | undefined {
  return steps.find((s) => !s.done);
}

export function stepStates(task: Task, live: boolean): Map<string, StepState> {
  const now = task.status === 'active' ? currentStep(task.steps) : undefined;
  return new Map(task.steps.map((s) => [s.id, s.done ? 'done' : s === now ? (live ? 'live' : 'now') : 'waiting']));
}

const SVG: Record<StepState, string> = {
  done: '<circle class="pi__disc" cx="12" cy="12" r="10"/><path class="pi__tick" d="M7.2 12.4l3 3 6.4-6.8"/>',
  live: '<circle class="pi__track" cx="12" cy="12" r="9"/><path class="pi__arc" d="M12 3a9 9 0 0 1 9 9"/>',
  now: '<circle class="pi__track" cx="12" cy="12" r="9"/><path class="pi__arc pi__arc--still" d="M12 3a9 9 0 0 1 7.8 4.5"/>',
  waiting: '<circle class="pi__wait" cx="12" cy="12" r="9"/>',
};

/** The step's state as a small icon (styles in global.css, `.pi`). */
export function stepIcon(state: StepState, size = 24): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `pi pi--${state}`);
  svg.innerHTML = SVG[state];
  return svg;
}

/** One segment per step; the one you're on is marked, and pulses while live. */
export function stepBar(task: Task, live: boolean): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'segs';
  row.setAttribute('aria-hidden', 'true');
  for (const state of stepStates(task, live).values()) {
    const seg = document.createElement('span');
    if (state === 'done') seg.className = 'is-done';
    else if (state === 'live') seg.className = 'is-live';
    else if (state === 'now') seg.className = 'is-now';
    row.append(seg);
  }
  return row;
}

/** Spoken and shown names for a state. */
/** A step's state in words, for screen readers. */
export const stateWords = (state: StepState): string => t(`step.${state}`);
