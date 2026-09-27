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
  components/           UI pieces (timer, heatmap, chain, quiz, appearance menu …)
  lib/                  storage, timer engine, stats, dates, paths, appearance
  pages/                one file per route
public/                 copied as-is: favicon, manifest.webmanifest, icons/
pwa/                    service worker template + the build step that generates it
.github/workflows/      GitHub Pages deployment
```

### Look and feel

- Colours are CSS custom properties in `src/styles/tokens.css`.
- **Light is the default.** The "Look" menu in the header switches theme
  (Light / Dark / Auto = follow the system), background (Sunrise / Meadow /
  Lavender / Plain) and gentle background motion. Choices are stored locally and
  applied before first paint (no flash).
- The ambient background (`src/components/Ambient.astro`) is four soft CSS gradients
  that drift slowly, lean towards the pointer, and briefly "bloom" when you finish a
  session, log something as done, tick a step or mark your chain. Motion stops with
  the menu switch or `prefers-reduced-motion`. Palettes are the `--amb-*` tokens.
- The dark palette appears twice in the tokens file (for `data-theme="auto"` inside
  the media query, and for `data-theme="dark"`) — edit both when changing it.

### Data and the timer

- `src/lib/storage.ts` is the only code that touches localStorage. Keys look like
  `rw:v1:sessions`; `rw:meta` holds the schema version, and `MIGRATIONS` in that file
  is where future format changes go.
- `src/lib/timer/engine.ts` is the timer's state machine (pure functions, no DOM).
  It stores start timestamps and derives remaining time from `Date.now()`, so it
  doesn't drift in background tabs and survives reloads.
- Stored items: `sessions`, `done`, `chain`, `breakdown`, `timer`, `timer-prefs`, `theme`.
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
