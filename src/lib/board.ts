/**
 * The weekly board (Grove › Board, and its card in You).
 *
 * - Opt-in. You appear under a nickname you pick, never your email or name.
 * - Weekly: it counts focus from Monday 00:00 (your local time) and starts again each week.
 * - Leagues are the grove's stages, so you compare with people at a similar point.
 * - At most DAILY_CAP_MIN of a day's focus counts, so the board never rewards overwork.
 *
 * Your settings are the `board` store (synced with your account). Each week's entry is
 * boards/{week}/entries/{uid} in Firestore, written from this device (src/lib/account/firebase.ts).
 *
 * Two ways to keep up with someone:
 * - Follow: one way, no asking (follows/{you_them}). They see "X followed you" and can follow
 *   back, or remove you. You see their row while it shows to everyone.
 * - Friends: both ways. You ask (links/{you_them}), they accept, and each keeps the other in
 *   their own `friends`; with "Friends only" only friends see you.
 * Before November 2026 "friends" were one-way adds; those move to Following (see normaliseBoard).
 *
 * Safety (Google Play's user-generated content policy): you agree to the board rules when you
 * join, can report a nickname (reports/{id}, read only in the Firebase console) and block
 * someone (kept in your settings, so it follows your account). A nickname reported by
 * REPORTS_TO_HIDE different people shows as "hidden name" until its owner picks another.
 */
import { getAccount, loadAccount, onAccountChange } from './account/state';
import { addDays, dayKey, startOfDay, startOfWeek } from './dates';
import { tierName } from './rewards';
import { dateFormat, t } from './i18n';
import { sprigStage } from './sprig';
import { getSessions, read, subscribe, write, type FocusSession } from './storage';

export type Visibility = 'all' | 'friends';

/** Someone you blocked: you don't see them, and they leave your friends. */
export interface Blocked {
  uid: string;
  /** Their nickname when you blocked them, for the list in You. */
  name: string;
  at: number;
}

export const REPORT_REASONS = ['hate', 'sexual', 'bullying', 'impersonation', 'personal', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface BoardSettings {
  joined: boolean;
  name: string;
  visibility: Visibility;
  /** Your friend code, e.g. OAK-7Q4K. Empty until you join. */
  code: string;
  /** Friends: both of you agreed. They can see your row when it shows to friends only. */
  friends: string[];
  /** People you follow (one way). */
  following: string[];
  /** Your follows are in the account (false: kept from before follows existed, not sent yet). */
  followsSent: boolean;
  /** When you last looked at what's new (followers), to show the dot. */
  seenAt: number;
  /** People you blocked, newest first. */
  blocked: Blocked[];
  /** A nickname of yours that others reported; it stays hidden until you pick another. */
  hiddenName: string;
  /** When you agreed to the board rules (0: joined before there were rules). */
  agreedAt: number;
}

/** One row of the board, as stored in Firestore (plus the account id it belongs to). */
export interface BoardEntry {
  uid: string;
  name: string;
  minutes: number;
  /** The league: the grove stage, 0 (seed) to 5. */
  tier: number;
  guest: boolean;
  visibility: Visibility;
  friends: string[];
  updatedAt: number;
  /** How many different people reported this nickname this week (back to 0 when it changes). */
  reports: number;
  /** Set by the owner's own app for a nickname reported before, so it stays hidden in later weeks. */
  hidden: boolean;
}

export const DAILY_CAP_MIN = 240;
export const WEEK_CAP_MIN = 7 * DAILY_CAP_MIN;
export const MAX_FRIENDS = 30;
export const MAX_FOLLOWING = 100;
export const MAX_BLOCKED = 200;
export const REPORTS_TO_HIDE = 3;

export type LinkState = 'ask' | 'yes' | 'end';

/** Someone who follows you, or asked to be friends. */
export interface Person {
  uid: string;
  /** Their nickname when they followed or asked. */
  name: string;
  at: number;
}

export interface Link extends Person {
  state: LinkState;
}

/** What the account knows about the people around you (src/lib/account/firebase.ts loadSocial). */
export interface Social {
  followers: Person[];
  following: string[];
  /** Requests to you ('ask'), or someone ending a friendship ('end'). */
  incoming: Link[];
  /** Your requests: waiting ('ask') or accepted ('yes'). */
  outgoing: Link[];
}

const EMPTY: BoardSettings = {
  joined: false,
  name: '',
  visibility: 'all',
  code: '',
  friends: [],
  following: [],
  followsSent: false,
  seenAt: 0,
  blocked: [],
  hiddenName: '',
  agreedAt: 0,
};

function ids(v: unknown, max: number): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((f): f is string => typeof f === 'string' && f.length > 0))].slice(0, max) : [];
}

