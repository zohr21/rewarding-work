/**
 * Task actions shared by the breakdown tool and the tasks page, including their
 * effect on the Done list: a ticked step or a finished task is logged there, and
 * unticking or reopening takes the entry out again.
 */
import {
  addDone,
  createTask,
  getCurrentTask,
  getTask,
  LOG_MAX,
  LOG_TEXT_MAX,
  newId,
  NOTES_MAX,
  removeDoneBySource,
  updateTask,
  type FocusSession,
  type Task,
  type TaskLogEntry,
} from './storage';

export const UNTITLED = 'Untitled task';

export const taskName = (task: Pick<Task, 'title'>) => task.title || UNTITLED;

/** Done-list source for a whole task (steps use their own id). */
const taskSource = (id: string) => `task:${id}`;

/** The current task, created (untitled) if there isn't one yet. */
export function ensureCurrentTask(): Task {
  return getCurrentTask() ?? createTask('');
}

export function addStep(taskId: string, text: string): void {
  const clean = text.trim().slice(0, 120);
  if (!clean) return;
  updateTask(taskId, (t) => ({ steps: [...t.steps, { id: newId('st'), text: clean, done: false }] }));
}

export function removeStep(taskId: string, stepId: string): void {
  updateTask(taskId, (t) => ({ steps: t.steps.filter((s) => s.id !== stepId) }));
}

export function setStepDone(taskId: string, stepId: string, done: boolean): void {
  const task = updateTask(taskId, (t) => ({ steps: t.steps.map((s) => (s.id === stepId ? { ...s, done } : s)) }));
  const step = task?.steps.find((s) => s.id === stepId);
  if (!task || !step) return;
  if (done) addDone(task.title ? `${step.text} (${task.title})` : step.text, { source: step.id, taskId: task.id });
  else removeDoneBySource(step.id);
}

export function finishTask(id: string): void {
  const task = updateTask(id, () => ({ status: 'done', doneAt: Date.now() }));
  if (task) addDone(`Finished: ${taskName(task)}`, { source: taskSource(id), taskId: id });
}

export function reopenTask(id: string): void {
  if (!getTask(id)) return;
  updateTask(id, () => ({ status: 'active', doneAt: undefined }));
  removeDoneBySource(taskSource(id));
}

/** Focus seconds per task id. */
export function focusByTask(sessions: FocusSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) if (s.taskId) map.set(s.taskId, (map.get(s.taskId) ?? 0) + s.focusSeconds);
  return map;
}

export function formatFocus(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function setTaskNotes(id: string, notes: string): void {
  const clean = notes.slice(0, NOTES_MAX);
  if ((getTask(id)?.notes ?? '') === clean) return;
  updateTask(id, () => ({ notes: clean || undefined }));
}

export interface SessionLog {
  taskId?: string;
  did: string;
  next: string;
  focusSeconds: number;
}

/**
 * Save the note left after a focus session: "did" goes to the Done list, "next" becomes
 * the task's next step, and both are kept in the task's session log.
 */
export function logSession({ taskId, did, next, focusSeconds }: SessionLog): void {
  const cleanDid = did.trim().slice(0, LOG_TEXT_MAX);
  const cleanNext = next.trim().slice(0, LOG_TEXT_MAX);
  if (!cleanDid && !cleanNext) return;
  const task = taskId ? getTask(taskId) : null;
  if (cleanDid) addDone(task?.title ? `${cleanDid} (${task.title})` : cleanDid, { taskId: task?.id });
  if (!task) return;
  if (cleanNext && task.status === 'active') addStep(task.id, cleanNext);
  const entry: TaskLogEntry = { id: newId('lg'), at: Date.now(), did: cleanDid, next: cleanNext, focusSeconds };
  updateTask(task.id, (t) => ({ log: [...(t.log ?? []), entry].slice(-LOG_MAX) }));
}
