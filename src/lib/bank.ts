/**
 * Bank alerts into Budget (Android app only). The phone keeps notifications from the bank
 * apps and SMS senders you picked (BankInbox.java); this reads each one, works out whether
 * it is money you spent, how much, where and on which day, and adds it to Budget, or puts
 * it in a short list to check first when something about it is unsure.
 *
 * Kept in the `bank` store, on this device only: settings, what waits for review, and the
 * last alerts read, so you can always see what was read and what was done with it. Only the
 * expenses it adds go to the synced Budget store.
 */
import { read, write } from './storage';
import { dayKey, fromDayKey, isDayKey, addDays, type DayKey } from './dates';
import type { BankNotice, BankSources } from './device';
import { CATEGORIES, currencyCode, getBudget, importSpend, importSpends, removeSpends, renameSpends, WHAT_MAX, type Category, type SpendEntry } from './budget';

/** Bank apps offered in setup, when they are on the phone (each also listed in AndroidManifest.xml <queries>). */
export const BANK_APPS: { pkg: string; name: string }[] = [
  { pkg: 'iba.mobilbank', name: 'ABB' },
  { pkg: 'az.kapitalbank.mbanking', name: 'Birbank' },
  { pkg: 'az.unibank.mbanking', name: 'Unibank' },
  { pkg: 'com.rabitabank', name: 'Rabitabank' },
  { pkg: 'com.ftfarm.leo', name: 'Leobank' },
  { pkg: 'com.m10', name: 'm10' },
  { pkg: 'com.paypal.android.p2pmobile', name: 'PayPal' },
];

/** SMS apps whose notifications are titled with the sender. */
export const SMS_APPS = ['com.samsung.android.messaging', 'com.google.android.apps.messaging'];

/** Senders offered in setup; you can add others. Azericard sends the card alerts of many Azerbaijani banks. */
export const BANK_SENDERS = ['Azericard', 'ABB', 'Birbank', 'KapitalBank', 'Rabitabank', 'Unibank', 'Leobank', 'PASHA Bank', 'Yelo Bank', 'AccessBank', 'Xalq Bank', 'Bank Respublika'];
export const SENDER_MAX = 30;

export type Outcome = 'added' | 'review' | 'skipped' | 'income' | 'declined' | 'duplicate' | 'not-money';

export const OUTCOME_LABELS: Record<Outcome, string> = {
  added: 'Added',
  review: 'To check',
  skipped: 'Left out by you',
  income: 'Money in: left out',
  declined: 'Declined: left out',
  duplicate: 'Same payment again: left out',
  'not-money': 'No payment in it',
};

/** An expense that waits for you: the amount is in another currency, or it isn't clear money went out. */
export interface Pending {
  /** The alert's id (BankInbox.java). */
  id: string;
  at: number;
  /** The bank, or the SMS sender. */
  from: string;
  what: string;
  amount: number;
  /** As the alert says it, e.g. "USD". */
  currency: string;
  day: DayKey;
  category: Category;
  /** In another currency than Budget's; not clear money went out; or it looks like money moved to your own account. */
  why: 'currency' | 'direction' | 'transfer';
  text: string;
}

/** One alert read, newest first: what it said and what was done with it. */
export interface LogItem {
  id: string;
  at: number;
  from: string;
  text: string;
  outcome: Outcome;
}

export interface BankStore {
  v: 1;
  /** Reading is on: the phone keeps alerts from `apps` and `senders`. */
  on: boolean;
  /** Clear expenses in the Budget currency go straight in; the rest wait in `pending` either way. */
  auto: boolean;
  apps: string[];
  senders: string[];
  pending: Pending[];
  /** A place you put in a category, by `placeKey`, so the next payment there goes to the same one. */
  rules: Record<string, Category>;
  /** Recent payments, to drop the same one told twice (the bank's app and an SMS). */
  recent: { id: string; amount: number; currency: string; at: number }[];
  log: LogItem[];
  /** The last imports of past SMS, newest first, for Undo. */
  imports: ImportBatch[];
}

export const EMPTY_BANK: BankStore = { v: 1, on: false, auto: true, apps: [], senders: [], pending: [], rules: {}, recent: [], log: [], imports: [] };

