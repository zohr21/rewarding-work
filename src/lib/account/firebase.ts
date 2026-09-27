/**
 * Accounts and sync, on Firebase (Authentication + Firestore). Loaded on demand by
 * src/lib/account/state.ts — never import this module directly from a page.
 *
 * How sync works
 *  - localStorage stays the source the widgets read, so the site works offline and
 *    for people who never sign in.
 *  - Each synced store is one Firestore document: users/{uid}/stores/{name} =
 *    { data: <the same JSON text as localStorage>, updatedAt }.
 *  - A local change marks the store "dirty" (persisted in rw:v1:sync) and is sent
 *    a moment later. When the account's copy changes (another device), it replaces
 *    the local one — unless this device has unsent changes, then the two are merged
 *    (src/lib/account/merge.ts) and the result is sent back.
 *  - First sign-in on a device that already has data: everything counts as dirty,
 *    so it's merged into the account instead of being overwritten.
 */
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  connectAuthEmulator,
  getAuth,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updatePassword,
  type Auth,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocs, getFirestore, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, USE_EMULATOR } from '../../config/firebase';
import {
  SYNCED_STORES,
  getSyncMeta,
  isSyncedStore,
  onWrite,
  readJson,
  setSyncMeta,
  writeJsonFromSync,
  type SyncedStore,
} from '../storage';
import { errorCode, friendlyError } from './errors';
import { mergeJson } from './merge';
import { getAccount, setAccount, type AccountUser } from './state';

let auth: Auth;
let db: Firestore;
let started = false;

export function init(): void {
  if (started) return;
  started = true;
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
  if (USE_EMULATOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  onAuthStateChanged(auth, handleUser);
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  // Leaving the page: send what's waiting (best effort; anything unsent stays dirty for next time).
  window.addEventListener('pagehide', () => void flushNow());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flushNow());
}

function summarize(user: User): AccountUser {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    providers: user.providerData.map((p) => p.providerId),
    name: user.displayName,
  };
}

function publishUser(): void {
  const user = auth.currentUser;
  setAccount({ ready: true, user: user ? summarize(user) : null });
}

function handleUser(user: User | null): void {
  if (!user) {
    stopSync();
    const meta = getSyncMeta();
    // Signed out (here, in another tab, or the session ended). The data stays marked
    // as belonging to that account, so a different account never gets mixed into it.
    if (meta.active) setSyncMeta({ ...meta, active: false });
    setAccount({ ready: true, user: null, sync: 'idle', syncError: null });
    return;
  }
  const meta = getSyncMeta();
  if (!meta.active) setSyncMeta({ ...meta, active: true });
  publishUser();
  startSync(user.uid);
}

// ---------- Sync engine ----------

const SEND_DELAY = 1500;

let syncUid: string | null = null;
let stopFns: (() => void)[] = [];
const timers = new Map<SyncedStore, number>();
/** Bumped on every local change, so a slow upload doesn't clear a newer change's dirty flag. */
const versions = new Map<SyncedStore, number>();
let inFlight = 0;

const storeRef = (uid: string, name: string) => doc(db, 'users', uid, 'stores', name);

function isDirty(name: SyncedStore): boolean {
  return getSyncMeta().dirty.includes(name);
}

function addDirty(name: SyncedStore): void {
  const meta = getSyncMeta();
  if (!meta.dirty.includes(name)) setSyncMeta({ ...meta, dirty: [...meta.dirty, name] });
}

function clearDirty(name: SyncedStore): void {
  const meta = getSyncMeta();
  if (meta.dirty.includes(name)) setSyncMeta({ ...meta, dirty: meta.dirty.filter((d) => d !== name) });
}

function localStores(): SyncedStore[] {
  return SYNCED_STORES.filter((name) => readJson(name) !== null);
}

function updateStatus(): void {
  if (!syncUid) return;
  const waiting = inFlight > 0 || getSyncMeta().dirty.length > 0;
  const current = getAccount();
  if (current.sync === 'error' && waiting) return; // keep showing the error until something succeeds
  setAccount({ sync: !navigator.onLine && waiting ? 'offline' : waiting ? 'saving' : 'synced' });
}

function schedule(name: SyncedStore, delay = SEND_DELAY): void {
  window.clearTimeout(timers.get(name));
  timers.set(name, window.setTimeout(() => void send(name), delay));
}

