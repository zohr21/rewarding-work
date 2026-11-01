/**
 * Budget: what you spend, entered by hand, against a monthly budget and optional budgets
 * per category. Bills that come back every month are "repeats": each one adds its entry on
 * its day. Copied to your account when you are signed in, like tasks and sessions.
 *
 * Kept in the `health` store, where wellbeing spend used to live (it is now the Wellbeing
 * category), so the account sync and its rules stay as they are. A store written before
 * Budget existed (no `v`) is read as wellbeing spend: see `normaliseBudget`.
 *
 * The plan (2026-11): income, a needs / wants / savings split (50/30/20 by default), a need or
 * want tag on each category that one expense can change, and savings goals that are paid
 * first when income comes in. These are extra keys and fields on the same `v: 2` store, so an
 * older app still reads every expense; it only leaves the new parts out when it writes.
 */
import { newId, read, write } from './storage';
import { addDays, dayKey, fromDayKey, isDayKey, type DayKey } from './dates';

export const CATEGORIES = ['food', 'home', 'wellbeing', 'transport', 'fun', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food and groceries',
  home: 'Home and bills',
  wellbeing: 'Wellbeing',
  transport: 'Transport',
  fun: 'Fun and going out',
  other: 'Other',
};

/** For chips and tight rows. */
export const CATEGORY_SHORT: Record<Category, string> = {
  food: 'Food',
  home: 'Home',
  wellbeing: 'Wellbeing',
  transport: 'Transport',
  fun: 'Fun',
  other: 'Other',
};

/** One colour per category, from the tokens so both themes work. */
export const CATEGORY_COLORS: Record<Category, string> = {
  food: 'var(--cat-reward)',
  home: 'var(--tier-2-edge)',
  wellbeing: 'var(--cat-time)',
  transport: 'var(--cat-visual)',
  fun: 'var(--heat-3)',
  other: 'var(--color-border-strong)',
};

/** What a Wellbeing expense was for: the categories wellbeing spend had before Budget. */
export const WELLBEING_KINDS = ['therapy', 'gym', 'nutrition', 'medical'] as const;
export type WellbeingKind = (typeof WELLBEING_KINDS)[number];

export const KIND_LABELS: Record<WellbeingKind, string> = {
  therapy: 'Therapy and coaching',
  gym: 'Gym and sport',
  nutrition: 'Nutrition',
  medical: 'Medical',
};

/** Whether money spent was needed or wanted. A category is one of these, or mixed (asked each time). */
export type Need = 'need' | 'want';
export type CategoryTag = Need | 'mixed';
export const NEED_LABELS: Record<Need, string> = { need: 'Need', want: 'Want' };

/** Groceries are needs and eating out is a want, so food asks. */
export const DEFAULT_TAGS: Record<Category, CategoryTag> = {
  food: 'mixed',
  home: 'need',
  wellbeing: 'need',
  transport: 'need',
  fun: 'want',
  other: 'want',
};

export const INCOME_SOURCES = ['salary', 'freelance', 'gift', 'other'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];
export const SOURCE_LABELS: Record<IncomeSource, string> = { salary: 'Salary', freelance: 'Freelance', gift: 'Gift', other: 'Other' };

/** Needs / wants / savings, in percent of income. */
export type Split = [number, number, number];
export const SPLITS: Split[] = [
  [50, 30, 20],
  [60, 20, 20],
  [70, 20, 10],
];

export const WHAT_MAX = 80;
export const AMOUNT_MAX = 1_000_000;
export const CURRENCY_MAX = 4;

export interface SpendEntry {
  id: string;
  /** The day it was spent, not the day it was typed in. */
  day: DayKey;
  what: string;
  category: Category;
  /** Only on Wellbeing entries, and optional there. */
  kind?: WellbeingKind;
  amount: number;
  /** Epoch ms. */
  createdAt: number;
  /** Set on entries a repeat added. */
  repeatId?: string;
  /** Set on entries read from a bank alert: the bank's name (src/lib/bank.ts). */
  from?: string;
  /** Need or want for this one expense; without it the category's tag counts. */
  need?: Need;
  /**
   * Set when the entry was removed: a marker (what and amount stripped) that stays in
   * the store so the removal reaches other devices instead of the entry coming back.
   */
  deletedAt?: number;
}

/** A bill that comes back every month, on the same day. */
export interface Repeat {
  id: string;
  what: string;
  category: Category;
  kind?: WellbeingKind;
  amount: number;
  /** 1–31; in a shorter month it falls on the last day. */
  dayOfMonth: number;
  /** The first month it adds an entry for. */
  from: MonthKey;
  need?: Need;
  createdAt: number;
  deletedAt?: number;
}

export interface IncomeEntry {
  id: string;
  day: DayKey;
  what: string;
  source: IncomeSource;
  amount: number;
  createdAt: number;
  /** Set on income a repeat added. */
  repeatId?: string;
  deletedAt?: number;
}

/** Income that comes every month on the same day, like a salary. */
export interface IncomeRepeat {
  id: string;
  what: string;
  source: IncomeSource;
  amount: number;
  dayOfMonth: number;
  from: MonthKey;
  /** Each time it comes, the savings share goes to the goals first. */
  saveFirst: boolean;
  createdAt: number;
  deletedAt?: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** How much of each month's savings goes here; the savings are shared out by these. */
  monthly: number;
  /** When you want it by. */
  by?: MonthKey;
  createdAt: number;
  /** Goals are changed in place; the newer copy wins between devices. */
  updatedAt: number;
  deletedAt?: number;
}

/** Money put towards a goal ("" for savings with no goal). */
export interface SaveEntry {
  id: string;
  goalId: string;
  day: DayKey;
  amount: number;
  createdAt: number;
  deletedAt?: number;
}

