/**
 * Wellbeing spend: what you put into feeling well (gym, therapy, nutrition, medical),
 * entered by hand, against an optional monthly budget. Copied to your account when
 * you are signed in, like tasks and sessions.
 */
import { newId, read, write } from './storage';
import { dayKey, isDayKey, type DayKey } from './dates';

export const SPEND_CATEGORIES = ['therapy', 'gym', 'nutrition', 'medical', 'other'] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const SPEND_LABELS: Record<SpendCategory, string> = {
  therapy: 'Therapy and coaching',
  gym: 'Gym and sport',
  nutrition: 'Nutrition',
  medical: 'Medical',
  other: 'Other',
};

/** One colour per category, from the tokens so both themes work. */
export const SPEND_COLORS: Record<SpendCategory, string> = {
  therapy: 'var(--cat-time)',
  gym: 'var(--heat-3)',
  nutrition: 'var(--cat-reward)',
  medical: 'var(--cat-visual)',
  other: 'var(--color-border-strong)',
};

export const WHAT_MAX = 80;
export const AMOUNT_MAX = 1_000_000;
export const CURRENCY_MAX = 4;

export interface SpendEntry {
  id: string;
  /** The day it was spent, not the day it was typed in. */
  day: DayKey;
  what: string;
  category: SpendCategory;
  amount: number;
  /** Epoch ms. */
  createdAt: number;
  /**
   * Set when the entry was removed: a marker (what and amount stripped) that stays in
   * the store so the removal reaches other devices instead of the entry coming back.
   */
  deletedAt?: number;
}

export interface HealthStore {
  /** Monthly budget, or null when none is set. */
  budget: number | null;
  /** Shown in front of every amount, e.g. "$" or "€". */
  currency: string;
  /** When the budget and currency were last set (epoch ms), so the newer pair wins between devices. */
  budgetAt: number;
  /** Removal markers included; `getHealth` leaves them out. */
  entries: SpendEntry[];
}

export const EMPTY_HEALTH: HealthStore = { budget: null, currency: '$', budgetAt: 0, entries: [] };

/** Removal markers older than this are dropped; by then every device has long since synced. */
const MARKER_MS = 180 * 86_400_000;

const isCategory = (v: unknown): v is SpendCategory => (SPEND_CATEGORIES as readonly unknown[]).includes(v);
const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= AMOUNT_MAX;

function isSpendEntry(v: unknown): v is SpendEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  const removed = typeof e.deletedAt === 'number';
  return (
    typeof e.id === 'string' &&
    isDayKey(e.day) &&
    typeof e.what === 'string' &&
    isCategory(e.category) &&
    (isAmount(e.amount) || (removed && e.amount === 0)) &&
    typeof e.createdAt === 'number' &&
    (removed || e.deletedAt === undefined)
  );
}

/** Newest day first, and within a day the one added last. */
const byDay = (a: SpendEntry, b: SpendEntry) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt;

/** Anything stored or synced, made into a store: bad entries dropped, missing parts filled in. */
export function normaliseHealth(raw: unknown): HealthStore {
  if (typeof raw !== 'object' || raw === null) return EMPTY_HEALTH;
  const s = raw as Record<string, unknown>;
  return {
    budget: isAmount(s.budget) ? s.budget : null,
    currency: typeof s.currency === 'string' ? s.currency.slice(0, CURRENCY_MAX) : EMPTY_HEALTH.currency,
    budgetAt: typeof s.budgetAt === 'number' ? s.budgetAt : 0,
    entries: Array.isArray(s.entries) ? s.entries.filter(isSpendEntry).sort(byDay) : [],
  };
}

/** Everything stored, removal markers included (for sync). */
function getHealthStore(): HealthStore {
  return normaliseHealth(read<unknown>('health', null));
}

/** The budget and the live (not removed) entries. */
export function getHealth(): HealthStore {
  const store = getHealthStore();
  return { ...store, entries: store.entries.filter((e) => e.deletedAt === undefined) };
}

function writeHealth(store: HealthStore): void {
  const cutoff = Date.now() - MARKER_MS;
  write('health', { ...store, entries: store.entries.filter((e) => e.deletedAt === undefined || e.deletedAt > cutoff).sort(byDay) });
}

const round = (n: number) => Math.round(n * 100) / 100;

export function addSpend(input: { what: string; category: SpendCategory; amount: number; day?: DayKey }): SpendEntry | null {
  const amount = round(input.amount);
  if (!isAmount(amount)) return null;
  const entry: SpendEntry = {
    id: newId('h'),
    day: input.day && isDayKey(input.day) ? input.day : dayKey(new Date()),
    what: input.what.trim().slice(0, WHAT_MAX) || SPEND_LABELS[input.category],
    category: input.category,
    amount,
    createdAt: Date.now(),
  };
  const store = getHealthStore();
  writeHealth({ ...store, entries: [entry, ...store.entries] });
  return entry;
}

export function removeSpend(id: string): void {
  const store = getHealthStore();
  if (!store.entries.some((e) => e.id === id && e.deletedAt === undefined)) return;
  const now = Date.now();
  writeHealth({
    ...store,
    entries: store.entries.map((e) => (e.id === id ? { id, day: e.day, what: '', category: e.category, amount: 0, createdAt: e.createdAt, deletedAt: now } : e)),
  });
}

/** `budget` of 0 (or anything that is not an amount) clears it. */
export function setBudget(budget: number, currency: string): void {
  const rounded = round(budget);
  writeHealth({ ...getHealthStore(), budget: isAmount(rounded) ? rounded : null, currency: currency.trim().slice(0, CURRENCY_MAX), budgetAt: Date.now() });
}

/**
 * Combine two copies of the store (account sync). Entries are never edited, only added
 * or removed, so per id a removal marker beats the live copy. The budget and currency
 * come from whichever copy set them last.
 */
export function mergeHealthStores(a: HealthStore, b: HealthStore): HealthStore {
  const byId = new Map(a.entries.map((e) => [e.id, e]));
  for (const e of b.entries) {
    const mine = byId.get(e.id);
    if (!mine || (e.deletedAt !== undefined && (mine.deletedAt === undefined || e.deletedAt < mine.deletedAt))) byId.set(e.id, e);
  }
  const newer = b.budgetAt > a.budgetAt ? b : a;
  return { budget: newer.budget, currency: newer.currency, budgetAt: newer.budgetAt, entries: [...byId.values()].sort(byDay) };
}

/** "2026-10" for a day in October 2026. */
export type MonthKey = string;
export const monthOf = (day: DayKey): MonthKey => day.slice(0, 7);

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return monthOf(dayKey(new Date(y!, m! - 1 + by, 1)));
}

export interface MonthSpend {
  entries: SpendEntry[];
  total: number;
  /** Categories with something spent, largest first. */
  byCategory: { category: SpendCategory; amount: number }[];
}

export function monthSpend(entries: SpendEntry[], month: MonthKey): MonthSpend {
  const mine = entries.filter((e) => monthOf(e.day) === month);
  const sums = new Map<SpendCategory, number>();
  for (const e of mine) sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
  return {
    entries: mine,
    total: round(mine.reduce((sum, e) => sum + e.amount, 0)),
    byCategory: [...sums].map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
