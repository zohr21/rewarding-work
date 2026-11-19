/**
 * The privacy policy's date, and the English version each translation was made from.
 *
 * The English page (src/pages/privacy.astro) is the one that applies; the translations in
 * src/components/privacy/ say so at the top. When the English changes, move PRIVACY_UPDATED:
 * the build then fails until each translation is brought up to date and its date here moved
 * to match.
 */
export const PRIVACY_UPDATED = '20 November 2026';

export const PRIVACY_TRANSLATED: Record<'ru' | 'az', string> = {
  ru: '20 November 2026',
  az: '20 November 2026',
};