const LOG_MAX = 20;
const LOG_TEXT_MAX = 300;
const PENDING_MAX = 400;
const IMPORTS_MAX = 5;
const RECENT_MS = 2 * 86_400_000;
/** The same amount from another source within this time is the same payment. */
const TWICE_MS = 5 * 60_000;

const isCategory = (v: unknown): v is Category => (CATEGORIES as readonly unknown[]).includes(v);
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).map((x) => x.slice(0, max)) : []);
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null);

export function normaliseBank(raw: unknown): BankStore {
  const s = obj(raw);
  if (!s) return EMPTY_BANK;
  const rules: Record<string, Category> = {};
  for (const [k, v] of Object.entries(obj(s.rules) ?? {})) if (isCategory(v)) rules[k] = v;
  const pending = (Array.isArray(s.pending) ? s.pending : []).flatMap((x): Pending[] => {
    const p = obj(x);
    return p &&
      typeof p.id === 'string' &&
      typeof p.at === 'number' &&
      typeof p.amount === 'number' &&
      p.amount > 0 &&
      typeof p.currency === 'string' &&
      isDayKey(p.day) &&
      isCategory(p.category)
      ? [
          {
            id: p.id,
            at: p.at,
            from: String(p.from ?? ''),
            what: String(p.what ?? ''),
            amount: p.amount,
            currency: p.currency,
            day: p.day,
            category: p.category,
            why: p.why === 'currency' || p.why === 'transfer' ? p.why : 'direction',
            text: mask(String(p.text ?? '')),
          },
        ]
      : [];
  });
  const recent = (Array.isArray(s.recent) ? s.recent : []).flatMap((x) => {
    const r = obj(x);
    return r && typeof r.id === 'string' && typeof r.amount === 'number' && typeof r.currency === 'string' && typeof r.at === 'number'
      ? [{ id: r.id, amount: r.amount, currency: r.currency, at: r.at }]
      : [];
  });
  const log = (Array.isArray(s.log) ? s.log : []).flatMap((x): LogItem[] => {
    const l = obj(x);
    return l && typeof l.id === 'string' && typeof l.at === 'number' && typeof l.outcome === 'string' && l.outcome in OUTCOME_LABELS
      ? [{ id: l.id, at: l.at, from: String(l.from ?? ''), text: mask(String(l.text ?? '')), outcome: l.outcome as Outcome }]
      : [];
  });
  const imports = (Array.isArray(s.imports) ? s.imports : []).flatMap((x): ImportBatch[] => {
    const b = obj(x);
    return b && typeof b.id === 'string' && typeof b.at === 'number' ? [{ id: b.id, at: b.at, ids: strings(b.ids, 100), pendingIds: strings(b.pendingIds, 100) }] : [];
  });
  return {
    v: 1,
    on: s.on === true,
    auto: s.auto !== false,
    apps: strings(s.apps, 200),
    senders: strings(s.senders, SENDER_MAX),
    pending,
    rules,
    recent,
    log,
    imports,
  };
}

export const getBank = (): BankStore => normaliseBank(read<unknown>('bank', null));
const writeBank = (store: BankStore) => write('bank', store);

/** What the phone should keep, from the settings; nothing while reading is off. */
export function sourcesOf(store: BankStore): BankSources {
  if (!store.on) return { apps: [], sms: [], senders: [] };
  return { apps: store.apps, sms: store.senders.length ? SMS_APPS : [], senders: store.senders };
}

export function setBankSettings(change: Partial<Pick<BankStore, 'on' | 'auto' | 'apps' | 'senders'>>): BankStore {
  const store = { ...getBank(), ...change };
  // Turning it off forgets what it read; the expenses it added stay in Budget.
  const next = store.on ? store : { ...store, pending: [], recent: [], log: [] };
  writeBank(next);
  return next;
}

// ---------- Reading an alert ----------

