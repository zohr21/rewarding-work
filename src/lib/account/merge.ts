/**
 * How this device's data and your account's data are combined when both changed
 * (first sign-in on a device with data, or edits made while offline). Nothing is lost:
 * lists are joined by id / day (a removal on either side wins); for single settings
 * this device's value wins.
 */
import {
  isChain,
  isDoneItem,
  mergeChains,
  isFocusSession,
  mergeDoneLists,
  mergeExamStores,
  mergeTaskStores,
  normaliseExam,
  normaliseTasks,
  type FocusSession,
  type SyncedStore,
} from '../storage';

function parse(json: string | null): unknown {
  if (json === null) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map(a.map((x) => [x.id, x]));
  b.forEach((x) => map.has(x.id) || map.set(x.id, x));
  return [...map.values()];
}

const list = <T>(v: unknown, guard: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(guard) : []);

/** Merge two stored JSON values of `name`. Returns JSON text (null only if both are empty). */
export function mergeJson(name: SyncedStore, localJson: string | null, remoteJson: string | null): string | null {
  // Retired: its content now lives in `tasks`, so the removal always wins.
  if (name === 'breakdown') return null;
  const local = parse(localJson);
  const remote = parse(remoteJson);
  if (local === undefined) return remote === undefined ? null : remoteJson;
  if (remote === undefined) return localJson;

  switch (name) {
    case 'sessions': {
      const all = unionById<FocusSession>(list(local, isFocusSession), list(remote, isFocusSession));
      return JSON.stringify(all.sort((x, y) => x.start - y.start));
    }
    case 'done': {
      return JSON.stringify(mergeDoneLists(list(local, isDoneItem), list(remote, isDoneItem)));
    }
    case 'chain': {
      if (!isChain(local)) return remoteJson;
      if (!isChain(remote)) return localJson;
      return JSON.stringify(mergeChains(local, remote));
    }
    case 'tasks':
      return JSON.stringify(mergeTaskStores(normaliseTasks(local), normaliseTasks(remote)));
    case 'exam':
      return JSON.stringify(mergeExamStores(normaliseExam(local), normaliseExam(remote)));
    default:
      return localJson;
  }
}
