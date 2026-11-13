/**
 * Where the device is, as far as its settings say, for the things a language alone does not
 * decide: how English dates are written, and which currency to start with. No imports, so
 * the tests and every page can share it.
 *
 * A phone set to "English (United States)" is the factory setting far outside the United
 * States, so on its own it says little. The time zone and the other languages on the phone
 * say more.
 */

/** Time zones of the United States (mainland, Alaska, Hawaii). */
const US_ZONE =
  /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Adak|Sitka|Nome|Menominee|Metlakatla|Yakutat|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu|US\/.+)$/;

/** Time zones that name one country whose currency Grovyn lists. */
const ZONE_REGION: Record<string, string> = {
  'Asia/Baku': 'AZ',
  'Europe/Istanbul': 'TR',
  'Europe/London': 'GB',
  'Europe/Moscow': 'RU',
  'Europe/Kaliningrad': 'RU',
  'Europe/Samara': 'RU',
  'Asia/Yekaterinburg': 'RU',
  'Asia/Novosibirsk': 'RU',
  'Asia/Vladivostok': 'RU',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
};

/** "az-AZ" → "AZ", "en" → null, "zh-Hant-TW" → "TW". */
function regionOf(tag: string): string | null {
  const m = /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(tag);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * The country the device is most likely used in (ISO code), or null when nothing says.
 * `tags` are the device's languages, first choice first; `timeZone` is its IANA zone.
 */
export function deviceRegion(tags: readonly string[], timeZone?: string): string | null {
  const regions = tags.map(regionOf).filter((r): r is string => r !== null);
  const first = regions[0];
  if (first && first !== 'US') return first;
  if (timeZone && US_ZONE.test(timeZone)) return 'US';
  // "en-US" first, away from the United States: the next language or the time zone says where.
  const other = regions.find((r) => r !== 'US') ?? (timeZone ? ZONE_REGION[timeZone] : undefined);
  if (other) return other;
  return first && !timeZone ? 'US' : null;
}

/**
 * The locale for English dates and numbers. `undefined` keeps the device's own formats.
 * English with a region of its own ("en-GB", "en-IN") is used as it is. "en-US" away from
 * the United States gets day-before-month dates and the 24-hour clock ("en-GB"), which is
 * how most of the world writes them.
 */
export function englishLocale(tags: readonly string[], timeZone?: string): string | undefined {
  const first = tags[0] ?? '';
  const region = regionOf(first);
  if (/^en\b/i.test(first) && region && region !== 'US') return first;
  if (!timeZone || US_ZONE.test(timeZone)) return undefined;
  return 'en-GB';
}

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
const REGION_CURRENCY: Record<string, string> = { US: 'USD', GB: 'GBP', RU: 'RUB', AZ: 'AZN', TR: 'TRY' };

/** The currency code to start a new budget with, from the ones Grovyn lists; null when the region has none of them. */
export function regionCurrency(region: string | null): string | null {
  if (!region) return null;
  return REGION_CURRENCY[region] ?? (EURO.includes(region) ? 'EUR' : null);
}

/** The device's own languages and time zone; empty on the build server. */
export function deviceSettings(): { tags: readonly string[]; timeZone?: string } {
  if (typeof navigator === 'undefined') return { tags: [] };
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  return { tags: navigator.languages?.length ? navigator.languages : [navigator.language], timeZone };
}
