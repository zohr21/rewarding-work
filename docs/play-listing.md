# Play Store listing (draft)

What goes under **Grow users → Store presence → Main store listing** for the `play` version (`app.grovyn`).
Drafted 2026-11-07. Policy answers are in `docs/play-console-answers.md`; building and signing in `docs/release.md`.

The description names the three sensitive features (bank alerts from notifications, Health Connect, screen time),
because Play wants every sensitive permission to serve a feature the listing promotes.

## Text

**App name** (30 max): `Grovyn: Focus Timer & Tasks` (27)

**Short description** (80 max):

> Focus timer, tasks in small steps, and a grove that grows with every minute.

(76 characters)

**Full description** (4000 max):

> Grovyn makes work feel worth doing. Start a focus session, break a big task into small steps, and watch Sprig grow
> from a seed into a whole grove with every minute you put in.
>
> FOCUS
> • A focus timer with Pomodoro (25/5), 52/17, Flowtime or your own lengths
> • Jot a thought mid-session without losing your place; sort it afterwards
> • Calm sounds: rain, waves, fireplace, brown noise and more
> • Timer alerts and a home-screen widget
>
> TASKS
> • Today, Next and Someday lists, with one task "first up"
> • Break any task into steps, like an installer: see how far along you are
> • A done list that shows what you actually finished
>
> SEE IT GROW
> • Sprig grows with your total focus time: seedling, sprout, sapling, tree, grove
> • Chains for daily habits, and stats for your week
>
> COACH
> • Stuck? Pick what's in the way ("I can't start", "I keep drifting", "Too much to do") and get a technique that
>   fits, with the evidence behind it
> • Exam prep: a study plan and practice questions for one exam
>
> OPTIONAL SECTIONS (turn on only what you want)
> • Health: see sleep, steps and activity next to your focus. Read from Health Connect, only with your permission,
>   and kept on your phone. You can also type them in yourself.
> • Budget: plan the month and see what is safe to spend today. Grovyn can add expenses from your bank's alerts:
>   with your permission it reads notifications from the banking apps you pick, keeps the amount, shop and date,
>   and ignores everything else.
> • Screen time: see where your phone time goes next to your plan. With your permission it reads how long you use
>   each app; this stays on your phone.
>
> PRIVATE BY DEFAULT
> • No ads, no analytics, no tracking
> • Works without an account; everything stays on your phone
> • Sign in (Google, email or guest) only if you want a backup and sync between devices
> • Delete your account and its data any time, in the app or on the web
>
> Questions or ideas: grovyn.support@gmail.com

**Category:** Productivity. **Tags:** Productivity, Time management, Habit tracker (pick from Play's list).
**Contact email:** grovyn.support@gmail.com. **Website:** `<site>/`. **Privacy policy:** `<site>/privacy/`.

## Graphics

All in `docs/store/`. Regenerate with `node scripts/store-shots.mjs` while the Play preview runs (see the script's header; it seeds
sample data and captures the Play version, so there is no weekly board in them).

| Asset | File | Spec |
|---|---|---|
| App icon | `public/icons/maskable-512.png` | 512×512 PNG, full-bleed square (Play rounds the corners). Use this one, not `icon-512.png`. |
| Feature graphic | `docs/store/feature-graphic.png` (from `feature-graphic.html`) | 1024×500, no alpha |
| Phone screenshots | `docs/store/01-today.png` … `07-coach.png` | 1080×1920 (9:16), 7 of the 8 allowed |

Suggested order and a caption for each, if you add captions in a design tool later:

1. `01-today.png`: *One thing first. Start focusing in a tap.*
2. `02-timer.png`: *A calm focus timer, your way.*
3. `03-tasks.png`: *Big tasks, small steps.*
4. `04-grove.png`: *Every minute grows your grove.*
5. `05-health.png`: *Sleep and steps next to your focus.*
6. `06-budget.png`: *Know what's safe to spend today.*
7. `07-coach.png`: *Stuck? Get a technique that fits.*

Screenshots must show the real app. If a screen changes before release, regenerate them.
