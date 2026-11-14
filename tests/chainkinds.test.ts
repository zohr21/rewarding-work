/**
 * Chain details (kind and day entries) meeting across devices through the account
 * (src/lib/chainkinds.ts, merged in src/lib/account/merge.ts).
 */
import { describe, expect, it } from 'vitest';
import { mergeChainDetail, normaliseDetail, type ChainDetail } from '../src/lib/chainkinds';
import { mergeJson } from '../src/lib/account/merge';

const parts = (at?: number) => ({ kind: 'parts' as const, parts: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'], countAt: 5, ...(at ? { at } : {}) });

describe('normaliseDetail', () => {
  it('reads the shape saved before timestamps', () => {
    const old = { setups: { main: { kind: 'parts', parts: ['A', 'B'], countAt: 2 } }, log: { main: { '2026-11-13': { parts: [1, 0] } } } };
    expect(normaliseDetail(old)).toEqual({ setups: { main: { kind: 'parts', parts: ['A', 'B'], countAt: 2 } }, log: { main: { '2026-11-13': { parts: [1, 0] } } } });
  });

  it('keeps at and since, and drops garbage', () => {
    const d = normaliseDetail({ setups: { a: { kind: 'tick', at: 5, since: 5 }, b: { kind: 'nope' }, c: 7 }, log: { a: { bad: {}, '2026-11-13': { at: 9 } } } });
    expect(d).toEqual({ setups: { a: { kind: 'tick', at: 5, since: 5 } }, log: { a: { '2026-11-13': { at: 9 } } } });
    expect(normaliseDetail('x')).toEqual({ setups: {}, log: {} });
  });
});

describe('mergeChainDetail', () => {
  const empty: ChainDetail = { setups: {}, log: {} };

  it('brings the phone’s parts chain to a device that only has the tick', () => {
    const phone: ChainDetail = { setups: { main: parts(100) }, log: { main: { '2026-11-14': { parts: [1, 1, 0, 0, 0], at: 100 } } } };
    expect(mergeChainDetail(empty, phone)).toEqual(phone);
  });

  it('takes the newer setup, this device on a tie', () => {
    const local: ChainDetail = { setups: { main: parts(100) }, log: {} };
    const remote: ChainDetail = { setups: { main: { kind: 'tick', at: 200 } }, log: {} };
    expect(mergeChainDetail(local, remote).setups.main).toEqual({ kind: 'tick', at: 200 });
    expect(mergeChainDetail(remote, { setups: { main: parts(200) }, log: {} }).setups.main.kind).toBe('tick');
  });

  it('takes the newer day, so a cleared slot stays cleared', () => {
    const local: ChainDetail = { setups: {}, log: { main: { '2026-11-14': { parts: [1, 1], at: 100 }, '2026-11-13': { n: 3, at: 50 } } } };
    const remote: ChainDetail = { setups: {}, log: { main: { '2026-11-14': { at: 150 }, '2026-11-13': { n: 1, at: 10 } } } };
    expect(mergeChainDetail(local, remote).log.main).toEqual({ '2026-11-14': { at: 150 }, '2026-11-13': { n: 3, at: 50 } });
  });

  it('drops days from before a chain was deleted', () => {
    const local: ChainDetail = { setups: { main: { kind: 'tick', at: 300, since: 300 } }, log: {} };
    const remote: ChainDetail = { setups: { main: parts(100) }, log: { main: { '2026-11-10': { parts: [1], at: 100 }, '2026-11-14': { parts: [1], at: 400 } } } };
    const merged = mergeChainDetail(local, remote);
    expect(merged.setups.main).toEqual({ kind: 'tick', at: 300, since: 300 });
    expect(merged.log.main).toEqual({ '2026-11-14': { parts: [1], at: 400 } });
  });
});

describe('mergeJson chain-detail', () => {
  it('merges the stored text from both sides', () => {
    const local = JSON.stringify({ setups: {}, log: {} });
    const remote = JSON.stringify({ setups: { main: parts(100) }, log: {} });
    expect(JSON.parse(mergeJson('chain-detail', local, remote)!).setups.main.kind).toBe('parts');
  });
});

describe('saving on this device', async () => {
  const { saveSetup, saveEntry, getEntry, getSetup, removeDetail } = await import('../src/lib/chainkinds');
  const { addChain, read } = await import('../src/lib/storage');
  const day = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  it('stamps setups and days, keeps a cleared day, and leaves a record when deleted', () => {
    const id = addChain('NMP')!;
    saveSetup(id, { kind: 'parts', parts: ['Morning', 'Noon', 'Night'], countAt: 2 });
    expect(getSetup(id)).toMatchObject({ kind: 'parts', countAt: 2, at: expect.any(Number) });

    expect(saveEntry(id, day, { parts: [1, 1, 0] })).toBe(true);
    expect(getEntry(id, day)).toMatchObject({ parts: [1, 1, 0], at: expect.any(Number) });

    expect(saveEntry(id, day, {})).toBe(false);
    expect(getEntry(id, day)).toEqual({});
    const stored = read<ChainDetail>('chain-detail', { setups: {}, log: {} });
    expect(stored.log[id][day]).toEqual({ at: expect.any(Number) });

    saveSetup(id, { kind: 'tick' });
    expect(getSetup(id)).toMatchObject({ kind: 'tick', at: expect.any(Number) });

    removeDetail(id);
    expect(getSetup(id)).toMatchObject({ kind: 'tick', since: expect.any(Number) });
    expect(read<ChainDetail>('chain-detail', { setups: {}, log: {} }).log[id]).toBeUndefined();
  });
});
