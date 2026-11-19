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
 * Friends are people whose code you added; with "Friends only" only they see you.
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
  /** Account ids of the people whose code you added. */
  friends: string[];
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
export const MAX_BLOCKED = 200;
export const REPORTS_TO_HIDE = 3;

const EMPTY: BoardSettings = { joined: false, name: '', visibility: 'all', code: '', friends: [], blocked: [], hiddenName: '', agreedAt: 0 };

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

function normalise(v: unknown): BoardSettings {
  if (typeof v !== 'object' || v === null) return EMPTY;
  const o = v as Record<string, unknown>;
  return {
    joined: o.joined === true,
    name: typeof o.name === 'string' ? o.name : '',
    visibility: o.visibility === 'friends' ? 'friends' : 'all',
    code: typeof o.code === 'string' ? o.code : '',
    friends: Array.isArray(o.friends) ? o.friends.filter((f): f is string => typeof f === 'string').slice(0, MAX_FRIENDS) : [],
    // Added in November 2026 for the Play version; older settings have none of these.
    blocked: normaliseBlocked(o.blocked),
    hiddenName: typeof o.hiddenName === 'string' ? o.hiddenName : '',
    agreedAt: typeof o.agreedAt === 'number' ? o.agreedAt : 0,
  };
}

export function getBoard(): BoardSettings {
  return normalise(read<unknown>('board', null));
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
}

/** Leave: your rows for this week and last are removed. */
export async function leaveBoard(): Promise<void> {
  setBoard({ joined: false });
  if (!getAccount().user) return;
  const rt = await loadAccount();
  const now = new Date();
  await rt.removeBoardEntries([weekKey(now), weekKey(addDays(startOfDay(now), -7))]);
}

/** Add a friend by their code. Returns a problem to show, or null when added. */
export async function addFriend(input: string): Promise<string | null> {
  const code = cleanCode(input);
  if (!code) return t('board.err.codeShape');
  const settings = getBoard();
  if (code === settings.code) return t('board.err.ownCode');
  if (settings.friends.length >= MAX_FRIENDS) return t('board.err.maxFriends', { n: MAX_FRIENDS });
  const rt = await loadAccount();
  const uid = await rt.findFriendCode(code);
  if (!uid) return t('board.err.noCode');
  if (settings.friends.includes(uid)) return t('board.err.already');
  setBoard({ friends: [...settings.friends, uid] });
  await pushEntry();
  return null;
}

export async function removeFriend(uid: string): Promise<void> {
  setBoard({ friends: getBoard().friends.filter((f) => f !== uid) });
  await pushEntry();
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

/** Block someone: gone from your board, and from your friends, so they no longer see a Friends-only row. */
export async function blockPerson(uid: string, name: string): Promise<void> {
  const settings = getBoard();
  if (isBlocked(uid, settings)) return;
  setBoard({
    blocked: [{ uid, name, at: Date.now() }, ...settings.blocked].slice(0, MAX_BLOCKED),
    friends: settings.friends.filter((f) => f !== uid),
  });
  if (settings.friends.includes(uid)) await pushEntry();
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

/** You and your friends who have a row this week, most minutes first. */
export async function loadFriends(): Promise<BoardEntry[]> {
  const uid = getAccount().user?.uid;
  if (!uid) return [];
  const rt = await loadAccount();
  const rows = withoutBlocked(await rt.boardEntries(weekKey(), [uid, ...getBoard().friends]));
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
    if (uid && uid !== lastUid && getBoard().joined) schedule();
    lastUid = uid;
  });
}
