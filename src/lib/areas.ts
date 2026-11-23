/**
 * Areas: the part of life a task belongs to (Work, Life, Study…). One per task, picked on the
 * task's sheet or with a #tag when adding it; the chip row on the tasks page filters by it,
 * and the grove splits focus time by it. Stored in the `tasks` store (src/lib/storage.ts).
 */
import {
  AREA_COLORS,
  getTaskStore,
  updateTask,
  writeAreas,
  newId,
  type AreaColor,
  type FocusSession,
  type Task,
  type TaskArea,
} from './storage';
import { t } from './i18n';

/** Enough to tell apart, few enough that the chip row stays short. */
export const AREAS_MAX = 6;
export const AREA_NAME_MAX = 24;

/** The ready-made areas, with fixed ids and their own colours. */
export const AREA_PRESETS = ['work', 'life', 'study', 'health', 'home'] as const;
export type AreaPreset = (typeof AREA_PRESETS)[number];
const PRESET_COLOR: Record<AreaPreset, AreaColor> = { work: 'blue', life: 'pink', study: 'violet', health: 'orange', home: 'teal' };
/** Picked to start with on the first-run question. */
export const AREA_STARTERS: AreaPreset[] = ['work', 'life', 'study'];

const isPreset = (id: string): id is AreaPreset => (AREA_PRESETS as readonly string[]).includes(id);

/** All areas, removed ones included (what gets written back). */
function allAreas(): TaskArea[] {
  return getTaskStore().areas ?? [];
}

