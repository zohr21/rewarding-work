---
name: grovyn-ui
description: Conventions for writing or changing Grovyn's Astro pages and components (src/components, src/pages, src/scripts) — page lifecycle under the client router, sheets, app-only vs site UI, tokens, optional modules, copy style. Use whenever adding or editing UI in this repo.
---

# Grovyn UI conventions

Astro 7 + TypeScript + plain CSS, no framework. The same source builds the website
(GitHub Pages, base `/rewarding-work/`) and the Android app (Capacitor, base `/`,
`NATIVE_APP` true). Read the README sections *Page navigation* and *Data and the timer* if
something here is unclear.

## Component scripts: always `onPage`

The site uses `<ClientRouter />`, so a component `<script>` runs **once per visit, not once
per page**. Every component follows this shape:

```ts
import { onPage, listen, cleanups } from '../lib/page';
import { subscribe } from '../lib/storage';

onPage('budget-view', () => {
  const root = document.querySelector<HTMLElement>('[data-bv]');
  if (!root) return;
  const c = cleanups();
  c.add(subscribe('health', render));
  c.add(listen(document, 'visibilitychange', render));
  render();
  return c.run;
});
```

- Return a cleanup for anything outliving the DOM: `subscribe`, intervals, window/document
  listeners, our own events (`listen(target, 'board:changed', …)` works on any EventTarget).
- `history.replaceState` must keep `history.state`.
- Find elements by `data-*` hooks (`[data-bv-mix]`), not by class.
- DOM built from script: `el(tag, className, text)` from `src/lib/dom.ts`. Styles for
  script-built nodes need `:global(...)` in the component's `<style>`, or they won't apply.
- Links: `url('/budget')` from `src/lib/paths.ts` (handles the base path) — never hard-code
  `/rewarding-work/`.

## Sheets, not new pages

`src/components/Sheet.astro` is the generic dialog: bottom sheet on phone, right panel
≥ 900 px, swipe down to close.
- Open with any `[data-sheet-open="<id>"]` button; the dialog gets `sheet:open`.
- A form with unsaved changes listens for the cancelable `sheet:dismiss` and can ask first.
- Android Back closes the open sheet or dialog first (`grovynBack` in `src/scripts/device-sync.ts`,
  called by `MainActivity`), then goes back a page.

## App vs site

- `NATIVE_APP` from `src/config/app.ts` in frontmatter/TS; `html[data-app]` in CSS for
  app-only layout (see `AppNav.astro`, `TaskList.astro`).
- Native calls go through `src/lib/device.ts` only (they no-op on the site). See `grovyn-native`.
- Optional sections: `MODULES` in `src/config/site.ts`, chosen at Welcome and stored in
  `profile`. CSS `html:not([data-mod-<id>]) [data-module='<id>']` hides them.
  `APP_ONLY_MODULES` hides app-only ones on the site.
- Navigation lists: `NAV`, `FOCUS`, `FOCUS_TABS` in `site.ts`.

## Look

- Colours, spacing, motion: CSS custom properties in `src/styles/tokens.css`. The dark palette
  is written **twice** (inside the `auto` media query and for `data-theme="dark"`) — edit both.
- Shared pieces in `src/styles/global.css`: `.btn`, `.card`, `.input`, `.tool-btn`, `.popover`,
  `.tier-coin`. Raised surfaces use `--surface-grad` / `--edge`.
- Glow tokens `--glow --glow-soft --firefly --glow-strength`: only for live or earned things.
- Celebrate real progress with `celebrate()` / `celebrate(el)` from `src/lib/appearance.ts`.
- Respect `prefers-reduced-motion` and the motion switch (`data-motion`).
- 3D (three.js 0.170) is lazy-loaded and page-scoped (`src/lib/scene/tree.ts`,
  `src/lib/scene/sprig3d.ts`). Sprig models come from `art/sprig/sprig3d.py`:
  `blender --background --factory-startup --python art/sprig/sprig3d.py -- --stage N --out DIR --preview`
  (Blender at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`), output to
  `public/sprig/sprig-<n>.glb`. Re-export after editing the script.
- New sound files: `scripts/encode-sound.mjs`, then bump `SOUNDS` in `pwa/sw.template.js`.

## Copy

- Product name is **Grovyn**. Keep `rw:` / `rw-` keys, the Firebase project id and the
  `/rewarding-work/` base path as they are — never rename them without asking.
- Plain, short, kind. No guilt ("you missed…"), no jargon on Today, no "browser" in the app.
- Contact links use `SITE.supportEmail`; copyright uses `SITE.owner`. Never a personal address.
- Money goes through `formatMoney` (respects currency and "Hide amounts").
- Undoable actions call `offerUndo` (`src/lib/undo.ts`) instead of a confirm dialog.

## Before you finish

`npx astro check` must pass (the build runs it). Then check it with `grovyn-verify`.
