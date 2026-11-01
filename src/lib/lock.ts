/**
 * The Budget lock: ask before showing your money. In the app it is the phone's own unlock
 * (fingerprint, face or the phone's PIN, src/lib/device.ts); on the site a 4–6 digit PIN kept
 * as a slow salted hash (PBKDF2). Both are kept per device and never synced: a short PIN's
 * hash in the account could be guessed offline in moments.
 *
 * This keeps Budget from a glance at an open screen. The data itself is not encrypted on the
 * device; the account sign-in and the phone's own lock are what protect it.
 *
 * Whether it is open now is kept in sessionStorage, so closing the tab (or restarting the app)
 * locks it again, and so does being away longer than `after`. The inline script in
 * BudgetLock.astro repeats `isOpen` before the page paints, so nothing shows first.
 */
import { read, write } from './storage';

export type LockMode = 'off' | 'device' | 'pin';

export interface LockStore {
  mode: LockMode;
  /** Seconds away before it locks again; 0 locks as soon as you leave. */
  after: number;
  /** Open Budget with amounts hidden. */
  hideOnOpen: boolean;
  pin: { salt: string; hash: string; iterations: number } | null;
  /** Wrong PINs left before only "Forgot PIN" is offered. */
  tries: number;
}

export const AFTER_CHOICES = [0, 60, 300, 900] as const;
export const MAX_TRIES = 5;
export const PIN_MIN = 4;
export const PIN_MAX = 6;
const ITERATIONS = 210_000;

const DEFAULTS: LockStore = { mode: 'off', after: 300, hideOnOpen: false, pin: null, tries: MAX_TRIES };

/** Session keys, read by the inline script in BudgetLock.astro too. */
export const OPEN_KEY = 'rw:lock:open';
export const HIDE_KEY = 'rw:lock:hide';

function isLockStore(v: unknown): v is Partial<LockStore> {
  return typeof v === 'object' && v !== null;
}

export function getLock(): LockStore {
  const v = read<Partial<LockStore>>('lock', {}, isLockStore);
  const mode: LockMode = v.mode === 'device' || v.mode === 'pin' ? v.mode : 'off';
  const pin =
    v.pin && typeof v.pin.salt === 'string' && typeof v.pin.hash === 'string' && typeof v.pin.iterations === 'number' ? v.pin : null;
  return {
    // A PIN lock without a PIN is no lock.
    mode: mode === 'pin' && !pin ? 'off' : mode,
    after: (AFTER_CHOICES as readonly number[]).includes(v.after as number) ? (v.after as number) : DEFAULTS.after,
    hideOnOpen: v.hideOnOpen === true,
    pin,
    tries: typeof v.tries === 'number' ? Math.max(0, Math.min(MAX_TRIES, v.tries)) : MAX_TRIES,
  };
}

export function setLock(patch: Partial<LockStore>): LockStore {
  const next = { ...getLock(), ...patch };
  write('lock', next);
  return next;
}

// ---------- Open or locked, this session ----------

interface OpenState {
  /** When you left Budget (or the app), or null while you are on it. */
  awayAt: number | null;
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readOpen(): OpenState | null {
  try {
    const v = JSON.parse(session()?.getItem(OPEN_KEY) ?? 'null') as OpenState | null;
    return v && (v.awayAt === null || typeof v.awayAt === 'number') ? v : null;
  } catch {
    return null;
  }
}

/** Unlocked and not away for longer than the lock allows. */
export function isOpen(lock = getLock(), now = Date.now()): boolean {
  if (lock.mode === 'off') return true;
  const open = readOpen();
  if (!open) return false;
  return open.awayAt === null || now - open.awayAt <= lock.after * 1000;
}

export function markOpen(): void {
  session()?.setItem(OPEN_KEY, JSON.stringify({ awayAt: null } satisfies OpenState));
}

/** Leaving Budget or the app: the time away starts now. */
export function markAway(): void {
  const open = readOpen();
  if (open && open.awayAt === null) session()?.setItem(OPEN_KEY, JSON.stringify({ awayAt: Date.now() } satisfies OpenState));
}

export function lockNow(): void {
  session()?.removeItem(OPEN_KEY);
}

// ---------- Hide amounts, this session ----------

export function amountsHidden(lock = getLock()): boolean {
  const v = session()?.getItem(HIDE_KEY);
  return v === null || v === undefined ? lock.hideOnOpen : v === '1';
}

export function setAmountsHidden(hidden: boolean): void {
  session()?.setItem(HIDE_KEY, hidden ? '1' : '0');
}

// ---------- The PIN ----------

export const isPin = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function hashPin(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return toBase64(new Uint8Array(bits));
}

/** Turns the PIN lock on with this PIN; you stay unlocked. */
export async function setPin(pin: string): Promise<void> {
  if (!isPin(pin)) throw new Error(`A PIN is ${PIN_MIN} to ${PIN_MAX} digits.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  setLock({ mode: 'pin', pin: { salt: toBase64(salt), hash: await hashPin(pin, salt, ITERATIONS), iterations: ITERATIONS }, tries: MAX_TRIES });
  markOpen();
}

/** True and open on the right PIN; a wrong one uses up a try. */
export async function checkPin(pin: string): Promise<boolean> {
  const lock = getLock();
  if (!lock.pin || lock.tries <= 0) return false;
  const ok = (await hashPin(pin, fromBase64(lock.pin.salt), lock.pin.iterations)) === lock.pin.hash;
  setLock({ tries: ok ? MAX_TRIES : lock.tries - 1 });
  if (ok) markOpen();
  return ok;
}

/** After you confirm who you are (Forgot PIN): the PIN goes, Budget opens, and you can set a new one. */
export function forgetPin(): void {
  setLock({ mode: 'off', pin: null, tries: MAX_TRIES });
  markOpen();
}
