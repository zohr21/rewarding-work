/**
 * Budget months that start on payday, what a month passes on to the next, and the balance
 * (src/lib/budget.ts). All amounts and days are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { write } from '../src/lib/storage';
import {
  answerCover,
  coverOffer,
  savingsWhere,
  addIncome,
  addRepeat,
  addSave,
  saveGoal,
  addSpend,
  answerSweep,
  balance,
  carriedInto,
  catchUpRepeats,
  getBudget,
  mergeBudgetStores,
  monthPlan,
  monthSpend,
  normaliseBudget,
  paceLine,
  period,
  periodOf,
  setMonthStart,
  setPlan,
  setStartBalance,
  sweepOffer,
} from '../src/lib/budget';

beforeEach(() => {
  write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
});

describe('period', () => {
  it('is the calendar month when months start on the 1st', () => {
    expect(period('2026-02', 1)).toEqual({ month: '2026-02', start: '2026-02-01', end: '2026-02-28', days: 28 });
    expect(periodOf('2026-11-26', 1)).toBe('2026-11');
  });

  it('runs from payday to the day before, named after the month it ends in', () => {
    expect(period('2026-11', 26)).toEqual({ month: '2026-11', start: '2026-10-26', end: '2026-11-25', days: 31 });
    expect(periodOf('2026-10-25', 26)).toBe('2026-10');
    expect(periodOf('2026-10-26', 26)).toBe('2026-11');
    expect(periodOf('2026-12-31', 26)).toBe('2027-01');
  });

  it('keeps every day in exactly one month, across a year end and February', () => {
    expect(period('2027-01', 26).start).toBe('2026-12-26');
    expect(period('2026-03', 28)).toMatchObject({ start: '2026-02-28', end: '2026-03-27', days: 28 });
    for (let m = 1; m < 12; m++) {
      const a = period(`2026-${String(m).padStart(2, '0')}`, 26);
      const b = period(`2026-${String(m + 1).padStart(2, '0')}`, 26);
      const next = new Date(`${a.end}T12:00:00`);
      next.setDate(next.getDate() + 1);
      expect(b.start).toBe(next.toISOString().slice(0, 10));
    }
  });
});

describe('a month that starts on payday', () => {
  beforeEach(() => {
    setMonthStart(26);
    addIncome({ what: 'Salary', source: 'salary', amount: 1800, day: '2026-10-26' });
    addSpend({ what: 'Groceries', category: 'food', amount: 40, day: '2026-10-28' });
    addSpend({ what: 'Bus', category: 'transport', amount: 2, day: '2026-11-03' });
  });

  it('counts the salary of 26 October in November', () => {
    const p = monthPlan(getBudget(), '2026-11', '2026-11-03');
    expect(p.received).toBe(1800);
    expect(p.spent).toBe(42);
    expect(p.daysLeft).toBe(23);
    expect(monthPlan(getBudget(), '2026-10', '2026-11-03').received).toBe(0);
  });

  it('puts each day of spending at its place in the month', () => {
    const p = monthPlan(getBudget(), '2026-11', '2026-11-03');
    expect(p.byDay[2]).toBe(40);
    expect(p.byDay[8]).toBe(2);
    expect(monthSpend(getBudget().entries, '2026-11', 3, 26).total).toBe(40);
  });

  it('places a repeating bill on its day inside the month', () => {
    addRepeat({ what: 'Rent', category: 'home', amount: 450, day: '2026-11-01' });
    const { billsByDay } = paceLine(getBudget().repeats, '2026-12', 1000, undefined, 26);
    // December runs from 26 November: the 1st is its sixth day.
    expect(billsByDay[5]).toBe(450);
    expect(billsByDay.reduce((a, b) => a + b, 0)).toBe(450);
  });

  it('expects a repeating salary in the month it starts', () => {
    write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
    setMonthStart(26);
    addIncome({ what: 'Salary', source: 'salary', amount: 1800, day: '2026-10-26' }, { repeat: true });
    // On 20 November the December salary (26 November) is still to come, and belongs to December.
    expect(monthPlan(getBudget(), '2026-11', '2026-11-20')).toMatchObject({ received: 1800, expected: 0 });
  });

  it('expects the salary still to come in the month it pays for', () => {
    write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [], incomeRepeats: [{ id: 'ir1', what: 'Salary', source: 'salary', amount: 1800, dayOfMonth: 26, from: '2026-10', saveFirst: false, createdAt: 1 }] });
    setMonthStart(26);
    // On 20 November, catching up adds only the October salary; December's is expected in December.
    catchUpRepeats('2026-11-20');
    expect(getBudget().incomes.map((i) => i.day)).toEqual(['2026-10-26']);
    expect(monthPlan(getBudget(), '2026-11', '2026-11-20')).toMatchObject({ received: 1800, expected: 0, income: 1800 });
  });

  it('keeps the start when the plan is changed, and a bad value reads as the 1st', () => {
    setPlan({ ...getBudget().plan, split: [60, 20, 20] });
    expect(getBudget().plan.monthStart).toBe(26);
    expect(normaliseBudget({ v: 2, plan: { split: [50, 30, 20], tags: {}, monthStart: 31 } }).plan.monthStart).toBeUndefined();
    setMonthStart(1);
    expect(getBudget().plan.monthStart).toBeUndefined();
  });

  it('sweeps the month that ended on the day before payday', () => {
    const offer = sweepOffer('2026-11-26')!;
    // 1,800 in, the planned 20% (360) kept for savings, 42 spent.
    expect(offer).toMatchObject({ month: '2026-11', amount: 1398 });
    expect(answerSweep(offer, 100)).toMatchObject({ id: 'sweep-2026-11', day: '2026-11-25' });
  });
});

describe('what a month passes on', () => {
  it('carries what was left into the next month, and a minus when it went over', () => {
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-09-01' });
    addSpend({ what: 'Rent', category: 'home', amount: 700, day: '2026-09-02' });
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' });
    addSpend({ what: 'Trip', category: 'fun', amount: 1300, day: '2026-10-02' });
    const store = getBudget();
    // September: 1,000 in, the planned 20% (200) kept for savings, 700 spent.
    expect(carriedInto(store, '2026-10')).toBe(100);
    // October: 100 passed on + 1,000 in − 200 − 1,300 spent: 400 over, taken off November.
    expect(carriedInto(store, '2026-11')).toBe(-400);
  });

  it('matches what the sweep offers, and passes nothing on once it is saved', () => {
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' });
    addSpend({ what: 'Rent', category: 'home', amount: 700, day: '2026-10-02' });
    const offer = sweepOffer('2026-11-01')!;
    expect(offer.amount).toBe(carriedInto(getBudget(), '2026-11'));
    answerSweep(offer, offer.amount);
    expect(carriedInto(getBudget(), '2026-11')).toBe(0);
  });

  it('passes the rest on when you keep it', () => {
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' });
    addSpend({ what: 'Rent', category: 'home', amount: 700, day: '2026-10-02' });
    answerSweep(sweepOffer('2026-11-01')!, null);
    expect(carriedInto(getBudget(), '2026-11')).toBe(100);
  });

  it('adds it to what is safe to spend, and leaves out what was saved', () => {
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' });
    addSpend({ what: 'Rent', category: 'home', amount: 700, day: '2026-10-02' });
    addSave('', 200, 'card', '2026-10-03');
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-11-01' });
    const p = monthPlan(getBudget(), '2026-11', '2026-11-01');
    expect(p.carried).toBe(100);
    // 1,000 + 100 − 200 planned savings.
    expect(p.free).toBe(900);
  });

  it('is nothing before any income', () => {
    addSpend({ what: 'Coffee', category: 'food', amount: 3, day: '2026-10-02' });
    expect(carriedInto(getBudget(), '2026-11')).toBe(0);
  });
});

describe('balance', () => {
  it('waits for a starting balance', () => {
    addSpend({ what: 'Coffee', category: 'food', amount: 3, day: '2026-10-02' });
    expect(balance(getBudget())).toBeNull();
  });

  it('counts on from it: income in, spending out, savings still yours', () => {
    addSpend({ what: 'Before', category: 'food', amount: 50, day: '2026-11-01' });
    setStartBalance(1200, '2026-11-02');
    addIncome({ what: 'Salary', source: 'salary', amount: 1800, day: '2026-11-26' }, { saveFirst: true });
    addSpend({ what: 'Groceries', category: 'food', amount: 24.6, day: '2026-11-28' });
    expect(balance(getBudget(), '2026-11-30')).toBe(2975.4);
  });

  it('counts a salary written in for a later day only from that day', () => {
    setStartBalance(0, '2026-11-28');
    addIncome({ what: 'November salary', source: 'salary', amount: 2288.57, day: '2026-12-01' }, { saveFirst: true });
    expect(balance(getBudget(), '2026-11-28')).toBe(0);
    expect(balance(getBudget(), '2026-12-01')).toBe(2288.57);
  });

  it('reads back, drops a broken one, and the newer one wins in a merge', () => {
    expect(normaliseBudget({ v: 2, start: { amount: 'x', day: '2026-11-01', at: 1 } }).start).toBeUndefined();
    const a = normaliseBudget({ v: 2, start: { amount: 100, day: '2026-11-01', at: 1 } });
    const b = normaliseBudget({ v: 2, start: { amount: 250, day: '2026-11-05', at: 2 } });
    const none = normaliseBudget({ v: 2 });
    expect(mergeBudgetStores(a, b).start?.amount).toBe(250);
    expect(mergeBudgetStores(b, a).start?.amount).toBe(250);
    expect(mergeBudgetStores(none, a).start?.amount).toBe(100);
    expect(mergeBudgetStores(none, none).start).toBeUndefined();
  });
});

describe('savings set aside ahead of time', () => {
  it('count from their day, not before', () => {
    addIncome({ what: 'October salary', source: 'salary', amount: 1000, day: '2026-11-01' }, { saveFirst: true });
    addIncome({ what: 'November salary', source: 'salary', amount: 2000, day: '2026-12-01' }, { saveFirst: true });
    expect(savingsWhere(getBudget().saves, '2026-11-28').total).toBe(200);
    expect(savingsWhere(getBudget().saves, '2026-12-01').total).toBe(600);
  });
});

describe('a month before the budget started', () => {
  it('is never offered as gone over', () => {
    // Spending was imported for October, but the first income is 1 November.
    addSpend({ what: 'Birthday', category: 'fun', amount: 1569, day: '2026-10-19' });
    addIncome({ what: 'October salary', source: 'salary', amount: 4262, day: '2026-11-01' }, { saveFirst: true });
    expect(coverOffer('2026-11-28')).toBeNull();
    expect(monthPlan(getBudget(), '2026-11', '2026-11-28').carried).toBe(0);
  });

  it('is not offered with no income at all', () => {
    addSpend({ what: 'Birthday', category: 'fun', amount: 400, day: '2026-10-19' });
    expect(coverOffer('2026-11-02')).toBeNull();
  });
});

describe('a month that went over', () => {
  beforeEach(() => {
    // October: 1,000 in, 200 put in savings, 1,100 spent: 300 over.
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' }, { saveFirst: true });
    addSpend({ what: 'Trip', category: 'fun', amount: 1100, day: '2026-10-05' });
    // November: 1,000 in, 200 of it put in savings first.
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-11-01' }, { saveFirst: true });
  });

  it('comes off the next month, and savings are left alone', () => {
    const p = monthPlan(getBudget(), '2026-11', '2026-11-01');
    expect(p.carried).toBe(-300);
    // 1,000 − 300 over − 200 planned savings.
    expect(p.free).toBe(500);
    expect(savingsWhere(getBudget().saves).total).toBe(400);
  });

  it('asks once whether to take it from savings', () => {
    expect(coverOffer('2026-11-01')).toEqual({ month: '2026-10', over: 300, amount: 300 });
    answerCover(coverOffer('2026-11-01')!, false);
    expect(coverOffer('2026-11-02')).toBeNull();
    expect(monthPlan(getBudget(), '2026-11', '2026-11-02').carried).toBe(-300);
  });

  it('taking it from savings ends the month even, on its last day', () => {
    const taken = answerCover(coverOffer('2026-11-01')!, true);
    expect(taken.map((x) => [x.day, x.amount, x.type])).toEqual([['2026-10-31', -300, 'out']]);
    expect(savingsWhere(getBudget().saves).total).toBe(100);
    expect(monthPlan(getBudget(), '2026-11', '2026-11-01').carried).toBe(0);
    expect(coverOffer('2026-11-02')).toBeNull();
  });

  it('takes what savings have when they cannot cover all of it', () => {
    addSpend({ what: 'Repair', category: 'home', amount: 500, day: '2026-10-06' });
    // 800 over, 400 saved (200 from each salary).
    const offer = coverOffer('2026-11-01')!;
    expect(offer).toMatchObject({ over: 800, amount: 400 });
    answerCover(offer, true);
    expect(savingsWhere(getBudget().saves).total).toBe(0);
    expect(monthPlan(getBudget(), '2026-11', '2026-11-01').carried).toBe(-400);
  });

  it('takes from savings with no goal first, then the fullest goal', () => {
    write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
    const a = saveGoal({ name: 'Laptop', target: 2000, monthly: 0 })!;
    const b = saveGoal({ name: 'Trip', target: 2000, monthly: 0 })!;
    addSave('', 50, 'card', '2026-09-01');
    addSave(a.id, 100, 'card', '2026-09-01');
    addSave(b.id, 300, 'card', '2026-09-01');
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' });
    addSpend({ what: 'Trip', category: 'fun', amount: 1000, day: '2026-10-05' });
    // 1,000 − 200 planned − 1,000 = 200 over.
    const taken = answerCover(coverOffer('2026-11-01')!, true);
    expect(taken.map((x) => [x.goalId, x.amount])).toEqual([
      ['', -50],
      [b.id, -150],
    ]);
  });

  it('is not offered with nothing saved', () => {
    write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
    addIncome({ what: 'Salary', source: 'salary', amount: 1000, day: '2026-10-01' });
    addSpend({ what: 'Trip', category: 'fun', amount: 1100, day: '2026-10-05' });
    expect(coverOffer('2026-11-01')).toBeNull();
    expect(carriedInto(getBudget(), '2026-11')).toBe(-300);
  });
});
