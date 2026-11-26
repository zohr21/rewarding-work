# Decisions

What the owner chose, newest first, so a session on any machine starts from the same place.
One or two lines each: the date, what was picked, and anything deliberately left out. Design
canvases are private pages and this repository is public, so their links are not kept here.

## 2026-11

- **27 Nov · You becomes a hub of sheets (option B), one delete sheet, type DELETE.** The page
  had eight groups, a jump list, four delete or forget actions in three places, and a "Timer
  defaults" row that only opened the Timer. Now: profile, then short rows that each open a
  sheet and show their state: Account (email, password, Google, sign out), Weekly board,
  Preferences (sections, appearance, language, sounds), Notifications, Data and privacy
  (what's kept, backup, Google, Health Connect, What Grovyn learns, Lock Budget, Privacy),
  Help & guides, Write to us, and at the bottom "Delete data or account…". That sheet holds
  Start fresh (deletes the data, keeps the sign-in; two presses) and Delete account (type
  DELETE, or the word in the chosen language, plus the password if there is one), with a link
  to /delete-account. Timer defaults and the "This device" group are gone; "Forget everything"
  reads "Reset what Grovyn learned". Old `#acc-…` links open the matching sheet. The website
  uses the same hub. Options A (regroup the long list) and C (everyday settings inline) were
  set aside.

- **27 Nov · Several study plans at once (option B: one Today card).** Study held one plan;
  starting another meant finishing or deleting it. Now up to 5 run side by side. With one plan
  the page is unchanged apart from "+ New plan". With two or more, the goal card becomes one
  Today card: "Aim for 1 h on UiPath and 38 min on AWS" (short names), a row per plan with
  its day ring, time left today, date and play, Continue on the plan furthest behind today,
  and chips for the weakest chapter overall and "N to review" (a sheet asks which plan when
  more than one has some; a round never mixes exams). Chapters group under each plan, nearest
  date first and open, with a pencil (edits that plan in the goal form, where "I took the
  exam" and delete live), "+ Add chapter" and "Practise N". The question bank shows the open
  plan's name. The Timer's task sheet lists every plan's open chapters, nearest exam first,
  tagged with the plan. Store: `exam` stays the open plan (the one last worked on), plus
  `others`, `removed` tombstones and per-plan `id` (`'p' + createdAt`) and `updatedAt`; the old
  shape still reads; the sync merge joins plans by id. Options A (switcher) and C (plan
  cards) were set aside.

- **26 Nov · Exam prep becomes Study (option B: today first).** The page was ~2,560 px on a
  phone: a 600 px goal card, chapter cards of ~200 px each with Focus/Done/Edit buttons, the
  same Practice button twice, a weak-chapter note you couldn't tap and Past exams always open.
  The tab, section and help area are now called Study (ru Учёба, az Təhsil, as the Tasks area);
  routes, store and keys keep the `exam` name. One goal card: date and days left, the title, a
  pencil to edit, a ring (hours of the target, or chapters done without one), "Aim for X
  today", Continue/Start on the next chapter, and practice chips: the whole bank, the weakest
  chapter, and "N to review" (flagged, or missed more often than right). Chapters are slim rows:
  tick box, name with time of planned and a thin bar, share of right answers, play. A tap on
  the name opens a chapter sheet (Focus, practise this chapter, add a question, name, hours,
  notes, order, remove). Questions can now be added by hand in a sheet (2 to 8 options, one or
  more right); import stays. Past exams fold into "Past exams (n)", open when there is no plan.
  About 1,620 px with the same sample. Readiness %, mock exam and spaced review were left for
  later (they need new stored data). Options A (tidy) and C (Plan/Practice tabs) were set aside.

- **26 Nov · Timer layout (option B: task on top, quiet while running).** The Timer page was
  ~1,740 px on a phone and repeated itself (task chips and an On Today card listed the same
  tasks; a technique card repeated the rhythm chip). Now one column: a "Focusing on" row at
  the top opens a task sheet (Coach's Top 3, then Today, other open tasks, open exam chapters,
  each with its focus time, or your own words; picks link by id). The 3D tree stays above the
  dial. Start with a small reset icon, then one rhythm chip that opens a "Rhythm and sound"
  sheet (modes, Custom lengths, what the picked rhythm does with "Why it works", end sound,
  the note about breaks), and today's total. While focusing the chip, total and keyboard hint
  fade and the app bar, Focus tabs and header dim. Arriving from Tasks (row ▶, task sheet with
  its step) or Exam (chapter Focus/Review, goal) sets the task when idle or on a break; in the
  middle of a focus session it says to finish or reset first instead of moving the minutes.
  Technique pages keep their inline timer as before. Options A (tidy) and C (full-screen
  session) were set aside; C could come later on top of B.

- **25 Nov · Coach day rhythm (option B).** Coach follows the day with tabs Plan · Now ·
  Close · Week, opening on the one that fits the time. Plan: energy (with last night's sleep
  when Health is on), a Top 3 that is simply the first three on Today (picked in a sheet),
  15/25/50/90-minute estimates, your best two hours. Now: Top 3 progress, one suggestion with
  its reason (task waiting 3+ days, low energy, stopping early at this time of day, best hours,
  an app that keeps coming up, next task), "Not now" for today and "This isn't true" for good,
  and "Park a thought" into the Inbox. Close: done vs. planned, estimate vs. timer time, a
  first step for what's left, parked thoughts kept or let go, Close the day. Week (Sunday
  afternoon): the week so far, a kind line about quiet days, and a WOOP plan shown each
  morning. The six tiles and the weekly plan moved into a "Stuck?" fold. Today's app row shows
  the day (Plan your day / Top 3 · 1 of 3 / Close the day). My choices, not confirmed: estimates live in Coach, not on tasks;
  closing the day doesn't tick the chain (the chain is for your own habit); no reminders.
  26 Nov, after the phone test: the Plan · Now · Close · Week tabs are plain words with an
  underline (not pills like Focus's own tabs), and the app hides the page's "Coach" heading,
  as Timer and Tasks do. The owner chose to sync the `coach` store: days join by date (the
  newer copy of a day wins), the plan and WOOP come from the copy written last, and it is not
  in `SYNCED_AT_FIRST`, so devices already signed in send what they hold.

- **25 Nov · Savings autopilot (option C).** In the Savings sheet: "Sweep what is left" (on
  by default) offers last month's rest on Budget at the start of a month, once (Save / Keep it),
  to the first goal not yet reached; "Round up payments" (off by default) counts each payment's
  cents up to the next whole amount as savings, from the day it is turned on, and the round-up
  goes when its payment is changed or removed. Grovyn never moves bank money, so the note says
  to move it once a month. A goal reaching its target is celebrated once, gets a sun leaf, and
  Budget says for a week where savings go next. My choices, not confirmed: sweep on by default,
  whole units only, round-ups to the next whole amount; no reward in the grove itself.
- **25 Nov · Savings you already had.** Put in has "I already had this": savings from before
  (e.g. cash kept at home) count in the total, the card/cash split and their goal, but not as
  this month's savings, so what is safe to spend stays the same.
- **25 Nov · Savings on card and in cash.** Cash taken out to keep as savings was counted twice
  (once kept back as savings, again as spending). Picked option A, a savings pot: the Goals tile
  is now Savings (total, card and cash), and its sheet has Put in · Take out · Card ⇄ cash above
  the goals. Bank alerts that look like cash or a transfer get Into savings: what is already
  saved on the card moves to cash, the rest is new savings in cash; safe to spend does not drop.
  An expense can be turned into savings ("This was savings, not spending", with Undo). Money
  taken out goes back into safe to spend. Not built (option C, later): month-end sweep of what
  is left, round-ups, a reward when a goal is reached.
- **24 Nov · Compact task list.** Picked option A: one slim row per task (tick to finish, name,
  one info line, play to focus), about 64 px; the ring, step and focus bars, dropdowns and the
  button row are gone. Tapping a row opens the task sheet, which now also holds its list, When,
  Do first and Delete (with Undo).
- **24 Nov · Due dates and repeats on tasks.** Picked option A: a small "When" button on each
  open task row opens a sheet with day chips (Today, Tomorrow, This weekend, Next week, a date)
  and repeat chips (every day, weekdays, every week, every month). Picked over setting it inside
  the Steps sheet (B, hard to find, as the area picker was) and a "Coming up" fold (C). On its
  day a task shows on Today by itself with a "For today" tag; once the day passes it gets the
  usual "Still for today?" Keep / Move to Next note, never red or "overdue". Finishing a
  repeating task adds the next copy (steps unticked) for the next day of the repeat. Quick add
  reads `tomorrow`, `fri`, `every week`… in English, Russian and Azerbaijani. My defaults (the
  owner didn't answer these canvas questions): repeats count from the day it was for, not the
  day it was finished; a repeat with no day counts from the day it's finished; a lone "weekly"
  or "daily" is a repeat only at the end of the text; "sun"/"sat" alone stay in the title.
  Not built yet: search, reminders.

- **24 Nov · Google sign-in on the site uses Google's own window.** Firebase's pop-up failed
  with "The sign-in window was closed before finishing" in Chrome with third-party cookies
  blocked. The site now gets a token from Google Identity Services with the Firebase
  project's web client and hands it to Firebase; the pop-up stays as the fallback when no
  client id is set.

- **24 Nov · Undo inside sheets.** The shared Undo toast moves into whichever sheet or dialog
  is open, so it can be tapped there. "Your areas" dropped its own inline Undo bar and uses
  the shared toast like every other removal.

- **23 Nov · Task areas (Work, Life, Study).** Picked option A: one area per task, a chip row
  above every list to filter, picked over free #tags (B) or switching the whole app into an
  "area mode" (C, maybe later on top of A). Lists still say *when*, areas say *which part of
  life*. Added once by a "Group your tasks?" card (Work, Life, Study picked; Health, Home
  offered; can skip), set on the task's sheet or with `#study` when adding, managed in a
  "Your areas" sheet (rename, colour, order, up to 6; removing keeps the tasks). Grove › Stats
  gets "Focus by area" for the week. My proposals, built as drawn: ready-made areas keep fixed
  ids so old app builds can't lose them, and the website keeps the chip row instead of the
  left rail on the canvas. Not built yet: due dates, repeats, search, reminders.

- **20 Nov · Follow vs. friends on the board.** Follow is one way, no asking; the other person
  sees "X followed you" and can follow back or remove them. Add friend goes both ways: a
  request, then Accept. What's new shows as one slim "N new" row on Board › Friends and a dot
  on the Grove tab (option A, picked over a bell or a phone notification). Old one-way
  friends became people you follow. My proposals, built as drawn: Accept is required, and
  followers don't see a Friends-only row.

- **18 Nov · Board safety, so the board ships on Play.** Picked "tap a row → small sheet"
  (over a ⋯ button or long-press): Block (with Undo, unblock in You › Weekly board) and Report
  nickname (7 reasons, "also block" ticked). Join asks to agree to four board rules. A name
  reported by 3 different people shows as "hidden name" until its owner picks another; a
  short word, link and phone-number filter runs at join. The board is now in the Play build.
  The 3-reports number and the filter were my proposals, built as drawn.

- **14 Nov · Play Console set up.** App `app.grovyn`, Free (in-app purchases possible later),
  audience 13+, category Productivity. Store graphics are not labelled as AI-made. The
  Azerbaijani store name is «Grovyn: Fokus və tapşırıqlar» («tapşırıqlar», not «işlər»; the
  longer «Fokus taymeri, tapşırıqlar» is over Play's 30 characters).

- **14 Nov · Closed test prepared.** `docs/closed-test.md` is the step-by-step list (key, Console,
  testers, Firebase SHA-1s, release notes, invites in three languages). The Play bundle builds;
  the owner made the upload key the same day and the signed bundle is built. Store screenshots in all three languages were
  regenerated: every screen frame now shows the five-tab app (Health and Budget on, one Life
  tab) with the tab bar in view, and RU/AZ show «Ментор» and «Rifah». The upload key is made
  with `CN=Grovyn` only, so no personal details sit in the certificate.

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
