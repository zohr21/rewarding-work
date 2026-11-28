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
import { locale, t, type Key } from './i18n';
import { deviceRegion, deviceSettings, regionCurrency } from './i18n/region';

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

/** The labels above in the current language (the constants stay English for markup and exports). */
export const categoryLabel = (c: Category) => t(`budget.cat.${c}` as Key);
export const categoryShort = (c: Category) => t(`budget.catShort.${c}` as Key);
export const kindLabel = (k: WellbeingKind) => t(`budget.kind.${k}` as Key);
export const needLabel = (n: Need | CategoryTag) => t(`budget.tag.${n}` as Key);
export const sourceLabel = (s: IncomeSource) => t(`budget.src.${s}` as Key);

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
  /** When the goal was first seen reached (epoch ms), so it is celebrated once. */
  reachedAt?: number;
  deletedAt?: number;
}

/** Where saved money is kept. Entries without `where` are on the card (in the bank). */
export type SaveWhere = 'card' | 'cash';

/**
 * Money put towards a goal ("" for savings with no goal). Plain entries are money put in and
 * are always above 0. Since 2026-11 there are two more:
 * - `type: 'move'`, half of a move between card and cash: one entry below 0 where the money
 *   left, one above 0 where it went, so the total stays the same;
 * - `type: 'out'`, money taken out of savings (below 0), which goes back to what is safe to spend;
 * - `type: 'had'`, savings you already had before (above 0): in the total and its goal, but not
 *   taken from the month's income, so what is safe to spend stays the same.
 * An older app drops the entries below 0 when it reads them, so it shows a little more saved,
 * and reads `had` as money put in that month.
 */
export interface SaveEntry {
  id: string;
  goalId: string;
  day: DayKey;
  amount: number;
  createdAt: number;
  where?: 'cash';
  type?: 'move' | 'out' | 'had';
  deletedAt?: number;
}

export interface Plan {
  split: Split;
  /** Only the categories changed from DEFAULT_TAGS. */
  tags: Partial<Record<Category, CategoryTag>>;
  /** Autopilot (2026-11). The month-end sweep asks unless this is set. */
  sweepOff?: true;
  /** Round-ups are on from this day: each payment's cents up to the next whole amount count as savings. */
  roundUpFrom?: DayKey;
  /**
   * The day budget months start (2026-11), 2–28; left out for the 1st. A month that starts on
   * the 26th runs from 26 October to 25 November and is called November: the salary paid on
   * the 26th pays for the month it starts. Entries keep their real days.
   */
  monthStart?: number;
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
  /**
   * What you had (cards and cash together) when you set it, on `day` at `at` (epoch ms).
   * The balance counts from there; the newer one wins between devices. Left out until set.
   */
  start?: StartBalance;
}

export interface StartBalance {
  amount: number;
  day: DayKey;
  at: number;
}

/** What a budget nobody has set up yet counts in: the device's own currency when Grovyn lists it, else "$". */
export function defaultCurrency(): string {
  const { tags, timeZone } = deviceSettings();
  return regionCurrency(deviceRegion(tags, timeZone)) ?? EMPTY_BUDGET.currency;
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
  if (typeof r.reachedAt === 'number') goal.reachedAt = r.reachedAt;
  if (r.removed) goal.deletedAt = r.deletedAt as number;
  return goal;
}

function readSave(v: unknown): SaveEntry | null {
  const r = record(v);
  if (!r) return null;
  const type = r.type === 'move' || r.type === 'out' || r.type === 'had' ? r.type : undefined;
  // Moves and take-outs may be below 0; take-outs always are.
  const signed = typeof r.amount === 'number' && (type === 'move' ? isAmount(Math.abs(r.amount)) : type === 'out' ? isAmount(-r.amount) : isAmount(r.amount));
  if (typeof r.goalId !== 'string' || !isDayKey(r.day) || !(signed || (r.removed && r.amount === 0)) || typeof r.createdAt !== 'number') return null;
  const save: SaveEntry = { id: r.id, goalId: r.goalId, day: r.day, amount: r.amount as number, createdAt: r.createdAt };
  if (r.where === 'cash') save.where = 'cash';
  if (type) save.type = type;
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
  const plan: Plan = { split: [...(ok ? (p.split as Split) : DEFAULT_PLAN.split)] as Split, tags };
  if (p.sweepOff === true) plan.sweepOff = true;
  if (isDayKey(p.roundUpFrom)) plan.roundUpFrom = p.roundUpFrom;
  if (isMonthStart(p.monthStart)) plan.monthStart = p.monthStart;
  return plan;
}

