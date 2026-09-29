/**
 * Task actions shared by the breakdown tool and the tasks page, including their
 * effect on the Done list: a ticked step or a finished task is logged there, and
 * unticking or reopening takes the entry out again.
 */
import {
  addDone,
  createTask,
  deleteTask,
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
  type TaskList,
  type TaskLogEntry,
} from './storage';
import { startOfDay } from './dates';

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

// ---------- Lists: Inbox, Today, Next, Someday ----------

export const LIST_LABELS: Record<TaskList, string> = { inbox: 'Inbox', today: 'Today', next: 'Next', someday: 'Someday' };

/** Today works best short; past this the list nudges you to move some on. */
export const TODAY_SOFT_MAX = 3;

export const listOf = (task: Pick<Task, 'list'>): TaskList => task.list ?? 'next';

export function moveTask(id: string, list: TaskList): void {
  updateTask(id, (t) => {
    if (listOf(t) === list) return {};
    return { list: list === 'next' ? undefined : list, todayAt: list === 'today' ? Date.now() : undefined, todayOrder: undefined };
  });
}

const todayKey = (t: Task) => t.todayOrder ?? t.todayAt ?? t.createdAt;

/** Open tasks on Today, first up first. */
export function todayTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === 'active' && listOf(t) === 'today').sort((a, b) => todayKey(a) - todayKey(b));
}

/** Put a Today task first. */
export function moveToTop(id: string, tasks: Task[]): void {
  const first = todayTasks(tasks)[0];
  if (!first || first.id === id) return;
  updateTask(id, () => ({ todayOrder: todayKey(first) - 1 }));
}

/** Keep tasks carried over from an earlier day on Today, in the same places. */
export function keepForToday(tasks: Task[], now = Date.now()): void {
  for (const t of todayTasks(tasks)) {
    if (isCarriedOver(t, now)) updateTask(t.id, () => ({ todayAt: now, todayOrder: todayKey(t) }));
  }
}

/** On Today since before today (planned for an earlier day and not finished). */
export function isCarriedOver(task: Task, now = Date.now()): boolean {
  return listOf(task) === 'today' && task.todayAt !== undefined && task.todayAt < startOfDay(now).getTime();
}

// ---------- Scratchpad ----------

/** Catch a stray thought during focus: it waits in the Inbox to be sorted later. */
export function jot(text: string): Task | null {
  const clean = text.trim();
  if (!clean) return null;
  return createTask(clean, { makeCurrent: false, list: 'inbox' });
}

/** Turn an Inbox thought into a line in another task's notes (and remove it from the Inbox). */
export function jotToNotes(jotId: string, taskId: string): void {
  const thought = getTask(jotId);
  const target = getTask(taskId);
  if (!thought || !target || jotId === taskId) return;
  const notes = target.notes ? `${target.notes.trimEnd()}\n${thought.title}` : thought.title;
  setTaskNotes(taskId, notes);
  deleteTask(jotId);
}
