/**
 * Several study plans at once (src/lib/storage.ts `exam` store, src/lib/exam.ts): the older
 * one-plan shape, opening and finishing plans, the sync merge and the day's aim.
 * Plans, chapters and sessions here are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getExamStore,
  getPlans,
  mergeExamStores,
  normaliseExam,
  openPlan,
  PLANS_MAX,
  write,
  type Exam,
  type ExamStore,
  type FocusSession,
} from '../src/lib/storage';
import { mergeJson } from '../src/lib/account/merge';
import { addChapter, byDate, createExam, dayAim, deleteExam, finishExam, planToContinue, removePastExam, updateChapter, weakestOverall } from '../src/lib/exam';

const plan = (id: string, more: Partial<Exam> = {}): Exam => ({
  id,
  title: id,
  chapters: [{ id: `${id}-c1`, name: 'One', done: false }],
  questions: [],
  rounds: [],
  createdAt: 1,
  updatedAt: 1,
  ...more,
});
const store = (more: Partial<ExamStore>): ExamStore => ({ exam: null, others: [], removed: [], past: [], updatedAt: 1, ...more });

function session(taskId: string, start: Date, minutes: number): FocusSession {
  const s = start.getTime();
  return { id: `s${s}${taskId}`, start: s, end: s + minutes * 60_000, focusSeconds: minutes * 60, mode: 'pomodoro', label: '', completed: true, taskId };
}

beforeEach(() => write('exam', null));

describe('older one-plan store', () => {
  it('reads it as one plan whose id comes from createdAt', () => {
    const old = { exam: { title: 'AWS', createdAt: 1700, chapters: [], questions: [], rounds: [] }, past: [], updatedAt: 1800 };
    const s = normaliseExam(old);
    expect(s.exam).toMatchObject({ id: 'p1700', title: 'AWS', updatedAt: 1800 });
    expect(s.others).toEqual([]);
    expect(s.removed).toEqual([]);
  });

  it('opens the next plan when the open one is missing or removed', () => {
    const s = normaliseExam({ exam: plan('a'), others: [plan('b'), 'junk', plan('b')], removed: [{ id: 'a', at: 5 }], past: [], updatedAt: 9 });
    expect(s.exam?.id).toBe('b');
    expect(s.others).toEqual([]);
  });
});

describe('plans side by side', () => {
  it('a new plan opens next to the one already running', () => {
    createExam({ title: 'UiPath' }, [{ name: 'Orchestrator' }]);
    const first = getExamStore().exam!;
    createExam({ title: 'AWS' }, [{ name: 'Networking' }]);
    const s = getExamStore();
    expect(s.exam?.title).toBe('AWS');
    expect(s.others.map((p) => p.title)).toEqual(['UiPath']);
    expect(s.others[0]!.id).toBe(first.id);
  });

  it('stops at PLANS_MAX', () => {
    for (let i = 0; i < PLANS_MAX; i++) expect(createExam({ title: `P${i}` }, [])).toBe(true);
    expect(createExam({ title: 'one too many' }, [])).toBe(false);
  });

  it('changes a chapter in its own plan, not the open one', () => {
    write('exam', store({ exam: plan('a'), others: [plan('b')] }));
    updateChapter('b-c1', { done: true });
    addChapter('Two', undefined, 'b');
    const s = getExamStore();
    expect(s.exam!.chapters[0]!.done).toBe(false);
    expect(s.others[0]!.chapters.map((c) => [c.name, c.done])).toEqual([['One', true], ['Two', false]]);
    expect(s.others[0]!.updatedAt).toBeGreaterThan(1);
  });

  it('opening a plan swaps it in; finishing or deleting opens the next and remembers the id', () => {
    write('exam', store({ exam: plan('a'), others: [plan('b'), plan('c')] }));
    expect(openPlan('c')).toBe(true);
    expect(getPlans().map((p) => p.id)).toEqual(['c', 'a', 'b']);
    finishExam('passed', 0);
    let s = getExamStore();
    expect(s.exam?.id).toBe('a');
    expect(s.past).toHaveLength(1);
    expect(s.removed.map((r) => r.id)).toEqual(['c']);
    deleteExam();
    s = getExamStore();
    expect(s.exam?.id).toBe('b');
    expect(s.removed.map((r) => r.id)).toEqual(['c', 'a']);
    removePastExam(s.past[0]!.id);
    expect(getExamStore().past).toEqual([]);
  });
});

describe('mergeExamStores', () => {
  it('keeps a plan made on each device', () => {
    const phone = store({ exam: plan('ui'), updatedAt: 5 });
    const laptop = store({ exam: plan('aws'), updatedAt: 9 });
    const m = mergeExamStores(phone, laptop);
    expect(m.exam?.id).toBe('aws');
    expect(m.others.map((p) => p.id)).toEqual(['ui']);
  });

  it('keeps the newer copy of each plan', () => {
    const a = store({ exam: plan('ui', { title: 'old', updatedAt: 3 }), others: [plan('aws', { title: 'new', updatedAt: 8 })], updatedAt: 8 });
    const b = store({ exam: plan('ui', { title: 'newer', updatedAt: 7 }), others: [plan('aws', { title: 'older', updatedAt: 2 })], updatedAt: 7 });
    const m = mergeExamStores(a, b);
    expect(getPlans(m).map((p) => p.title).sort()).toEqual(['new', 'newer']);
  });

  it('a removal on either side wins', () => {
    const a = store({ exam: plan('ui'), others: [plan('aws')], updatedAt: 4 });
    const b = store({ exam: plan('ui'), removed: [{ id: 'aws', at: 6 }], updatedAt: 6 });
    expect(getPlans(mergeExamStores(a, b)).map((p) => p.id)).toEqual(['ui']);
  });

  it('an older app’s copy counts as an edit of its one plan and loses no other plan', () => {
    const here = store({ exam: plan('p1700', { createdAt: 1700, updatedAt: 3 }), others: [plan('aws')], updatedAt: 3 });
    // What 0.1.6 writes: no ids, no updatedAt per plan, no others.
    const oldJson = JSON.stringify({ exam: { title: 'UiPath, edited', createdAt: 1700, chapters: [], questions: [], rounds: [] }, past: [], updatedAt: 10 });
    const m = normaliseExam(JSON.parse(mergeJson('exam', JSON.stringify(here), oldJson)!));
    expect(m.exam).toMatchObject({ id: 'p1700', title: 'UiPath, edited' });
    expect(m.others.map((p) => p.id)).toEqual(['aws']);
  });

  it('joins past exams and keeps the one already used for "Prepare again"', () => {
    const rec = { id: 'px1', title: 'PL-900', result: 'failed' as const, finishedAt: 1, studiedSeconds: 0, chaptersDone: 0, chaptersTotal: 0 };
    const a = store({ past: [{ ...rec, retry: { chapters: [], questions: [] } }], updatedAt: 9 });
    const b = store({ past: [rec, { ...rec, id: 'px2', finishedAt: 2 }], updatedAt: 2 });
    const m = mergeExamStores(a, b);
    expect(m.past.map((p) => [p.id, Boolean(p.retry)])).toEqual([['px1', false], ['px2', false]]);
  });
});

describe('the day across plans', () => {
  const now = new Date(2026, 10, 27, 15);
  const ui = plan('ui', { date: '2026-12-12', targetHours: 50, chapters: [{ id: 'u1', name: 'Orchestrator', done: false }] });
  const aws = plan('aws', { date: '2027-01-20', targetHours: 80, chapters: [{ id: 'w1', name: 'Networking', done: false }] });
  const sessions = [session('u1', new Date(2026, 10, 1, 9), 35 * 60), session('u1', new Date(2026, 10, 27, 9), 25), session('w1', new Date(2026, 10, 2, 9), 46 * 60)];

  it('aims from the time before today, so it holds still while you study', () => {
    const d = dayAim(ui, sessions, now);
    expect(d.aim).toBe(3600); // 15 h left over 15 days
    expect(d.done).toBe(25 * 60);
    expect(d.left).toBe(35 * 60);
    expect(dayAim(plan('x'), sessions, now).aim).toBeNull();
  });

  it('orders plans by date and continues the one furthest behind today', () => {
    expect(byDate([aws, plan('none'), ui]).map((p) => p.id)).toEqual(['ui', 'aws', 'none']);
    expect(planToContinue([ui, aws], sessions, now)?.id).toBe('aws');
  });

  it('finds the weakest chapter over all plans', () => {
    const q = (chapterId: string, seen: number, correct: number) => ({ id: `q${chapterId}`, chapterId, text: 'x', options: ['a', 'b'], answer: [0], seen, correct });
    const w = weakestOverall([{ ...ui, questions: [q('u1', 10, 4)] }, { ...aws, questions: [q('w1', 10, 3)] }]);
    expect([w?.plan.id, w?.chapter.id]).toEqual(['aws', 'w1']);
  });
});