function normaliseBlocked(v: unknown): Blocked[] {
  if (!Array.isArray(v)) return [];
  const out: Blocked[] = [];
  for (const b of v) {
    if (typeof b !== 'object' || b === null) continue;
    const o = b as Record<string, unknown>;
    if (typeof o.uid !== 'string' || !o.uid) continue;
    out.push({ uid: o.uid, name: typeof o.name === 'string' ? o.name : '', at: typeof o.at === 'number' ? o.at : 0 });
  }
  return out.slice(0, MAX_BLOCKED);
}

/** Settings as stored (any version) → the current shape. */
export function normaliseBoard(v: unknown): BoardSettings {
  if (typeof v !== 'object' || v === null) return EMPTY;
  const o = v as Record<string, unknown>;
  // Settings from before follows had one-way "friends": those become people you follow.
  const before = !Array.isArray(o.following);
  const friends = ids(o.friends, MAX_FRIENDS);
  return {
    joined: o.joined === true,
    name: typeof o.name === 'string' ? o.name : '',
    visibility: o.visibility === 'friends' ? 'friends' : 'all',
    code: typeof o.code === 'string' ? o.code : '',
    friends: before ? [] : friends,
    following: before ? friends : ids(o.following, MAX_FOLLOWING),
    followsSent: o.followsSent === true,
    seenAt: typeof o.seenAt === 'number' ? o.seenAt : 0,
    // Added in November 2026 for the Play version; older settings have none of these.
    blocked: normaliseBlocked(o.blocked),
    hiddenName: typeof o.hiddenName === 'string' ? o.hiddenName : '',
    agreedAt: typeof o.agreedAt === 'number' ? o.agreedAt : 0,
  };
}

export function getBoard(): BoardSettings {
  return normaliseBoard(read<unknown>('board', null));
}

export function setBoard(patch: Partial<BoardSettings>): BoardSettings {
  const next = { ...getBoard(), ...patch };
  write('board', next);
  return next;
}

// ---------- Pure helpers ----------

/** The week an entry belongs to: its Monday, as YYYY-MM-DD. */
export function weekKey(now: Date | number = new Date()): string {
  return dayKey(startOfWeek(now));
}

/** This week's focus minutes for the board, each day counted up to DAILY_CAP_MIN. */
export function weekMinutes(sessions: FocusSession[], now = new Date()): number {
  const from = startOfWeek(now).getTime();
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.start < from) continue;
    const key = dayKey(s.start);
    byDay.set(key, (byDay.get(key) ?? 0) + s.focusSeconds / 60);
  }
  let total = 0;
  byDay.forEach((m) => (total += Math.min(DAILY_CAP_MIN, m)));
  return Math.min(WEEK_CAP_MIN, Math.round(total));
}

/** "Seed", "Sapling": the stage a league is named after. */
export function leagueStage(tier: number): string {
  return tier <= 0 ? t('board.seed') : tierName(Math.min(5, tier) - 1);
}

/** "Seed league", "Sapling league". */
export function leagueName(tier: number): string {
  return t('board.league', { name: leagueStage(tier) });
}

/** "8 h 30", "45 min". */
export function formatMinutes(min: number): string {
  if (min < 60) return t('unit.min', { n: min });
  return t('board.hMm', { h: Math.floor(min / 60), mm: String(min % 60).padStart(2, '0') });
}

