/**
 * Task days and repeats (src/lib/when.ts) and how they place a task on Today (src/lib/tasks.ts).
 * "Now" is Tuesday 24 November 2026, 10:00 local time. Tasks here are made up.
 */
import { describe, expect, it } from 'vitest';
import { nextDue, parseWhen, quickDay } from '../src/lib/when';
import { isCarriedOver, isDueToday, listOf, todayTasks } from '../src/lib/tasks';
import { mergeTaskStores, normaliseTasks, type Task } from '../src/lib/storage';

const NOW = new Date(2026, 10, 24, 10, 0).getTime();
const task = (id: string, more: Partial<Task> = {}): Task => ({ id, title: id, steps: [], status: 'active', createdAt: 1, updatedAt: 1, ...more });

describe('nextDue', () => {
  it('steps a day, a week or a month on from the day it was for', () => {
    expect(nextDue('2026-11-24', 'day', '2026-11-24')).toBe('2026-11-25');
    expect(nextDue('2026-11-20', 'week', '2026-11-24')).toBe('2026-11-27');
    expect(nextDue('2026-11-24', 'month', '2026-11-24')).toBe('2026-12-24');
  });

  it('skips repeats missed while it waited instead of piling them up', () => {
    expect(nextDue('2026-11-01', 'day', '2026-11-24')).toBe('2026-11-25');
    expect(nextDue('2026-10-02', 'week', '2026-11-24')).toBe('2026-11-27');
  });

  it('keeps weekdays off the weekend', () => {
    expect(nextDue('2026-11-27', 'weekdays', '2026-11-27')).toBe('2026-11-30'); // Fri → Mon
    expect(nextDue('2026-11-24', 'weekdays', '2026-11-24')).toBe('2026-11-25');
  });

  it('lands on the last day of a short month and goes back to the day after', () => {
    expect(nextDue('2027-01-31', 'month', '2027-01-31')).toBe('2027-02-28');
    expect(nextDue('2027-01-31', 'month', '2027-02-28')).toBe('2027-03-31');
  });
});

describe('quickDay', () => {
  it('reads the sheet picks from a Tuesday', () => {
    expect(quickDay('today', NOW)).toBe('2026-11-24');
    expect(quickDay('tomorrow', NOW)).toBe('2026-11-25');
    expect(quickDay('weekend', NOW)).toBe('2026-11-28');
    expect(quickDay('nextWeek', NOW)).toBe('2026-11-30');
  });

  it('takes a Sunday as this weekend and the next Monday as next week', () => {
    const sunday = new Date(2026, 10, 29, 9).getTime();
    expect(quickDay('weekend', sunday)).toBe('2026-11-29');
    expect(quickDay('nextWeek', sunday)).toBe('2026-11-30');
  });
});

