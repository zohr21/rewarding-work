---
name: grovyn-canvas
description: Draw a Grovyn design canvas (an Artifact with phone/web boards and A/B/C options) before building a new screen, redesign or feature. Use when the user asks how something could look, whether a page is user friendly, to redesign a page, or to propose a new feature for the Grovyn app or site.
---

# Grovyn design canvas

Almost every Grovyn feature has started as a canvas the user looked at first (Health redesign,
Budget plan, Coach, Screen time, Sprig, Leaderboard, Findings…). The user picks an option or
says "Build it", then it gets built. Don't build first.

## Steps

1. **Answer the question in a line first.** If the user asked "is X user friendly?" or "which
   method is best?", give a verdict and one recommendation before drawing.
2. **Measure what is there** when it's a redesign: page height at phone width (e.g. "11 phone
   screens long"), numbers shown twice, controls below the fold. Use the `grovyn-verify` preview.
3. **Offer 2–3 directions, named A / B / C**, each one short phrase ("A tabs, B list first,
   C one screen with sheets"). Mark your recommendation.
4. **Draw the canvas** as an Artifact (load the Artifact quickstart / design skill first).
   - Boards are 390×844 phone artboards in the app look; add a Web board when the site differs.
   - Typical boards: Main, the sheet(s) it opens, an empty / first-run state, Settings, Web.
   - Make the key board interactive when the choice depends on feel (sheets, toggles, keypads).
   - **All numbers are sample data** — say so on the canvas. Real technique names, tiers and
     store names may be used.
5. **Stop and ask** which option, unless the user already said to build.
6. **Write a memory note** (`<feature>-canvas.md`): canvas link, boards, which option was
   picked, what was *my* proposal vs. what the user confirmed. See `grovyn-ship`.

## Look and brand (use on the canvas and in the build)

- Tokens live in `src/styles/tokens.css`. Raised surfaces with a solid edge (`--surface-grad`,
  `--edge`, `--well-bg`, `--accent-grad`), not flat borders.
- Brand: lowercase "grovyn" in Bricolage Grotesque, three-tree mark with one sun-gold leaf.
  Glow green `#8fe0ae` is for **actions and live/earned things only**; sun `#f2c14e` for
  **rewards only**. Dark "forest night" and the light clay look both exist.
- Tiers: Seedling (green) · Sprout (bronze) · Sapling (silver) · Tree (gold) · Grove (diamond).
  Sprig (the mascot, `src/lib/sprig.ts`) grows with the focus tier; it never guilts the user and
  stays quiet while the timer runs.
- App bar: Today · Focus · Grove · You. Health, Budget, Screen time are opt-in modules.
- Activity colours: run `#f2a65a`, swim `#8cc3ea`, gym `#c5a3f0`, walk `#8fe0ae`,
  cycle `#e8d27a`, yoga `#f0a8c8`, sleep `#b7b3f5`, phone `#8cc3ea`, focus `#3f8f61`.

## Patterns the user has liked

- Forms open **in place**: bottom sheet on phone, right side panel on web (`Sheet.astro`).
- One slim row that opens a sheet instead of a big card ("minimal space, no page change").
- List first, like a bank app; finished things fold into "N finished".
- Progressive disclosure: advanced import/remove/settings inside a fold.
- Plain-language findings with honest confidence ("Not yet / Maybe / Fairly sure").
- Privacy said in plain words: what stays on the phone, what syncs.

Tap targets ≥ 44 px, no zeros-everywhere empty states, no "browser" wording inside the app.