/** "2 d 14 h" until next Monday 00:00. */
export function resetsIn(now = new Date()): string {
  const next = addDays(startOfWeek(now), 7).getTime();
  const hours = Math.max(1, Math.ceil((next - now.getTime()) / 3_600_000));
  if (hours < 24) return t('unit.h', { n: hours });
  return hours % 24 ? t('board.dH', { d: Math.floor(hours / 24), h: hours % 24 }) : t('board.d', { n: hours / 24 });
}

/** "Week of 27 Oct". */
export function weekLabel(now = new Date()): string {
  return t('board.weekOf', { date: dateFormat({ day: 'numeric', month: 'short' }).format(startOfWeek(now)) });
}

const NAME_RE = /^[\p{L}\p{N}._-]{2,20}$/u;

/**
 * The obvious ones, caught before a nickname is posted (reports catch the rest). Matched
 * inside the name, with dots, dashes and underscores taken out and look-alike digits read
 * as letters.
 */
const BLOCKED_WORDS = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'porn', 'nude', 'pussy', 'penis', 'rapist',
  'nazi', 'hitler', 'nigg', 'faggot', 'retard', 'suicide',
  'хуй', 'хуе', 'пизд', 'бляд', 'ебат', 'ебан', 'сука', 'шлюх', 'пидор', 'порно',
  'qəhbə', 'qehbe', 'fahişə', 'fahise', 'peysər', 'peyser', 'dalbayob',
];
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };

/** True when a nickname looks like it breaks the board rules: a rude word, a link or a phone number. */
export function breaksRules(name: string): boolean {
  const flat = name
    .toLowerCase()
    .replace(/[._-]/g, '')
    .replace(/[013457]/g, (ch) => LOOKALIKE[ch] ?? ch);
  if (BLOCKED_WORDS.some((w) => flat.includes(w))) return true;
  if (/www|http|\.(com|net|org|ru|az|me)\b/i.test(name)) return true;
  return (name.match(/\d/g) ?? []).length >= 7;
}

/** Null when fine, otherwise what to fix. */
export function nicknameProblem(name: string): string | null {
  if (name.length < 2) return t('board.err.short');
  if (name.length > 20) return t('board.err.long');
  if (!NAME_RE.test(name)) return t('board.err.chars');
  if (breaksRules(name)) return t('board.err.rules');
  if (name === getBoard().hiddenName) return t('board.err.hiddenName');
  return null;
}

/** Whether others see this row's nickname, or "hidden name". */
export function isHidden(e: Pick<BoardEntry, 'reports' | 'hidden'>): boolean {
  return e.hidden || e.reports >= REPORTS_TO_HIDE;
}

/** True when your current nickname is the one that was hidden. */
export function myNameHidden(settings = getBoard()): boolean {
  return settings.joined && !!settings.hiddenName && settings.hiddenName === settings.name;
}

const NAME_A = ['quiet', 'calm', 'steady', 'early', 'bright', 'gentle', 'patient', 'misty'];
const NAME_B = ['maple', 'birch', 'oak', 'ginkgo', 'fern', 'moss', 'acorn', 'willow'];

export function nicknameIdeas(count = 3): string[] {
  const ideas = new Set<string>();
  while (ideas.size < count) {
    const a = NAME_A[Math.floor(Math.random() * NAME_A.length)]!;
    const b = NAME_B[Math.floor(Math.random() * NAME_B.length)]!;
    ideas.add(ideas.size === count - 1 ? `${b}${10 + Math.floor(Math.random() * 90)}` : `${a}.${b}`);
  }
  return [...ideas];
}

