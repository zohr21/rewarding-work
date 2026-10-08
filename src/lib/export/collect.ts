/**
 * What an export contains: the stored data, narrowed to the kinds and the time range
 * chosen in the export dialog. Pure — the caller passes the stored data in.
 */
import { addDays, dayKey, formatShort, startOfDay, startOfWeek, type DayKey } from '../dates';
import { chainsOf, type Chain, type ChainEntry, type DoneItem, type FocusSession, type Task } from '../storage';

export type ExportRange = 'week' | '30d' | 'all';

export interface ExportOptions {
  tasks: boolean;
  /** Task notes and session logs. */
  notes: boolean;
  sessions: boolean;
  done: boolean;
  chain: boolean;
  range: ExportRange;
}

export interface ExportSource {
  tasks: Task[];
  sessions: FocusSession[];
  done: DoneItem[];
  chain: Chain;
}

export interface ExportData {
  options: ExportOptions;
  now: Date;
  /** Start of the range, or null for all time. */
  from: Date | null;
  /** "28 Sep – 4 Oct 2026", "Last 30 days", "All time". */
  rangeLabel: string;
  /** Open and finished tasks (all of them: a task isn't tied to a date). Empty if not included. */
  tasks: Task[];
  /** Every session, for focus time per task. */
  allSessions: FocusSession[];
  /** Sessions, done items and chain days inside the range, oldest first. Empty if not included. */
  sessions: FocusSession[];
  done: DoneItem[];
  /** One entry per marked day of each chain. */
  chainDays: { day: DayKey; habit: string }[];
  /** Every chain, whatever the range. */
  chains: ChainEntry[];
  chain: Chain;
}

const yearFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const RANGE_LABELS: Record<ExportRange, string> = { week: 'This week', '30d': 'Last 30 days', all: 'All time' };

export function rangeStart(range: ExportRange, now: Date): Date | null {
  if (range === 'week') return startOfWeek(now);
  if (range === '30d') return addDays(startOfDay(now), -29);
  return null;
}

export function collect(source: ExportSource, options: ExportOptions, now = new Date()): ExportData {
  const from = rangeStart(options.range, now);
  const since = from?.getTime() ?? -Infinity;
  const fromKey = from ? dayKey(from) : '';
  const chains = chainsOf(source.chain);
  const rangeLabel =
    options.range === 'week' ? `${formatShort(from!)} – ${yearFmt.format(addDays(from!, 6))}` : RANGE_LABELS[options.range];
  return {
    options,
    now,
    from,
    rangeLabel,
    tasks: options.tasks ? [...source.tasks].sort((a, b) => a.createdAt - b.createdAt) : [],
    allSessions: source.sessions,
    sessions: options.sessions ? source.sessions.filter((s) => s.start >= since).sort((a, b) => a.start - b.start) : [],
    done: options.done ? source.done.filter((d) => d.deletedAt === undefined && d.doneAt >= since).sort((a, b) => a.doneAt - b.doneAt) : [],
    chainDays: options.chain
      ? chains
          .flatMap((c) => c.days.filter((k) => k >= fromKey).map((day) => ({ day, habit: c.habit })))
          .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
      : [],
    chains,
    chain: source.chain,
  };
}

/** The days a per-day table or chart covers: the range, or for "all time" from the first session (at most `cap` days). */
export function exportDays(data: ExportData, cap = 400): Date[] {
  const today = startOfDay(data.now);
  const first = data.from ?? (data.sessions[0] ? startOfDay(data.sessions[0].start) : today);
  const days: Date[] = [];
  // A week runs to Sunday so the table has all seven days; other ranges stop today.
  const last = data.options.range === 'week' ? addDays(first, 6) : today;
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days.slice(-cap);
}
