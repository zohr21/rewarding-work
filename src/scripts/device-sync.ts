/**
 * Keeps the Android app's home-screen widgets in step with your data, goes where a
 * notification or widget asked to go when it opened the app, and answers Android's Back key. Loaded only in the app
 * (AppNav.astro); the native side is src/lib/device.ts.
 */
import { getChains, getTasks, subscribe } from '../lib/storage';
import { todayTasks } from '../lib/tasks';
import { setWidgets, takeRoute } from '../lib/device';
import { cleanups, listen } from '../lib/page';
import { url } from '../lib/paths';

/** Enough days for the widget to work out the current run and this week. */
const CHAIN_DAYS = 400;

function sendWidgets(): void {
  const task = todayTasks(getTasks())[0];
  const chain = getChains()[0];
  setWidgets({
    firstUp: task
      ? {
          id: task.id,
          title: task.title || 'Untitled task',
          done: task.steps.filter((s) => s.done).length,
          total: task.steps.length,
          next: task.steps.find((s) => !s.done)?.text ?? '',
        }
      : null,
    chain: chain ? { habit: chain.habit, days: [...chain.days].sort().slice(-CHAIN_DAYS) } : null,
  });
}

/** "timer?task=t1" from a widget or notification: the page, with its query kept. */
async function followRoute(): Promise<void> {
  const route = await takeRoute();
  if (!route) return;
  const [page = '', query = ''] = route.split('?');
  if (!/^[a-z]+$/.test(page)) return;
  const target = url(`/${page}`) + (query ? `?${query}` : '');
  if (location.pathname + location.search !== target) location.assign(target);
}

/**
 * Android's Back key (MainActivity asks before it leaves the page): put away what is open
 * over the page. A sheet asks its form first, as a tap on its close button does. False
 * lets Android go back a page, or leave the app from the first one.
 */
function handleBack(): boolean {
  const top = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
  if (!top) return false;
  if (top.dispatchEvent(new Event('cancel', { cancelable: true }))) top.close();
  // A dialog that refuses to close (the Budget lock) must not trap Back; a sheet asking about unsaved changes may.
  return !top.open || top.matches('dialog.sheet');
}

export function mountDeviceSync(): () => void {
  const c = cleanups();
  (window as Window & { grovynBack?: () => boolean }).grovynBack = handleBack;
  sendWidgets();
  c.add(subscribe('tasks', sendWidgets));
  c.add(subscribe('chain', sendWidgets));
  void followRoute();
  // Coming back to the app from a widget or notification, while it was already open.
  c.add(listen(document, 'visibilitychange', () => document.visibilityState === 'visible' && void followRoute()));
  return c.run;
}
