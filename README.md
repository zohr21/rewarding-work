# Rewarding Work

A static site that teaches evidence-aware techniques for making tasks feel rewarding —
and lets you try each one on the spot. Built with Astro, TypeScript and plain CSS.
No backend: all user data lives in the browser's localStorage.

## Run locally

Requires Node.js 22.12 or newer (22.19+ recommended).

```bash
npm install
npm run dev        # http://localhost:4321/rewarding-work/
npm run build      # type-check (astro check) + static build into dist/
npm run preview    # serve the built site
```

The site is served under the base path `/rewarding-work/` so that local URLs match
GitHub Pages. Change it in `astro.config.mjs` (or set `BASE_PATH`).

> **Windows: keep the project path short.** Astro 7 on Windows silently leaves all CSS
> out of `npm run build` when the project folder path is very long (~150+ characters).
> `npm run dev` is unaffected. Use a folder like `C:\code\rewarding-work`. The build
> prints a warning if it happens (and fails in CI, so an unstyled site is never deployed).

## Project layout

```
src/
  config/site.ts        site name, tagline, main navigation
  data/                 taxonomy (problems, categories, evidence), quiz
  content/techniques/   one Markdown file per technique
  styles/tokens.css     all colours, type, spacing, motion, background palettes
  styles/global.css     reset, base elements, shared .btn / .card / .input …
  layouts/BaseLayout.astro
  components/           UI pieces (timer, heatmap, chain, quiz, look + sound menus …)
  lib/                  storage, timer engine, stats, dates, paths, appearance, page lifecycle
  lib/scene/            WebGL background scenes (runner + one shader per scene)
  lib/sound/            background sound: synthesised soundscapes, YouTube, player
  pages/                one file per route
public/                 copied as-is: favicon, manifest.webmanifest, icons/
pwa/                    service worker template + the build step that generates it
.github/workflows/      GitHub Pages deployment
```

### Look and feel

- Colours are CSS custom properties in `src/styles/tokens.css`.
- **Light is the default.** The "Look" menu in the header switches theme
  (Light / Dark / Auto = follow the system), background and gentle background motion.
  Choices are stored locally and applied before first paint (no flash).
- Backgrounds come in two kinds:
  - **Soft glows** (Sunrise / Meadow / Lavender, or Plain): four CSS gradients that
    drift slowly and lean towards the pointer. Palettes are the `--amb-*` tokens.
  - **Live scenes** (Aurora / Floating lights / Calm water / Rolling hills): WebGL
    fragment shaders in `src/lib/scene/scenes/`, drawn by `src/lib/scene/runner.ts`.
    Fully procedural (no images or models, a few KB each, loaded only when chosen),
    with a light and a dark palette each. To stay cheap on battery they render at
    reduced resolution, at most 30 fps, not at all in a hidden tab, and as one still
    frame when motion is off. While a focus session runs they slow down and fade back.
    Without WebGL the Sunrise glow is shown instead.
- Both kinds "bloom" when you finish a session, log something as done, tick a step
  or mark your chain (`celebrate()` in `src/lib/appearance.ts`), and stop moving with
  the menu switch or `prefers-reduced-motion`. `src/components/Ambient.astro` owns it.
- To add a scene: write `src/lib/scene/scenes/<id>.ts` (a `scene(uv, p, t)` GLSL
  function + two palettes; see `prelude.ts` for the uniforms and noise helpers), add
  the id to `SCENES` in `src/lib/storage.ts`, and a label + preview in `src/lib/scene/index.ts`.
- The dark palette appears twice in the tokens file (for `data-theme="auto"` inside
  the media query, and for `data-theme="dark"`) — edit both when changing it.

### Background sound

- The "Sound" menu in the header plays one source at a time:
  - **Generated sounds** — Rain, Ocean waves, Wind, Fireplace, Brown / Pink noise, and
    two endless generative music pieces (Soft pads, Gentle piano). All synthesised with
    the Web Audio API in `src/lib/sound/soundscapes.ts` (building blocks in `kit.ts`):
    no audio files, so they work offline and cost nothing to download.
  - **A YouTube link** (video or playlist), played through the privacy-enhanced
    `youtube-nocookie.com` embed. YouTube's terms don't allow hiding the video to play
    audio only, so it shows in a small player in the corner (their 200 × 200 px minimum).
- `src/lib/sound/player.ts` owns playback; the menu is only UI. Browsers only allow
  sound after a click, so nothing plays on page load — after a full reload, press Play.
- Sound keeps playing while you move around the site (see *Page navigation* below).

### Page navigation (important for component scripts)

The site uses Astro's client-side router (`<ClientRouter />` in `BaseLayout.astro`), so
links swap the page without a full reload. That's what keeps the scene and the sound
going between pages: the ambient background is `transition:persist`, and the YouTube
player is attached outside `<body>` (which the router replaces).

The catch: a component's `<script>` runs **once per visit, not once per page**. So:

- Wrap page setup in `onPage(key, setup)` from `src/lib/page.ts`. It runs on every page
  load, including the first. Return a cleanup function for anything that outlives the
  page's DOM — `subscribe(...)`, intervals, listeners on `window`/`document` (use
  `listen()` and `cleanups()` from the same file). See any component for the pattern.
- `history.replaceState` must keep `history.state` (the router stores its data there).
- The router resets `<html>` attributes on each navigation; the inline script in the
  layout re-applies theme and background on `astro:after-swap`.

