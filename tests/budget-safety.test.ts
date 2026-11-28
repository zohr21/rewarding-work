/**
 * Keeping Budget data safe (2026-11-28): removed bills stay removed, an older or newer app's
 * copy never strips what it doesn't know, the merge is the same on every device, big stores
 * still fit the account, and bank alerts read and count right. All amounts are made up.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { read, write } from '../src/lib/storage';
import { catchUpRepeats, getBudget, mergeBudgetStores, normaliseBudget } from '../src/lib/budget';
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