export interface Plan {
  split: Split;
  /** Only the categories changed from DEFAULT_TAGS. */
  tags: Partial<Record<Category, CategoryTag>>;
}

export const DEFAULT_PLAN: Plan = { split: [50, 30, 20], tags: {} };

export interface BudgetStore {
  v: 2;
  /** The whole month's budget, or null when none is set. */
  budget: number | null;
  /** Per-category budgets; a category without one is left out. */
  budgets: Partial<Record<Category, number>>;
  /** Shown in front of every amount, e.g. "$" or "€". */
  currency: string;
  /** When the budgets and currency were last set (epoch ms), so the newer set wins between devices. */
  budgetAt: number;
  /** Removal markers included; `getBudget` leaves them out. */
  entries: SpendEntry[];
  repeats: Repeat[];
  incomes: IncomeEntry[];
  incomeRepeats: IncomeRepeat[];
  goals: Goal[];
  saves: SaveEntry[];
  plan: Plan;
  /** When the plan was last set, so the newer one wins between devices. */
  planAt: number;
}

export const EMPTY_BUDGET: BudgetStore = {
  v: 2,
  budget: null,
  budgets: {},
  currency: '$',
  budgetAt: 0,
  entries: [],
  repeats: [],
  incomes: [],
  incomeRepeats: [],
  goals: [],
  saves: [],
  plan: DEFAULT_PLAN,
  planAt: 0,
};

/** Removal markers older than this are dropped; by then every device has long since synced. */
const MARKER_MS = 180 * 86_400_000;

const isCategory = (v: unknown): v is Category => (CATEGORIES as readonly unknown[]).includes(v);
const isKind = (v: unknown): v is WellbeingKind => (WELLBEING_KINDS as readonly unknown[]).includes(v);
const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= AMOUNT_MAX;
const isMonthKey = (v: unknown): v is MonthKey => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const isNeed = (v: unknown): v is Need => v === 'need' || v === 'want';
const isTag = (v: unknown): v is CategoryTag => isNeed(v) || v === 'mixed';
const isSource = (v: unknown): v is IncomeSource => (INCOME_SOURCES as readonly unknown[]).includes(v);
const isDayOfMonth = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;

function readEntry(v: unknown, legacy: boolean): SpendEntry | null {
  if (typeof v !== 'object' || v === null) return null;
  const e = v as Record<string, unknown>;
  const removed = typeof e.deletedAt === 'number';
  if (
    typeof e.id !== 'string' ||
    !isDayKey(e.day) ||
    typeof e.what !== 'string' ||
    !(isAmount(e.amount) || (removed && e.amount === 0)) ||
    typeof e.createdAt !== 'number'
  )
    return null;
  let category: Category;
  let kind: WellbeingKind | undefined;
  if (legacy) {
    // Before Budget everything here was wellbeing spend, and its categories are now the kinds.
    category = 'wellbeing';
    kind = isKind(e.category) ? e.category : undefined;
  } else {
    if (!isCategory(e.category)) return null;
    category = e.category;
    kind = category === 'wellbeing' && isKind(e.kind) ? e.kind : undefined;
  }
  const entry: SpendEntry = { id: e.id, day: e.day, what: e.what, category, amount: e.amount as number, createdAt: e.createdAt };
  if (kind) entry.kind = kind;
  if (typeof e.repeatId === 'string') entry.repeatId = e.repeatId;
  if (typeof e.from === 'string' && e.from) entry.from = e.from.slice(0, WHAT_MAX);
  if (isNeed(e.need)) entry.need = e.need;
  if (removed) entry.deletedAt = e.deletedAt as number;
  return entry;
}

function readRepeat(v: unknown): Repeat | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const removed = typeof r.deletedAt === 'number';
  if (
    typeof r.id !== 'string' ||
    typeof r.what !== 'string' ||
    !isCategory(r.category) ||
    !(isAmount(r.amount) || (removed && r.amount === 0)) ||
    typeof r.dayOfMonth !== 'number' ||
    !Number.isInteger(r.dayOfMonth) ||
    r.dayOfMonth < 1 ||
    r.dayOfMonth > 31 ||
    !isMonthKey(r.from) ||
    typeof r.createdAt !== 'number'
  )
    return null;
  const repeat: Repeat = { id: r.id, what: r.what, category: r.category, amount: r.amount as number, dayOfMonth: r.dayOfMonth, from: r.from, createdAt: r.createdAt };
  if (r.category === 'wellbeing' && isKind(r.kind)) repeat.kind = r.kind;
  if (isNeed(r.need)) repeat.need = r.need;
  if (removed) repeat.deletedAt = r.deletedAt as number;
  return repeat;
}

/** Shared by the newer lists: an object with an id, live or a removal marker. */
function record(v: unknown): (Record<string, unknown> & { id: string; removed: boolean }) | null {
  if (typeof v !== 'object' || v === null || typeof (v as { id?: unknown }).id !== 'string') return null;
  const r = v as Record<string, unknown> & { id: string };
  return { ...r, removed: typeof r.deletedAt === 'number' };
}

const amountOk = (amount: unknown, removed: boolean) => isAmount(amount) || (removed && amount === 0);

function readIncome(v: unknown): IncomeEntry | null {
  const r = record(v);
  if (!r || !isDayKey(r.day) || typeof r.what !== 'string' || !isSource(r.source) || !amountOk(r.amount, r.removed) || typeof r.createdAt !== 'number') return null;
  const income: IncomeEntry = { id: r.id, day: r.day, what: r.what, source: r.source, amount: r.amount as number, createdAt: r.createdAt };
  if (typeof r.repeatId === 'string') income.repeatId = r.repeatId;
  if (r.removed) income.deletedAt = r.deletedAt as number;
  return income;
}