/** The last day a month can start on, so every month has it. */
export const MONTH_START_MAX = 28;
const isMonthStart = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= MONTH_START_MAX;

function readStart(v: unknown): StartBalance | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || Math.abs(r.amount) > AMOUNT_MAX || !isDayKey(r.day) || typeof r.at !== 'number') return undefined;
  return { amount: r.amount, day: r.day, at: r.at };
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
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_BUDGET, currency: defaultCurrency() };
  const s = raw as Record<string, unknown>;
  const legacy = s.v !== 2;
  const budgets: Partial<Record<Category, number>> = {};
  if (legacy) {
    // The old single budget was for wellbeing.
    if (isAmount(s.budget)) budgets.wellbeing = s.budget;
  } else if (typeof s.budgets === 'object' && s.budgets !== null) {
    for (const [key, value] of Object.entries(s.budgets)) if (isCategory(key) && isAmount(value)) budgets[key] = value;
  }
  const start = readStart(s.start);
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
    ...(start ? { start } : {}),
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

function writeStore(next: BudgetStore): void {
  const store = withRoundUps(next);
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
    what: input.what.trim().slice(0, WHAT_MAX) || (input.kind ? kindLabel(input.kind) : categoryLabel(input.category)),
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
    what: input.what.trim().slice(0, WHAT_MAX) || sourceLabel(input.source),
    source: input.source,
    amount,
    createdAt: Date.now(),
  };
}