async function send(name: SyncedStore): Promise<void> {
  timers.delete(name);
  const uid = syncUid;
  if (!uid) return;
  const version = versions.get(name) ?? 0;
  const json = readJson(name);
  inFlight++;
  updateStatus();
  try {
    if (json === null) await deleteDoc(storeRef(uid, name));
    else await setDoc(storeRef(uid, name), { data: json, updatedAt: Date.now() });
    if (syncUid === uid && (versions.get(name) ?? 0) === version) clearDirty(name);
    setAccount({ lastSynced: Date.now(), syncError: null, sync: 'saving' });
  } catch (err) {
    setAccount({ sync: 'error', syncError: friendlyError(err) });
  } finally {
    inFlight--;
    updateStatus();
  }
}

/** Compare the account's copy of one store with this device's, and settle the difference. */
function reconcile(name: SyncedStore, remote: string | null): void {
  const local = readJson(name);
  if (isDirty(name)) {
    const merged = remote === null ? local : mergeJson(name, local, remote);
    if (merged !== local) writeJsonFromSync(name, merged);
    if (merged === remote) clearDirty(name);
    else schedule(name, 0);
  } else if (remote !== local) {
    // Changed (or deleted) on another device, nothing unsent here: take the account's copy.
    writeJsonFromSync(name, remote);
  }
}

function startSync(uid: string): void {
  if (syncUid === uid) return;
  stopSync();
  syncUid = uid;

  const meta = getSyncMeta();
  if (meta.uid !== uid) {
    if (meta.uid) {
      // This browser holds another account's data: don't mix it into this one.
      SYNCED_STORES.forEach((name) => writeJsonFromSync(name, null));
      setSyncMeta({ uid, active: true, dirty: [] });
    } else {
      // Data made before signing in (or as a guest being replaced): merge it into the account.
      setSyncMeta({ uid, active: true, dirty: localStores() });
    }
  }

  stopFns.push(
    onWrite((name) => {
      if (!isSyncedStore(name) || !syncUid) return;
      versions.set(name, (versions.get(name) ?? 0) + 1);
      addDirty(name);
      schedule(name);
      updateStatus();
    }),
  );

  setAccount({ sync: 'saving', syncError: null });
  let first = true;
  stopFns.push(
    onSnapshot(
      collection(db, 'users', uid, 'stores'),
      { includeMetadataChanges: true },
      (snap) => {
        if (first && snap.metadata.fromCache) return; // wait for the server's answer before comparing
        const remote = new Map(snap.docs.map((d) => [d.id, d]));
        const names = first
          ? [...SYNCED_STORES]
          : [...new Set(snap.docChanges().map((c) => c.doc.id))].filter(isSyncedStore);
        first = false;
        for (const name of names) {
          const d = remote.get(name);
          if (d?.metadata.hasPendingWrites) continue; // our own write on its way
          const data = d?.get('data');
          reconcile(name, typeof data === 'string' ? data : null);
        }
        if (!snap.metadata.fromCache) setAccount({ lastSynced: Date.now(), syncError: null });
        updateStatus();
      },
      (err) => setAccount({ sync: 'error', syncError: friendlyError(err) }),
    ),
  );
}

function stopSync(): void {
  stopFns.splice(0).forEach((fn) => fn());
  timers.forEach((t) => window.clearTimeout(t));
  timers.clear();
  syncUid = null;
}

/** Send every waiting change now. */
function flushNow(): Promise<void> {
  if (!syncUid) return Promise.resolve();
  timers.forEach((t) => window.clearTimeout(t));
  timers.clear();
  return Promise.all(getSyncMeta().dirty.map((name) => send(name))).then(() => undefined);
}

/** Send waiting changes; true if everything reached the account within `ms`. */
async function flush(ms = 6000): Promise<boolean> {
  await Promise.race([flushNow(), new Promise((r) => window.setTimeout(r, ms))]);
  return getSyncMeta().dirty.length === 0;
}

async function deleteCloudData(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, 'stores'));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/** Forget this device's copy of the synced data (after sign-out or account deletion). */
function clearLocal(): void {
  setSyncMeta({ uid: null, active: false, dirty: [] });
  SYNCED_STORES.forEach((name) => writeJsonFromSync(name, null));
}

// ---------- Actions (used by the account page) ----------

const google = () => new GoogleAuthProvider();

