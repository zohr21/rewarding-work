/**
 * Board safety and friends (src/lib/board.ts): the nickname filter, hidden names, blocking,
 * moving old one-way friends to Following, and what counts as new. Nicknames and ids here
 * are made up.
 */
import { describe, expect, it } from 'vitest';
import { breaksRules, inbox, isHidden, normaliseBoard, REPORTS_TO_HIDE, withoutBlocked, type BoardSettings, type Social } from '../src/lib/board';

const settings = (blocked: string[], more: Partial<BoardSettings> = {}): BoardSettings => ({
  joined: true,
  name: 'misty.fern',
  visibility: 'all',
  code: 'OAK-7Q4K',
  friends: [],
  following: [],
  followsSent: true,
  seenAt: 0,
  blocked: blocked.map((uid) => ({ uid, name: uid, at: 0 })),
  hiddenName: '',
  agreedAt: 1,
  ...more,
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

describe('normaliseBoard', () => {
  it('moves one-way friends from before follows into Following', () => {
    const old = normaliseBoard({ joined: true, name: 'misty.fern', friends: ['a', 'b', 'a'] });
    expect(old.friends).toEqual([]);
    expect(old.following).toEqual(['a', 'b']);
    expect(old.followsSent).toBe(false);
  });

  it('keeps friends and follows once settings have both', () => {
    const now = normaliseBoard({ joined: true, friends: ['a'], following: ['b'], followsSent: true, seenAt: 5 });
    expect(now.friends).toEqual(['a']);
    expect(now.following).toEqual(['b']);
    expect(now.seenAt).toBe(5);
  });
});

describe('inbox', () => {
  const social: Social = {
    followers: [
      { uid: 'old', name: 'calm.oak', at: 100 },
      { uid: 'new', name: 'birch42', at: 300 },
      { uid: 'bad', name: 'spam.bot', at: 400 },
    ],
    following: [],
    incoming: [
      { uid: 'ask', name: 'quiet.willow', at: 200, state: 'ask' },
      { uid: 'pal', name: 'gentle.moss', at: 250, state: 'ask' },
    ],
    outgoing: [],
  };

  it('counts followers since you last looked and unanswered requests, not blocked people', () => {
    const { requests, follows } = inbox(social, settings(['bad'], { seenAt: 150, friends: ['pal'] }));
    expect(follows.map((p) => p.uid)).toEqual(['new']);
    // A request from someone already your friend needs no answer.
    expect(requests.map((p) => p.uid)).toEqual(['ask']);
  });

  it('is empty when you are not on the board', () => {
    expect(inbox(social, settings([], { joined: false }))).toEqual({ requests: [], follows: [] });
  });
});
