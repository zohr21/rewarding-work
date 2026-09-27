/**
 * Account state shared by the header button and the account page.
 *
 * This module is tiny and has no Firebase code. The Firebase SDK (src/lib/account/firebase.ts)
 * is only downloaded when someone is signed in on this device, or opens the account page.
 */
import { ACCOUNTS_ENABLED } from '../../config/firebase';
import { getSyncMeta, subscribe } from '../storage';

export interface AccountUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  /** 'password' and/or 'google.com'. Empty for guests. */
  providers: string[];
  name: string | null;
}

/** saving: changes waiting to be sent. offline: they'll be sent when you're back online. */
export type SyncStatus = 'idle' | 'saving' | 'synced' | 'offline' | 'error';

export interface AccountState {
  enabled: boolean;
  /** False until we know whether someone is signed in. */
  ready: boolean;
  user: AccountUser | null;
  sync: SyncStatus;
  lastSynced: number | null;
  /** Human-readable reason when sync is 'error'. */
  syncError: string | null;
}

let state: AccountState = {
  enabled: ACCOUNTS_ENABLED,
  ready: false,
  user: null,
  sync: 'idle',
  lastSynced: null,
  syncError: null,
};

const listeners = new Set<(s: AccountState) => void>();

export function getAccount(): AccountState {
  return state;
}

export function setAccount(patch: Partial<AccountState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

/** Called now and on every change. Returns an unsubscribe function. */
export function onAccountChange(fn: (s: AccountState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

type Runtime = typeof import('./firebase');
let runtime: Promise<Runtime> | null = null;

/** Load Firebase and start listening for sign-in changes (once). */
export function loadAccount(): Promise<Runtime> {
  if (!ACCOUNTS_ENABLED) return Promise.reject(new Error('Accounts are not configured.'));
  runtime ??= import('./firebase').then((m) => {
    m.init();
    return m;
  });
  return runtime;
}

let watching = false;

/**
 * Run on every page. Loads the account code only if someone is signed in here;
 * otherwise reports "signed out" straight away without downloading anything.
 */
export function startAccount(): void {
  if (!ACCOUNTS_ENABLED) {
    setAccount({ ready: true });
    return;
  }
  if (getSyncMeta().active) {
    loadAccount().catch(() => setAccount({ ready: true, sync: 'error', syncError: "Couldn't load the account code." }));
  } else if (!runtime) {
    setAccount({ ready: true });
  }
  // Signed in from another tab: start syncing here too, so this tab's changes aren't missed.
  if (!watching) {
    watching = true;
    subscribe('sync', () => getSyncMeta().active && void loadAccount().catch(() => {}), { otherTabsOnly: true });
  }
}