export interface Reading {
  /** Money went out, came in, or the alert doesn't say. */
  direction: 'out' | 'in' | 'unsure';
  /** Looks like money moved to your own wallet or account. */
  transfer: boolean;
  declined: boolean;
  amount: number;
  /** ISO code where known ("AZN"), else as written. */
  currency: string;
  /** Where it was spent, as the bank writes it; empty when the alert doesn't say. */
  place: string;
  /** The day of the payment the alert gives, if it gives one. */
  day: DayKey | null;
}

/** Lower case and plain Latin letters, so "Ödəniş", "odenis" and "odenish" read alike. */
export function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[əä]/g, 'e')
    .replace(/[ıİ]/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c');
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(azn|₼|manat|man\.?)$/i, 'AZN'],
  [/^(usd|\$)$/i, 'USD'],
  [/^(eur|€)$/i, 'EUR'],
  [/^(rub|₽|руб\.?)$/i, 'RUB'],
  [/^(try|₺|tl)$/i, 'TRY'],
  [/^(gbp|£)$/i, 'GBP'],
];
const CUR = String.raw`AZN|₼|manat|man\.?|USD|\$|EUR|€|RUB|₽|руб\.?|TRY|₺|TL|GBP|£`;
const NUM = String.raw`\d{1,3}(?:[   ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
/** "-2.80 AZN", "2 802.65 AZN", "₼12,50", "USD -5". */
const MONEY = new RegExp(String.raw`([+\-−])?\s?(${NUM})\s?(${CUR})(?![A-Za-z])|(?<![A-Za-z])(${CUR})\s?([+\-−])?\s?(${NUM})`, 'giu');
/** Amounts that are not the payment: what is left, and fees. */
const NOT_PAYMENT = /(balans|balance|qalig\w*|qaliq|qalıq|остаток|баланс|vergi|komissiya|commission|fee|limit)\s*:?\s*[+\-−]?\s*$/i;
const AMOUNT_KEY = /(mebleg|məbləğ|amount|сумма)\s*:?\s*$/i;

const DECLINED = /imtina|redd|ugursuz|declined|failed|insufficient|catismazlig|отказ|отклон|недостаточно/;
const INCOME = /terminal payment|medaxil|daxil ol|emek haqqi|maas|mukafat|cashback|kesbek|gelir|qaytar|legv|refund|credited|received|зачисл|пополн|поступ|возврат/;
/** Money moved to your own wallet or account (topping up m10, the ABB app's transfers) or taken out as cash: not spending, unless you say so. */
const TRANSFER = /\batm|top ?up|abb mobile|card ?to ?card|\bc2c\b|\bp2p\b|kocurme|перевод|transfer/;
const SPENT = /odenis|alis|mexaric|silin|tutul|kocurme|purchase|payment|paid|spent|debit|списан|оплат|покупк|abune haqqi|xidmet haqqi/;
/**
 * Offers and notices with an amount in them: loans and cards offered ("10000 AZN-dek"),
 * repayments due, links to follow, a payment you are about to confirm.
 */
const NOT_A_PAYMENT =
  /https?:\/\/|www\.|teklif|kampaniya|endirim|muraciet edin|sifaris (edin|et)|lotereya|ipoteka|-dek\b|limitinedek|ayda cemi|minimum mebleg|odeme tarixi|odenilecek|kreditiniz uzre|credit limit|icra edilecek|istediyiniz|tesdiq ed/;
/** One-time codes, which the phone already drops (BankInbox.java): never read, even if one slips through. */
const CODE = /(otp|code|kod|şifr|sifr|parol|пароль|код)\D{0,25}\d{4,8}|\b\d{4,8}\b\D{0,25}(code|kod|код)|\b3ds\b|bu kodu/iu;

const PLACE_LABEL = /(?:merchant|mercant|satici|obyekt|terminal|место|магазин)[ \t]*:/i;
/** The place after its label, on the same line only: "Merchant:" with nothing after it is no place. */
const PLACE_KEY = /(?:merchant|mercant|satici|obyekt|terminal|место|магазин)[ \t]*:[ \t]*([^\n]+?)(?=\s{2,}|\n|\s+(?:balans|balance|tarix)\b|$)/i;
/** Words for what happened, not where: "Payment Azercell" is Azercell, "Əməliyyat:" alone is no place. */
const ACTION = /^(payment|purchase|ödəniş|odenis|odenish|alış|alis|əməliyyat|emeliyyat|köçürmə|kocurme|transfer)(?=[\s:]|$)[\s:]*/iu;

function toNumber(s: string): number {
  const t = s.replace(/[   ]/g, '');
  return Number(t.replace(',', '.'));
}

function toCurrency(s: string): string {
  for (const [re, code] of CURRENCY_WORDS) if (re.test(s)) return code;
  return s.toUpperCase();
}

/** "2026-10-14", "14.10.2026" or "14/10/2026" in the alert. */
function dayIn(text: string): DayKey | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /\b(\d{2})[./](\d{2})[./](\d{4})\b/.exec(text);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

/** What is left of the alert once amounts, cards, dates and labels are taken out: the best guess at the place. */
function placeGuess(text: string): string {
  const parts = text
    .replace(MONEY, '\n')
    .replace(/\d*\*+\d+/g, '\n')
    .replace(/\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4}|\d{1,2}:\d{2}(:\d{2})?/g, '\n')
    .split(/\n|\s{2,}|[|;]|,\s|\.\s/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '').replace(ACTION, ''))
    .filter((p) => /\p{L}{2}/u.test(p) && !/^(balans|balance|hesab|kart|card|tarix|date|vergi|hormetli|hörmətli|sizin|dear)\b/i.test(p));
  // Words like "payment" say what happened, not where.
  const named = parts.filter((p) => !SPENT.test(plain(p)) || /[A-Z]{3}/.test(p));
  return (named[0] ?? parts[0] ?? '').slice(0, WHAT_MAX);
}

export function readAlert(raw: string): Reading | null {
  const text = clean(raw);
  const words = plain(text);
  let best: { amount: number; currency: string; sign: string } | null = null;
  for (const m of text.matchAll(MONEY)) {
    const before = text.slice(Math.max(0, m.index! - 16), m.index!);
    if (NOT_PAYMENT.test(before)) continue;
    const found = { sign: m[1] ?? m[5] ?? '', amount: toNumber(m[2] ?? m[6]!), currency: toCurrency(m[3] ?? m[4]!) };
    if (!(found.amount > 0)) continue;
    if (AMOUNT_KEY.test(before)) {
      best = found;
      break;
    }
    best ??= found;
  }
  if (!best) return null;
  const declined = DECLINED.test(words);
  const direction =
    best.sign === '+' ? 'in' : best.sign === '-' || best.sign === '−' ? 'out' : INCOME.test(words) ? 'in' : SPENT.test(words) ? 'out' : 'unsure';
  // A "Merchant:" line that is there but empty means the bank didn't say where.
  const place = tidyPlace(PLACE_LABEL.test(text) ? (PLACE_KEY.exec(text)?.[1]?.trim() ?? '') : placeGuess(text));
  return {
    direction,
    transfer: TRANSFER.test(words),
    declined,
    amount: Math.round(best.amount * 100) / 100,
    currency: best.currency,
    place,
    day: dayIn(text),
  };
}

/** "AL MARKET 6077" → "Al Market", "PAYPAL *P1A2B3C4D" → "Paypal": terminal and order numbers off, shouting softened. */
export function tidyPlace(place: string): string {
  const words = place.split(/\s+/).filter(Boolean);
  while (words.length > 1 && /\d/.test(words.at(-1)!)) words.pop();
  let out = words.join(' ').replace(/\s*\*\S*$/, '').trim() || place.trim();
  if (out === out.toUpperCase() && /\p{Lu}{2}/u.test(out)) out = out.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return out.slice(0, WHAT_MAX);
}

/** Without the invisible direction marks banks wrap amounts in ("-\u200e1.00\u200e₼"). */
export const clean = (text: string) => mask(text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')).trim();

/** "CARD 4111111111111111" → "CARD •••• 1111": full card and account numbers are never kept (the phone masks them too, BankInbox.java). */
export const mask = (text: string) => text.replace(/(?:\d[ -]?){8,}(\d{4})\b/g, '\u2022\u2022\u2022\u2022 $1');

/**
 * The words of an alert to read: an SMS's text, or a bank app's title and text, since
 * ABB puts the amount in the title ("💸 Köçürmə: -1.00₼") and the card and balance below.
 */
export const alertText = (notice: Pick<BankNotice, 'sms' | 'title' | 'text'>) =>
  clean(notice.sms ? notice.text : [notice.title, notice.text].filter(Boolean).join('\n'));

/** True for alerts that mention money but aren't a payment: offers, links to confirm something. */
export const isNotice = (raw: string) => {
  const text = clean(raw);
  return CODE.test(text) || NOT_A_PAYMENT.test(plain(text));
};

// ---------- Categories ----------

/** A place's name without card numbers, terminal numbers and punctuation: "PIZZA HUT CASPIAN P 2" → "pizza hut caspian p". */
export const placeKey = (place: string) =>
  plain(place)
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Matched against `placeKey` (plain letters: "sh" is "s"). First match wins, so "bolt food" is food before "bolt" is transport. */
const PLACE_WORDS: [RegExp, Category][] = [
  [/wolt|bolt food|yemek|market|bravo|araz|bazarstore|oba|neptun|globus|tendir|cerez|kulinar|pizza|mc ?donald|kfc|erzaq|cake|dinner|keytrinq|burger|dodo|papa john|falafel|sirniyyat|restoran|restaurant|cafe|kafe|coffee|kofe|bakery|isti|gallus|doner|donar|kabab|kebab|\bcay\b|food/, 'food'],
  [/bolt|uber|yango|taxi|taksi|metro|bakikart|jet saring|azpetrol|socar|lukoil|parking|parkinq|avtobus/, 'transport'],
  [/azercell|bakcell|\bnar\b|kontakt home|aztelecom|baktelecom|azeriqaz|azerigaz|azerisiq|azersu|internet|kommunal|ikea|sms notification|abune haqqi/, 'home'],
  [/aptek|pharm|klinik|clinic|hospital|xestexana|stomat|dental|gym|fitness|sport|iherb|medical|tibb/, 'wellbeing'],
  [/netflix|spotify|youtube|google|apple|steam|playstation|xbox|cinema|kino|iticket|farlight|game|oyun|bar\b|pub\b/, 'fun'],
];

export function guessCategory(place: string, rules: Record<string, Category>): Category {
  const key = placeKey(place);
  if (key && rules[key]) return rules[key];
  for (const [re, category] of PLACE_WORDS) if (re.test(key)) return category;
  return 'other';
}

/** Remember where a place goes, from a choice you made. */
export function learnCategory(place: string, category: Category): void {
  const key = placeKey(place);
  if (!key) return;
  const store = getBank();
  if (store.rules[key] === category) return;
  writeBank({ ...store, rules: { ...store.rules, [key]: category } });
}

// ---------- Taking alerts in ----------

const entryId = (noticeId: string) => `b-${noticeId}`;

/** A readable name for where an alert came from: the bank's app, or the SMS sender. */
export function sourceName(notice: Pick<BankNotice, 'sms' | 'title' | 'app' | 'pkg'>): string {
  if (notice.sms) return notice.title.trim();
  return BANK_APPS.find((a) => a.pkg === notice.pkg)?.name ?? notice.app;
}

export type PlanOutcome = Exclude<Outcome, 'skipped'> | 'already' | 'known';

/** What one alert comes to, worked out without changing anything (`planAlerts`). */
export interface Planned {
  notice: BankNotice;
  from: string;
  /**
   * `added`: a clear expense in the Budget currency. `review`: an expense to check first.
   * `already`: an expense you typed in yourself on the same day for the same amount.
   * `known`: this alert was handled before.
   */
  outcome: PlanOutcome;
  pending?: Pending;
}

/**
 * Reads alerts and works out what each one says: an expense in the Budget currency, one to
 * check first (another currency, a transfer, unclear direction), or something to leave out
 * (money in, declined, not a payment, the same payment told twice, already in Budget).
 */
export function planAlerts(notices: BankNotice[], now = Date.now()): Planned[] {
  const store = getBank();
  const budget = getBudget();
  const budgetCurrency = currencyCode(budget.currency);
  const known = new Set([...store.log.map((l) => l.id), ...store.pending.map((p) => p.id), ...budget.entries.map((e) => e.id.replace(/^b-/, '').replace(/-r$/, ''))]);
  // Expenses typed in by hand, so an alert for one of them doesn't add it again.
  const typed = new Set(budget.entries.filter((e) => !e.from && !e.repeatId).map((e) => `${e.day}|${e.amount}`));
  const today = dayKey(new Date(now));
  const paid = store.recent.filter((r) => now - r.at < RECENT_MS);
  const plan: Planned[] = [];

  for (const notice of [...notices].sort((a, b) => a.at - b.at)) {
    const from = sourceName(notice);
    const body = alertText(notice);
    const reading = readAlert(body);
    if (known.has(notice.id)) {
      // Still a payment told once already, so its twin from another source stays left out.
      if (reading && reading.direction !== 'in') paid.push({ id: notice.id, amount: reading.amount, currency: reading.currency, at: notice.at });
      plan.push({ notice, from, outcome: 'known' });
      continue;
    }
    known.add(notice.id);
    if (!reading || isNotice(body)) plan.push({ notice, from, outcome: 'not-money' });
    else if (reading.declined) plan.push({ notice, from, outcome: 'declined' });
    else if (reading.direction === 'in') plan.push({ notice, from, outcome: 'income' });
    else if (paid.some((r) => r.amount === reading.amount && r.currency === reading.currency && Math.abs(r.at - notice.at) < TWICE_MS)) {
      plan.push({ notice, from, outcome: 'duplicate' });
    } else {
      paid.push({ id: notice.id, amount: reading.amount, currency: reading.currency, at: notice.at });
      const posted = dayKey(new Date(notice.at));
      // A day the alert gives is trusted only when it is close to when it came.
      const day = reading.day && reading.day <= today && reading.day >= dayKey(addDays(fromDayKey(posted), -7)) ? reading.day : posted;
      const sure = reading.direction === 'out' && !reading.transfer && reading.currency === budgetCurrency;
      const why: Pending['why'] = reading.currency !== budgetCurrency ? 'currency' : reading.transfer ? 'transfer' : 'direction';
      const pending: Pending = {
        id: notice.id,
        at: notice.at,
        from,
        what: reading.place || from,
        amount: reading.amount,
        currency: reading.currency,
        day,
        category: guessCategory(reading.place, store.rules),
        why,
        text: body.slice(0, LOG_TEXT_MAX),
      };
      const outcome = sure && typed.has(`${day}|${reading.amount}`) ? 'already' : sure ? 'added' : 'review';
      plan.push({ notice, from, outcome, pending });
    }
  }
  return plan;
}

/** An import of past alerts, kept so it can be undone as one. */
export interface ImportBatch {
  id: string;
  at: number;
  /** Expense ids it added. */
  ids: string[];
  /** Alerts it put in To check. */
  pendingIds: string[];
}

export interface Applied {
  added: SpendEntry[];
  review: number;
}

/**
 * Does what a plan says. `add` false puts even the clear expenses in To check (adding on its
 * own is off); `review` false leaves the unsure ones out instead of putting them there. `log`
 * keeps the alerts in Recently read (live alerts; an import of hundreds would push the rest
 * out). `batch` records the import so it can be undone as one.
 */
export function applyPlan(plan: Planned[], options: { add: boolean; review: boolean; log: boolean; batch?: boolean }, now = Date.now()): Applied {
  const fresh = plan.filter((p) => p.outcome !== 'known');
  if (!fresh.length) return { added: [], review: 0 };
  const toAdd = options.add ? fresh.filter((p) => p.outcome === 'added') : [];
  const added = importSpends(
    toAdd.map((p) => ({
      input: { what: p.pending!.what, category: p.pending!.category, amount: p.pending!.amount, day: p.pending!.day },
      id: entryId(p.notice.id),
      from: p.from,
    })),
  );
  const addedIds = new Set(added.map((e) => e.id));
  const waiting = options.review
    ? fresh.filter((p) => p.pending && (p.outcome === 'review' || (p.outcome === 'added' && !options.add))).map((p) => p.pending!)
    : [];
  const store = getBank();
  const outcomeOf = (p: Planned): Outcome =>
    p.outcome === 'added'
      ? addedIds.has(entryId(p.notice.id))
        ? 'added'
        : 'review'
      : p.outcome === 'already' || p.outcome === 'known'
        ? 'duplicate'
        : p.outcome;
  const log = options.log
    ? [...fresh.map((p) => ({ id: p.notice.id, at: p.notice.at, from: p.from, text: alertText(p.notice).slice(0, LOG_TEXT_MAX), outcome: outcomeOf(p) })).reverse(), ...store.log].slice(0, LOG_MAX)
    : store.log;
  const recent = [
    ...store.recent,
    ...fresh.filter((p) => p.pending).map((p) => ({ id: p.notice.id, amount: p.pending!.amount, currency: p.pending!.currency, at: p.notice.at })),
  ].filter((r) => now - r.at < RECENT_MS);
  const imports =
    options.batch && (added.length || waiting.length)
      ? [{ id: `i${now.toString(36)}`, at: now, ids: added.map((e) => e.id), pendingIds: waiting.map((p) => p.id) }, ...store.imports].slice(0, IMPORTS_MAX)
      : store.imports;
  writeBank({ ...store, pending: [...waiting.reverse(), ...store.pending].slice(0, PENDING_MAX), recent, log, imports });
  return { added, review: waiting.length };
}

export interface Taken extends Applied {
  /** Every alert dealt with, to remove from the phone's inbox. */
  ids: string[];
}

/** Live alerts, as they come: an expense goes in (when adding on its own is on), the unsure wait in To check. Safe to run twice. */
export function takeAlerts(notices: BankNotice[], now = Date.now()): Taken {
  const store = getBank();
  if (!notices.length || !store.on) return { ids: [], added: [], review: 0 };
  return { ids: notices.map((n) => n.id), ...applyPlan(planAlerts(notices, now), { add: store.auto, review: true, log: true }, now) };
}

/**
 * Names an early version got wrong: "Balans: 598.74 AZN" (an empty "Merchant:" line read
 * the line after it) and ABB's "Əməliyyat" (operation). They become the bank's name.
 */
export function repairImportedNames(): number {
  const wrong = /^(balans|balance)\s*:|^(əməliyyat|emeliyyat|köçürmə|kocurme)$/i;
  return renameSpends(getBudget().entries.filter((e) => e.from && wrong.test(e.what)).map((e) => ({ id: e.id, what: e.from! })));
}

/** Takes back an import: the expenses it added and what it put in To check. */
export function undoImport(id: string): void {
  const store = getBank();
  const batch = store.imports.find((b) => b.id === id);
  if (!batch) return;
  removeSpends(batch.ids);
  const gone = new Set(batch.pendingIds);
  writeBank({ ...store, pending: store.pending.filter((p) => !gone.has(p.id)), imports: store.imports.filter((b) => b.id !== id) });
}

/** Leaves everything in To check out. */
export function dropAllPending(): void {
  const store = getBank();
  const gone = new Set(store.pending.map((p) => p.id));
  writeBank({ ...store, pending: [], log: store.log.map((l) => (gone.has(l.id) ? { ...l, outcome: 'skipped' as const } : l)) });
}

/** Adds a reviewed expense, with what you changed. Learns the category for next time. */
export function acceptPending(id: string, input: { what: string; category: Category; amount: number; day: DayKey }): SpendEntry | null {
  const store = getBank();
  const item = store.pending.find((p) => p.id === id);
  if (!item) return null;
  const entry = importSpend(input, entryId(id), item.from);
  if (item.category !== input.category) learnCategory(item.what, input.category);
  dropPending(id, 'added');
  return entry;
}

/** Leaves a reviewed alert out. */
export function dropPending(id: string, outcome: Outcome = 'skipped'): void {
  const store = getBank();
  writeBank({
    ...store,
    pending: store.pending.filter((p) => p.id !== id),
    log: store.log.map((l) => (l.id === id ? { ...l, outcome } : l)),
  });
}
