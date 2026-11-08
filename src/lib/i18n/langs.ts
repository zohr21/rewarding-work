/**
 * The languages Grovyn speaks. No imports, so the build, the page scripts and the inline
 * script in BaseLayout can all share it.
 */

export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Русский' },
  { id: 'az', name: 'Azərbaycanca' },
] as const;
export type Lang = (typeof LANGS)[number]['id'];

export const DEFAULT_LANG: Lang = 'en';

/**
 * Languages whose word lists are still being filled in: the picker marks them "beta", and
 * Grovyn never picks them by itself from the phone's language. Remove one when its
 * translation is complete and reviewed.
 */
export const BETA_LANGS: readonly Lang[] = ['ru', 'az'];

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGS.some((l) => l.id === v);
}

/** The phone's or browser's language, when Grovyn speaks it and it is not still in beta. */
export function deviceLang(): Lang | null {
  if (typeof navigator === 'undefined') return null;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const id = tag.toLowerCase().split('-')[0];
    if (isLang(id) && !BETA_LANGS.includes(id)) return id;
  }
  return null;
}
