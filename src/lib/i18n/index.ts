/**
 * Translations. The pages are built in English; in another language:
 *
 * - script-built text calls `t('today.title')`, or `tn('today.chainDays', n)` for a plural;
 * - built markup marks its text with `data-t="key"` (and `data-t-aria-label`, `data-t-title`,
 *   `data-t-placeholder` for attributes), which `translatePage` swaps before the page shows
 *   (src/scripts/i18n-boot.ts);
 * - dates go through `dateFormat(options)`, numbers through `toLocaleString(locale())`.
 *
 * The language is kept on this device (`lang` store). Changing it reloads the page, so
 * everything is drawn again in the new language.
 */
import { read, remove, write } from '../storage';
import { en, type Key, type Plural } from './en';
import { ru } from './ru';
import { az } from './az';
import { DEFAULT_LANG, deviceLang, isLang, type Lang } from './langs';

export { LANGS, BETA_LANGS, type Lang } from './langs';
export type { Key } from './en';

const LISTS: Record<Lang, Partial<Record<Key, string | Plural>>> = { en, ru, az };

let current: Lang | null = null;

/** The picked language, else the device's when Grovyn speaks it, else English. On the build server: English. */
export function getLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  current ??= read<Lang | null>('lang', null, (v): v is Lang | null => isLang(v)) ?? deviceLang() ?? DEFAULT_LANG;
  return current;
}

/** Whether someone picked a language, rather than following the device. */
export function hasPickedLang(): boolean {
  return isLang(read<unknown>('lang', null));
}

/** Pick a language (`null` follows the device again) and draw the page again in it. */
export function setLang(lang: Lang | null): void {
  if (lang) write('lang', lang);
  else remove('lang');
  current = null;
  location.reload();
}

/** The locale for Intl date and number formats: English keeps the device's own formats. */
export function locale(): string | undefined {
  const lang = getLang();
  return lang === 'en' ? undefined : lang;
}

/**
 * Some Android WebViews and desktop shells claim Azerbaijani but carry no names for it
 * ("M11 7, Sat"). Then dates are drawn in a day-month order with our own names instead.
 */
const AZ_NAMES = {
  monthLong: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
  monthShort: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'],
  // Sunday first, as Date.getDay() counts.
  weekdayLong: ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'],
  weekdayShort: ['B.', 'B.e.', 'Ç.a.', 'Ç.', 'C.a.', 'C.', 'Ş.'],
  weekdayNarrow: ['B', 'B', 'Ç', 'Ç', 'C', 'C', 'Ş'],
};

let deviceKnowsLang: boolean | null = null;
function deviceKnows(): boolean {
  if (getLang() !== 'az') return true;
  try {
    deviceKnowsLang ??= new Intl.DateTimeFormat('az', { month: 'long' }).format(new Date(2020, 0, 15)) === 'yanvar';
  } catch {
    deviceKnowsLang = false;
  }
  return deviceKnowsLang;
}

/**
 * `new Intl.DateTimeFormat(locale(), options)`, but with Azerbaijani names on a device
 * that has none. Use it for every date the page shows.
 */
export function dateFormat(options: Intl.DateTimeFormatOptions): { format: (date: Date | number) => string } {
  if (deviceKnows()) return new Intl.DateTimeFormat(locale(), options);
  // en-GB puts the day before the month, like Azerbaijani, and uses a 24-hour clock.
  const base = new Intl.DateTimeFormat('en-GB', options);
  return {
    format(date) {
      const d = new Date(date);
      return base
        .formatToParts(d)
        .map((part) => {
          if (part.type === 'month' && (options.month === 'long' || options.month === 'short')) {
            return (options.month === 'long' ? AZ_NAMES.monthLong : AZ_NAMES.monthShort)[d.getMonth()];
          }
          if (part.type === 'weekday') {
            const names = options.weekday === 'long' ? AZ_NAMES.weekdayLong : options.weekday === 'narrow' ? AZ_NAMES.weekdayNarrow : AZ_NAMES.weekdayShort;
            return names[d.getDay()];
          }
          return part.value;
        })
        .join('');
    },
  };
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function entry(key: Key): string | Plural {
  return LISTS[getLang()][key] ?? en[key];
}

/** The text for `key` in the current language, with `{name}` filled in from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const e = entry(key);
  return fill(typeof e === 'string' ? e : e.other, vars);
}

/** Where one English line of data kept in code lives: the object, its field, and its key. */
export type Slot = [object, string | number, string];

/**
 * Data kept in English in code (tours, tips, playbooks): put each line in the current language,
 * once, when the module loads. Changing the language reloads the page, so this is enough.
 */
export function translateData(slots: Slot[]): void {
  if (getLang() === 'en') return;
  for (const [o, field, key] of slots) (o as Record<string | number, unknown>)[field] = t(key as Key);
}

/** A plural: picks the form for `n` (one, few, many…) and fills in `{n}` and `vars`. */
export function tn(key: Key, n: number, vars?: Record<string, string | number>): string {
  const e = entry(key);
  if (typeof e === 'string') return fill(e, { n: n.toLocaleString(locale()), ...vars });
  const form = new Intl.PluralRules(getLang()).select(n);
  return fill(e[form] ?? e.other, { n: n.toLocaleString(locale()), ...vars });
}

/** Whether `key` is one of ours (data-t values come from markup, so they are checked). */
function isKey(v: string | undefined): v is Key {
  return !!v && v in en;
}

const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'] as const;

/**
 * Swap the text of every `data-t` element under `root` into the current language.
 * `data-t` replaces all of an element's children, so put it on the text's own <span>.
 */
export function translatePage(root: ParentNode = document): void {
  document.documentElement.lang = getLang();
  // Text written out in each language (articles): show the one picked.
  root.querySelectorAll<HTMLElement>('[data-lang]').forEach((node) => {
    node.hidden = node.dataset.lang !== getLang();
  });
  if (getLang() === 'en') return;
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((node) => {
    // data-t-n="5" fills {n} and picks the plural form: <span data-t="x.tryIn" data-t-n="5">Try it in 5 min</span>
    if (isKey(node.dataset.t)) node.textContent = node.dataset.tN === undefined ? t(node.dataset.t) : tn(node.dataset.t, Number(node.dataset.tN));
  });
  for (const attr of ATTRS) {
    root.querySelectorAll<HTMLElement>(`[data-t-${attr}]`).forEach((node) => {
      const key = node.getAttribute(`data-t-${attr}`) ?? undefined;
      if (isKey(key)) node.setAttribute(attr, t(key));
    });
  }
  // The tab title: <title data-t-doc="key" data-t-doc-suffix=" · Grovyn"> (BaseLayout's titleKey).
  const title = document.querySelector<HTMLTitleElement>('title[data-t-doc]');
  if (title && isKey(title.dataset.tDoc)) document.title = `${t(title.dataset.tDoc)}${title.dataset.tDocSuffix ?? ''}`;
}