/** No 0/O or 1/I, so a code read aloud can't be mistyped. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-Z2-9]{3}-[A-Z2-9]{4}$/;

export function newCode(): string {
  const pick = () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

/** "oak 7q4k", "oak7q4k" → "OAK-7Q4K"; null if it can't be a code. */
export function cleanCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 7) return null;
  const code = `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return CODE_RE.test(code) ? code : null;
}

// ---------- Talking to the account ----------

/** Your grove stage, which is your league. */
export function myTier(sessions = getSessions()): number {
  return Math.max(0, Math.min(5, sprigStage(sessions)));
}

/** What your row says right now, from this device's sessions. */
export function myEntry(uid: string, settings = getBoard(), sessions = getSessions()): BoardEntry {
  return {
    uid,
    name: settings.name,
    minutes: weekMinutes(sessions),
    tier: myTier(sessions),
    guest: getAccount().user?.isAnonymous ?? false,
    visibility: settings.visibility,
    friends: settings.friends,
    updatedAt: Date.now(),
    reports: 0,
    hidden: myNameHidden(settings),
  };
}

let codeChecked: string | null = null;

/** Make sure your friend code points at this account (a new code if it is taken). */
async function ensureCode(rt: Awaited<ReturnType<typeof loadAccount>>, uid: string): Promise<void> {
  const settings = getBoard();
  if (settings.code && codeChecked === `${uid}:${settings.code}`) return;
  for (let tries = 0; tries < 4; tries++) {
    const code = tries === 0 && settings.code ? settings.code : newCode();
    if (await rt.claimFriendCode(code)) {
      if (code !== settings.code) setBoard({ code });
      codeChecked = `${uid}:${code}`;
      return;
    }
  }
}

/** Send your row for this week. Does nothing unless you joined and are signed in. */
export async function pushEntry(): Promise<void> {
  const settings = getBoard();
  const uid = getAccount().user?.uid;
  if (!settings.joined || !uid) return;
  const rt = await loadAccount();
  await ensureCode(rt, uid);
  const reports = await rt.saveBoardEntry(weekKey(), myEntry(uid));
  // Reported by enough people: remember it, so the name stays hidden in later weeks too.
  if (reports >= REPORTS_TO_HIDE && getBoard().hiddenName !== settings.name) {
    setBoard({ hiddenName: settings.name });
    await rt.saveBoardEntry(weekKey(), myEntry(uid));
  }
}

/** Join under `name`. Starts a guest account first when nobody is signed in. */
export async function joinBoard(name: string): Promise<void> {
  const rt = await loadAccount();
  if (!getAccount().user) await rt.continueAsGuest();
  await waitForUser();
  setBoard({ joined: true, name, agreedAt: Date.now() });
  await pushEntry();
  void refreshSocial(true).catch(() => {});
}

/** Leave: your rows for this week and last are removed. */
export async function leaveBoard(): Promise<void> {
  setBoard({ joined: false });
  social = null;
  paintDots();
  if (!getAccount().user) return;
  const rt = await loadAccount();
  const now = new Date();
  await rt.removeBoardEntries([weekKey(now), weekKey(addDays(startOfDay(now), -7))]);
}

// ---------- Following and friends ----------

let social: Social | null = null;
let socialAt = 0;
let refreshing: Promise<void> | null = null;

/** The last thing the account said, or null before it has been asked (or when you're not on the board). */
export function getSocial(): Social | null {
  return social;
}

export function isFollowing(uid: string, settings = getBoard()): boolean {
  return settings.following.includes(uid);
}

export function isFriend(uid: string, settings = getBoard()): boolean {
  return settings.friends.includes(uid);
}

/** You asked them to be friends and they haven't answered. */
export function isAsked(uid: string): boolean {
  return !!social?.outgoing.some((l) => l.uid === uid && l.state === 'ask');
}

/** They asked you to be friends. */
export function askedMe(uid: string): boolean {
  return !!social?.incoming.some((l) => l.uid === uid && l.state === 'ask');
}

/** What's new: friend requests to answer, and followers since you last looked. */
export function inbox(s: Social | null = social, settings = getBoard()): { requests: Person[]; follows: Person[] } {
  if (!s || !settings.joined) return { requests: [], follows: [] };
  const requests = withoutBlocked(s.incoming.filter((l) => l.state === 'ask' && !settings.friends.includes(l.uid)), settings);
  const follows = withoutBlocked(s.followers.filter((p) => p.at > settings.seenAt), settings);
  return { requests: requests.sort((a, b) => b.at - a.at), follows: follows.sort((a, b) => b.at - a.at) };
}

export function inboxCount(): number {
  const { requests, follows } = inbox();
  return requests.length + follows.length;
}

/** Followers seen: the dot goes (requests stay until answered). */
export function markInboxSeen(): void {
  if (!social) return;
  const newest = Math.max(0, ...social.followers.map((p) => p.at));
  if (newest > getBoard().seenAt) setBoard({ seenAt: newest });
  paintDots();
}

/** Show or hide every "something new on the board" dot on the page ([data-board-dot]). */
export function paintDots(): void {
  if (typeof document === 'undefined') return;
  const n = inboxCount();
  document.querySelectorAll<HTMLElement>('[data-board-dot]').forEach((dot) => (dot.hidden = n === 0));
  document.dispatchEvent(new CustomEvent('board:social'));
}

/**
 * Ask the account what changed: new followers, requests, answers to yours. Acts on answers
 * (a yes adds them to your friends; an 'end' removes them) and clears anything a blocked
 * person left. At most once a minute unless `force`.
 */
export async function refreshSocial(force = false): Promise<void> {
  const settings = getBoard();
  const uid = getAccount().user?.uid;
  if (!settings.joined || !uid) {
    social = null;
    paintDots();
    return;
  }
  if (refreshing) return refreshing;
  if (!force && social && Date.now() - socialAt < 60_000) return;
  refreshing = (async () => {
    const rt = await loadAccount();
    const s = await rt.loadSocial();
    const blocked = new Set(settings.blocked.map((b) => b.uid));
    const work: Promise<unknown>[] = [];
    let friends = settings.friends.filter((f) => !blocked.has(f));
    for (const p of [...s.followers, ...s.incoming]) if (blocked.has(p.uid)) work.push(rt.cutTies(p.uid));
    for (const l of s.outgoing) {
      if (l.state !== 'yes') continue;
      if (!blocked.has(l.uid) && !friends.includes(l.uid) && friends.length < MAX_FRIENDS) friends.push(l.uid);
      work.push(rt.dropLink(l.uid, true));
    }
    for (const l of s.incoming) {
      if (l.state === 'end') {
        friends = friends.filter((f) => f !== l.uid);
        work.push(rt.dropLink(l.uid, false));
      } else if (l.state === 'ask' && friends.includes(l.uid)) {
        // Already friends on this side (you both asked): just say yes.
        work.push(rt.acceptLink(l.uid));
      }
    }
    // Follows kept from before go to the account once; after that the account is right
    // (someone may have removed you as a follower).
    let following: string[];
    if (!settings.followsSent) {
      const keep = settings.following.filter((f) => !blocked.has(f));
      keep.filter((f) => !s.following.includes(f)).forEach((f) => work.push(rt.follow(f, settings.name)));
      following = [...new Set([...keep, ...s.following])];
    } else {
      following = s.following.filter((f) => !blocked.has(f));
    }
    await Promise.all(work.map((p) => p.catch(() => {})));
    const friendsChanged = friends.join() !== settings.friends.join();
    setBoard({ friends, following: following.slice(0, MAX_FOLLOWING), followsSent: true });
    if (friendsChanged) await pushEntry().catch(() => {});
    social = {
      followers: s.followers.filter((p) => !blocked.has(p.uid)),
      following,
      incoming: s.incoming.filter((l) => l.state === 'ask' && !blocked.has(l.uid)),
      outgoing: s.outgoing.filter((l) => l.state === 'ask'),
    };
    socialAt = Date.now();
  })().finally(() => {
    refreshing = null;
    paintDots();
  });
  return refreshing;
}

async function onBoardAccount(): Promise<Awaited<ReturnType<typeof loadAccount>>> {
  if (!getBoard().joined || !getAccount().user) throw new Error(t('board.err.joinFirst'));
  return loadAccount();
}

export async function followPerson(uid: string): Promise<void> {
  const settings = getBoard();
  if (isFollowing(uid, settings)) return;
  if (settings.following.length >= MAX_FOLLOWING) throw new Error(t('board.err.maxFollowing', { n: MAX_FOLLOWING }));
  const rt = await onBoardAccount();
  await rt.follow(uid, settings.name);
  setBoard({ following: [...getBoard().following, uid] });
  if (social) social.following = [...social.following, uid];
  paintDots();
}

export async function unfollowPerson(uid: string): Promise<void> {
  setBoard({ following: getBoard().following.filter((f) => f !== uid) });
  if (social) social.following = social.following.filter((f) => f !== uid);
  paintDots();
  const rt = await onBoardAccount();
  await rt.unfollow(uid);
}

/** Stop them following you. They aren't told. */
export async function removeFollower(uid: string): Promise<void> {
  const rt = await onBoardAccount();
  await rt.unfollow(uid, true);
  if (social) social.followers = social.followers.filter((p) => p.uid !== uid);
  paintDots();
}

/** Ask to be friends. If they already asked you, you're friends straight away. */
export async function askFriend(uid: string): Promise<'sent' | 'friends'> {
  const settings = getBoard();
  if (isFriend(uid, settings)) return 'friends';
  if (settings.friends.length >= MAX_FRIENDS) throw new Error(t('board.err.maxFriends', { n: MAX_FRIENDS }));
  const rt = await onBoardAccount();
  if (askedMe(uid)) {
    await acceptFriend(uid);
    return 'friends';
  }
  await rt.sendLink(uid, settings.name, 'ask');
  if (social && !isAsked(uid)) social.outgoing = [...social.outgoing, { uid, name: '', at: Date.now(), state: 'ask' }];
  paintDots();
  return 'sent';
}

/** Ask someone to be friends by their code. Returns what to say. */
export async function askFriendByCode(input: string): Promise<{ ok: boolean; message: string }> {
  const code = cleanCode(input);
  if (!code) return { ok: false, message: t('board.err.codeShape') };
  const settings = getBoard();
  if (code === settings.code) return { ok: false, message: t('board.err.ownCode') };
  const rt = await onBoardAccount();
  const uid = await rt.findFriendCode(code);
  if (!uid) return { ok: false, message: t('board.err.noCode') };
  if (isFriend(uid, settings)) return { ok: false, message: t('board.err.already') };
  if (isBlocked(uid, settings)) return { ok: false, message: t('board.err.blockedThem') };
  if (isAsked(uid)) return { ok: false, message: t('board.err.askedAlready') };
  const result = await askFriend(uid);
  return { ok: true, message: result === 'friends' ? t('board.nowFriends') : t('board.requestSent') };
}

export async function acceptFriend(uid: string): Promise<void> {
  const settings = getBoard();
  if (!isFriend(uid, settings)) {
    if (settings.friends.length >= MAX_FRIENDS) throw new Error(t('board.err.maxFriends', { n: MAX_FRIENDS }));
    setBoard({ friends: [...settings.friends, uid] });
  }
  const rt = await onBoardAccount();
  await rt.acceptLink(uid);
  if (social) social.incoming = social.incoming.filter((l) => l.uid !== uid);
  paintDots();
  await pushEntry();
}

/** Say no to a request. They aren't told. */
export async function declineFriend(uid: string): Promise<void> {
  const rt = await onBoardAccount();
  await rt.dropLink(uid, false);
  if (social) social.incoming = social.incoming.filter((l) => l.uid !== uid);
  paintDots();
}

/** No longer friends, on both sides (their app removes you when it next checks). */
export async function removeFriend(uid: string): Promise<void> {
  const settings = getBoard();
  setBoard({ friends: settings.friends.filter((f) => f !== uid) });
  await pushEntry();
  const rt = await onBoardAccount();
  await rt.sendLink(uid, settings.name, 'end');
}

/** Take back a request they haven't answered. */
export async function cancelAsk(uid: string): Promise<void> {
  const rt = await onBoardAccount();
  await rt.dropLink(uid, true);
  if (social) social.outgoing = social.outgoing.filter((l) => l.uid !== uid);
  paintDots();
}

// ---------- Blocking and reporting ----------

export function isBlocked(uid: string, settings = getBoard()): boolean {
  return settings.blocked.some((b) => b.uid === uid);
}

/** Leave out the people you blocked. */
export function withoutBlocked<T extends { uid: string }>(rows: T[], settings = getBoard()): T[] {
  if (!settings.blocked.length) return rows;
  const out = new Set(settings.blocked.map((b) => b.uid));
  return rows.filter((r) => !out.has(r.uid));
}

/**
 * Block someone: gone from your board, your friends and the people you follow, so they no
 * longer see a Friends-only row; their follow and any request between you are removed.
 */
export async function blockPerson(uid: string, name: string): Promise<void> {
  const settings = getBoard();
  if (isBlocked(uid, settings)) return;
  setBoard({
    blocked: [{ uid, name, at: Date.now() }, ...settings.blocked].slice(0, MAX_BLOCKED),
    friends: settings.friends.filter((f) => f !== uid),
    following: settings.following.filter((f) => f !== uid),
  });
  if (social) {
    social.followers = social.followers.filter((p) => p.uid !== uid);
    social.following = social.following.filter((f) => f !== uid);
    social.incoming = social.incoming.filter((l) => l.uid !== uid);
    social.outgoing = social.outgoing.filter((l) => l.uid !== uid);
  }
  paintDots();
  if (settings.friends.includes(uid)) await pushEntry();
  if (getAccount().user) await (await loadAccount()).cutTies(uid).catch(() => {});
}

export function unblockPerson(uid: string): void {
  setBoard({ blocked: getBoard().blocked.filter((b) => b.uid !== uid) });
}

/** Report a nickname. Once per person per week; the owner reviews reports in the Firebase console. */
export async function reportPerson(uid: string, name: string, reason: ReportReason): Promise<void> {
  const rt = await loadAccount();
  if (!getAccount().user) await rt.continueAsGuest();
  await waitForUser();
  await rt.reportBoardEntry(weekKey(), uid, name, reason);
}

/** Everyone in a league who shows to everyone, most minutes first. */
export async function loadLeague(tier: number): Promise<BoardEntry[]> {
  const rt = await loadAccount();
  const rows = withoutBlocked(await rt.boardLeague(weekKey(), tier));
  return rows.sort((a, b) => b.minutes - a.minutes || a.updatedAt - b.updatedAt);
}

/** You, your friends and the people you follow who have a row you can see this week, most minutes first. */
export async function loadFriends(): Promise<BoardEntry[]> {
  const uid = getAccount().user?.uid;
  if (!uid) return [];
  const rt = await loadAccount();
  const settings = getBoard();
  const people = [...new Set([uid, ...settings.friends, ...settings.following])];
  const rows = withoutBlocked(await rt.boardEntries(weekKey(), people));
  return rows.sort((a, b) => b.minutes - a.minutes || a.updatedAt - b.updatedAt);
}

function waitForUser(ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      stop();
      reject(new Error(t('board.err.guest')));
    }, ms);
    const stop = onAccountChange((s) => {
      if (!s.user) return;
      window.clearTimeout(timer);
      queueMicrotask(() => stop());
      resolve();
    });
  });
}

let started = false;

/**
 * Run on every page: keeps your row up to date when a session is saved here, or when
 * you sign in on a device where you had joined.
 */
export function startBoard(): void {
  // Each page draws its own nav, so its dot is set again on every page.
  paintDots();
  if (started) return;
  started = true;
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void pushEntry().catch(() => {}), 2000);
  };
  subscribe('sessions', schedule);
  let lastUid: string | null = null;
  onAccountChange((s) => {
    const uid = s.user?.uid ?? null;
    if (uid !== lastUid) {
      social = null;
      if (uid && getBoard().joined) {
        schedule();
        void refreshSocial(true).catch(() => {});
      } else paintDots();
    }
    lastUid = uid;
  });
  // Coming back to the app (or the tab) checks for new followers and requests.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshSocial().catch(() => {});
  });
}
