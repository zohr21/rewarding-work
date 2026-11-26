/**
 * Exam prep (src/lib/exam.ts): questions typed by hand, mistakes to look at again and
 * the right answers per chapter. Questions here are made up.
 */
import { describe, expect, it } from 'vitest';
import { chapterScores, cleanQuestion, isMistake, MISTAKES, pickRound } from '../src/lib/exam';
import type { Exam, ExamQuestion } from '../src/lib/storage';

const q = (id: string, more: Partial<ExamQuestion> = {}): ExamQuestion => ({ id, text: id, options: ['a', 'b'], answer: [0], seen: 0, correct: 0, ...more });
const exam = (questions: ExamQuestion[]): Exam => ({ id: 'p1', updatedAt: 1, title: 'Test', chapters: [{ id: 'c1', name: 'One', done: false }], questions, rounds: [], createdAt: 1 });

describe('cleanQuestion', () => {
  it('drops empty options and keeps the right answer pointing at the same text', () => {
    const r = cleanQuestion({ text: ' What? ', options: ['', 'Yes', ' ', 'No'], answer: [3], chapterId: 'c1' }, ['c1']);
    expect(r).toEqual({ ok: true, question: { chapterId: 'c1', text: 'What?', options: ['Yes', 'No'], answer: [1] } });
  });

  it('says what is missing', () => {
    expect(cleanQuestion({ text: '', options: ['a', 'b'], answer: [0] }, [])).toEqual({ ok: false, error: 'text' });
    expect(cleanQuestion({ text: 'x', options: ['a', ''], answer: [0] }, [])).toEqual({ ok: false, error: 'options' });
    expect(cleanQuestion({ text: 'x', options: ['a', 'b', ''], answer: [2] }, [])).toEqual({ ok: false, error: 'answer' });
  });

  it('forgets a chapter that is gone and keeps several right answers', () => {
    const r = cleanQuestion({ text: 'x', options: ['a', 'b', 'c'], answer: [0, 2], chapterId: 'gone', explanation: '  ' }, ['c1']);
    expect(r).toEqual({ ok: true, question: { text: 'x', options: ['a', 'b', 'c'], answer: [0, 2] } });
  });
});

describe('mistakes', () => {
  it('counts flagged and mostly missed questions, not ones got right since', () => {
    expect(isMistake(q('a', { again: true }))).toBe(true);
    expect(isMistake(q('b', { seen: 1, correct: 0 }))).toBe(true);
    expect(isMistake(q('c', { seen: 2, correct: 1 }))).toBe(false);
    expect(isMistake(q('d'))).toBe(false);
  });

  it('builds a round of only those', () => {
    const e = exam([q('a', { again: true }), q('b', { seen: 3, correct: 3 }), q('c', { seen: 2, correct: 0 })]);
    expect(pickRound(e, MISTAKES).map((x) => x.id).sort()).toEqual(['a', 'c']);
  });
});

describe('chapterScores', () => {
  it('adds up answers per chapter and leaves out unpractised ones', () => {
    const e = exam([q('a', { chapterId: 'c1', seen: 4, correct: 3 }), q('b', { chapterId: 'c1', seen: 2, correct: 0 }), q('c', { chapterId: 'c2' }), q('d', { seen: 5, correct: 5 })]);
    expect([...chapterScores(e)]).toEqual([['c1', { seen: 6, correct: 3 }]]);
  });
});