function readIncomeRepeat(v: unknown): IncomeRepeat | null {
  const r = record(v);
  if (!r || typeof r.what !== 'string' || !isSource(r.source) || !amountOk(r.amount, r.removed) || !isDayOfMonth(r.dayOfMonth) || !isMonthKey(r.from) || typeof r.createdAt !== 'number') return null;
  const repeat: IncomeRepeat = { id: r.id, what: r.what, source: r.source, amount: r.amount as number, dayOfMonth: r.dayOfMonth, from: r.from, saveFirst: r.saveFirst === true, createdAt: r.createdAt };
  if (r.removed) repeat.deletedAt = r.deletedAt as number;
  return repeat;
}

function readGoal(v: unknown): Goal | null {
  const r = record(v);
  if (!r || typeof r.name !== 'string' || !amountOk(r.target, r.removed) || typeof r.monthly !== 'number' || r.monthly < 0 || typeof r.createdAt !== 'number') return null;
  const goal: Goal = { id: r.id, name: r.name, target: r.target as number, monthly: r.monthly, createdAt: r.createdAt, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : r.createdAt };
  if (isMonthKey(r.by)) goal.by = r.by;
  if (r.removed) goal.deletedAt = r.deletedAt as number;
  return goal;
}

function readSave(v: unknown): SaveEntry | null {
  const r = record(v);
  if (!r || typeof r.goalId !== 'string' || !isDayKey(r.day) || !amountOk(r.amount, r.removed) || typeof r.createdAt !== 'number') return null;
  const save: SaveEntry = { id: r.id, goalId: r.goalId, day: r.day, amount: r.amount as number, createdAt: r.createdAt };
  if (r.removed) save.deletedAt = r.deletedAt as number;
  return save;
}

function readPlan(v: unknown): Plan {
  if (typeof v !== 'object' || v === null) return DEFAULT_PLAN;
  const p = v as Record<string, unknown>;
  const ok =
    Array.isArray(p.split) &&
    p.split.length === 3 &&
    p.split.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100) &&
    (p.split as number[]).reduce((a, b) => a + b, 0) === 100;
  const tags: Partial<Record<Category, CategoryTag>> = {};
  if (typeof p.tags === 'object' && p.tags !== null) for (const [key, value] of Object.entries(p.tags)) if (isCategory(key) && isTag(value)) tags[key] = value;
  return { split: [...(ok ? (p.split as Split) : DEFAULT_PLAN.split)] as Split, tags };
}

/** Newest day first, and within a day the one added last. */
const byDay = (a: SpendEntry, b: SpendEntry) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt;
const byDayOfMonth = <T extends { dayOfMonth: number; createdAt: number }>(a: T, b: T) => a.dayOfMonth - b.dayOfMonth || a.createdAt - b.createdAt;
const byNewest = <T extends { day: DayKey; createdAt: number }>(a: T, b: T) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt;
const byCreated = (a: Goal, b: Goal) => a.createdAt - b.createdAt;

const pick = <T>(list: unknown, fn: (v: unknown) => T | null): T[] =>
  Array.isArray(list) ? list.map(fn).filter((x): x is T => x !== null) : [];

/** Anything stored or synced, made into a store: bad entries dropped, missing parts filled in. */
export function normaliseBudget(raw: unknown): BudgetStore {
  if (typeof raw !== 'object' || raw === null) return EMPTY_BUDGET;
  const s = raw as Record<string, unknown>;
  const legacy = s.v !== 2;
  const budgets: Partial<Record<Category, number>> = {};
  if (legacy) {
    // The old single budget was for wellbeing.
    if (isAmount(s.budget)) budgets.wellbeing = s.budget;
  } else if (typeof s.budgets === 'object' && s.budgets !== null) {
    for (const [key, value] of Object.entries(s.budgets)) if (isCategory(key) && isAmount(value)) budgets[key] = value;
  }
  return {
    v: 2,
    budget: !legacy && isAmount(s.budget) ? s.budget : null,
    budgets,
    currency: typeof s.currency === 'string' ? s.currency.slice(0, CURRENCY_MAX) : EMPTY_BUDGET.currency,
    budgetAt: typeof s.budgetAt === 'number' ? s.budgetAt : 0,
    entries: pick(s.entries, (e) => readEntry(e, legacy)).sort(byDay),
    repeats: pick(s.repeats, readRepeat).sort(byDayOfMonth),
    incomes: pick(s.incomes, readIncome).sort(byNewest),
    incomeRepeats: pick(s.incomeRepeats, readIncomeRepeat).sort(byDayOfMonth),
    goals: pick(s.goals, readGoal).sort(byCreated),
    saves: pick(s.saves, readSave).sort(byNewest),
    plan: readPlan(s.plan),
    planAt: typeof s.planAt === 'number' ? s.planAt : 0,
  };
}

/** Everything stored, removal markers included (for sync). */
function getStore(): BudgetStore {
  return normaliseBudget(read<unknown>('health', null));
}

/** The budgets and the live (not removed) entries and repeats. */
export function getBudget(): BudgetStore {
  const store = getStore();
  return {
    ...store,
    entries: store.entries.filter((e) => e.deletedAt === undefined),
    repeats: store.repeats.filter((r) => r.deletedAt === undefined),
    incomes: store.incomes.filter((e) => e.deletedAt === undefined),
    incomeRepeats: store.incomeRepeats.filter((r) => r.deletedAt === undefined),
    goals: store.goals.filter((g) => g.deletedAt === undefined),
    saves: store.saves.filter((x) => x.deletedAt === undefined),
  };
}

