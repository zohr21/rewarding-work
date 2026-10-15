/**
 * The Android app's native side (android/…/DevicePlugin.java): the timer's notifications,
 * the home-screen widgets, where a notification or widget asked to go, and Health Connect. On the site
 * every call here does nothing, and Capacitor isn't even loaded.
 */
import { NATIVE_APP } from '../config/app';

/** `endAt` counts down to that moment, `since` counts up from it; with neither the line stands still (paused). */
export interface TimerOngoing {
  title: string;
  text: string;
  endAt?: number;
  since?: number;
}

/** Said at `at`, when a phase ends in the background; `then` is the notification for the phase after it. */
export interface TimerAlert {
  at: number;
  title: string;
  text: string;
  then: TimerOngoing | null;
}

export interface WidgetData {
  firstUp: { id: string; title: string; done: number; total: number; next: string } | null;
  chain: { habit: string; days: string[] } | null;
}

export const HEALTH_KINDS = ['sleep', 'steps', 'exercise', 'heart', 'calories', 'activeCalories', 'distance'] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];

/** `available` is false before Android 14, which has no Health Connect of its own; each kind is true once allowed. */
export type HealthState = { available: boolean } & Record<HealthKind, boolean>;

/** One day from Health Connect. A field is missing when nothing was recorded or that kind isn't allowed. */
export interface BodyDay {
  day: string;
  sleepMin?: number;
  steps?: number;
  activeMin?: number;
  restingHr?: number;
  /** Everything burned that day, resting included, in kcal. */
  totalKcal?: number;
  /** Burned by moving, in kcal. */
  activeKcal?: number;
  /** Walked, run or cycled, in metres. */
  distanceM?: number;
}

export type BodyField = keyof Omit<BodyDay, 'day'>;

/** A notification from a bank app or bank SMS, as the phone kept it (BankInbox.java). */
export interface BankNotice {
  id: string;
  /** The app that posted it: the bank's app, or the SMS app. */
  pkg: string;
  app: string;
  /** True when it is an SMS; `title` is then the sender. */
  sms: boolean;
  title: string;
  text: string;
  /** When it was posted, epoch ms. */
  at: number;
}

/** `access`: Notification access is on for the app. `installed`: the apps asked about that are on the phone. */
export interface BankState {
  access: boolean;
  installed: { pkg: string; label: string }[];
}

export interface BankSources {
  apps: string[];
  sms: string[];
  senders: string[];
}

interface DevicePlugin {
  bankState(options: { packages: string[] }): Promise<BankState>;
  bankSettings(): Promise<void>;
  bankSources(options: BankSources): Promise<void>;
  bankPending(): Promise<{ items: BankNotice[] }>;
  bankSmsHistory(options: { senders: string[]; since: number }): Promise<{ items: BankNotice[] }>;
  bankAck(options: { ids: string[] }): Promise<void>;
  addListener(event: 'bankNotice', fn: (notice: BankNotice) => void): Promise<{ remove: () => Promise<void> }>;
  healthState(): Promise<HealthState>;
  healthConnect(options: { kinds: HealthKind[] }): Promise<HealthState>;
  healthRead(options: { days: number }): Promise<{ days: BodyDay[]; failed: Partial<Record<BodyField, string>> }>;
  healthSettings(): Promise<void>;
  showTimer(options: { ongoing: TimerOngoing | null; alerts: TimerAlert[] }): Promise<void>;
  clearTimer(): Promise<void>;
  notificationState(): Promise<{ granted: boolean }>;
  requestNotifications(): Promise<{ granted: boolean }>;
  setWidgets(data: WidgetData): Promise<void>;
  takeRoute(): Promise<{ route: string | null }>;
  googleSignIn(options: { clientId: string }): Promise<{ idToken: string }>;
}

// Wrapped in an object: Capacitor's plugin is a proxy that answers to any name, `then` included,
// so a promise of the bare plugin would try to call it as one and never settle.
const plugin: Promise<{ device: DevicePlugin }> | null = NATIVE_APP
  ? import('@capacitor/core').then((c) => ({ device: c.registerPlugin<DevicePlugin>('RewardDevice') }))
  : null;

/** Run `fn` on the plugin; `fallback` on the site, in a browser preview of the app build, or if the call fails. */
async function call<T>(fn: (p: DevicePlugin) => Promise<T>, fallback: T): Promise<T> {
  if (!plugin) return fallback;
  try {
    return await fn((await plugin).device);
  } catch {
    return fallback;
  }
}

export const showTimerNotice = (ongoing: TimerOngoing | null, alerts: TimerAlert[]) => void call((p) => p.showTimer({ ongoing, alerts }), undefined);
export const clearTimerNotice = () => void call((p) => p.clearTimer(), undefined);
/** null where there is no native side to ask. */
export const notificationsGranted = () => call<boolean | null>(async (p) => (await p.notificationState()).granted, null);
export const requestNotifications = () => call<boolean | null>(async (p) => (await p.requestNotifications()).granted, null);
export const setWidgets = (data: WidgetData) => void call((p) => p.setWidgets(data), undefined);
/** null where there is no native side to ask. */
export const healthState = () => call<HealthState | null>((p) => p.healthState(), null);
export const healthConnect = (kinds: HealthKind[]) => call<HealthState | null>((p) => p.healthConnect({ kinds }), null);
/**
 * The last `days` days, and the fields Health Connect would not answer for this time (it only
 * answers while the app is on screen). null where there is no native side, or the call failed.
 */
export const healthRead = (days: number) => call<{ days: BodyDay[]; failed: Partial<Record<BodyField, string>> } | null>((p) => p.healthRead({ days }), null);
export const openHealthSettings = () => void call((p) => p.healthSettings(), undefined);
export const takeRoute = () => call<string | null>(async (p) => (await p.takeRoute()).route, null);

/**
 * Opens Google's account picker and gives back the ID token to sign in to Firebase with.
 * Unlike the calls above it throws (code `google/cancelled` or `google/unavailable`), so the page can say why.
 */
export async function googleIdToken(clientId: string): Promise<string> {
  if (!plugin) throw Object.assign(new Error('No native side.'), { code: 'google/unavailable' });
  return (await (await plugin).device.googleSignIn({ clientId })).idToken;
}

/** null where there is no native side to ask. */
export const bankState = (packages: string[]) => call<BankState | null>((p) => p.bankState({ packages }), null);
export const openBankSettings = () => void call((p) => p.bankSettings(), undefined);
export const setBankSources = (sources: BankSources) => call((p) => p.bankSources(sources), undefined);
export const bankPending = () => call<BankNotice[]>(async (p) => (await p.bankPending()).items, []);
/**
 * Past SMS from the bank senders since `since`, oldest first. Asks for SMS access the first time.
 * Throws with code `sms/denied` when it is refused, so the page can say so; null where there is no native side.
 */
export async function bankSmsHistory(senders: string[], since: number): Promise<BankNotice[] | null> {
  if (!plugin) return null;
  return (await (await plugin).device.bankSmsHistory({ senders, since })).items;
}
export const bankAck = (ids: string[]) => call((p) => p.bankAck({ ids }), undefined);

/** Calls `fn` with each alert as it comes while the app is open. Returns the way to stop. */
export function onBankNotice(fn: (notice: BankNotice) => void): () => void {
  let stop: (() => void) | null = null;
  let stopped = false;
  void call(async (p) => {
    const handle = await p.addListener('bankNotice', fn);
    if (stopped) void handle.remove();
    else stop = () => void handle.remove();
  }, undefined);
  return () => {
    stopped = true;
    stop?.();
  };
}
