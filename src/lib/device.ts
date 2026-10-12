/**
 * The Android app's native side (android/…/DevicePlugin.java): the timer's notifications,
 * the home-screen widgets and where a notification or widget asked to go. On the site
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

interface DevicePlugin {
  showTimer(options: { ongoing: TimerOngoing | null; alerts: TimerAlert[] }): Promise<void>;
  clearTimer(): Promise<void>;
  notificationState(): Promise<{ granted: boolean }>;
  requestNotifications(): Promise<{ granted: boolean }>;
  setWidgets(data: WidgetData): Promise<void>;
  takeRoute(): Promise<{ route: string | null }>;
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
export const takeRoute = () => call<string | null>(async (p) => (await p.takeRoute()).route, null);