function writeStore(store: BudgetStore): void {
  const cutoff = Date.now() - MARKER_MS;
  const keep = (x: { deletedAt?: number }) => x.deletedAt === undefined || x.deletedAt > cutoff;
  write('health', {
    ...store,
    entries: store.entries.filter(keep).sort(byDay),
    repeats: store.repeats.filter(keep).sort(byDayOfMonth),
    incomes: store.incomes.filter(keep).sort(byNewest),
    incomeRepeats: store.incomeRepeats.filter(keep).sort(byDayOfMonth),
    goals: store.goals.filter(keep).sort(byCreated),
    saves: store.saves.filter(keep).sort(byNewest),
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface SpendInput {
  what: string;
  category: Category;
  kind?: WellbeingKind | null;
  amount: number;
  day?: DayKey;
  /** Need or want for this expense; left out, the category's tag counts. */
  need?: Need | null;
}

function makeEntry(input: SpendInput, id = newId('h')): SpendEntry | null {
  const amount = round(input.amount);
  if (!isAmount(amount) || !isCategory(input.category)) return null;
  const entry: SpendEntry = {
    id,
    day: input.day && isDayKey(input.day) ? input.day : dayKey(new Date()),
    what: input.what.trim().slice(0, WHAT_MAX) || (input.kind ? KIND_LABELS[input.kind] : CATEGORY_LABELS[input.category]),
    category: input.category,
    amount,
    createdAt: Date.now(),
  };
  if (input.category === 'wellbeing' && input.kind && isKind(input.kind)) entry.kind = input.kind;
  if (isNeed(input.need)) entry.need = input.need;
  return entry;
}

const marker = (e: SpendEntry, now: number): SpendEntry => {
  const m: SpendEntry = { id: e.id, day: e.day, what: '', category: e.category, amount: 0, createdAt: e.createdAt, deletedAt: now };
  if (e.repeatId) m.repeatId = e.repeatId;
  return m;
};

export function addSpend(input: SpendInput): SpendEntry | null {
  const entry = makeEntry(input);
  if (!entry) return null;
  const store = getStore();
  writeStore({ ...store, entries: [entry, ...store.entries] });
  return entry;
}

/**
 * Expenses read from bank alerts, in one write, each with an id made from its alert, so the
 * same alert never adds twice (not even after it was removed: the removal marker keeps the id).
 */
export function importSpends(items: { input: SpendInput; id: string; from: string }[]): SpendEntry[] {
  const store = getStore();
  const known = new Set(store.entries.map((e) => e.id));
  const added: SpendEntry[] = [];
  for (const { input, id, from } of items) {
    if (known.has(id)) continue;
    const entry = makeEntry(input, id);
    if (!entry) continue;
    entry.from = from.slice(0, WHAT_MAX);
    known.add(id);
    added.push(entry);
  }
  if (added.length) writeStore({ ...store, entries: [...added, ...store.entries] });
  return added;
}

export const importSpend = (input: SpendInput, id: string, from: string): SpendEntry | null => importSpends([{ input, id, from }])[0] ?? null;

/**
 * Gives entries a new name, in one write. Like any change, each old entry is removed and a
 * copy added under a new id (`<id>-r`), so the change reaches other devices.
 */
export function renameSpends(changes: { id: string; what: string; category?: Category }[]): number {
  const names = new Map(changes.map((c) => [c.id, c.what.trim().slice(0, WHAT_MAX)]));
  const categories = new Map(changes.map((c) => [c.id, c.category]));
  const store = getStore();
  const now = Date.now();
  const copies: SpendEntry[] = [];
  const entries = store.entries.map((e) => {
    const what = names.get(e.id);
    if (!what || e.deletedAt !== undefined) return e;
    copies.push({ ...e, id: `${e.id}-r`, what, category: categories.get(e.id) ?? e.category, createdAt: now });
    return marker(e, now);
  });
  if (copies.length) writeStore({ ...store, entries: [...copies, ...entries] });
  return copies.length;
}

/** Removes many at once (undoing an import), in one write. */
export function removeSpends(ids: string[]): void {
  const gone = new Set(ids);
  const store = getStore();
  const now = Date.now();
  writeStore({ ...store, entries: store.entries.map((e) => (gone.has(e.id) && e.deletedAt === undefined ? marker(e, now) : e)) });
}

/**
 * Entries are never changed in place (so sync can join them by id): a change removes the
 * old one and adds the new one in a single write.
 */
export function changeSpend(id: string, input: SpendInput): SpendEntry | null {
  const store = getStore();
  const old = store.entries.find((e) => e.id === id && e.deletedAt === undefined);
  const entry = makeEntry(input);
  if (!old || !entry) return null;
  const now = Date.now();
  writeStore({ ...store, entries: [entry, ...store.entries.map((e) => (e.id === id ? marker(e, now) : e))] });
  return entry;
}

export function removeSpend(id: string): void {
  const store = getStore();
  if (!store.entries.some((e) => e.id === id && e.deletedAt === undefined)) return;
  const now = Date.now();
  writeStore({ ...store, entries: store.entries.map((e) => (e.id === id ? marker(e, now) : e)) });
}

/** A bill for every month from the month of `day`, on that day of the month. Adds this month's entry when it is due. */
export function addRepeat(input: SpendInput): Repeat | null {
  const first = makeEntry(input);
  if (!first) return null;
  const repeat: Repeat = {
    id: newId('r'),
    what: first.what,
    category: first.category,
    amount: first.amount,
    dayOfMonth: fromDayKey(first.day).getDate(),
    from: monthOf(first.day),
    createdAt: Date.now(),
  };
  if (first.kind) repeat.kind = first.kind;
  if (first.need) repeat.need = first.need;
  const store = getStore();
  writeStore({ ...store, repeats: [...store.repeats, repeat] });
  catchUpRepeats();
  return repeat;
}

/** Stops a repeat. The entries it already added stay. */
export function removeRepeat(id: string): void {
  const store = getStore();
  if (!store.repeats.some((r) => r.id === id && r.deletedAt === undefined)) return;
  const now = Date.now();
  writeStore({
    ...store,
    repeats: store.repeats.map((r) => (r.id === id ? { ...r, what: '', amount: 0, deletedAt: now } : r)),
  });
}

/** The day a repeat falls on in `month`. */
export function repeatDay(r: Pick<Repeat, 'dayOfMonth'>, month: MonthKey): DayKey {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${month}-${String(Math.min(r.dayOfMonth, last)).padStart(2, '0')}`;
}

/**
 * Adds every entry a repeat owes up to today. Each gets the id `<repeat>-<month>`, so two
 * devices catching up at once add the same entry once, and a removed one stays removed.
 */
export function catchUpRepeats(today: DayKey = dayKey(new Date())): number {
  const store = getStore();
  const known = new Set(store.entries.map((e) => e.id));
  const added: SpendEntry[] = [];
  const now = monthOf(today);
  for (const r of store.repeats) {
    if (r.deletedAt !== undefined) continue;
    for (let month = r.from; month <= now; month = shiftMonth(month, 1)) {
      const id = `${r.id}-${month}`;
      const day = repeatDay(r, month);
      if (day > today || known.has(id)) continue;
      const entry: SpendEntry = { id, day, what: r.what, category: r.category, amount: r.amount, createdAt: Date.now(), repeatId: r.id };
      if (r.kind) entry.kind = r.kind;
      if (r.need) entry.need = r.need;
      added.push(entry);
    }
  }
  if (added.length) writeStore({ ...store, entries: [...added, ...store.entries] });
  return added.length + catchUpIncome(today);
}

/** Repeats whose next entry falls within `days` days after today, soonest first. */
export function dueSoon(repeats: Repeat[], days = 7, today: DayKey = dayKey(new Date())): { repeat: Repeat; day: DayKey }[] {
  const end = dayKey(addDays(fromDayKey(today), days));
  const out: { repeat: Repeat; day: DayKey }[] = [];
  for (const repeat of repeats) {
    for (const month of [monthOf(today), shiftMonth(monthOf(today), 1)]) {
      if (month < repeat.from) continue;
      const day = repeatDay(repeat, month);
      if (day > today && day <= end) {
        out.push({ repeat, day });
        break;
      }
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

// ---------- Income, savings and the plan ----------

export interface IncomeInput {
  what: string;
  source: IncomeSource;
  amount: number;
  day?: DayKey;
}

function makeIncome(input: IncomeInput, id = newId('i')): IncomeEntry | null {
  const amount = round(input.amount);
  if (!isAmount(amount) || !isSource(input.source)) return null;
  return {
    id,
    day: input.day && isDayKey(input.day) ? input.day : dayKey(new Date()),
    what: input.what.trim().slice(0, WHAT_MAX) || SOURCE_LABELS[input.source],
    source: input.source,
    amount,
    createdAt: Date.now(),
  };
}

export function savedFor(saves: SaveEntry[], goalId: string): number {
  return round(saves.filter((x) => x.deletedAt === undefined && x.goalId === goalId).reduce((a, x) => a + x.amount, 0));
}

/**
 * The savings share of an income, shared out over the unfinished goals by their monthly
 * amounts (evenly when none has one). With no goals it is still put aside, under goal "".
 * `idBase` makes the ids, so a repeat's savings are added once on every device.
 */
function savesFor(store: BudgetStore, amount: number, day: DayKey, idBase: string): SaveEntry[] {
  const share = round((amount * store.plan.split[2]) / 100);
  if (!isAmount(share)) return [];
  const now = Date.now();
  const goals = store.goals.filter((g) => g.deletedAt === undefined && savedFor(store.saves, g.id) < g.target);
  if (!goals.length) return [{ id: `${idBase}-s`, goalId: '', day, amount: share, createdAt: now }];
  const total = goals.reduce((a, g) => a + g.monthly, 0);
  let left = share;
  return goals.flatMap((g, i) => {
    const part = i === goals.length - 1 ? round(left) : round(total ? (share * g.monthly) / total : share / goals.length);
    left = round(left - part);
    return part > 0 ? [{ id: `${idBase}-s-${g.id}`, goalId: g.id, day, amount: part, createdAt: now }] : [];
  });
}

/** Adds income. With `repeat` it comes every month on this day; with `saveFirst` its savings share goes to the goals first. */
export function addIncome(input: IncomeInput, { repeat = false, saveFirst = false } = {}): IncomeEntry | null {
  const first = makeIncome(input);
  if (!first) return null;
  const store = getStore();
  if (repeat) {
    const r: IncomeRepeat = {
      id: newId('ir'),
      what: first.what,
      source: first.source,
      amount: first.amount,
      dayOfMonth: fromDayKey(first.day).getDate(),
      from: monthOf(first.day),
      saveFirst,
      createdAt: Date.now(),
    };
    writeStore({ ...store, incomeRepeats: [...store.incomeRepeats, r] });
    catchUpIncome();
    return getStore().incomes.find((i) => i.repeatId === r.id && i.deletedAt === undefined) ?? first;
  }
  const saves = saveFirst ? savesFor(store, first.amount, first.day, first.id) : [];
  writeStore({ ...store, incomes: [first, ...store.incomes], saves: [...saves, ...store.saves] });
  return first;
}

/** Removes income, and the savings it put aside. */
export function removeIncome(id: string): void {
  const store = getStore();
  const now = Date.now();
  const fromIt = (x: SaveEntry) => x.deletedAt === undefined && (x.id === `${id}-s` || x.id.startsWith(`${id}-s-`));
  writeStore({
    ...store,
    incomes: store.incomes.map((i) => (i.id === id && i.deletedAt === undefined ? { ...i, what: '', amount: 0, deletedAt: now } : i)),
    saves: store.saves.map((x) => (fromIt(x) ? { ...x, amount: 0, deletedAt: now } : x)),
  });
}

/** Stops a repeating income. What it already added stays. */
export function removeIncomeRepeat(id: string): void {
  const store = getStore();
  const now = Date.now();
  writeStore({
    ...store,
    incomeRepeats: store.incomeRepeats.map((r) => (r.id === id && r.deletedAt === undefined ? { ...r, what: '', amount: 0, deletedAt: now } : r)),
  });
}

/** Adds every income a repeat owes up to today, with its savings, under ids made from the repeat and the month. */
function catchUpIncome(today: DayKey = dayKey(new Date())): number {
  const store = getStore();
  const known = new Set(store.incomes.map((e) => e.id));
  const knownSaves = new Set(store.saves.map((x) => x.id));
  const incomes: IncomeEntry[] = [];
  let saves: SaveEntry[] = [];
  const now = monthOf(today);
  for (const r of store.incomeRepeats) {
    if (r.deletedAt !== undefined) continue;
    for (let month = r.from; month <= now; month = shiftMonth(month, 1)) {
      const id = `${r.id}-${month}`;
      const day = repeatDay(r, month);
      if (day > today || known.has(id)) continue;
      incomes.push({ id, day, what: r.what, source: r.source, amount: r.amount, createdAt: Date.now(), repeatId: r.id });
      if (r.saveFirst) saves = [...saves, ...savesFor({ ...store, saves: [...saves, ...store.saves] }, r.amount, day, id).filter((x) => !knownSaves.has(x.id))];
    }
  }
  if (incomes.length) writeStore({ ...store, incomes: [...incomes, ...store.incomes], saves: [...saves, ...store.saves] });
  return incomes.length;
}

export interface GoalInput {
  name: string;
  target: number;
  monthly: number;
  by?: MonthKey | null;
}

/** Adds a goal, or changes the one with `id`. */
export function saveGoal(input: GoalInput, id?: string): Goal | null {
  const target = round(input.target);
  const name = input.name.trim().slice(0, WHAT_MAX);
  if (!isAmount(target) || !name) return null;
  const store = getStore();
  const old = id ? store.goals.find((g) => g.id === id && g.deletedAt === undefined) : undefined;
  const now = Date.now();
  const goal: Goal = { id: old?.id ?? newId('g'), name, target, monthly: Math.max(0, round(input.monthly) || 0), createdAt: old?.createdAt ?? now, updatedAt: now };
  if (input.by && isMonthKey(input.by)) goal.by = input.by;
  writeStore({ ...store, goals: [...store.goals.filter((g) => g.id !== goal.id), goal] });
  return goal;
}

/** Removes a goal. The money put towards it stays in your savings, with no goal. */
export function removeGoal(id: string): void {
  const store = getStore();
  const now = Date.now();
  writeStore({
    ...store,
    goals: store.goals.map((g) => (g.id === id && g.deletedAt === undefined ? { ...g, name: '', target: 0, updatedAt: now, deletedAt: now } : g)),
    saves: store.saves.map((x) => (x.goalId === id ? { ...x, goalId: '' } : x)),
  });
}

/** Puts money towards a goal ("" for savings with no goal). */
export function addSave(goalId: string, amount: number, day: DayKey = dayKey(new Date())): SaveEntry | null {
  const value = round(amount);
  if (!isAmount(value)) return null;
  const save: SaveEntry = { id: newId('s'), goalId, day, amount: value, createdAt: Date.now() };
  const store = getStore();
  writeStore({ ...store, saves: [save, ...store.saves] });
  return save;
}

export function setPlan(plan: Plan): void {
  const tags: Partial<Record<Category, CategoryTag>> = {};
  for (const c of CATEGORIES) if (plan.tags[c] && plan.tags[c] !== DEFAULT_TAGS[c]) tags[c] = plan.tags[c];
  writeStore({ ...getStore(), plan: { split: [...plan.split] as Split, tags }, planAt: Date.now() });
}

export const categoryTag = (plan: Plan, c: Category): CategoryTag => plan.tags[c] ?? DEFAULT_TAGS[c];

/** Need or want for this expense; null for a mixed category it was not given for. */
export function needOf(entry: Pick<SpendEntry, 'need' | 'category'>, plan: Plan): Need | null {
  if (entry.need) return entry.need;
  const tag = categoryTag(plan, entry.category);
  return tag === 'mixed' ? null : tag;
}

export interface MonthPlan {
  /** Income in the month: what came in, plus repeating income still due (in the current month). */
  income: number;
  received: number;
  expected: number;
  /** The split of `income`. */
  planned: { needs: number; wants: number; savings: number };
  /** Put aside this month. Safe to spend keeps back the larger of this and the planned savings. */
  saved: number;
  spent: number;
  needs: number;
  wants: number;
  /** Spent in a mixed category without need or want given. */
  unsorted: number;
  /** Repeating bills after today (current month only). */
  billsLater: number;
  daysLeft: number;
  /** Free per day from today on, counting nothing spent today (bills paid today are already taken off). */
  perDay: number;
  spentToday: number;
  /** Left to spend today; below 0 when today went over. */
  leftToday: number;
  /** Free after savings and the bills still to come, for the days left (today included). */
  free: number;
  /** Spent each day of the month, repeating bills left out. */
  byDay: number[];
  /** Repeating bills on each day of the month. */
  billsByDay: number[];
}

/** The month against the plan. `today` decides whether it is the current month and how many days are left. */
export function monthPlan(store: BudgetStore, month: MonthKey, today: DayKey = dayKey(new Date())): MonthPlan {
  const days = daysInMonth(month);
  const current = monthOf(today) === month;
  const dom = current ? Number(today.slice(8)) : days;
  const live = <T extends { deletedAt?: number }>(x: T) => x.deletedAt === undefined;
  const incomes = store.incomes.filter(live);
  const received = round(incomes.filter((i) => monthOf(i.day) === month).reduce((a, i) => a + i.amount, 0));
  const known = new Set(incomes.map((i) => i.id));
  const expected = current
    ? round(
        store.incomeRepeats
          .filter((r) => live(r) && r.from <= month && repeatDay(r, month) > today && !known.has(`${r.id}-${month}`))
          .reduce((a, r) => a + r.amount, 0),
      )
    : 0;
  const income = round(received + expected);
  const [n, w, sv] = store.plan.split;
  const planned = { needs: round((income * n) / 100), wants: round((income * w) / 100), savings: round((income * sv) / 100) };
  const saved = round(store.saves.filter((x) => live(x) && monthOf(x.day) === month).reduce((a, x) => a + x.amount, 0));
  const mine = store.entries.filter((e) => live(e) && monthOf(e.day) === month);
  let needs = 0;
  let wants = 0;
  let unsorted = 0;
  const byDay = new Array<number>(days).fill(0);
  for (const e of mine) {
    const tag = needOf(e, store.plan);
    if (tag === 'need') needs += e.amount;
    else if (tag === 'want') wants += e.amount;
    else unsorted += e.amount;
    if (!e.repeatId) byDay[Number(e.day.slice(8)) - 1]! += e.amount;
  }
  const spent = round(needs + wants + unsorted);
  const billsByDay = new Array<number>(days).fill(0);
  for (const r of store.repeats) {
    if (!live(r) || r.from > month) continue;
    billsByDay[Number(repeatDay(r, month).slice(8)) - 1]! += r.amount;
  }
  const billsLater = current ? billsAfter(billsByDay, dom) : 0;
  // Bills are planned for apart from the day's money, so one paid today does not eat today's share.
  const spentToday = current ? round(mine.filter((e) => e.day === today && !e.repeatId).reduce((a, e) => a + e.amount, 0)) : 0;
  const daysLeft = current ? days - dom + 1 : 0;
  const free = round(income - Math.max(saved, planned.savings) - (spent - spentToday) - billsLater);
  const perDay = daysLeft ? free / daysLeft : 0;
  return {
    income,
    received,
    expected,
    planned,
    saved,
    spent,
    needs: round(needs),
    wants: round(wants),
    unsorted: round(unsorted),
    billsLater,
    daysLeft,
    perDay,
    spentToday,
    leftToday: perDay - spentToday,
    free,
    byDay: byDay.map(round),
    billsByDay,
  };
}

/** `budget` null clears it; a category left out of `budgets` has none. */
export function setBudgets(budget: number | null, budgets: Partial<Record<Category, number>>, currency: string): void {
  const clean: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) {
    const value = budgets[c];
    if (value !== undefined && isAmount(round(value))) clean[c] = round(value);
  }
  const total = budget === null ? null : round(budget);
  writeStore({
    ...getStore(),
    budget: total !== null && isAmount(total) ? total : null,
    budgets: clean,
    currency: currency.trim().slice(0, CURRENCY_MAX),
    budgetAt: Date.now(),
  });
}

/** The month's budget: the one set, else the category budgets added up, else none. */
export function monthBudget(store: Pick<BudgetStore, 'budget' | 'budgets'>): number | null {
  if (store.budget) return store.budget;
  const sum = round(Object.values(store.budgets).reduce((a, b) => a + (b ?? 0), 0));
  return sum > 0 ? sum : null;
}

function mergeById<T extends { id: string; deletedAt?: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]));
  for (const x of b) {
    const mine = byId.get(x.id);
    if (!mine || (x.deletedAt !== undefined && (mine.deletedAt === undefined || x.deletedAt < mine.deletedAt))) byId.set(x.id, x);
  }
  return [...byId.values()];
}

/**
 * Combine two copies of the store (account sync). Entries and repeats are never edited,
 * only added or removed, so per id a removal marker beats the live copy. The budgets and
 * currency come from whichever copy set them last.
 */
export function mergeBudgetStores(a: BudgetStore, b: BudgetStore): BudgetStore {
  const newer = b.budgetAt > a.budgetAt ? b : a;
  const newerPlan = b.planAt > a.planAt ? b : a;
  // Goals change in place: a removal wins, else the copy changed last.
  const goals = new Map(a.goals.map((g) => [g.id, g]));
  for (const g of b.goals) {
    const mine = goals.get(g.id);
    if (!mine || (g.deletedAt !== undefined && mine.deletedAt === undefined) || (mine.deletedAt === undefined && g.updatedAt > mine.updatedAt)) goals.set(g.id, g);
  }
  return {
    v: 2,
    budget: newer.budget,
    budgets: newer.budgets,
    currency: newer.currency,
    budgetAt: newer.budgetAt,
    entries: mergeById(a.entries, b.entries).sort(byDay),
    repeats: mergeById(a.repeats, b.repeats).sort(byDayOfMonth),
    incomes: mergeById(a.incomes, b.incomes).sort(byNewest),
    incomeRepeats: mergeById(a.incomeRepeats, b.incomeRepeats).sort(byDayOfMonth),
    goals: [...goals.values()].sort(byCreated),
    saves: mergeById(a.saves, b.saves).sort(byNewest),
    plan: newerPlan.plan,
    planAt: newerPlan.planAt,
  };
}

/** "2026-10" for a day in October 2026. */
export type MonthKey = string;
export const monthOf = (day: DayKey): MonthKey => day.slice(0, 7);

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return monthOf(dayKey(new Date(y!, m! - 1 + by, 1)));
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
}

export interface MonthSpend {
  entries: SpendEntry[];
  total: number;
  /** Every category with something spent. */
  byCategory: Map<Category, number>;
}

export function monthSpend(entries: SpendEntry[], month: MonthKey, uptoDayOfMonth = 31): MonthSpend {
  const mine = entries.filter((e) => monthOf(e.day) === month && Number(e.day.slice(8)) <= uptoDayOfMonth);
  const byCategory = new Map<Category, number>();
  for (const e of mine) byCategory.set(e.category, round((byCategory.get(e.category) ?? 0) + e.amount));
  return { entries: mine, total: round(mine.reduce((sum, e) => sum + e.amount, 0)), byCategory };
}

/** Spent so far by the end of each day of the month, one number per day. */
export function runningTotals(entries: SpendEntry[], month: MonthKey): number[] {
  const perDay = new Array<number>(daysInMonth(month)).fill(0);
  for (const e of entries) if (monthOf(e.day) === month) perDay[Number(e.day.slice(8)) - 1]! += e.amount;
  let sum = 0;
  return perDay.map((v) => (sum = round(sum + v)));
}

/**
 * Where spending "should" be by the end of each day of the month: repeating bills count in
 * full on their day, and the rest of the budget is spread evenly. So rent on the 1st does
 * not make the month look ahead of pace.
 */
export function paceLine(repeats: Repeat[], month: MonthKey, budget: number, category?: Category): { line: number[]; billsByDay: number[] } {
  const days = daysInMonth(month);
  const billsByDay = new Array<number>(days).fill(0);
  for (const r of repeats) {
    if (r.deletedAt !== undefined || r.from > month || (category && r.category !== category)) continue;
    billsByDay[Number(repeatDay(r, month).slice(8)) - 1]! += r.amount;
  }
  const bills = billsByDay.reduce((a, b) => a + b, 0);
  const spread = Math.max(0, budget - bills) / days;
  let sum = 0;
  const line = billsByDay.map((b, i) => (sum += b) + spread * (i + 1));
  return { line, billsByDay };
}

/** Repeating bills in the month that fall after `dayOfMonth`. */
export function billsAfter(billsByDay: number[], dayOfMonth: number): number {
  return round(billsByDay.slice(dayOfMonth).reduce((a, b) => a + b, 0));
}

/** The totals of `count` months ending with `last`, oldest first. */
export function monthTotals(entries: SpendEntry[], last: MonthKey, count: number, category?: Category): { month: MonthKey; total: number }[] {
  const out: { month: MonthKey; total: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(last, -i);
    const mine = entries.filter((e) => monthOf(e.day) === month && (!category || e.category === category));
    out.push({ month, total: round(mine.reduce((sum, e) => sum + e.amount, 0)) });
  }
  return out;
}

/**
 * Currencies you can pick by name. The store keeps the code ("AZN"); anything else in it
 * is a sign you typed yourself, shown in front of the amount.
 */
export const CURRENCIES = [
  { code: 'USD', name: 'US dollar', sign: '$' },
  { code: 'EUR', name: 'Euro', sign: '€' },
  { code: 'GBP', name: 'British pound', sign: '£' },
  { code: 'RUB', name: 'Russian ruble', sign: '₽' },
  { code: 'AZN', name: 'Azerbaijani manat', sign: '₼' },
  { code: 'TRY', name: 'Turkish lira', sign: '₺' },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

/** The listed currency `currency` stands for: its code, or its sign (stores from before the list say "$"). */
export function currencyCode(currency: string): CurrencyCode | null {
  return CURRENCIES.find((c) => c.code === currency || c.sign === currency)?.code ?? null;
}

/** The short sign to show next to an amount being typed. */
export function currencySign(currency: string): string {
  const code = currencyCode(currency);
  return code ? CURRENCIES.find((c) => c.code === code)!.sign : currency;
}

const moneyFormats = new Map<string, Intl.NumberFormat>();

/**
 * A listed currency is written the way your language writes it ("$652", "652 ₽", "652,40 €");
 * a typed sign goes in front. `compact` shortens big numbers for chart axes ("₼1.2K").
 */
export function formatMoney(amount: number, currency: string, decimals: 'auto' | 0 = 'auto', compact = false): string {
  if (moneyHidden()) return `${currencySign(currency)}•••`;
  const fraction = compact
    ? { maximumFractionDigits: 1 }
    : decimals === 0
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 };
  const code = currencyCode(currency);
  const key = `${code ?? ''}|${JSON.stringify(fraction)}|${compact}`;
  let fmt = moneyFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      ...(code ? { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' } : {}),
      ...(compact ? { notation: 'compact' } : {}),
      ...fraction,
    });
    moneyFormats.set(key, fmt);
  }
  // A sign made of letters ("CHF") gets a space before the number; "$" does not.
  return code ? fmt.format(amount) : `${currency}${/\p{L}$/u.test(currency) ? ' ' : ''}${fmt.format(amount)}`;
}

/**
 * Hide amounts (the eye on the Budget page, src/components/BudgetLock.astro): every amount
 * then shows as "₼•••". Kept on the page, so it ends when you leave Budget.
 */
export function moneyHidden(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-money-hidden');
}

/** The month's entries as CSV, for a spreadsheet. */
export function toCsv(entries: SpendEntry[], currency: string): string {
  // A leading = + - @ would make a spreadsheet run the text as a formula.
  const cell = (raw: string) => {
    const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Date', 'What', 'Category', 'Kind', `Amount (${currencyCode(currency) ?? currency})`].join(',')];
  for (const e of [...entries].sort((a, b) => a.day.localeCompare(b.day))) {
    rows.push([e.day, cell(e.what), CATEGORY_LABELS[e.category], e.kind ? KIND_LABELS[e.kind] : '', String(e.amount)].join(','));
  }
  return rows.join('\n') + '\n';
}
