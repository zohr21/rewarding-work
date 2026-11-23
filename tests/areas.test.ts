/**
 * Task areas (src/lib/areas.ts) and their place in the tasks store (src/lib/storage.ts):
 * #tags when adding, the ready-made fallback, focus by area, old stores and sync merges.
 * Tasks and times here are made up.
 */
import { describe, expect, it } from 'vitest';
import { areaName, areaOf, focusByArea, getAreas, parseAreaTag } from '../src/lib/areas';
import { mergeTaskStores, normaliseTasks, type FocusSession, type Task, type TaskArea, type TaskStore } from '../src/lib/storage';

const area = (id: string, more: Partial<TaskArea> = {}): TaskArea => ({ id, color: 'blue', order: 0, updatedAt: 1, ...more });
const AREAS = [area('work', { order: 0 }), area('life', { order: 1, color: 'pink' }), area('study', { order: 2, color: 'violet' }), area('ar_x', { name: 'Family', order: 3 })];
const task = (id: string, more: Partial<Task> = {}): Task => ({ id, title: id, steps: [], status: 'active', createdAt: 1, updatedAt: 1, ...more });
const session = (taskId: string | undefined, focusSeconds: number, start = 10): FocusSession => ({
  id: `s-${taskId}-${start}`,
  start,
  end: start + focusSeconds * 1000,
  focusSeconds,
  mode: 'pomodoro',
  label: '',
  completed: true,
  taskId,
});

describe('parseAreaTag', () => {
  it('takes a #tag out of the title and picks its area', () => {
    const r = parseAreaTag('Read the paper #study tomorrow', AREAS);
    expect(r.title).toBe('Read the paper tomorrow');
    expect(r.area?.id).toBe('study');
  });

  it('matches the start of a name, ignoring case', () => {
    expect(parseAreaTag('#WO Send invoice', AREAS).area?.id).toBe('work');
    expect(parseAreaTag('Call mum #fam', AREAS).area?.id).toBe('ar_x');
  });

  it('leaves an unknown tag in the title', () => {
    expect(parseAreaTag('Fix bug #42', AREAS)).toEqual({ title: 'Fix bug #42' });
  });

  it('ignores a # inside a word and removed areas', () => {
    expect(parseAreaTag('C#study', AREAS).area).toBeUndefined();
    expect(parseAreaTag('x #life', [area('life', { deletedAt: 5 })]).area).toBeUndefined();
  });
});

describe('areaOf', () => {
  it('finds the area, or none for a removed one', () => {
    expect(areaOf(task('a', { area: 'life' }), AREAS)?.color).toBe('pink');
    expect(areaOf(task('a', { area: 'life' }), [area('life', { deletedAt: 9 })])).toBeUndefined();
    expect(areaOf(task('a'), AREAS)).toBeUndefined();
  });

  it('still shows a ready-made area when the list was lost', () => {
    expect(areaOf(task('a', { area: 'study' }), [])?.color).toBe('violet');
    expect(areaOf(task('a', { area: 'ar_gone' }), [])).toBeUndefined();
  });

  it('names ready-made areas in the language, own ones as given', () => {
    expect(areaName(area('work'))).toBe('Work');
    expect(areaName(area('work', { name: 'Job' }))).toBe('Job');
    expect(areaName(AREAS[3]!)).toBe('Family');
  });
});

describe('getAreas', () => {
  it('keeps chip order and drops removed ones', () => {
    const list = [area('b', { order: 2 }), area('a', { order: 1 }), area('c', { order: 0, deletedAt: 3 })];
    expect(getAreas(list).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('focusByArea', () => {
  it('adds focus time per area, with the rest under ""', () => {
    const tasks = [task('t1', { area: 'work' }), task('t2', { area: 'study' }), task('t3')];
    const sessions = [session('t1', 600), session('t1', 300, 20), session('t2', 1200), session('t3', 60), session(undefined, 120), { ...session('t2', 900, 30), removedAt: 1 }];
    const by = focusByArea(sessions, tasks, AREAS);
    expect(by.get('work')).toBe(900);
    expect(by.get('study')).toBe(1200);
    expect(by.get('')).toBe(180);
  });

  it('counts only sessions from `from` on', () => {
    const by = focusByArea([session('t1', 600, 5), session('t1', 60, 50)], [task('t1', { area: 'work' })], AREAS, 40);
    expect(by.get('work')).toBe(60);
  });
});

describe('tasks store with areas', () => {
  it('reads an old store with no areas', () => {
    const old = { items: [task('t1')], current: null, currentAt: 0 };
    const store = normaliseTasks(old);
    expect(store.areas).toBeUndefined();
    expect(store.items).toHaveLength(1);
  });

  it('drops broken areas, keeps good ones and task areas', () => {
    const store = normaliseTasks({ items: [task('t1', { area: 'work' })], current: null, currentAt: 0, areas: [area('work'), { id: 'x', color: 'neon' }, 'junk'], areasAt: 7 });
    expect(store.areas?.map((a) => a.id)).toEqual(['work']);
    expect(store.areasAt).toBe(7);
    expect(store.items[0]!.area).toBe('work');
  });

  it('drops a task whose area is not a string', () => {
    expect(normaliseTasks({ items: [{ ...task('t1'), area: 3 }], current: null, currentAt: 0 }).items).toHaveLength(0);
  });

  it('merges areas per id, newer change winning, removals included', () => {
    const a: TaskStore = { items: [], current: null, currentAt: 0, areas: [area('work', { name: 'Job', updatedAt: 5 }), area('life', { updatedAt: 2 })], areasAt: 3 };
    const b: TaskStore = { items: [], current: null, currentAt: 0, areas: [area('work', { updatedAt: 4 }), area('life', { updatedAt: 6, deletedAt: 6 }), area('study')], areasAt: 9 };
    const m = mergeTaskStores(a, b);
    const byId = new Map(m.areas!.map((x) => [x.id, x]));
    expect(byId.get('work')!.name).toBe('Job');
    expect(byId.get('life')!.deletedAt).toBe(6);
    expect(byId.has('study')).toBe(true);
    expect(m.areasAt).toBe(9);
  });

  it('keeps areas when the other copy is from an older build without them', () => {
    const mine: TaskStore = { items: [task('t1', { area: 'work' })], current: null, currentAt: 0, areas: [area('work')], areasAt: 2 };
    const older: TaskStore = { items: [task('t1', { area: 'work' })], current: null, currentAt: 0 };
    expect(mergeTaskStores(older, mine).areas).toHaveLength(1);
    expect(mergeTaskStores(mine, older).areasAt).toBe(2);
  });
});
