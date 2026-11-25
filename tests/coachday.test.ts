/**
 * Coach's day rhythm (src/lib/coachday.ts) and the coach store's new keys (src/lib/coach.ts).
 * All sessions and tasks are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { write, read, type FocusSession, type Task } from '../src/lib/storage';
import { getCoach, setDay, DAYS_KEPT } from '../src/lib/coach';
import { closeHour, energyFromSleep, estimateRatio, padded, phaseFor, signal, weekSummary, woopWeek } from '../src/lib/coachday';
import { dayKey } from '../src/lib/dates';

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

function session(start: Date, minutes: number, extra: Partial<FocusSession> = {}): FocusSession {
  const s = start.getTime();
  return { id: `s${s}`, start: s, end: s + minutes * 60_000, focusSeconds: minutes * 60, mode: 'pomodoro', label: '', completed: true, ...extra };
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, steps: [], status: 'active', createdAt: 0, updatedAt: 0, ...extra };
}

beforeEach(() => write('coach', {}));

describe('coach store', () => {
  it('reads a store saved before the day rhythm', () => {
    write('coach', { plan: null, tried: null, worked: { pomodoro: { helped: 1, tries: 2 } } });
    const c = getCoach();
    expect(c.days).toEqual({});
    expect(c.muted).toEqual([]);
    expect(c.woop).toBeNull();
    expect(c.worked.pomodoro).toEqual({ helped: 1, tries: 2 });
  });

  it('drops malformed days and keeps the rest', () => {
    write('coach', { days: { '2026-11-25': { energy: 'ok', top: ['a', 3], est: { a: 25, b: -1 } }, nope: { energy: 'ok' }, '2026-11-24': 'x' } });
    expect(getCoach().days).toEqual({ '2026-11-25': { energy: 'ok', top: ['a'], est: { a: 25 } } });
  });

  it('keeps the plan and worked when a day changes, and only the newest days', () => {
    write('coach', { plan: null, tried: null, worked: { flowtime: { helped: 1, tries: 1 } } });
    for (let i = 0; i < DAYS_KEPT + 5; i++) setDay(dayKey(at(2026, 1, 1 + i, 9)), (d) => ({ ...d, energy: 'ok' }));
    const c = getCoach();
    expect(Object.keys(c.days)).toHaveLength(DAYS_KEPT);
    expect(c.worked.flowtime).toBeDefined();
    expect(read<{ days: object }>('coach', { days: {} }).days).not.toHaveProperty('2026-01-01');
  });
});

describe('phase', () => {
  const wed = (h: number) => at(2026, 11, 25, h);
  it('opens on Plan in the morning until you plan', () => {
    expect(phaseFor(undefined, [], wed(8))).toBe('plan');
    expect(phaseFor({ plannedAt: 1 }, [], wed(8))).toBe('now');
    expect(phaseFor(undefined, [], wed(15))).toBe('now');
  });
  it('opens on Close in the evening and once closed', () => {
    expect(phaseFor({ plannedAt: 1 }, [], wed(19))).toBe('close');
    expect(phaseFor({ closedAt: 1 }, [], wed(10))).toBe('close');
  });
  it('opens on the week on Sunday afternoon', () => {
    expect(phaseFor(undefined, [], at(2026, 11, 29, 13))).toBe('week');
    expect(phaseFor({ closedAt: 1 }, [], at(2026, 11, 29, 21))).toBe('week');
  });
  it('closes when your days usually end', () => {
    const late = Array.from({ length: 6 }, (_, i) => session(at(2026, 11, 18 + i, 20), 30));
    expect(closeHour(late, wed(10))).toBe(21);
    expect(closeHour([], wed(10))).toBe(19);
  });
});

describe('estimates', () => {
  it('needs four earlier tasks, then gives the median overrun', () => {
    const days: Record<string, { est: Record<string, number> }> = {};
    const sessions: FocusSession[] = [];
    ['a', 'b', 'c'].forEach((id, i) => {
      const d = at(2026, 11, 20 + i, 10);
      days[dayKey(d)] = { est: { [id]: 20 } };
      sessions.push(session(d, 26, { taskId: id }));
    });
    const now = at(2026, 11, 25, 9);
    expect(estimateRatio({ days }, sessions, now)).toBeUndefined();
    const d = at(2026, 11, 24, 10);
    days[dayKey(d)] = { est: { d: 20 } };
    sessions.push(session(d, 26, { taskId: 'd' }));
    expect(estimateRatio({ days }, sessions, now)).toBe(1.3);
  });
  it('pads only real overruns', () => {
    expect(padded(50, 1.3)).toBe(65);
    expect(padded(50, 1.1)).toBe(50);
    expect(padded(50, undefined)).toBe(50);
  });
  it('turns sleep into a suggested energy', () => {
    expect(energyFromSleep(330)).toBe('low');
    expect(energyFromSleep(400)).toBe('ok');
    expect(energyFromSleep(480)).toBe('good');
  });
});

describe('the one suggestion', () => {
  const now = at(2026, 11, 25, 14);
  it('points at a task that has waited three days with no focus', () => {
    const old = task('Thesis intro', { todayAt: at(2026, 11, 21, 9).getTime() });
    const s = signal({ now, day: undefined, muted: [], today: [old], sessions: [] });
    expect(s?.id).toBe('stuck');
    expect(s?.vars.days).toBe(4);
  });
  it('offers a shorter box when you often stop early at this time of day', () => {
    const t = task('Reply', { todayAt: now.getTime() });
    const sessions = Array.from({ length: 6 }, (_, i) => session(at(2026, 11, 18 + i, 14), 11, { completed: i === 0 }));
    const s = signal({ now, day: undefined, muted: [], today: [t], sessions });
    expect(s?.id).toBe('short-stops');
    expect(s?.min).toBe(15);
  });
  it('skips what you put off or said is not true', () => {
    const old = task('Thesis intro', { todayAt: at(2026, 11, 21, 9).getTime() });
    expect(signal({ now, day: { snoozed: ['stuck'] }, muted: [], today: [old], sessions: [] })?.id).toBe('next');
    expect(signal({ now, day: undefined, muted: ['stuck', 'next'], today: [old], sessions: [] })).toBeUndefined();
  });
  it('says nothing with nothing on Today', () => {
    expect(signal({ now, day: undefined, muted: [], today: [], sessions: [] })).toBeUndefined();
  });
});

describe('the week', () => {
  it('counts planned, done, closed and quiet days from Monday', () => {
    const mon = at(2026, 11, 23, 9);
    const tue = at(2026, 11, 24, 9);
    const days = { [dayKey(mon)]: { top: ['a', 'b'], closedAt: 1 }, [dayKey(tue)]: { top: ['c'] } };
    const tasks = [task('a', { status: 'done', doneAt: mon.getTime() }), task('b'), task('c')];
    const w = weekSummary({ days }, [session(mon, 30)], tasks, at(2026, 11, 25, 20));
    expect(w).toMatchObject({ week: '2026-11-23', planned: 3, done: 1, closed: 1, quietDays: 1, daysSoFar: 3, focusSeconds: 1800 });
  });
  it('writes Sunday’s review for the coming week', () => {
    expect(woopWeek(at(2026, 11, 29, 18))).toBe('2026-11-30');
    expect(woopWeek(at(2026, 11, 25, 18))).toBe('2026-11-23');
  });
});
