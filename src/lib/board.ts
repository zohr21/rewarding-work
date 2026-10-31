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
 */
import { getAccount, loadAccount, onAccountChange } from './account/state';
import { addDays, dayKey, startOfDay, startOfWeek } from './dates';
import { TIER_NAMES } from './rewards';
import { sprigStage } from './sprig';
import { getSessions, read, subscribe, write, type FocusSession } from './storage';

export type Visibility = 'all' | 'friends';

export interface BoardSettings {
  joined: boolean;
  name: string;
  visibility: Visibility;
  /** Your friend code, e.g. OAK-7Q4K. Empty until you join. */
  code: string;
  /** Account ids of the people whose code you added. */
  friends: string[];
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
}

export const DAILY_CAP_MIN = 240;
export const WEEK_CAP_MIN = 7 * DAILY_CAP_MIN;
export const MAX_FRIENDS = 30;

const EMPTY: BoardSettings = { joined: false, name: '', visibility: 'all', code: '', friends: [] };

function normalise(v: unknown): BoardSettings {
  if (typeof v !== 'object' || v === null) return EMPTY;
  const o = v as Record<string, unknown>;
  return {
    joined: o.joined === true,
    name: typeof o.name === 'string' ? o.name : '',
    visibility: o.visibility === 'friends' ? 'friends' : 'all',
    code: typeof o.code === 'string' ? o.code : '',
    friends: Array.isArray(o.friends) ? o.friends.filter((f): f is string => typeof f === 'string').slice(0, MAX_FRIENDS) : [],
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

/** "Seed league", "Sapling league". */
export function leagueName(tier: number): string {
  return `${tier <= 0 ? 'Seed' : TIER_NAMES[Math.min(5, tier) - 1]} league`;
}

/** "8 h 30", "45 min". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** "2 d 14 h" until next Monday 00:00. */
export function resetsIn(now = new Date()): string {
  const next = addDays(startOfWeek(now), 7).getTime();
  const hours = Math.max(1, Math.ceil((next - now.getTime()) / 3_600_000));
  if (hours < 24) return `${hours} h`;
  return hours % 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${hours / 24} d`;
}

/** "Week of 27 Oct". */
export function weekLabel(now = new Date()): string {
  return `Week of ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(startOfWeek(now))}`;
}

const NAME_RE = /^[\p{L}\p{N}._-]{2,20}$/u;

/** Null when fine, otherwise what to fix. */
export function nicknameProblem(name: string): string | null {
  if (name.length < 2) return 'At least 2 characters.';
  if (name.length > 20) return '20 characters at most.';
  if (!NAME_RE.test(name)) return 'Letters, numbers, dots, dashes and underscores only.';
  return null;
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
  await rt.saveBoardEntry(weekKey(), myEntry(uid));
}

/** Join under `name`. Starts a guest account first when nobody is signed in. */
export async function joinBoard(name: string): Promise<void> {
  const rt = await loadAccount();
  if (!getAccount().user) await rt.continueAsGuest();
  await waitForUser();
  setBoard({ joined: true, name });
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
  if (!code) return 'A code looks like OAK-7Q4K.';
  const settings = getBoard();
  if (code === settings.code) return "That's your own code.";
  if (settings.friends.length >= MAX_FRIENDS) return `You can have ${MAX_FRIENDS} friends on the board.`;
  const rt = await loadAccount();
  const uid = await rt.findFriendCode(code);
  if (!uid) return 'No one has that code. Check it with your friend.';
  if (settings.friends.includes(uid)) return 'Already one of your friends.';
  setBoard({ friends: [...settings.friends, uid] });
  await pushEntry();
  return null;
}

export async function removeFriend(uid: string): Promise<void> {
  setBoard({ friends: getBoard().friends.filter((f) => f !== uid) });
  await pushEntry();
}

/** Everyone in a league who shows to everyone, most minutes first. */
export async function loadLeague(tier: number): Promise<BoardEntry[]> {
  const rt = await loadAccount();
  const rows = await rt.boardLeague(weekKey(), tier);
  return rows.sort((a, b) => b.minutes - a.minutes || a.updatedAt - b.updatedAt);
}

/** You and your friends who have a row this week, most minutes first. */
export async function loadFriends(): Promise<BoardEntry[]> {
  const uid = getAccount().user?.uid;
  if (!uid) return [];
  const rt = await loadAccount();
  const rows = await rt.boardEntries(weekKey(), [uid, ...getBoard().friends]);
  return rows.sort((a, b) => b.minutes - a.minutes || a.updatedAt - b.updatedAt);
}

function waitForUser(ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      stop();
      reject(new Error("Couldn't start a guest account. Check your connection."));
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
