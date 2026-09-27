import { defineConfig } from 'astro/config';
import serviceWorker from './pwa/integration.mjs';

// GitHub Pages: a project site lives at https://<user>.github.io/<repo>/.
// The deploy workflow sets SITE_URL / BASE_PATH from the repository automatically.
// For a user/org site (<user>.github.io repo) or a custom domain, BASE_PATH is /.
const site = process.env.SITE_URL ?? 'https://example.github.io';
const base = process.env.BASE_PATH ?? '/rewarding-work';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [serviceWorker()],
});
