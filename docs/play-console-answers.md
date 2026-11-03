# Play Console answers (draft)

What to fill in under **App content** for the `play` version (`app.grovyn`). Drafted 2026-11-04 from the
code. Check each answer against the console's current wording before submitting; Google changes the forms.
Background and policy links: `docs/play-store-readiness.md`. Building and signing: `docs/release.md`.

Replace `<site>` with the live site address (the GitHub Pages URL, e.g. `https://zohr21.github.io/rewarding-work`).

## Links

| Field | Value |
|---|---|
| Privacy policy | `<site>/privacy/` |
| Account deletion (Data safety) | `<site>/delete-account/` |
| Support email | grovyn.support@gmail.com |

## Data safety

**Does the app collect or share any of the required user data types?** Yes (collect). Shared with third parties: **no**.
**Is all collected data encrypted in transit?** Yes (Firebase over HTTPS).
**Can users request that their data be deleted?** Yes: in the app (You → Delete account…, at the bottom) and at the deletion URL.

Data that never leaves the phone doesn't count as collected: Health Connect numbers, screen time, bank alert text,
workouts and manual health entries, findings, the coach plan, the Budget lock.

| Data type (console name) | Collected? | Optional? | Purpose | Why |
|---|---|---|---|---|
| Personal info → **Email address** | Yes | Optional (accounts are optional) | Account management | Email/password or Google sign-in (Firebase Auth) |
| Personal info → **Name** | Yes | Optional | Account management | Google sign-in passes the account name |
| Personal info → **User IDs** | Yes | Optional | Account management, App functionality | Firebase uid; weekly board is off in the Play version |
| Financial info → **Purchase history** | Yes | Optional | App functionality | Budget expenses sync to the account when signed in |
| Financial info → **Other financial info** | Yes | Optional | App functionality | Budgets, repeating bills |
| App activity → **Other user-generated content** | Yes | Optional | App functionality | Tasks, notes, exam plan, done list, chains |
| App activity → **App interactions** | Yes | Optional | App functionality | Focus sessions (time and length), settings |

Not collected: location, contacts, messages, photos, files, audio, calendar, web history, device IDs, health and
fitness (stays on the phone), app info and performance (no crash or analytics SDK).

## Health apps declaration

Category: **Activity and fitness**, and **Sleep management**. The app is not a medical device and makes no medical claims.

## Health Connect permissions (one reason each)

All are read-only, asked per type on the Health page, and shown on the Health page. The numbers stay on the phone.

| Permission | Shown where | Reason to give |
|---|---|---|
| `READ_SLEEP` | Health › Sleep tile, Grove › Rested nights | Shows last night's sleep next to the user's focus time, so they can see how rest and focus go together. |
| `READ_STEPS` | Health › Steps tile, Grove › Moving days | Shows daily steps next to focus time; counts "moving days" for the user's own reward tiers. |
| `READ_EXERCISE` | Health › Active tile | Shows exercise sessions and active minutes next to focus time. |
| `READ_RESTING_HEART_RATE` | Health › Resting heart tile | Shows the daily resting heart rate trend, as a rest signal next to focus. |
| `READ_TOTAL_CALORIES_BURNED` | Health › Calories tile (main number) | Shows calories burned for the day. |
| `READ_ACTIVE_CALORIES_BURNED` | Health › Calories tile ("N active") | Shows the active part of the day's calories, next to the total. |
| `READ_DISTANCE` | Health › Distance tile | Shows distance walked or run per day. |

Not requested: any `WRITE_*` permission, and background reads.

## Other declarations

| Form | Answer |
|---|---|
| **Financial features** | Personal budgeting / expense tracking only. No loans, payments, banking, crypto or trading. |
| **Ads** | No ads. |
| **Content rating** | Questionnaire: no violence, sex, gambling or user-to-user chat in the Play version. Expect Everyone / PEGI 3. |
| **Target audience** | 13+ (or 18+). Not for children: Health Connect apps may not target children. |
| **News app** | No. |
| **Government app** | No. |
| **Permissions declaration** | Not needed: no SMS, call log, all-files or `QUERY_ALL_PACKAGES`. `USE_EXACT_ALARM` was replaced by `SCHEDULE_EXACT_ALARM`. |
| **Foreground service** | None declared. |

## Prominent disclosures (for review notes)

Say this in the review notes so the reviewer can find each one:

- **Usage access** (screen time): Today or Grove → *See where your phone time goes* opens a sheet saying what is read;
  *Agree and open Usage access* opens Android's screen.
- **Notification access** (bank alerts): Budget → Bank alerts → *Allow* (or Save in its settings) opens *Let Grovyn
  read bank alerts?*; *Agree* opens Android's screen.
- **Health Connect**: Health → each tile's *Connect* opens Android's own Health Connect dialog. The rationale link
  in Health Connect opens the privacy page in the app.

## Before production

New personal developer accounts need a **closed test with at least 12 testers opted in for 14 days in a row**,
then *Apply for production*. Start recruiting testers as soon as the first signed bundle is up.