describe('parseWhen', () => {
  it('takes a day and a repeat out of the title', () => {
    expect(parseWhen('Weekly review fri every week', NOW)).toEqual({ title: 'Weekly review', due: '2026-11-27', repeat: 'week' });
    expect(parseWhen('Call mum tomorrow', NOW)).toEqual({ title: 'Call mum', due: '2026-11-25' });
    expect(parseWhen('Flashcards every day', NOW)).toEqual({ title: 'Flashcards', repeat: 'day' });
    expect(parseWhen('Gym weekdays', NOW)).toEqual({ title: 'Gym', repeat: 'weekdays' });
  });

  it('reads a lone "weekly" or "daily" as a repeat only at the end', () => {
    expect(parseWhen('Weekly review', NOW)).toEqual({ title: 'Weekly review' });
    expect(parseWhen('Daily standup notes', NOW)).toEqual({ title: 'Daily standup notes' });
    expect(parseWhen('Water plants weekly', NOW)).toEqual({ title: 'Water plants', repeat: 'week' });
  });

  it('reads "every friday" as a weekly repeat starting that Friday', () => {
    expect(parseWhen('Team call every friday', NOW)).toEqual({ title: 'Team call', due: '2026-11-27', repeat: 'week' });
  });

  it('counts today as the coming Tuesday', () => {
    expect(parseWhen('Stand-up tue', NOW).due).toBe('2026-11-24');
  });

  it('understands Russian', () => {
    expect(parseWhen('Отчёт в пятницу каждую неделю', NOW)).toEqual({ title: 'Отчёт', due: '2026-11-27', repeat: 'week' });
    expect(parseWhen('Позвонить маме завтра', NOW)).toEqual({ title: 'Позвонить маме', due: '2026-11-25' });
    expect(parseWhen('Йога каждую среду', NOW)).toEqual({ title: 'Йога', due: '2026-11-25', repeat: 'week' });
    expect(parseWhen('Аренда ежемесячно', NOW)).toEqual({ title: 'Аренда', repeat: 'month' });
  });

  it('understands Azerbaijani, longer weekday names first', () => {
    expect(parseWhen('Kirayə hər ay', NOW)).toEqual({ title: 'Kirayə', repeat: 'month' });
    expect(parseWhen('Hesabat cümə axşamı', NOW)).toEqual({ title: 'Hesabat', due: '2026-11-26' });
    expect(parseWhen('Hesabat cümə', NOW)).toEqual({ title: 'Hesabat', due: '2026-11-27' });
    expect(parseWhen('Anama zəng sabah', NOW)).toEqual({ title: 'Anama zəng', due: '2026-11-25' });
  });

  it('leaves words inside other words, and lone "sun" or "sat", in the title', () => {
    expect(parseWhen('Buy sun cream', NOW)).toEqual({ title: 'Buy sun cream' });
    expect(parseWhen('SAT prep', NOW)).toEqual({ title: 'SAT prep' });
    expect(parseWhen('Monitor the logs', NOW)).toEqual({ title: 'Monitor the logs' });
    expect(parseWhen('Fix the frida bug', NOW)).toEqual({ title: 'Fix the frida bug' });
    expect(parseWhen('Picnic on sat', NOW).due).toBe('2026-11-28');
  });

  it('keeps the words as the title when there is nothing else', () => {
    expect(parseWhen('tomorrow', NOW)).toEqual({ title: 'tomorrow' });
  });
});

describe('a task with a day', () => {
  it('shows on Today once its day comes, from whatever list', () => {
    expect(listOf(task('a', { due: '2026-11-25' }), NOW)).toBe('next');
    expect(listOf(task('a', { due: '2026-11-24' }), NOW)).toBe('today');
    expect(listOf(task('a', { due: '2026-11-24', list: 'someday' }), NOW)).toBe('today');
    expect(listOf(task('a', { due: '2026-11-24', list: 'inbox' }), NOW)).toBe('inbox');
  });

  it('is due today on its day, and carried over after it', () => {
    const today = task('a', { due: '2026-11-24' });
    const missed = task('b', { due: '2026-11-20' });
    expect(isDueToday(today, NOW)).toBe(true);
    expect(isCarriedOver(today, NOW)).toBe(false);
    expect(isCarriedOver(missed, NOW)).toBe(true);
    expect(todayTasks([today, missed, task('c')], NOW).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('kept for today (put on Today today) is no longer carried over', () => {
    expect(isCarriedOver(task('b', { due: '2026-11-20', list: 'today', todayAt: NOW }), NOW)).toBe(false);
  });
});

describe('stored days and repeats', () => {
  it('reads old tasks without them, and drops only a broken day or repeat', () => {
    const store = normaliseTasks({
      items: [task('old'), { ...task('bad'), due: 'friday', repeat: 'yearly' }, task('ok', { due: '2026-11-27', repeat: 'week' })],
      current: null,
      currentAt: 0,
    });
    expect(store.items.map((t) => t.id)).toEqual(['old', 'bad', 'ok']);
    expect(store.items[1]).not.toHaveProperty('due');
    expect(store.items[1]).not.toHaveProperty('repeat');
    expect(store.items[2]).toMatchObject({ due: '2026-11-27', repeat: 'week' });
  });

  it('syncs with the task: the newer copy keeps its day', () => {
    const a = { items: [task('x', { updatedAt: 1 })], current: null, currentAt: 0 };
    const b = { items: [task('x', { updatedAt: 2, due: '2026-11-27', repeat: 'week' as const })], current: null, currentAt: 0 };
    expect(mergeTaskStores(a, b).items[0]).toMatchObject({ due: '2026-11-27', repeat: 'week' });
  });
});
