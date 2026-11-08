/**
 * Puts each page's built-in text into the picked language before it is seen (BaseLayout).
 *
 * On the first load the inline script in BaseLayout hides the page (`data-i18n-wait`) when a
 * language other than English is picked; this shows it again once the text is swapped. With
 * the client router, `astro:after-swap` runs before the new page is shown, so swapping there
 * needs no hiding.
 */
import { translatePage } from '../lib/i18n';

function run(): void {
  try {
    translatePage();
  } finally {
    document.documentElement.removeAttribute('data-i18n-wait');
  }
}

run();
document.addEventListener('astro:after-swap', run);