/**
 * Leave the current guest account for an existing one. The guest account and its
 * cloud copy are deleted first; its data stays in this browser and is merged into
 * the account you sign in to. If signing in fails, you're signed out with the data
 * still here, and can try again or start a new guest account.
 */
async function leaveGuest(signIn: () => Promise<unknown>): Promise<void> {
  const guest = auth.currentUser;
  if (guest?.isAnonymous) {
    await flush(3000);
    stopSync();
    setSyncMeta({ uid: null, active: false, dirty: localStores() });
    await deleteCloudData(guest.uid).catch(() => {});
    await deleteUser(guest).catch(() => fbSignOut(auth));
  }
  await signIn();
}

export async function continueAsGuest(): Promise<void> {
  await signInAnonymously(auth);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await leaveGuest(() => signInWithEmailAndPassword(auth, email, password));
}

/** New account — or, for a guest, turn the guest account into an email account (same data, same id). */
export async function createWithEmail(email: string, password: string): Promise<void> {
  const user = auth.currentUser;
  const result = user?.isAnonymous
    ? await linkWithCredential(user, EmailAuthProvider.credential(email, password))
    : await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(result.user).catch(() => {});
  await result.user.reload();
  publishUser();
}

export async function continueWithGoogle(): Promise<void> {
  const user = auth.currentUser;
  if (!user?.isAnonymous) {
    await signInWithPopup(auth, google());
    return;
  }
  // Guest: keep the same account and just attach Google to it…
  try {
    await linkWithPopup(user, google());
    await user.reload();
    publishUser();
  } catch (err) {
    // …unless that Google account already has an account here: switch to it and bring the data along.
    if (errorCode(err) !== 'auth/credential-already-in-use') throw err;
    const credential: AuthCredential | null = GoogleAuthProvider.credentialFromError(err as never);
    if (!credential) throw err;
    await leaveGuest(() => signInWithCredential(auth, credential));
  }
}

/** Connect Google to an email account, so either can be used to sign in. */
export async function linkGoogle(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await linkWithPopup(user, google());
  await user.reload();
  publishUser();
}

/** Always "succeeds", so the page can't be used to find out which emails have accounts. */
export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    const code = errorCode(err);
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') throw err;
  }
}

export async function resendVerification(): Promise<void> {
  const user = auth.currentUser;
  if (user) await sendEmailVerification(user);
}

/** Re-read the account (e.g. after clicking the verification link in another tab). */
export async function refreshUser(): Promise<void> {
  await auth.currentUser?.reload();
  publishUser();
}

async function reauthenticate(user: User, password?: string): Promise<void> {
  const providers = user.providerData.map((p) => p.providerId);
  if (password && user.email && providers.includes('password')) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else if (providers.includes('google.com')) {
    await reauthenticateWithPopup(user, google());
  } else if (providers.includes('password')) {
    throw Object.assign(new Error('Enter your current password.'), { code: 'auth/missing-password' });
  }
  // Guests have nothing to confirm.
}

export async function changePassword(current: string, next: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await reauthenticate(user, current);
  await updatePassword(user, next);
}

/**
 * Sign out on this device. Waiting changes are sent first; unless `force`, returns
 * false (and stays signed in) if they couldn't be sent. This device's copy is then
 * removed — it's safe in the account.
 */
export async function signOut(force = false): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return true;
  if (user.isAnonymous) throw new Error("Guest accounts can't sign in again — delete it instead, or save it with an email first.");
  if (!(await flush()) && !force) return false;
  stopSync();
  clearLocal();
  await fbSignOut(auth);
  return true;
}

/** Delete the account, everything stored in it, and this device's copy. */
export async function deleteAccount(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await reauthenticate(user, password);
  stopSync();
  try {
    await deleteCloudData(user.uid);
    await deleteUser(user);
  } catch (err) {
    // A guest can't confirm their identity again, so an old guest session may not be
    // allowed to delete itself. Its data is already gone; signing out finishes the job.
    if (user.isAnonymous && errorCode(err) === 'auth/requires-recent-login') {
      clearLocal();
      await fbSignOut(auth);
      return;
    }
    // Nothing is lost: sync starts again and puts the data back into the account.
    setSyncMeta({ uid: user.uid, active: true, dirty: localStores() });
    startSync(user.uid);
    throw err;
  }
  clearLocal();
}
