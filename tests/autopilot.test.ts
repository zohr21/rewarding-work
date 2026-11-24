/**
 * Savings autopilot (src/lib/budget.ts): the month-end sweep, round-ups and a goal reached
 * once. All amounts are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { write } from '../src/lib/storage';
import {
  addIncome,
  addSave,
  addSpend,
  answerSweep,
  changeSpend,
  getBudget,
  markReached,
  monthPlan,
  normaliseBudget,
  removeSpend,
  roundUpsIn,
  saveGoal,
  setAutopilot,
  setPlan,
  sweepOffer,
} from '../src/lib/budget';

beforeEach(() => {
  write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
});

describe('month-end sweep', () => {
  beforeEach(() => {
    // October: 1,500 in, 300 put in savings, 1,115.50 spent: 84.50 left.
    addIncome({ what: 'Salary', source: 'salary', amount: 1500, day: '2026-10-05' }, { saveFirst: true });
    addSpend({ what: 'Rent', category: 'home', amount: 1115.5, day: '2026-10-06' });
  });

  it('offers what was left of last month, in whole units', () => {
    expect(sweepOffer('2026-11-01')).toMatchObject({ month: '2026-10', amount: 84, goalId: '' });
  });

  it('saving it counts in that month and stops the offer', () => {
    const offer = sweepOffer('2026-11-01')!;
    const x = answerSweep(offer, offer.amount)!;
    expect(x).toMatchObject({ id: 'sweep-2026-10', day: '2026-10-31', amount: 84 });
    expect(monthPlan(getBudget(), '2026-10', '2026-11-01').saved).toBe(384);
    expect(sweepOffer('2026-11-02')).toBeNull();
    expect(answerSweep(offer, 84)).toBeNull();
  });

  it('keeping it stops the offer and saves nothing', () => {
    const offer = sweepOffer('2026-11-01')!;
    expect(answerSweep(offer, null)).toBeNull();
    expect(sweepOffer('2026-11-03')).toBeNull();
    expect(getBudget().saves.filter((x) => x.id.startsWith('sweep-'))).toHaveLength(0);
  });

  it('goes to the first goal not yet reached', () => {
    const goal = saveGoal({ name: 'Emergency fund', target: 2000, monthly: 0 })!;
    expect(sweepOffer('2026-11-01')?.goalId).toBe(goal.id);
  });

  it('does not ask when turned off, or with nothing left', () => {
    setAutopilot({ sweep: false });
    expect(sweepOffer('2026-11-01')).toBeNull();
    setAutopilot({ sweep: true });
    addSpend({ what: 'More', category: 'fun', amount: 90, day: '2026-10-20' });
    expect(sweepOffer('2026-11-01')).toBeNull();
  });
});

describe('round-ups', () => {
  it('count only from the day they were turned on', () => {
    addSpend({ what: 'Before', category: 'food', amount: 9.4, day: '2026-11-01' });
    setAutopilot({ roundUps: true }, '2026-11-10');
    const a = addSpend({ what: 'Bravo', category: 'food', amount: 24.3, day: '2026-11-10' })!;
    addSpend({ what: 'Whole', category: 'food', amount: 5, day: '2026-11-11' });
    const s = getBudget();
    expect(s.saves.map((x) => [x.id, x.amount])).toEqual([[`ru-${a.id}`, 0.7]]);
    expect(roundUpsIn(s.saves, '2026-11')).toBe(0.7);
  });

  it('follow the payment when it is changed or removed', () => {
    setAutopilot({ roundUps: true }, '2026-11-01');
    const a = addSpend({ what: 'Wolt', category: 'food', amount: 12.25, day: '2026-11-05' })!;
    const b = changeSpend(a.id, { what: 'Wolt', category: 'food', amount: 12.9, day: '2026-11-05' })!;
    expect(getBudget().saves.map((x) => [x.id, x.amount])).toEqual([[`ru-${b.id}`, 0.1]]);
    removeSpend(b.id);
    expect(getBudget().saves).toHaveLength(0);
  });

  it('stop when turned off, and other plan changes keep them on', () => {
    setAutopilot({ roundUps: true }, '2026-11-01');
    setPlan({ ...getBudget().plan, split: [60, 20, 20] });
    expect(getBudget().plan.roundUpFrom).toBe('2026-11-01');
    setAutopilot({ roundUps: false });
    addSpend({ what: 'Tea', category: 'food', amount: 1.5, day: '2026-11-12' });
    expect(getBudget().saves).toHaveLength(0);
  });
});

describe('a goal reached', () => {
  it('is marked once, and again only after its target is raised past what is saved', () => {
    const goal = saveGoal({ name: 'Bike', target: 100, monthly: 0 })!;
    expect(markReached(goal.id)).toBe(false);
    addSave(goal.id, 100);
    expect(markReached(goal.id)).toBe(true);
    expect(markReached(goal.id)).toBe(false);
    saveGoal({ name: 'Bike', target: 100, monthly: 10 }, goal.id);
    expect(getBudget().goals[0]?.reachedAt).toBeTypeOf('number');
    saveGoal({ name: 'Bike', target: 150, monthly: 10 }, goal.id);
    expect(getBudget().goals[0]?.reachedAt).toBeUndefined();
  });
});

describe('reading the plan', () => {
  it('keeps the autopilot settings and ignores bad ones', () => {
    expect(normaliseBudget({ v: 2, plan: { split: [50, 30, 20], tags: {}, sweepOff: true, roundUpFrom: '2026-11-02' } }).plan).toMatchObject({ sweepOff: true, roundUpFrom: '2026-11-02' });
    const bad = normaliseBudget({ v: 2, plan: { split: [50, 30, 20], tags: {}, sweepOff: 'yes', roundUpFrom: 'soon' } }).plan;
    expect(bad.sweepOff).toBeUndefined();
    expect(bad.roundUpFrom).toBeUndefined();
  });
});
