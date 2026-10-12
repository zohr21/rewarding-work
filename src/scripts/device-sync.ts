/**
 * Keeps the Android app's home-screen widgets in step with your data, and goes where a
 * notification or widget asked to go when it opened the app. Loaded only in the app
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

export function mountDeviceSync(): () => void {
  const c = cleanups();
  sendWidgets();
  c.add(subscribe('tasks', sendWidgets));
  c.add(subscribe('chain', sendWidgets));
  void followRoute();
  // Coming back to the app from a widget or notification, while it was already open.
  c.add(listen(document, 'visibilitychange', () => document.visibilityState === 'visible' && void followRoute()));
  return c.run;
}
