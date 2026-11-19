/**
 * Board safety (src/lib/board.ts): the nickname filter, hidden names and blocking.
 * Nicknames and ids here are made up.
 */
import { describe, expect, it } from 'vitest';
import { breaksRules, isHidden, REPORTS_TO_HIDE, withoutBlocked, type BoardSettings } from '../src/lib/board';

const settings = (blocked: string[]): BoardSettings => ({
  joined: true,
  name: 'misty.fern',
  visibility: 'all',
  code: 'OAK-7Q4K',
  friends: [],
  blocked: blocked.map((uid) => ({ uid, name: uid, at: 0 })),
  hiddenName: '',
  agreedAt: 1,
});

describe('breaksRules', () => {
  it('lets ordinary nicknames through', () => {
    for (const name of ['quiet.maple', 'birch42', 'calm_oak', 'Grape.fan', 'classic-sky', 'Peacock', 'Ləman', 'Сергей.к']) {
      expect(breaksRules(name), name).toBe(false);
    }
  });

  it('catches rude words, also when split or spelled with digits', () => {
    for (const name of ['fuckoff', 'f.u.c.k', 'sh1t_head', 'b1tch', 'хуйня', 'n4zi']) {
      expect(breaksRules(name), name).toBe(true);
    }
  });

  it('catches links and phone numbers', () => {
    expect(breaksRules('www.spam')).toBe(true);
    expect(breaksRules('buy.coins.com')).toBe(true);
    expect(breaksRules('call0501234567')).toBe(true);
    expect(breaksRules('oak2026')).toBe(false);
  });
});

describe('isHidden', () => {
  it('hides a name once enough people report it, or its owner marks it', () => {
    expect(isHidden({ reports: REPORTS_TO_HIDE - 1, hidden: false })).toBe(false);
    expect(isHidden({ reports: REPORTS_TO_HIDE, hidden: false })).toBe(true);
    expect(isHidden({ reports: 0, hidden: true })).toBe(true);
  });
});

describe('withoutBlocked', () => {
  it('leaves out only the people you blocked', () => {
    const rows = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
    expect(withoutBlocked(rows, settings(['b'])).map((r) => r.uid)).toEqual(['a', 'c']);
    expect(withoutBlocked(rows, settings([]))).toBe(rows);
  });
});