export function savedFor(saves: SaveEntry[], goalId: string, today: DayKey = dayKey(new Date())): number {
  return round(saves.filter((x) => x.deletedAt === undefined && x.goalId === goalId && x.day <= today).reduce((a, x) => a + x.amount, 0));
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
  // Raising the target past what is saved makes it a goal to reach again.
  if (old?.reachedAt && savedFor(store.saves, goal.id) >= target) goal.reachedAt = old.reachedAt;
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

/** Puts money towards a goal ("" for savings with no goal). `had`: savings you already had, which this month's income did not pay for. */
export function addSave(goalId: string, amount: number, where: SaveWhere = 'card', day: DayKey = dayKey(new Date()), had = false): SaveEntry | null {
  const value = round(amount);
  if (!isAmount(value)) return null;
  const save: SaveEntry = { id: newId('s'), goalId, day, amount: value, createdAt: Date.now() };
  if (where === 'cash') save.where = 'cash';
  if (had) save.type = 'had';
  const store = getStore();
  writeStore({ ...store, saves: [save, ...store.saves] });
  return save;
}

const live = <T extends { deletedAt?: number }>(x: T) => x.deletedAt === undefined;

/** All savings, and how much of it is on the card and in cash. */
export function savingsWhere(saves: SaveEntry[], today: DayKey = dayKey(new Date())): { total: number; card: number; cash: number } {
  let total = 0;
  let cash = 0;
  for (const x of saves) {
    // Money set aside on a later day (a salary written in ahead of time) isn't saved yet.
    if (!live(x) || x.day > today) continue;
    total += x.amount;
    if (x.where === 'cash') cash += x.amount;
  }
  return { total: round(total), card: round(total - cash), cash: round(cash) };
}

const saveEntry = (id: string, goalId: string, day: DayKey, amount: number, where: SaveWhere, type?: SaveEntry['type']): SaveEntry => {
  const x: SaveEntry = { id, goalId, day, amount: round(amount), createdAt: Date.now() };
  if (where === 'cash') x.where = 'cash';
  if (type) x.type = type;
  return x;
};

/** The two halves of a move, or none when nothing can move. */
function moveEntries(amount: number, to: SaveWhere, day: DayKey, idBase = newId('m')): SaveEntry[] {
  if (!isAmount(round(amount))) return [];
  const from: SaveWhere = to === 'cash' ? 'card' : 'cash';
  return [saveEntry(`${idBase}-from`, '', day, -amount, from, 'move'), saveEntry(`${idBase}-to`, '', day, amount, to, 'move')];
}

/** Moves savings between card and cash, at most what is there. Returns the ids written (for Undo). */
export function moveSavings(amount: number, to: SaveWhere, day: DayKey = dayKey(new Date())): string[] {
  const store = getStore();
  const has = savingsWhere(store.saves)[to === 'cash' ? 'card' : 'cash'];
  const entries = moveEntries(Math.min(round(amount), has), to, day);
  if (entries.length) writeStore({ ...store, saves: [...entries, ...store.saves] });
  return entries.map((x) => x.id);
}

export interface IntoSavings {
  /** Already saved on the card and now kept in cash. */
  moved: number;
  /** Not saved before: new savings, in cash. */
  added: number;
  ids: string[];
}

/**
 * Cash taken out to keep as savings. The part already saved on the card moves to cash (so it is
 * not counted twice); the rest is new savings in cash. `idBase` keeps it once on every device.
 */
function intoSavingsEntries(store: BudgetStore, amount: number, day: DayKey, idBase: string): { entries: SaveEntry[]; moved: number; added: number } {
  const value = round(amount);
  if (!isAmount(value)) return { entries: [], moved: 0, added: 0 };
  const moved = round(Math.max(0, Math.min(value, savingsWhere(store.saves).card)));
  const added = round(value - moved);
  const entries = [...moveEntries(moved, 'cash', day, idBase), ...(added > 0 ? [saveEntry(`${idBase}-s`, '', day, added, 'cash')] : [])];
  return { entries, moved, added };
}

/** Cash taken out (a bank alert) kept as savings. */
export function intoSavings(amount: number, day: DayKey = dayKey(new Date()), idBase = newId('c')): IntoSavings {
  const store = getStore();
  const { entries, moved, added } = intoSavingsEntries(store, amount, day, idBase);
  if (entries.length) writeStore({ ...store, saves: [...entries, ...store.saves] });
  return { moved, added, ids: entries.map((x) => x.id) };
}

/** An expense that was really cash kept as savings: removes it and puts the money in savings, in one write. */
export function spendToSavings(id: string): IntoSavings | null {
  const store = getStore();
  const old = store.entries.find((e) => e.id === id && e.deletedAt === undefined);
  if (!old) return null;
  const { entries, moved, added } = intoSavingsEntries(store, old.amount, old.day, `${id}-c`);
  const now = Date.now();
  writeStore({ ...store, entries: store.entries.map((e) => (e.id === id ? marker(e, now) : e)), saves: [...entries, ...store.saves] });
  return { moved, added, ids: entries.map((x) => x.id) };
}

/** Most that can be taken out of a goal ("" for savings with no goal) from the card or cash. */
export function canTakeOut(saves: SaveEntry[], goalId: string, from: SaveWhere): number {
  const where = savingsWhere(saves);
  return round(Math.max(0, Math.min(savedFor(saves, goalId), from === 'cash' ? where.cash : where.card)));
}

/** Takes money out of savings; it goes back into what is safe to spend this month. */
export function takeOut(goalId: string, amount: number, from: SaveWhere, day: DayKey = dayKey(new Date())): SaveEntry | null {
  const store = getStore();
  const value = round(Math.min(round(amount), canTakeOut(store.saves, goalId, from)));
  if (!isAmount(value)) return null;
  const x = saveEntry(newId('o'), goalId, day, -value, from, 'out');
  writeStore({ ...store, saves: [x, ...store.saves] });
  return x;
}

export function setPlan(plan: Plan): void {
  const tags: Partial<Record<Category, CategoryTag>> = {};
  for (const c of CATEGORIES) if (plan.tags[c] && plan.tags[c] !== DEFAULT_TAGS[c]) tags[c] = plan.tags[c];
  const next: Plan = { split: [...plan.split] as Split, tags };
  if (plan.sweepOff) next.sweepOff = true;
  if (plan.roundUpFrom && isDayKey(plan.roundUpFrom)) next.roundUpFrom = plan.roundUpFrom;
  if (isMonthStart(plan.monthStart)) next.monthStart = plan.monthStart;
  writeStore({ ...getStore(), plan: next, planAt: Date.now() });
}

/** Budget months start on `day` (1 for the calendar month). */
export function setMonthStart(day: number): void {
  const plan = { ...getStore().plan };
  if (isMonthStart(day)) plan.monthStart = day;
  else delete plan.monthStart;
  setPlan(plan);
}

/** What you have now, cards and cash together; the balance counts on from it. */
export function setStartBalance(amount: number, day: DayKey = dayKey(new Date())): void {
  if (!Number.isFinite(amount) || Math.abs(amount) > AMOUNT_MAX) return;
  writeStore({ ...getStore(), start: { amount: round(amount), day, at: Date.now() } });
}

/**
 * What you have: the starting balance, plus income and less spending added after it was set
 * (on its own day, only what was added after it). Savings are still yours, so they stay in;
 * null until a starting balance is set.
 */
export function balance(store: BudgetStore, today: DayKey = dayKey(new Date())): number | null {
  const s = store.start;
  if (!s) return null;
  // Counts what happened after the balance was set, up to today: a salary written in for a
  // later day counts on that day, not before.
  const after = (x: { day: DayKey; createdAt: number; deletedAt?: number }) =>
    x.deletedAt === undefined && x.day <= today && (x.day > s.day || (x.day === s.day && x.createdAt > s.at));
  const income = store.incomes.filter(after).reduce((a, i) => a + i.amount, 0);
  const spent = store.entries.filter(after).reduce((a, e) => a + e.amount, 0);
  return round(s.amount + income - spent);
}

/** Turns the autopilot parts on or off. Round-ups count from the day they are turned on. */
export function setAutopilot(change: { sweep?: boolean; roundUps?: boolean }, today: DayKey = dayKey(new Date())): void {
  const plan = { ...getStore().plan };
  if (change.sweep !== undefined) {
    if (change.sweep) delete plan.sweepOff;
    else plan.sweepOff = true;
  }
  if (change.roundUps !== undefined) {
    if (!change.roundUps) delete plan.roundUpFrom;
    else if (!plan.roundUpFrom) plan.roundUpFrom = today;
  }
  setPlan(plan);
}

/** The first goal still short of its target (savings with no goal when there is none). */
function firstOpenGoal(store: BudgetStore): string {
  return store.goals.find((g) => g.deletedAt === undefined && savedFor(store.saves, g.id) < g.target)?.id ?? '';
}

export interface SweepOffer {
  month: MonthKey;
  /** What was left of last month, in whole units. */
  amount: number;
  goalId: string;
}

/**
 * At the start of a month: what was left of the month before, offered for savings once.
 * Answered (saved or kept) when an entry `sweep-<month>` exists, live or as a removal marker.
 */
export function sweepOffer(today: DayKey = dayKey(new Date())): SweepOffer | null {
  const store = getStore();
  if (store.plan.sweepOff) return null;
  const month = shiftMonth(periodOf(today, startDayOf(store.plan)), -1);
  if (store.saves.some((x) => x.id === `sweep-${month}`)) return null;
  const p = monthPlan(store, month, today);
  const amount = Math.floor(p.free);
  if (!p.received || amount < 1) return null;
  return { month, amount, goalId: firstOpenGoal(store) };
}

/** Saves last month's rest (`amount` null: keeps it, and stops asking for that month). */
export function answerSweep(offer: SweepOffer, amount: number | null): SaveEntry | null {
  const store = getStore();
  const id = `sweep-${offer.month}`;
  if (store.saves.some((x) => x.id === id)) return null;
  const day = period(offer.month, startDayOf(store.plan)).end;
  const value = amount === null ? 0 : round(amount);
  const x: SaveEntry = { id, goalId: offer.goalId, day, amount: value, createdAt: Date.now() };
  if (amount === null || !isAmount(value)) x.deletedAt = Date.now();
  writeStore({ ...store, saves: [x, ...store.saves] });
  return x.deletedAt === undefined ? x : null;
}

export interface CoverOffer {
  month: MonthKey;
  /** How much last month went over. */
  over: number;
  /** How much of it savings can cover (all of it, or what is saved). */
  amount: number;
}

const coverId = (month: MonthKey) => `cover-${month}`;

/**
 * At the start of a month: last month went over, and there are savings. Offered once: take it
 * from savings (so it does not come off this month), or let it come off this month. Answered
 * when an entry `cover-<month>…` exists, live or as a removal marker.
 */
export function coverOffer(today: DayKey = dayKey(new Date())): CoverOffer | null {
  const store = getStore();
  const startDay = startDayOf(store.plan);
  const month = shiftMonth(periodOf(today, startDay), -1);
  // The budget starts with the first income: a month before it was never planned, so it can't go over.
  const first = store.incomes.filter(live).reduce<DayKey | null>((min, i) => (min === null || i.day < min ? i.day : min), null);
  if (!first || month < periodOf(first, startDay)) return null;
  if (store.saves.some((x) => x.id === coverId(month) || x.id.startsWith(`${coverId(month)}-`))) return null;
  const over = round(-monthPlan(store, month, today).free);
  const saved = savingsWhere(store.saves, today).total;
  if (over < 1 || saved <= 0) return null;
  return { month, over, amount: round(Math.min(over, saved)) };
}

/**
 * Answers the offer. `take` true: takes it out of savings on the month's last day (savings with
 * no goal first, then the goals with the most in them; card before cash), so the month ends
 * even. False: nothing is taken, and the minus comes off this month.
 */
export function answerCover(offer: CoverOffer, take: boolean): SaveEntry[] {
  const store = getStore();
  const id = coverId(offer.month);
  if (store.saves.some((x) => x.id === id || x.id.startsWith(`${id}-`))) return [];
  const day = period(offer.month, startDayOf(store.plan)).end;
  const now = Date.now();
  if (!take) {
    writeStore({ ...store, saves: [{ id, goalId: '', day, amount: 0, createdAt: now, deletedAt: now }, ...store.saves] });
    return [];
  }
  const goals = ['', ...store.goals.filter(live).map((g) => g.id).sort((a, b) => savedFor(store.saves, b) - savedFor(store.saves, a))];
  const taken: SaveEntry[] = [];
  let left = round(offer.amount);
  for (const goalId of goals) {
    for (const from of ['card', 'cash'] as SaveWhere[]) {
      if (left <= 0) break;
      const saves = [...taken, ...store.saves];
      const part = round(Math.min(left, canTakeOut(saves, goalId, from)));
      if (!isAmount(part)) continue;
      taken.push(saveEntry(`${id}-${taken.length + 1}`, goalId, day, -part, from, 'out'));
      left = round(left - part);
    }
  }
  if (!taken.length) return [];
  writeStore({ ...store, saves: [...taken, ...store.saves] });
  return taken;
}

/** Round-ups put in savings in `month`. */
export function roundUpsIn(saves: SaveEntry[], month: MonthKey, startDay = 1): number {
  const p = period(month, startDay);
  return round(saves.filter((x) => live(x) && x.id.startsWith('ru-') && inPeriod(p, x.day)).reduce((a, x) => a + x.amount, 0));
}

/**
 * Keeps round-ups in step with the payments, on every write: each payment on or after
 * `roundUpFrom` gets `ru-<its id>` (the cents up to the next whole amount, as savings), and a
 * round-up whose payment was removed or changed is removed with it.
 */
function withRoundUps(store: BudgetStore): BudgetStore {
  const from = store.plan.roundUpFrom;
  const liveSpends = new Map(store.entries.filter((e) => e.deletedAt === undefined).map((e) => [e.id, e]));
  const now = Date.now();
  let changed = false;
  const saves = store.saves.map((x) => {
    if (!x.id.startsWith('ru-') || !live(x) || liveSpends.has(x.id.slice(3))) return x;
    changed = true;
    return { ...x, amount: 0, deletedAt: now };
  });
  if (from) {
    const known = new Set(saves.map((x) => x.id));
    const goalId = firstOpenGoal(store);
    for (const e of liveSpends.values()) {
      const id = `ru-${e.id}`;
      const cents = round(Math.ceil(e.amount) - e.amount);
      if (e.day < from || known.has(id) || !isAmount(cents)) continue;
      saves.unshift({ id, goalId, day: e.day, amount: cents, createdAt: now });
      changed = true;
    }
  }
  return changed ? { ...store, saves } : store;
}

/** Marks a goal as reached, once. True when it was newly reached. */
export function markReached(id: string): boolean {
  const store = getStore();
  const goal = store.goals.find((g) => g.id === id && g.deletedAt === undefined);
  if (!goal || goal.reachedAt || savedFor(store.saves, id) < goal.target) return false;
  const now = Date.now();
  writeStore({ ...store, goals: store.goals.map((g) => (g.id === id ? { ...g, reachedAt: now, updatedAt: now } : g)) });
  return true;
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
  /** Passed on from the months before: left over (above 0) or gone over (below 0). */
  carried: number;
  /** The split of `income`. */
  planned: { needs: number; wants: number; savings: number };
  /** Put aside this month. Safe to spend keeps back the larger of this and the planned savings. */
  saved: number;
  /** Taken out of savings this month: back in what is safe to spend. */
  takenOut: number;
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
  /** Spent each day of the month (from its first day), repeating bills left out. */
  byDay: number[];
  /** Repeating bills on each day of the month. */
  billsByDay: number[];
}

/** One month's money: what came in, was saved, taken out of savings and spent. */
function flow(store: BudgetStore, p: Period) {
  const received = round(store.incomes.filter((i) => live(i) && inPeriod(p, i.day)).reduce((a, i) => a + i.amount, 0));
  const saves = store.saves.filter((x) => live(x) && inPeriod(p, x.day));
  // Moves between card and cash change neither; money taken out goes back to spend.
  const saved = round(saves.filter((x) => !x.type).reduce((a, x) => a + x.amount, 0));
  const takenOut = round(-saves.filter((x) => x.type === 'out').reduce((a, x) => a + x.amount, 0));
  const spent = round(store.entries.filter((e) => live(e) && inPeriod(p, e.day)).reduce((a, e) => a + e.amount, 0));
  return { received, saved, takenOut, spent };
}

/**
 * What the months before `month` passed on, counted from the first month with income. Each
 * month's rest is worked out like the month-end sweep: what came in (with what it was passed,
 * and what was taken out of savings) less the savings (at least the planned share) and what
 * was spent. A rest the sweep put in savings is passed on no further. A month that went over
 * passes on a minus (2026-11-28, the owner's choice): it comes off the next month's money,
 * unless it was taken from savings at the end of the month (`coverOffer`).
 */
export function carriedInto(store: BudgetStore, month: MonthKey): number {
  const startDay = startDayOf(store.plan);
  const first = store.incomes.filter(live).reduce<DayKey | null>((min, i) => (min === null || i.day < min ? i.day : min), null);
  if (!first) return 0;
  const [, , sv] = store.plan.split;
  let carried = 0;
  for (let m = periodOf(first, startDay); m < month; m = shiftMonth(m, 1)) {
    const f = flow(store, period(m, startDay));
    const swept = store.saves.some((x) => live(x) && x.id === `sweep-${m}`);
    const keep = Math.max(f.saved, round((f.received * sv) / 100));
    carried = swept ? 0 : round(carried + f.received + f.takenOut - keep - f.spent);
  }
  return carried;
}

/** The month against the plan. `today` decides whether it is the current month and how many days are left. */
export function monthPlan(store: BudgetStore, month: MonthKey, today: DayKey = dayKey(new Date())): MonthPlan {
  const p = period(month, startDayOf(store.plan));
  const days = p.days;
  const current = inPeriod(p, today);
  const dom = current ? dayIndex(p, today) + 1 : days;
  const { received, saved, takenOut } = flow(store, p);
  const known = new Set(store.incomes.map((i) => i.id));
  const expected = current
    ? round(
        store.incomeRepeats
          .filter(live)
          .map((r) => ({ r, at: repeatDayIn(r, p) }))
          .filter(({ r, at }) => at && at.day > today && !known.has(`${r.id}-${at.month}`))
          .reduce((a, { r }) => a + r.amount, 0),
      )
    : 0;
  const income = round(received + expected);
  const carried = carriedInto(store, month);
  const [n, w, sv] = store.plan.split;
  const planned = { needs: round((income * n) / 100), wants: round((income * w) / 100), savings: round((income * sv) / 100) };
  const mine = store.entries.filter((e) => live(e) && inPeriod(p, e.day));
  let needs = 0;
  let wants = 0;
  let unsorted = 0;
  const byDay = new Array<number>(days).fill(0);
  for (const e of mine) {
    const tag = needOf(e, store.plan);
    if (tag === 'need') needs += e.amount;
    else if (tag === 'want') wants += e.amount;
    else unsorted += e.amount;
    if (!e.repeatId) byDay[dayIndex(p, e.day)]! += e.amount;
  }
  const spent = round(needs + wants + unsorted);
  const billsByDay = billsIn(store.repeats, p);
  const billsLater = current ? billsAfter(billsByDay, dom) : 0;
  // Bills are planned for apart from the day's money, so one paid today does not eat today's share.
  const spentToday = current ? round(mine.filter((e) => e.day === today && !e.repeatId).reduce((a, e) => a + e.amount, 0)) : 0;
  const daysLeft = current ? days - dom + 1 : 0;
  const free = round(income + carried + takenOut - Math.max(saved, planned.savings) - (spent - spentToday) - billsLater);
  const perDay = daysLeft ? free / daysLeft : 0;
  return {
    income,
    received,
    expected,
    carried,
    planned,
    saved,
    takenOut,
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
    ...newerStart(a.start, b.start),
  };
}

/** The starting balance set last, from either copy. */
function newerStart(a?: StartBalance, b?: StartBalance): { start?: StartBalance } {
  const x = !a ? b : !b ? a : b.at > a.at ? b : a;
  return x ? { start: x } : {};
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

/**
 * A budget month: from its first day to its last. With months starting on the 1st it is the
 * calendar month; starting on the 26th, November runs from 26 October to 25 November.
 */
export interface Period {
  month: MonthKey;
  start: DayKey;
  end: DayKey;
  days: number;
}

export const startDayOf = (plan: Pick<Plan, 'monthStart'>): number => plan.monthStart ?? 1;

const onDay = (month: MonthKey, day: number): DayKey => `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;

export function period(month: MonthKey, startDay = 1): Period {
  if (startDay <= 1) return { month, start: `${month}-01`, end: onDay(month, 31), days: daysInMonth(month) };
  const start = onDay(shiftMonth(month, -1), startDay);
  const end = dayKey(addDays(fromDayKey(onDay(month, startDay)), -1));
  return { month, start, end, days: dayIndex({ start }, end) + 1 };
}

/** The budget month `day` falls in. */
export function periodOf(day: DayKey, startDay = 1): MonthKey {
  const month = monthOf(day);
  return startDay > 1 && day >= onDay(month, startDay) ? shiftMonth(month, 1) : month;
}

export const inPeriod = (p: Pick<Period, 'start' | 'end'>, day: DayKey): boolean => day >= p.start && day <= p.end;

/** Days from the period's first day (0 for the first day itself). */
export function dayIndex(p: Pick<Period, 'start'>, day: DayKey): number {
  const utc = (k: DayKey) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((utc(day) - utc(p.start)) / 86_400_000);
}

/** Every day of the period, in order. */
export function periodDays(p: Period): DayKey[] {
  const first = fromDayKey(p.start);
  return Array.from({ length: p.days }, (_, i) => dayKey(addDays(first, i)));
}

/** The day a repeat falls on in the period, with the calendar month it is counted for (its entry id); null when it does not. */
export function repeatDayIn(r: Pick<Repeat, 'dayOfMonth' | 'from'>, p: Period): { day: DayKey; month: MonthKey } | null {
  for (const month of [shiftMonth(p.month, -1), p.month]) {
    if (month < r.from) continue;
    const day = repeatDay(r, month);
    if (inPeriod(p, day)) return { day, month };
  }
  return null;
}

/** Repeating bills on each day of the period. */
function billsIn(repeats: Repeat[], p: Period, category?: Category): number[] {
  const byDay = new Array<number>(p.days).fill(0);
  for (const r of repeats) {
    if (r.deletedAt !== undefined || (category && r.category !== category)) continue;
    const at = repeatDayIn(r, p);
    if (at) byDay[dayIndex(p, at.day)]! += r.amount;
  }
  return byDay;
}

export interface MonthSpend {
  entries: SpendEntry[];
  total: number;
  /** Every category with something spent. */
  byCategory: Map<Category, number>;
}

/** Spent in the month, up to its `upto`-th day. */
export function monthSpend(entries: SpendEntry[], month: MonthKey, upto = 31, startDay = 1): MonthSpend {
  const p = period(month, startDay);
  const mine = entries.filter((e) => inPeriod(p, e.day) && dayIndex(p, e.day) < upto);
  const byCategory = new Map<Category, number>();
  for (const e of mine) byCategory.set(e.category, round((byCategory.get(e.category) ?? 0) + e.amount));
  return { entries: mine, total: round(mine.reduce((sum, e) => sum + e.amount, 0)), byCategory };
}

/** Spent so far by the end of each day of the month, one number per day. */
export function runningTotals(entries: SpendEntry[], month: MonthKey, startDay = 1): number[] {
  const p = period(month, startDay);
  const perDay = new Array<number>(p.days).fill(0);
  for (const e of entries) if (inPeriod(p, e.day)) perDay[dayIndex(p, e.day)]! += e.amount;
  let sum = 0;
  return perDay.map((v) => (sum = round(sum + v)));
}

/**
 * Where spending "should" be by the end of each day of the month: repeating bills count in
 * full on their day, and the rest of the budget is spread evenly. So rent on the 1st does
 * not make the month look ahead of pace.
 */
export function paceLine(repeats: Repeat[], month: MonthKey, budget: number, category?: Category, startDay = 1): { line: number[]; billsByDay: number[] } {
  const p = period(month, startDay);
  const billsByDay = billsIn(repeats, p, category);
  const bills = billsByDay.reduce((a, b) => a + b, 0);
  const spread = Math.max(0, budget - bills) / p.days;
  let sum = 0;
  const line = billsByDay.map((b, i) => (sum += b) + spread * (i + 1));
  return { line, billsByDay };
}

/** Repeating bills in the month that fall after its `dayOfMonth`-th day. */
export function billsAfter(billsByDay: number[], dayOfMonth: number): number {
  return round(billsByDay.slice(dayOfMonth).reduce((a, b) => a + b, 0));
}

/** The totals of `count` months ending with `last`, oldest first. */
export function monthTotals(entries: SpendEntry[], last: MonthKey, count: number, category?: Category, startDay = 1): { month: MonthKey; total: number }[] {
  const out: { month: MonthKey; total: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(last, -i);
    const p = period(month, startDay);
    const mine = entries.filter((e) => inPeriod(p, e.day) && (!category || e.category === category));
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
    fmt = new Intl.NumberFormat(locale(), {
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