### Data and the timer

- `src/lib/storage.ts` is the only code that touches localStorage. Keys look like
  `rw:v1:sessions`; `rw:meta` holds the schema version, and `MIGRATIONS` in that file
  is where future format changes go.
- `src/lib/timer/engine.ts` is the timer's state machine (pure functions, no DOM).
  It stores start timestamps and derives remaining time from `Date.now()`, so it
  doesn't drift in background tabs and survives reloads.
- Stored items: `sessions`, `done`, `chain`, `breakdown`, `timer`, `timer-prefs`, `theme`,
  `appearance`, `sound`.
  Every read has a type guard, so corrupted or hand-edited data falls back to a
  safe default instead of breaking the page.
- Export/import (on `/progress`) writes and reads a JSON file:
  `{ "app": "rewarding-work", "schemaVersion": 1, "exportedAt": "...", "data": { ... } }`.
  Import can **merge** (keep yours, add new entries by id/day) or **replace**.
  Unreadable entries in a file are skipped and counted, not fatal.
- Calculations (totals, heatmap buckets, chain lengths) live in `src/lib/stats.ts`;
  local-date helpers in `src/lib/dates.ts`.
- `src/components/TimerWidget.astro` is the UI, used on `/timer` and embedded on
  technique pages whose frontmatter has `tool: timer` (pick the starting mode with
  `timer_mode: pomodoro | 52-17 | flowtime | custom`). There is one shared timer
  across the site.

## Adding a technique

1. Create `src/content/techniques/<slug>.md`. The file name doesn't matter; the
   `slug` field sets the URL (`/techniques/<slug>`).
2. Fill in the frontmatter. It's validated at build time by `src/content.config.ts`,
   so a typo in a category, problem or evidence value fails the build with a clear message.

```yaml
---
title: Pomodoro Technique
slug: pomodoro                     # lowercase-with-hyphens
category: time                     # reward | visual | time | structure
problems: [lose-focus, cant-start] # cant-start | lose-focus | no-progress | too-much | burn-out
evidence: some evidence            # well-researched | some evidence | popular, mostly anecdotal
time_to_try: 25                    # minutes
summary: One sentence.
tool: timer                        # optional: timer | progress | chain | breakdown
timer_mode: pomodoro               # optional, with tool: timer — pomodoro | 52-17 | flowtime | custom
limits:                            # "When it does NOT work" bullets
  - ...
evidence_note: >-                  # honest, plain-language; no invented citations
  ...
related: [fifty-two-seventeen]     # optional; otherwise picked by shared problems
---
```

3. Write the body in Markdown with two sections: `## How it works` and `## Try it now`.
   The page adds the widget (if `tool` is set), "When it does not work", the evidence
   note and related techniques automatically.

The new technique shows up in the library, on the matching problem pages and in
related lists; nothing else needs editing. Problems, categories and evidence labels
live in `src/data/taxonomy.ts`.

> If `npm run dev` was already running when you created `content.config.ts` or changed
> the schema, restart it.

## Editing the quiz

Everything lives in `src/data/quiz.ts`, as plain data:

```ts
{
  id: 'blocker',                                  // unique per question
  question: "What's getting in the way most right now?",
  hint: 'optional line under the question',
  options: [
    {
      id: 'start',                                // unique within the question
      label: 'Getting started',
      points: { 'two-minute-rule': 3, pomodoro: 2 }, // technique slug → points
    },
    // …
  ],
}
```

- **Scoring:** points from the chosen answers are added up per technique. The top 2
  are shown, plus a 3rd if it scores at least `THIRD_PICK_RATIO` (default 0.6) of the
  top score. Ties are broken by the order of `TIE_BREAK`.
- Each result shows "Because you said: …" using the labels of the answers that gave
  it points, so keep labels short and in the user's voice.
- You can add or remove questions and options freely; the UI adapts ("Question 2 of N").
- A misspelled technique slug fails the build with a message naming the question and option.
- Problem card text (title, teaser, explanation) is in `src/data/taxonomy.ts`.

## Deploying (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` builds and publishes the site on
every push to `main`.

1. Create a GitHub repository (e.g. `rewarding-work`) and push this project to its
   `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push (or run the workflow manually from the **Actions** tab). The site appears at
   `https://<your-user>.github.io/<repo>/`.

`site` and `base` are set automatically from the repository: a project repo gets
base `/<repo>`, a `<user>.github.io` repo gets base `/`. For a custom domain, add a
`public/CNAME` file with the domain and set `BASE_PATH: /` in the workflow.

## Installable app and offline use

- `public/manifest.webmanifest` + `public/icons/` make the site installable
  ("Install app" in Chrome/Edge, "Add to Home Screen" on phones). Timer and
  Progress are available as app shortcuts.
- After `astro build`, `pwa/integration.mjs` writes `dist/sw.js` from
  `pwa/sw.template.js` with the list of every built file and a content hash.
  - First visit: every page and asset is cached, so the whole site then works offline.
  - Pages: network first (you get updates), cached copy when offline.
  - Assets: cache first (file names are content-hashed).
  - Each deploy has a new version; old caches are deleted automatically.
- The service worker is registered only in production builds. To try it locally:
  `npm run build && npm run preview`, open the site, then stop the server and reload.
- Timer notifications are shown through the service worker where available
  (required on Android), and clicking one brings the app back to the front.
