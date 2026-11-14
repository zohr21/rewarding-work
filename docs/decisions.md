# Decisions

What the owner chose, newest first, so a session on any machine starts from the same place.
One or two lines each: the date, what was picked, and anything deliberately left out. Design
canvases are private pages and this repository is public, so their links are not kept here.

## 2026-11

- **14 Nov · Chain kinds sync.** A chain's kind and what you fill in each day (slots, amounts,
  notes) now go to the account, so the site matches the phone. Still left out of the backup
  file. Workout-linked chains are only worked out on a device that has workouts.
- **14 Nov · App syncs from launch.** The app starts account sync (and the board row) on every
  page, not only once You was opened.

- **14 Nov · Translation choices.** The Coach tab is "Mentor" in both languages (RU «Ментор», was
  «Коуч»). Kept: AZ «fokuslanmaq», and AZ «Sönülü» for "Off" for now. The Life tab is «Rifah»
  ("well-being") in Azerbaijani (was «Həyat», too broad); English "Life" and Russian «Жизнь» stay. So the tab and a Budget category
  don't share a name, the AZ Wellbeing category is now «Özünə qulluq» (self-care); saved
  expenses keep their category. The read-through itself is in `docs/translation-review.md`.

- **14 Nov · Splash until the page has drawn.** `MainActivity` installs the splash screen and
  keeps it until the first page is visible (4 s at most); the splash is the dark ground with
  the mark, and the web view is dark behind the page. On the emulator the old build showed 3
  to 4 seconds of blank white on a cold start; the new one shows none. The Play build was
  walked on the emulator the same day (permissions, Welcome, Timer, five tabs, Grove without
  the board, Budget order, Back). Not yet seen on a real phone.

- **14 Nov · Budget, money first.** In the app the plan card ("Safe to spend today") comes
  right under the month; bank alerts moved below it, and are one slim row until they are set
  up or have something to check. The floating + shows only while the plan card's own
  "Add expense" button is out of sight, so it no longer covers the plan's figures at the top.
  Left as it was: the page is still about six screens long.

- **14 Nov · Five tabs and Grove clean-up.** The app's bar is Today · Focus · Grove · (one
  more) · You, never more than five. With Health and Budget both on they share one "Life" tab
  with Health | Budget tabs at the top of each page; with one on, the bar names it. Grove's
  Done is a row under "Next up" instead of a tab, and on a phone Sprig's card is the only box.
  Not confirmed by the owner: the name "Life" ("Жизнь", "Həyat"), and Health and Budget now
  coming after Grove in the bar. Screen time has no page of its own, so it is not a Life tab.

- **14 Nov · Store screenshots.** Direction A: a caption above the real screen, seven frames
  per language (`docs/store/en|ru|az/`), made by `scripts/store-shots.mjs`. Frames 1 to 5 show
  the four-tab app; frame 6 Health and Budget; frame 7 the privacy promise in words. The
  feature graphic shows Sprig, not a phone. Russian and Azerbaijani listing text is drafted in
  `docs/play-listing.md`. Not confirmed by the owner: the captions and listing translations.
  Found on the way: the mascot is "Сприг" in most Russian strings but "Росток" in four, and
  "Sprig" in most Azerbaijani strings but "Cücərti" in five; pick one in the read-through.

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
