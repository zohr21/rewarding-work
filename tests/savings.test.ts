/**
 * Savings on card and in cash (src/lib/budget.ts): cash taken out to keep is counted once,
 * money taken out goes back to spend, and old savings still read. All amounts are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { write } from '../src/lib/storage';
import {
  addIncome,
  addSave,
  addSpend,
  canTakeOut,
  getBudget,
  intoSavings,
  monthPlan,
  moveSavings,
  normaliseBudget,
  savedFor,
  savingsWhere,
  saveGoal,
  spendToSavings,
  takeOut,
} from '../src/lib/budget';

const DAY = '2026-11-10';
const MONTH = '2026-11';
const TODAY = '2026-11-25';

beforeEach(() => {
  write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
  // 1,500 in, 20% (300) put in savings first, on the card.
  addIncome({ what: 'Salary', source: 'salary', amount: 1500, day: DAY }, { saveFirst: true });
});

describe('savings on card and in cash', () => {
  it('starts on the card', () => {
    expect(savingsWhere(getBudget().saves)).toEqual({ total: 300, card: 300, cash: 0 });
  });

  it('cash taken out to keep moves to cash and leaves safe to spend as it was', () => {
    const before = monthPlan(getBudget(), MONTH, TODAY).free;
    const done = intoSavings(300, DAY);
    expect(done).toMatchObject({ moved: 300, added: 0 });
    const s = getBudget();
    expect(savingsWhere(s.saves)).toEqual({ total: 300, card: 0, cash: 300 });
    const p = monthPlan(s, MONTH, TODAY);
    expect(p.free).toBe(before);
    expect(p.saved).toBe(300);
    expect(p.spent).toBe(0);
  });

  it('cash beyond what was saved is new savings', () => {
    const done = intoSavings(450, DAY);
    expect(done).toMatchObject({ moved: 300, added: 150 });
    expect(savingsWhere(getBudget().saves)).toEqual({ total: 450, card: 0, cash: 450 });
    expect(monthPlan(getBudget(), MONTH, TODAY).saved).toBe(450);
  });

  it('is added once on every device: the same alert gives the same ids', () => {
    const a = intoSavings(100, DAY, 'bank-1-c');
    expect(a.ids).toEqual(['bank-1-c-from', 'bank-1-c-to']);
  });

  it('an expense that was savings stops counting as spending', () => {
    const before = monthPlan(getBudget(), MONTH, TODAY).free;
    const cash = addSpend({ what: 'ATM', category: 'other', amount: 300, day: DAY })!;
    expect(monthPlan(getBudget(), MONTH, TODAY).free).toBe(before - 300);
    spendToSavings(cash.id);
    const s = getBudget();
    expect(s.entries).toHaveLength(0);
    expect(monthPlan(s, MONTH, TODAY).free).toBe(before);
    expect(savingsWhere(s.saves).cash).toBe(300);
  });

  it('moves between card and cash, never more than is there', () => {
    expect(moveSavings(500, 'cash', DAY)).toHaveLength(2);
    expect(savingsWhere(getBudget().saves)).toEqual({ total: 300, card: 0, cash: 300 });
    moveSavings(100, 'card', DAY);
    expect(savingsWhere(getBudget().saves)).toEqual({ total: 300, card: 100, cash: 200 });
    expect(moveSavings(50, 'card', DAY).length).toBe(2);
    expect(moveSavings(1000, 'cash', DAY).length).toBe(2);
    expect(moveSavings(10, 'cash', DAY)).toEqual([]);
  });

  it('money taken out goes back to spend and leaves its goal', () => {
    write('health', { v: 2, entries: [], saves: [], incomes: [], goals: [] });
    const goal = saveGoal({ name: 'Laptop', target: 1000, monthly: 100 })!;
    addIncome({ what: 'Salary', source: 'salary', amount: 1500, day: DAY }, { saveFirst: true });
    expect(savedFor(getBudget().saves, goal.id)).toBe(300);
    const before = monthPlan(getBudget(), MONTH, TODAY).free;
    expect(canTakeOut(getBudget().saves, goal.id, 'card')).toBe(300);
    expect(canTakeOut(getBudget().saves, goal.id, 'cash')).toBe(0);
    takeOut(goal.id, 120, 'card', DAY);
    const s = getBudget();
    expect(savedFor(s.saves, goal.id)).toBe(180);
    const p = monthPlan(s, MONTH, TODAY);
    expect(p.takenOut).toBe(120);
    expect(p.free).toBe(before + 120);
    expect(takeOut(goal.id, 999, 'card', DAY)?.amount).toBe(-180);
    expect(takeOut(goal.id, 1, 'card', DAY)).toBeNull();
  });

  it('money put in can be kept in cash', () => {
    addSave('', 50, 'cash', DAY);
    expect(savingsWhere(getBudget().saves)).toEqual({ total: 350, card: 300, cash: 50 });
  });
});

describe('reading savings', () => {
  const base = { id: 'x', goalId: '', day: DAY, createdAt: 1 };

  it('still reads savings from before card and cash', () => {
    const s = normaliseBudget({ v: 2, saves: [{ ...base, amount: 40 }] });
    expect(s.saves).toEqual([{ ...base, amount: 40 }]);
    expect(savingsWhere(s.saves)).toEqual({ total: 40, card: 40, cash: 0 });
  });

  it('keeps moves and take-outs, and drops amounts that make no sense', () => {
    const s = normaliseBudget({
      v: 2,
      saves: [
        { ...base, id: 'a', amount: -30, type: 'move' },
        { ...base, id: 'b', amount: 30, type: 'move', where: 'cash' },
        { ...base, id: 'c', amount: -10, type: 'out' },
        { ...base, id: 'd', amount: 10, type: 'out' },
        { ...base, id: 'e', amount: -5 },
        { ...base, id: 'f', amount: 5, where: 'pocket' },
      ],
    });
    expect(s.saves.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'f']);
    expect(s.saves.find((x) => x.id === 'f')?.where).toBeUndefined();
  });
});
