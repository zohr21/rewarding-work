/**
 * Keeping Budget data safe (2026-11-28): removed bills stay removed, an older or newer app's
 * copy never strips what it doesn't know, the merge is the same on every device, big stores
 * still fit the account, and bank alerts read and count right. All amounts are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { read, write } from '../src/lib/storage';
import { addSpend, balance, catchUpRepeats, changeSpend, coverOffer, getBudget, importSpends, mergeBudgetStores, normaliseBudget, removeGoal, removeSpends, savedFor, savingsWhere } from '../src/lib/budget';
import { planAlerts, readAlert, setBankSettings } from '../src/lib/bank';
import { pack, unpack, PLAIN_MAX } from '../src/lib/account/pack';
import type { BankNotice } from '../src/lib/device';

const DAY_MS = 86_400_000;

describe('a removed bill a repeat added', () => {
  it('stays removed after its marker is half a year old', () => {
    const old = Date.now() - 400 * DAY_MS;
    write('health', {
      v: 2,
      repeats: [{ id: 'r1', what: 'Rent', category: 'home', amount: 500, dayOfMonth: 1, from: '2025-01', createdAt: old }],
      // January's rent was removed 200 days ago; a typed expense was too.
      entries: [
        { id: 'r1-2025-01', day: '2025-01-01', what: '', category: 'home', amount: 0, createdAt: old, repeatId: 'r1', deletedAt: Date.now() - 200 * DAY_MS },
        { id: 'h1', day: '2025-01-05', what: '', category: 'food', amount: 0, createdAt: old, deletedAt: Date.now() - 200 * DAY_MS },
      ],
    });
    catchUpRepeats('2025-03-15');
    catchUpRepeats('2025-03-15');
    const ids = getBudget().entries.map((e) => e.id);
    expect(ids).not.toContain('r1-2025-01');
    expect(ids).toEqual(expect.arrayContaining(['r1-2025-02', 'r1-2025-03']));
    // The typed expense's old marker is pruned; the bill's is kept.
    const raw = read<{ entries: { id: string }[] }>('health', { entries: [] });
    expect(raw.entries.map((e: { id: string }) => e.id)).toContain('r1-2025-01');
    expect(raw.entries.map((e: { id: string }) => e.id)).not.toContain('h1');
  });
});

describe('copies from other app versions', () => {
  it('keeps keys it does not know, and reads a newer version as this one', () => {
    const s = normaliseBudget({
      v: 3,
      currency: 'AZN',
      later: { x: 1 },
      entries: [{ id: 'h1', day: '2026-11-02', what: 'Bread', category: 'food', amount: 2, createdAt: 1, tip: 0.5 }],
      plan: { split: [50, 30, 20], tags: {}, mode: 'flow' },
    });
    expect(s.entries[0]).toMatchObject({ category: 'food', tip: 0.5 });
    expect((s as unknown as Record<string, unknown>).later).toEqual({ x: 1 });
    expect((s.plan as unknown as Record<string, unknown>).mode).toBe('flow');
  });

  it('merges a copy without goals or savings back into one that has them', () => {
    const full = normaliseBudget({
      v: 2,
      goals: [{ id: 'g1', name: 'Trip', target: 900, monthly: 100, createdAt: 1, updatedAt: 1 }],
      saves: [{ id: 's1', goalId: 'g1', day: '2026-11-02', amount: 100, createdAt: 1 }],
      entries: [{ id: 'h1', day: '2026-11-02', what: 'Bread', category: 'food', amount: 2, createdAt: 1 }],
    });
    const stripped = normaliseBudget({ v: 2, entries: [{ id: 'h2', day: '2026-11-03', what: 'Milk', category: 'food', amount: 1, createdAt: 2 }] });
    const merged = mergeBudgetStores(full, stripped);
    expect(merged.goals.map((g) => g.id)).toEqual(['g1']);
    expect(merged.saves.map((x) => x.id)).toEqual(['s1']);
    expect(merged.entries.map((e) => e.id).sort()).toEqual(['h1', 'h2']);
  });

  it('comes out the same whichever copy is this device’s', () => {
    const now = Date.now();
    const a = normaliseBudget({
      v: 2,
      currency: 'AZN',
      budgetAt: 5,
      entries: [{ id: 'r1-2026-11', day: '2026-11-01', what: 'Rent', category: 'home', amount: 500, createdAt: 10, repeatId: 'r1' }],
      goals: [{ id: 'g1', name: 'Trip', target: 900, monthly: 100, createdAt: 1, updatedAt: 3 }],
      start: { amount: 100, day: '2026-11-01', at: 7 },
    });
    const b = normaliseBudget({
      v: 2,
      currency: 'USD',
      budgetAt: 5,
      entries: [{ id: 'r1-2026-11', day: '2026-11-01', what: 'Rent', category: 'home', amount: 500, createdAt: 11, repeatId: 'r1' }],
      goals: [{ id: 'g1', name: 'Holiday', target: 900, monthly: 100, createdAt: 1, updatedAt: 3 }],
      start: { amount: 200, day: '2026-11-01', at: 7 },
    });
    const ab = JSON.stringify(mergeBudgetStores(a, b, now));
    const ba = JSON.stringify(mergeBudgetStores(b, a, now));
    expect(ab).toBe(ba);
    // Merging again changes nothing, so two devices settle instead of sending copies back and forth.
    const once = mergeBudgetStores(a, b, now);
    expect(JSON.stringify(mergeBudgetStores(once, b, now))).toBe(ab);
    expect(JSON.stringify(mergeBudgetStores(a, once, now))).toBe(ab);
  });
});

describe('packing big stores for the account', () => {
  it('sends small stores as they are', async () => {
    expect(await pack('{"v":2}')).toBe('{"v":2}');
  });

  it('packs a big one to well under the limit and reads it back', async () => {
    const entries = Array.from({ length: 6000 }, (_, i) => ({ id: `b-${i}`, day: '2026-11-02', what: 'Al Market', category: 'food', amount: i / 100, createdAt: 1764300000000 + i, from: 'ABB' }));
    const json = JSON.stringify({ v: 2, entries });
    expect(json.length).toBeGreaterThan(PLAIN_MAX);
    const data = await pack(json);
    expect(data.length).toBeLessThan(json.length / 4);
    expect(await unpack(data)).toBe(json);
  });

  it('gives nothing for a packed copy it cannot read', async () => {
    expect(await unpack('gz1:not-gzip')).toBeNull();
  });
});

describe('bank alert amounts', () => {
  it('reads thousands written with a comma or a dot', () => {
    expect(readAlert('Payment $1,234.56 to Amazon')?.amount).toBe(1234.56);
    expect(readAlert('You paid USD 1,234.56')?.amount).toBe(1234.56);
    expect(readAlert('Purchase 2.802,65 EUR')?.amount).toBe(2802.65);
    expect(readAlert('Paid €12,50 at Cafe')?.amount).toBe(12.5);
    expect(readAlert('Odenis: 12.50 AZN')?.amount).toBe(12.5);
  });
});

describe('bank alerts told twice', () => {
  const at = Date.parse('2026-11-20T09:00:00');
  const notice = (id: string, from: 'app' | 'sms', text: string, offset = 0): BankNotice =>
    from === 'app'
      ? { id, pkg: 'iba.mobilbank', app: 'ABB', sms: false, title: '', text, at: at + offset }
      : { id, pkg: 'com.google.android.apps.messaging', app: 'Messages', sms: true, title: 'Azericard', text, at: at + offset };

  beforeEach(() => {
    write('bank', null);
    write('health', { v: 2, currency: 'AZN', entries: [] });
    setBankSettings({ on: true });
  });

  it('adds two same-price payments from one bank a minute apart', () => {
    const plan = planAlerts([notice('n1', 'app', 'Odenis: 0.60 AZN Metro'), notice('n2', 'app', 'Odenis: 0.60 AZN Metro', 60_000)], at + 120_000);
    expect(plan.map((p) => p.outcome)).toEqual(['added', 'added']);
  });

  it('leaves out the same payment told by the bank app and an SMS', () => {
    const plan = planAlerts([notice('n1', 'app', 'Odenis: 7.20 AZN Wolt'), notice('n2', 'sms', 'Odenis: 7.20 AZN Wolt', 30_000)], at + 120_000);
    expect(plan.map((p) => p.outcome)).toEqual(['added', 'duplicate']);
  });

  it('lets one typed expense stand for one alert, not every alert at that price', () => {
    write('health', { v: 2, currency: 'AZN', entries: [{ id: 'h1', day: '2026-11-20', what: 'Coffee', category: 'food', amount: 3, createdAt: 1 }] });
    const plan = planAlerts([notice('n1', 'app', 'Odenis: 3.00 AZN Coffee'), notice('n2', 'app', 'Odenis: 3.00 AZN Coffee', 600_000)], at + 700_000);
    expect(plan.map((p) => p.outcome)).toEqual(['already', 'added']);
  });
});

describe('changing an expense', () => {
  it('keeps a bill a bill, and a bank payment from its bank', () => {
    write('health', {
      v: 2,
      entries: [
        { id: 'r1-2026-11', day: '2026-11-01', what: 'Rent', category: 'home', amount: 500, createdAt: 1, repeatId: 'r1' },
        { id: 'b-n1', day: '2026-11-02', what: 'Wolt', category: 'other', amount: 7.2, createdAt: 2, from: 'ABB' },
      ],
    });
    const bill = changeSpend('r1-2026-11', { what: 'Rent', category: 'home', amount: 520, day: '2026-11-01' });
    const paid = changeSpend('b-n1', { what: 'Wolt', category: 'food', amount: 7.2, day: '2026-11-02' });
    expect(bill).toMatchObject({ amount: 520, repeatId: 'r1' });
    expect(paid).toMatchObject({ category: 'food', from: 'ABB' });
    expect(getBudget().entries.map((e) => e.id)).not.toContain('r1-2026-11');
  });
});

describe('a removed goal', () => {
  const store = {
    v: 2,
    goals: [{ id: 'g1', name: 'Trip', target: 900, monthly: 100, createdAt: 1, updatedAt: 1 }],
    saves: [{ id: 's1', goalId: 'g1', day: '2026-11-02', amount: 100, createdAt: 1 }],
  };

  it('leaves its money in savings with no goal, without changing the saves', () => {
    write('health', store);
    removeGoal('g1');
    expect(savedFor(getBudget().saves, '')).toBe(100);
    const raw = read<{ saves: { goalId: string }[] }>('health', { saves: [] });
    expect(raw.saves[0]!.goalId).toBe('g1');
  });

  it('reads the same on a device whose saves still name the goal', () => {
    write('health', store);
    removeGoal('g1');
    const here = getBudget();
    const there = normaliseBudget(store);
    const merged = normaliseBudget(JSON.parse(JSON.stringify(mergeBudgetStores(there, here))));
    expect(savedFor(merged.saves, '')).toBe(100);
    expect(savedFor(merged.saves, 'g1')).toBe(0);
  });
});

describe('a salary shared out on two devices at once', () => {
  it('counts one share, the one made first, whichever copy merges', () => {
    const base = {
      v: 2,
      goals: [
        { id: 'g1', name: 'Trip', target: 900, monthly: 100, createdAt: 1, updatedAt: 1 },
        { id: 'g2', name: 'Bike', target: 900, monthly: 100, createdAt: 2, updatedAt: 2 },
      ],
      incomes: [{ id: 'ir1-2026-11', day: '2026-11-01', what: 'Salary', source: 'salary', amount: 1500, createdAt: 5, repeatId: 'ir1' }],
    };
    const a = normaliseBudget({ ...base, saves: [
      { id: 'ir1-2026-11-s-g1', goalId: 'g1', day: '2026-11-01', amount: 150, createdAt: 10 },
      { id: 'ir1-2026-11-s-g2', goalId: 'g2', day: '2026-11-01', amount: 150, createdAt: 10 },
    ] });
    const b = normaliseBudget({ ...base, saves: [{ id: 'ir1-2026-11-s-g1', goalId: 'g1', day: '2026-11-01', amount: 300, createdAt: 20 }] });
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const merged = normaliseBudget(JSON.parse(JSON.stringify(mergeBudgetStores(x, y))));
      expect(savingsWhere(merged.saves).total).toBe(300);
      expect(savedFor(merged.saves, 'g2')).toBe(150);
    }
  });
});

describe('the offer to cover a month from savings', () => {
  const store = (novIncome: number) => ({
    v: 2,
    incomes: [
      { id: 'i1', day: '2026-10-05', what: 'Salary', source: 'salary', amount: 100, createdAt: 1 },
      ...(novIncome ? [{ id: 'i2', day: '2026-11-05', what: 'Salary', source: 'salary', amount: novIncome, createdAt: 2 }] : []),
    ],
    entries: [{ id: 'h1', day: '2026-11-10', what: 'Rent', category: 'home', amount: 500, createdAt: 3 }],
    saves: [{ id: 's1', goalId: '', day: '2026-10-05', amount: 400, createdAt: 1, type: 'had' }],
  });

  it('is not made for a month with no income written in', () => {
    write('health', store(0));
    expect(coverOffer('2026-12-05')).toBeNull();
  });

  it('is made for a month with income that went over', () => {
    write('health', store(10));
    expect(coverOffer('2026-12-05')).toMatchObject({ month: '2026-11' });
  });
});

describe('big amounts', () => {
  it('takes a salary in the millions', () => {
    write('health', { v: 2 });
    expect(addSpend({ what: 'Rent', category: 'home', amount: 5_000_000, day: '2026-11-02' })).not.toBeNull();
    expect(normaliseBudget(getBudget()).entries[0]!.amount).toBe(5_000_000);
  });
});

describe('the balance on the day it was set', () => {
  it('leaves out a bill a repeat added that day and a payment made before it was set', () => {
    const at = Date.parse('2026-11-20T12:00:00');
    const s = normaliseBudget({
      v: 2,
      start: { amount: 1000, day: '2026-11-20', at },
      entries: [
        { id: 'r1-2026-11', day: '2026-11-20', what: 'Rent', category: 'home', amount: 500, createdAt: at + 60_000, repeatId: 'r1' },
        { id: 'b-n1', day: '2026-11-20', what: 'Wolt', category: 'food', amount: 7, createdAt: at - 60_000, from: 'ABB' },
        { id: 'h1', day: '2026-11-20', what: 'Bread', category: 'food', amount: 2, createdAt: at + 60_000 },
      ],
    });
    expect(balance(s, '2026-11-20')).toBe(998);
  });
});

describe('adding past SMS again after undoing an import', () => {
  it('adds them again under a new id; a live alert removed once stays removed', () => {
    write('health', { v: 2, entries: [] });
    const item = { input: { what: 'Wolt', category: 'food' as const, amount: 7, day: '2026-11-02' }, id: 'b-n1', from: 'ABB', at: 5 };
    importSpends([item]);
    removeSpends(['b-n1']);
    expect(importSpends([item])).toEqual([]);
    expect(importSpends([{ ...item, again: true }]).map((e) => e.id)).toEqual(['b-n1-a1']);
    expect(importSpends([{ ...item, again: true }])).toEqual([]);
    expect(getBudget().entries[0]!.createdAt).toBe(5);
  });

  it('does not add one again that was renamed and is still there', () => {
    write('health', { v: 2, entries: [
      { id: 'b-n1', day: '2026-11-02', what: '', category: 'food', amount: 0, createdAt: 5, deletedAt: 6 },
      { id: 'b-n1-r', day: '2026-11-02', what: 'Wolt', category: 'food', amount: 7, createdAt: 6, from: 'ABB' },
    ] });
    const item = { input: { what: 'Wolt', category: 'food' as const, amount: 7, day: '2026-11-02' }, id: 'b-n1', from: 'ABB', again: true };
    expect(importSpends([item])).toEqual([]);
  });
});
