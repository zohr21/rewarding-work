# Decisions

What the owner chose, newest first, so a session on any machine starts from the same place.
One or two lines each: the date, what was picked, and anything deliberately left out. Design
canvases are private pages and this repository is public, so their links are not kept here.

## 2026-11

- **14 Nov · Wave 1 languages.** Russian and Azerbaijani are no longer "beta": Grovyn opens in
  them by itself on a phone set to either. Welcome starts with a language row. English dates
  follow the region (day before month and the 24-hour clock outside the United States), a new
  budget starts in the local currency, and Android lists Grovyn's languages in its settings.
  Not confirmed by the owner: treating "English (US)" outside a US time zone as British-style
  dates. Still to do: a native read-through of both translations, and the week still starts
  on Monday everywhere.

- **14 Nov · Repo setup.** `CLAUDE.md`, `npm run verify`, Vitest, a check on every pull
  request, shared `.claude/launch.json` and `.claude/settings.json`. Work moves out of the
  OneDrive folder to a plain clone.
- **14 Nov · Timer and Back.** In the app Start sits right under the dial. Android Back closes
  an open sheet or dialog, then goes back a page, then puts the app in the background.
- **14 Nov · Going international (review, nothing picked yet).** Proposed, not confirmed:
  store screenshots with a caption above the real screen; launch English, Russian and
  Azerbaijani first; five tabs at most; language asked on Welcome; launch free.
- **7 Nov · Play listing drafted** (`docs/play-listing.md`): name "Grovyn: Focus Timer & Tasks",
  seven screenshots, feature graphic.
- **4 Nov · Play Store pass.** Play build has no `READ_SMS`, uses `SCHEDULE_EXACT_ALARM`, turns
  Android backup off, and hides the weekly board (to stay clear of the user-content policy).
  Privacy policy covers bank alerts, screen time and the board; `/delete-account` page added.
  Not confirmed by the owner: the "within 30 days" deletion promise.
- **4 Nov · Grove tiers.** "Next up" list with a marker sheet; body markers on Health.
- **3 Nov · Chain kinds.** A chain can be a tick, an amount, parts, or linked to something
  Grovyn already counts; a day sheet and a strip on Today.
- **3 Nov · Add by hand.** Sleep, steps and the like can be typed in when Health Connect has none.
- **2 Nov · Findings.** Plain-language findings with honest confidence ("Not yet / Maybe /
  Fairly sure") and a Your data page: the direction that sets Grovyn apart from a health app.
- **1 Nov · Health redesign.** Week strip, rings, workout log and calendar, forms in sheets.
- **1 Nov · Budget plan.** 50/30/20 split, income, need/want tags, goals, "safe to spend today".
- **1 Nov · Budget lock.** Phone unlock in the app, a per-browser PIN on the web, and an eye
  that hides amounts.
- **1 Nov · Weekly board.** Opt-in, weekly, in the full build only.

## 2026-10

- **24 Oct · Screen time.** Phone time next to the plan; stays on the phone, never synced.
- **24 Oct · Coach replaces Learn.** Pick what is in the way, get one technique with its evidence.
- **24 Oct · Budget is list first**, like a bank app; finished things fold away.
- **24 Oct · Grove has tabs**: Grove, Stats, Done, Chains.
- **23 Oct · Sprig.** A tree character that grows with the five focus tiers (Seedling, Sprout,
  Sapling, Tree, Grove). It never guilts, and stays quiet while the timer runs.
- **17 Oct · Renamed to Grovyn** (`app.grovyn`). Kept on purpose: `rw:` / `rw-` storage keys,
  the Firebase project id, and the `/rewarding-work/` base path.
- **17 Oct · First run.** Bottom bar is Today · Focus · Grove · You. Health, Budget, Exam prep
  and Screen time are optional sections chosen on Welcome. Brand: lowercase "grovyn", a
  three-tree mark with one gold leaf.
- **15 Oct · Bank alerts.** Expenses are added from the bank's notifications, for the banks the
  user picks; only amount, place and date are kept.
- **Earlier · Look.** "Forest night" dark look with raised, tactile surfaces; a light clay
  look also exists. Forms open in place: a bottom sheet on the phone, a side panel on the web.

## Standing preferences

- Design first: a canvas with options A / B / C, then build the one picked.
- One slim row that opens a sheet is preferred to a big card or a new page.
- Privacy is said in plain words: what stays on the phone, what syncs.
- Test on the real phone before a pull request when the change touches the app.
