---
name: grovyn-verify
description: Check a Grovyn change in the browser preview — which launch config to use (site, app look, built PWA), seeding localStorage with sample data, phone width, dark mode, and what to look for. Use after editing any page, component, style or client script, before telling the user it works.
---

# Checking a change in the preview

## Pick the server (`.claude/launch.json`, start with `preview_start {name}`)

| Name | Port | What it is |
|---|---|---|
| `dev` | 4411 | the website, `/rewarding-work/` |
| `dev-app` | 4413 | `astro dev --mode app`: the Android app's look (reads `.env.app`); open `/rewarding-work/` at phone width |
| `preview-build` | 4412 | `astro preview` of `dist/`, after `npm run build`: service worker, offline, real CSS |

- **Only one `astro dev` can run per checkout.** Stop `dev` before starting `dev-app`. If
  another chat holds it, build into the scratchpad (`npx astro build --outDir <scratch>`) and
  serve it with a small static-server launch config.
- After changing `content.config.ts` or the content schema, restart the dev server.

## Seed data instead of clicking it in

Stores are `rw:v1:<name>` JSON in localStorage. Set them with `javascript_tool`, then reload:

```js
localStorage.setItem('rw:v1:profile', JSON.stringify({ welcomed: true, modules: { exam: true, health: true, budget: true, screen: true } }));
localStorage.setItem('rw:v1:sessions', JSON.stringify([/* … shapes from src/lib/storage.ts guards … */]));
location.reload();
```

Look up the exact shape in the store's type guard before writing. Seed an empty state, a
normal week, and one odd case (very long title, huge number, an old-format copy).

## Look at

1. `read_console_messages` — no errors after load **and after navigating to another page and
   back** (the client router; a missing `onPage` cleanup shows up here as duplicate handlers).
2. `read_page` / `get_page_text` for content; `resize_window` `mobile` for phone width and
   `colorScheme: dark` for the dark palette.
3. Interact: open the sheet, save, undo, swipe-close; confirm the store changed via
   `localStorage`.
4. Page height at phone width when the task was "make it shorter" — measure before and after.
5. Animations: the hidden browser pane throttles `requestAnimationFrame`; wait before
   screenshotting a 3D scene or glow.
6. Screenshot the result for the user.

## Then

- `npx astro check` (the build fails on type errors).
- For native or app-only behaviour, also check on the phone (`grovyn-phone`).
- Clear any temporary stubs or seeded files you added to the repo.
- Report honestly what was checked where: "checked in dev-app with seeded data, not on the
  phone yet".