/** Live areas in chip order. */
export function getAreas(areas: TaskArea[] = allAreas()): TaskArea[] {
  return areas.filter((a) => a.deletedAt === undefined).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** True once the first-run question was answered or skipped, or areas exist anyway. */
export function areasAnswered(): boolean {
  const store = getTaskStore();
  return store.areasAt !== undefined || getAreas(store.areas ?? []).length > 0;
}

/**
 * The area a task shows under. A ready-made id with no entry at all (an older app build
 * dropped the list) still shows as that area; a removed one shows as no area.
 */
export function areaOf(task: Pick<Task, 'area'>, areas: TaskArea[] = allAreas()): TaskArea | undefined {
  if (!task.area) return undefined;
  const found = areas.find((a) => a.id === task.area);
  if (found) return found.deletedAt === undefined ? found : undefined;
  return isPreset(task.area) ? { id: task.area, color: PRESET_COLOR[task.area], order: AREA_PRESETS.indexOf(task.area), updatedAt: 0 } : undefined;
}

/** The area's name in the chosen language, or the one the user gave it. */
export function areaName(area: Pick<TaskArea, 'id' | 'name'>): string {
  if (area.name) return area.name;
  return isPreset(area.id) ? t(`taskArea.${area.id}`) : area.id;
}

const stamp = (a: TaskArea, patch: Partial<TaskArea>): TaskArea => ({ ...a, ...patch, updatedAt: Math.max(Date.now(), a.updatedAt + 1) });

function save(change: (areas: TaskArea[]) => TaskArea[], answered = false): void {
  writeAreas(change(allAreas()), { answered });
}

const nextOrder = (areas: TaskArea[]) => Math.max(-1, ...getAreas(areas).map((a) => a.order)) + 1;

/** Answer the first-run question: start with these ready-made areas (none = skip for now). */
export function setUpAreas(presets: AreaPreset[]): void {
  save((areas) => {
    let out = areas;
    for (const id of presets) out = withPreset(out, id);
    return out;
  }, true);
}

function withPreset(areas: TaskArea[], id: AreaPreset): TaskArea[] {
  if (getAreas(areas).length >= AREAS_MAX) return areas;
  const old = areas.find((a) => a.id === id);
  if (old && old.deletedAt === undefined) return areas;
  const now = Date.now();
  const fresh: TaskArea = { id, color: PRESET_COLOR[id], order: nextOrder(areas), updatedAt: old ? Math.max(now, old.updatedAt + 1) : now };
  return old ? areas.map((a) => (a.id === id ? fresh : a)) : [...areas, fresh];
}

/** Add a ready-made area back (or for the first time). */
export function addPresetArea(id: AreaPreset): void {
  save((areas) => withPreset(areas, id), true);
}

/** A colour no live area uses yet, else the least used. */
function freeColor(areas: TaskArea[]): AreaColor {
  const live = getAreas(areas);
  return [...AREA_COLORS].sort((a, b) => live.filter((x) => x.color === a).length - live.filter((x) => x.color === b).length)[0]!;
}

/** Add an area of your own. Returns it, or null if the name is empty or there are already enough. */
export function createArea(name: string): TaskArea | null {
  const clean = name.trim().slice(0, AREA_NAME_MAX);
  const areas = allAreas();
  if (!clean || getAreas(areas).length >= AREAS_MAX) return null;
  const area: TaskArea = { id: newId('ar'), name: clean, color: freeColor(areas), order: nextOrder(areas), updatedAt: Date.now() };
  writeAreas([...areas, area], { answered: true });
  return area;
}

function change(id: string, patch: (a: TaskArea) => Partial<TaskArea>): void {
  save((areas) => areas.map((a) => (a.id === id && a.deletedAt === undefined ? stamp(a, patch(a)) : a)));
}

/** Rename an area. An empty name gives a ready-made area its own name back. */
export function renameArea(id: string, name: string): void {
  const clean = name.trim().slice(0, AREA_NAME_MAX);
  if (!clean && !isPreset(id)) return;
  change(id, () => ({ name: clean && !(isPreset(id) && clean === t(`taskArea.${id}`)) ? clean : undefined }));
}

export function setAreaColor(id: string, color: AreaColor): void {
  change(id, () => ({ color }));
}

/** Move an area one place earlier (-1) or later (+1) in the chip row. */
export function moveArea(id: string, by: -1 | 1): void {
  save((areas) => {
    const live = getAreas(areas);
    const i = live.findIndex((a) => a.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= live.length) return areas;
    const order = live.map((a) => a.id);
    [order[i], order[j]] = [order[j]!, order[i]!];
    return areas.map((a) => {
      const k = order.indexOf(a.id);
      return k >= 0 && a.order !== k ? stamp(a, { order: k }) : a;
    });
  });
}

/** Remove an area. Its tasks stay, with no area. */
export function removeArea(id: string, tasks: Task[]): void {
  save((areas) => areas.map((a) => (a.id === id && a.deletedAt === undefined ? stamp(a, { deletedAt: Date.now() }) : a)));
  for (const task of tasks) if (task.area === id) updateTask(task.id, () => ({ area: undefined }));
}

/** Undo a removal: the area comes back, and so do these tasks' places in it. */
export function restoreArea(id: string, taskIds: string[]): void {
  save((areas) => areas.map((a) => (a.id === id && a.deletedAt !== undefined ? stamp(a, { deletedAt: undefined }) : a)));
  for (const taskId of taskIds) updateTask(taskId, () => ({ area: id }));
}

export function setTaskArea(taskId: string, areaId: string | null): void {
  updateTask(taskId, (task) => ((task.area ?? null) === areaId ? {} : { area: areaId ?? undefined }));
}

/** Lowercase in the chosen language, so "#İş" matches "iş" in Azerbaijani. */
const fold = (s: string) => s.toLocaleLowerCase().normalize('NFC');

/**
 * Pick an area out of a new task's text: "Read paper #study" → area `study`, title "Read paper".
 * The tag may be the start of the name ("#wo" for Work). An unknown tag stays in the title.
 */
export function parseAreaTag(text: string, areas: TaskArea[]): { title: string; area?: TaskArea } {
  const live = getAreas(areas);
  const tag = /(^|\s)#([\p{L}\p{N}_-]+)/u;
  const m = tag.exec(text);
  if (!m) return { title: text.trim() };
  const word = fold(m[2]!);
  const names = live.map((a) => ({ a, n: fold(areaName(a)).replace(/\s+/g, '') }));
  const area = names.find((x) => x.n === word)?.a ?? names.find((x) => x.n.startsWith(word))?.a;
  if (!area) return { title: text.trim() };
  const title = (text.slice(0, m.index) + m[1] + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { title, area };
}

/** Focus seconds per area id since `from`; '' is time on tasks with no area, or on no task. */
export function focusByArea(sessions: FocusSession[], tasks: Task[], areas: TaskArea[], from = 0): Map<string, number> {
  const areaByTask = new Map(tasks.map((task) => [task.id, areaOf(task, areas)?.id ?? '']));
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (s.removedAt !== undefined || s.start < from || s.focusSeconds <= 0) continue;
    const id = (s.taskId && areaByTask.get(s.taskId)) || '';
    out.set(id, (out.get(id) ?? 0) + s.focusSeconds);
  }
  return out;
}
