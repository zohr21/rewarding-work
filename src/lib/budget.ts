/**
 * Budget: what you spend, entered by hand, against a monthly budget and optional budgets
 * per category. Bills that come back every month are "repeats": each one adds its entry on
 * its day. Copied to your account when you are signed in, like tasks and sessions.
 *
 * Kept in the `health` store, where wellbeing spend used to live (it is now the Wellbeing
 * category), so the account sync and its rules stay as they are. A store written before
 * Budget existed (no `v`) is read as wellbeing spend: see `normaliseBudget`.
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
  createdAt: number;
  deletedAt?: number;
}

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
}

export const EMPTY_BUDGET: BudgetStore = { v: 2, budget: null, budgets: {}, currency: '$', budgetAt: 0, entries: [], repeats: [] };

/** Removal markers older than this are dropped; by then every device has long since synced. */
const MARKER_MS = 180 * 86_400_000;

const isCategory = (v: unknown): v is Category => (CATEGORIES as readonly unknown[]).includes(v);
const isKind = (v: unknown): v is WellbeingKind => (WELLBEING_KINDS as readonly unknown[]).includes(v);
const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= AMOUNT_MAX;
const isMonthKey = (v: unknown): v is MonthKey => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);

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
  if (removed) repeat.deletedAt = r.deletedAt as number;
  return repeat;
}

/** Newest day first, and within a day the one added last. */
const byDay = (a: SpendEntry, b: SpendEntry) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt;
const byDayOfMonth = (a: Repeat, b: Repeat) => a.dayOfMonth - b.dayOfMonth || a.createdAt - b.createdAt;

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
  };
}

function writeStore(store: BudgetStore): void {
  const cutoff = Date.now() - MARKER_MS;
  const keep = (x: { deletedAt?: number }) => x.deletedAt === undefined || x.deletedAt > cutoff;
  write('health', { ...store, entries: store.entries.filter(keep).sort(byDay), repeats: store.repeats.filter(keep).sort(byDayOfMonth) });
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface SpendInput {
  what: string;
  category: Category;
  kind?: WellbeingKind | null;
  amount: number;
  day?: DayKey;
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
      added.push(entry);
    }
  }
  if (added.length) writeStore({ ...store, entries: [...added, ...store.entries] });
  return added.length;
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
  return {
    v: 2,
    budget: newer.budget,
    budgets: newer.budgets,
    currency: newer.currency,
    budgetAt: newer.budgetAt,
    entries: mergeById(a.entries, b.entries).sort(byDay),
    repeats: mergeById(a.repeats, b.repeats).sort(byDayOfMonth),
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
