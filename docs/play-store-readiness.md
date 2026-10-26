# Google Play readiness audit

Audited 2026-10-25 on branch `claude/ownership` (same Android setup as `origin/main`). Read-only: no app code changed.
Policy facts were checked on Google's own pages on that date; links are given next to each one.

**Short answer:** the app can go to Play, but not as built. One feature (reading past SMS) is very likely to be
rejected, one permission (`USE_EXACT_ALARM`) is a probable rejection, the privacy policy doesn't mention three of the
sensitive features, there is no web page for deleting an account, and the build makes a debug APK, not a signed AAB.
None of this is hard to fix. The big thing that takes calendar time is the 14-day closed test with 12 testers.

---

## 1. Permissions and sensitive APIs

Declared in [AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml); requested from
[DevicePlugin.java](../android/app/src/main/java/app/grovyn/DevicePlugin.java). There are no third-party Capacitor
plugins: `package.json` has only `@capacitor/android` and `@capacitor/core`, and all native work is in the app's own
Java under `android/app/src/main/java/app/grovyn/`.

| Permission / API | Where | Play policy | Verdict |
|---|---|---|---|
| `READ_SMS` | [AndroidManifest.xml:105](../android/app/src/main/AndroidManifest.xml:105), [DevicePlugin.java:53](../android/app/src/main/java/app/grovyn/DevicePlugin.java:53), read at [DevicePlugin.java:402-447](../android/app/src/main/java/app/grovyn/DevicePlugin.java:402) | Restricted SMS permission + Permissions Declaration Form | **Blocker — remove for v1** |
| Notification listener (`BankListener`) | [AndroidManifest.xml:44-52](../android/app/src/main/AndroidManifest.xml:44), [BankListener.java](../android/app/src/main/java/app/grovyn/BankListener.java), [BankInbox.java](../android/app/src/main/java/app/grovyn/BankInbox.java) | No declaration form; User Data policy → prominent disclosure | **Passes after a disclosure fix** |
| Health Connect reads (7 types) | [AndroidManifest.xml:111-117](../android/app/src/main/AndroidManifest.xml:111), rationale alias [:29-38](../android/app/src/main/AndroidManifest.xml:29), [DevicePlugin.java:55-61](../android/app/src/main/java/app/grovyn/DevicePlugin.java:55), [HealthData.java](../android/app/src/main/java/app/grovyn/HealthData.java) | Health Connect declaration in Play Console + Health apps declaration | **Passes, needs declarations and policy text** |
| `PACKAGE_USAGE_STATS` (screen time) | [AndroidManifest.xml:119](../android/app/src/main/AndroidManifest.xml:119), [DevicePlugin.java:268-310](../android/app/src/main/java/app/grovyn/DevicePlugin.java:268), [UsageData.java](../android/app/src/main/java/app/grovyn/UsageData.java) | Special access; User Data policy → prominent disclosure | **Passes, needs disclosure + policy text** |
| `USE_EXACT_ALARM` | [AndroidManifest.xml:108](../android/app/src/main/AndroidManifest.xml:108) | Restricted: only alarm/timer or calendar apps, with declaration | **Probable rejection — switch to `SCHEDULE_EXACT_ALARM`** |
| `SCHEDULE_EXACT_ALARM` (≤ API 32) | [AndroidManifest.xml:109](../android/app/src/main/AndroidManifest.xml:109) | User-granted | Fine |
| `POST_NOTIFICATIONS` | [AndroidManifest.xml:107](../android/app/src/main/AndroidManifest.xml:107), asked in context at [DevicePlugin.java:112-118](../android/app/src/main/java/app/grovyn/DevicePlugin.java:112) | Normal runtime permission | Fine |
| `INTERNET` | [AndroidManifest.xml:103](../android/app/src/main/AndroidManifest.xml:103) | Normal | Fine |
| `<queries>` for 9 named packages + launcher/home intents | [AndroidManifest.xml:80-99](../android/app/src/main/AndroidManifest.xml:80) | Package visibility: named packages and intent queries are not `QUERY_ALL_PACKAGES`, no declaration | Fine |
| Google sign-in (Credential Manager) | [build.gradle:40-42](../android/app/build.gradle:40) | Covered by Data safety (email, name) | Fine |

### 1a. Reading past SMS — `READ_SMS`

**Policy.** `READ_SMS` is a restricted permission. It is allowed only for the default SMS handler or for a listed
exception, after you fill in the Permissions Declaration Form in Play Console; apps without the form "may be removed".
"SMS-based money management" ("apps that track and manage budget") **is** on the exception list. But exceptions are
granted only "when no alternative exists", and budgeting apps "may not exfiltrate or share non-financial or personal
SMS history".
Source: [Use of SMS or Call Log permission groups](https://support.google.com/googleplay/android-developer/answer/10208820).

**As built.** Some of it is good. Permission is asked only when you press *Read* ([BankImport.astro:106-122](../src/components/BankImport.astro:106)),
it filters to the bank senders you picked, drops one-time codes, and masks long card numbers
([DevicePlugin.java:426-428](../android/app/src/main/java/app/grovyn/DevicePlugin.java:426), [BankInbox.java:47-53](../android/app/src/main/java/app/grovyn/BankInbox.java:47)).
The problems:

- **An alternative already exists in the app.** New bank SMS already come in through the notification listener (the SMS
  app's notification carries the sender and text; see the `com.samsung.android.messaging` / `com.google.android.apps.messaging`
  queries at [AndroidManifest.xml:88-89](../android/app/src/main/AndroidManifest.xml:88)). The only thing `READ_SMS` adds
  is a one-time import of *old* messages. That is a convenience, and a reviewer is likely to rule it non-core.
- **The query reads the whole inbox.** `content://sms/inbox` is queried for every message since `since`
  ([DevicePlugin.java:424](../android/app/src/main/java/app/grovyn/DevicePlugin.java:424)) and filtered in Java. Nothing
  leaves the phone, so this is not "exfiltration", but the declaration has to describe it.
- **The derived expenses are synced to Firestore** when signed in (see §3). That's allowed as financial data the user
  asked for, but it has to be in the declaration, the privacy policy and Data safety.

**Recommendation.** Ship v1 **without** `READ_SMS`: remove the manifest line, the `@Permission` alias and the *Past SMS*
UI (or hide it behind a build flag). Ongoing alerts keep working through notifications. If the import turns out to
matter to users, add it in a later update and file the declaration then, with a video of the flow. Filing it on the
first submission puts the whole app's first review at risk.

### 1b. Bank alerts from notifications — `NotificationListenerService`

**Policy.** Play has no declaration form for notification listeners: the [Permissions and APIs that access sensitive
information](https://support.google.com/googleplay/android-developer/answer/16558241) page doesn't mention it (checked).
The general rules apply: use it only for a feature promoted in the listing, and show a **prominent disclosure** inside the
app, right before access is asked for. The disclosure must say *why*, *what data* and *how it's used*, it can't be only
in the description or website, and it should offer a clear accept and decline.
Source: [Prominent disclosure and consent](https://support.google.com/googleplay/android-developer/answer/11150561).

**As built.** The setup dialog has a good explanation ([BankImport.astro:38-43](../src/components/BankImport.astro:38)),
and access is only opened after *Save* ([BankImport.astro:360-364](../src/components/BankImport.astro:360)). Only
notifications from the chosen sources are stored; everything else is dropped in memory ([BankInbox.java:24-31](../android/app/src/main/java/app/grovyn/BankInbox.java:24)).

Needs changing:

- **The *Allow* button skips the disclosure.** The warning row's *Allow* goes straight to Android's Notification access
  screen ([BankImport.astro:24-27](../src/components/BankImport.astro:24), handler [:371](../src/components/BankImport.astro:371)).
  It should open the setup dialog (with the explanation) instead, or a short disclosure first.
- **The text should name the scope plainly.** Android's screen says the app can read *all* notifications. Say so:
  "Android lets the app see all your notifications. Grovyn looks only at the ones from the banks you pick, keeps the
  amount, shop and date, and ignores the rest." Also a clear *Agree* / *Not now* pair.
- **Promote it in the listing.** "Adds expenses from your bank's alerts" should be in the store description, since
  sensitive APIs must serve a feature the listing promotes.
- The *Allow restricted settings* hint ([BankImport.astro:77-78](../src/components/BankImport.astro:77)) is only needed
  for sideloaded APKs. Keep it, but it won't show up for Play installs.

### 1c. Health Connect

**Policy.** Apps reading Health Connect fill in a Health Connect declaration in Play Console with a justification for
each data type, need a privacy policy that covers health data (what, how used/stored/shared, retention, deletion,
security) reachable from the app and the listing, and can't use the data for ads, sell it or share it without consent.
"Fitness, wellness and coaching" (daily activity, sleep, heart rate) is an approved use case. Heart rate is not in the
extra-scrutiny group.
Source: [Health Connect permissions](https://support.google.com/googleplay/android-developer/answer/12991134).
Separately, **every** app must complete the **Health apps declaration** under *App content*
([answer/14738291](https://support.google.com/googleplay/android-developer/answer/14738291)): pick *Activity and
Fitness* and *Sleep Management*.

**As built.** Read-only, asked per type ([DevicePlugin.java:192-210](../android/app/src/main/java/app/grovyn/DevicePlugin.java:192)),
the rationale activity alias exists ([AndroidManifest.xml:29-38](../android/app/src/main/AndroidManifest.xml:29)), and
the numbers stay in the local `body` store, which is not synced ([storage.ts:31](../src/lib/storage.ts:31), [storage.ts:47](../src/lib/storage.ts:47)).
The privacy page already covers it well ([privacy.astro:73-83](../src/pages/privacy.astro:73)).

Needs changing:

- **Justify, or drop, each of the 7 types.** Both `READ_TOTAL_CALORIES_BURNED` and `READ_ACTIVE_CALORIES_BURNED`, and
  `READ_DISTANCE` next to `READ_STEPS`, will each need a reason a reviewer accepts. If the Health page shows only one
  calorie number, drop the other.
- Add retention and security lines to the health section of the privacy policy (how long the last read is kept;
  stored in app-private storage).
- Note from memory: the real-device Health Connect read has not been tested yet. Test it before the declaration, since
  review may install and try it.

### 1d. Screen time — `PACKAGE_USAGE_STATS`

**Policy.** No specific Play declaration form was found for usage access (the sensitive-APIs page doesn't list it).
It's a special access the user turns on in Settings, and the [prominent disclosure](https://support.google.com/googleplay/android-developer/answer/11150561)
rule applies: which apps you use and for how long is not something users expect an app to read.

**As built.** A setup sheet explains and opens Usage access ([ScreenSetup.astro:37-38](../src/components/ScreenSetup.astro:37)).
Data stays in the local `screen` store, never synced ([storage.ts:35](../src/lib/storage.ts:35)).

Needs changing: the sheet says *how* to switch it on but not *what* is read. Add one line ("Grovyn reads how long you
use each app, per day and during focus sessions. It stays on this phone.") with *Agree* / *Not now*. Add screen time
to the privacy policy (§5) and to the listing description.

### 1e. Exact alarms — `USE_EXACT_ALARM`

**Policy.** `USE_EXACT_ALARM` is restricted to apps whose *core* function is an alarm or timer, or a calendar, and needs
a declaration and review. Others should use `SCHEDULE_EXACT_ALARM`.
Sources: [sensitive permissions page](https://support.google.com/googleplay/android-developer/answer/16558241),
[Schedule alarms](https://developer.android.com/develop/background-work/services/alarms).

**As built.** It's used for the focus timer's phase-end alert ([TimerNotices.java](../android/app/src/main/java/app/grovyn/TimerNotices.java)).
A focus timer *can* argue "timer app", but Grovyn is listed as a task/rewards app with a timer as one feature, so this is
a coin flip in review. **Recommendation:** replace with `SCHEDULE_EXACT_ALARM` (no `maxSdkVersion`), check
`AlarmManager.canScheduleExactAlarms()`, and fall back to an inexact alarm (`setAndAllowWhileIdle`) when it's off. A
few seconds' late phase-end chime is acceptable for a focus timer.

---

## 2. Account deletion

**Policy.** Any app that lets users create an account must offer (1) an in-app way to delete the account and its data,
and (2) a **web link** where users can request deletion without having the app installed. The web page must name the
app or developer as on Play, and the link goes into the Data safety form. Data kept for legal reasons must be stated.
Source: [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

**In-app: exists and is good.** *You → Delete account* ([account.astro:296-311](../src/pages/account.astro:296),
[account-ui.ts:268-290](../src/scripts/account-ui.ts:268)) calls `deleteAccount`
([firebase.ts:438-461](../src/lib/account/firebase.ts:438)), which re-authenticates, deletes every
`users/{uid}/stores/*` document ([firebase.ts:276-279](../src/lib/account/firebase.ts:276)), deletes the Firebase Auth
user, and clears the device copy. Guests are handled too. Firestore holds nothing outside `users/{uid}/stores`
([firestore.rules](../firestore.rules)), so this removes everything.

**Web: partly.** The same account page works in a browser on the website, so a signed-in user can already delete from
the web. But it's not enough for Play on its own:

- It needs sign-in to work. A user who signed in with Google on the phone can do that on the web; a **guest** account
  can't be reached from another device at all.
- There's no page that *says* how to delete. Play wants a URL that leads with the deletion path.

**Fix (should be small):** add a `/delete-account` page on the site that (a) says "Grovyn — delete your account and
data", (b) explains the in-app path, (c) offers sign-in and the existing delete button, and (d) gives the support email
for anyone who can't sign in (guest accounts: say that uninstalling removes the guest's local data, and that the guest's
Firestore copy is deleted on request by uid). Put that URL in the Data safety form.

---

## 3. Data safety form inputs

Source for how to answer: [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469).
Data processed only on the phone and never sent off it does not count as "collected".

| Data | Where it lives | Leaves the phone? | Data safety type |
|---|---|---|---|
| Email, name (Google sign-in) | Firebase Auth | Yes, if signed in | Personal info → Email address, Name. Collected, not shared. Purpose: account management. Optional. |
| Tasks, sessions, done list, chain, exam plan, settings | localStorage; Firestore if signed in ([storage.ts:47](../src/lib/storage.ts:47)) | Yes, if signed in | App activity → Other user-generated content / App interactions. Collected, optional, app functionality. |
| Budget: expenses, categories, budgets, repeats (incl. ones made from bank alerts) | `health` store; synced to Firestore ([storage.ts:30](../src/lib/storage.ts:30), [storage.ts:47](../src/lib/storage.ts:47)) | Yes, if signed in | **Financial info → Purchase history / Other financial info.** Collected, optional, app functionality. |
| Raw bank alert text (notifications, SMS) | SharedPreferences `bank` queue ([BankInbox.java:33-36](../android/app/src/main/java/app/grovyn/BankInbox.java:33)) and the local `bank` store | No (only the expense is synced) | Not collected. Mention on-device processing in the policy. |
| Health Connect numbers | local `body` store | No | Not collected (on-device only). Still needs the Health Connect declaration. |
| Screen time per app | local `screen` store | No | Not collected (on-device only). |
| Coach plan, profile | local `coach`, `profile` | No | Not collected. |
| Google Drive export | Sent from the device straight to the user's Drive | To Google, on the user's request | Not "shared" (user-initiated transfer to a service they chose). |

Other answers: **no** data shared with third parties; **no** ads, **no** analytics SDK ([privacy.astro:27](../src/pages/privacy.astro:27));
data encrypted in transit (HTTPS/Firebase TLS): **yes**; users can request deletion: **yes**, with the web link from §2.

Two things to settle before filling it in:

- **Android Auto Backup is on** ([AndroidManifest.xml:6](../android/app/src/main/AndroidManifest.xml:6), no
  `dataExtractionRules`). That backs up the app's files, which includes the bank alert queue in SharedPreferences and
  probably the WebView's localStorage (health numbers, screen time), to the user's Google Drive. The privacy page says
  health numbers are "not part of backups" ([privacy.astro:79](../src/pages/privacy.astro:79)), which is then not quite
  true. Either set `android:allowBackup="false"`, or add `dataExtractionRules`/`fullBackupContent` that exclude the
  `bank` prefs and the WebView data. The first is simplest.
- **Firebase's own collection.** The Firebase Auth/Firestore web SDK sends nothing for analytics (no `getAnalytics`
  anywhere in `src`), but Google's SDK index lists what each Firebase SDK collects. Check it for the versions used.

---

## 4. Release engineering

| Item | Current | Play requirement | Action |
|---|---|---|---|
| `targetSdk` / `compileSdk` | 36 / 36 ([variables.gradle](../android/variables.gradle)) | New apps and updates: API 36 since 31 Aug 2026 ([target-sdk](https://developer.android.com/google/play/requirements/target-sdk)) | **OK** |
| `minSdk` | 24 | — | OK. Health Connect via `android.health.connect` is API 34+; make sure the Health page degrades below that (it already gates on SDK: [DevicePlugin.java:182](../android/app/src/main/java/app/grovyn/DevicePlugin.java:182), `@RequiresApi(34)` on `HealthData`). |
| Package format | `assembleDebug` → `grovyn.apk` ([build-apk.mjs:34](../scripts/build-apk.mjs:34)) | New apps must be AAB since Aug 2021 ([App Bundle](https://developer.android.com/guide/app-bundle)) | **Blocker:** add a release script running `bundleRelease`. |
| Signing | No `signingConfigs` in [build.gradle](../android/app/build.gradle); only the debug key | Play App Signing (default for new apps); you sign with an *upload key* | **Blocker:** make an upload keystore, keep it **outside** the repo/OneDrive sync, read path and passwords from `keystore.properties` or env vars, add `*.jks`/`*.keystore` to `.gitignore` (only `*.apk` is there now). Back the key up. |
| `versionCode` / `versionName` | 1 / "1.0" ([build.gradle:10-11](../android/app/build.gradle:10)); `package.json` is 0.1.0 | `versionCode` must go up on every upload | Fine for the first upload. Bump on each upload; consider deriving it from a counter or date so you don't forget. |
| R8 / minify | `minifyEnabled false` ([build.gradle:21](../android/app/build.gradle:21)) | Not required | Nice-to-have: turn on `minifyEnabled true` + `shrinkResources true`, test the Capacitor bridge (keep rules for `@CapacitorPlugin` classes), and upload the mapping file. Play will warn about a missing deobfuscation file once it's on. |
| `applicationId` | `app.grovyn` ([build.gradle:7](../android/app/build.gradle:7), [capacitor.config.ts](../capacitor.config.ts)). The old `app.rewardingwork` is already gone on `origin/main`. | Permanent once the first build is uploaded | **Decide the final name first.** If the app is renamed again, change `applicationId`, `namespace`, the Java package and `appId` *before* the first upload, even to internal testing. Also register the Android app under the new ID in Firebase (SHA-1 of the **Play app signing** key, not only the upload key, or Google sign-in breaks for Play installs). |
| `google-services.json` | Not present; build.gradle skips it ([build.gradle:51-58](../android/app/build.gradle:51)) | — | Fine: Firebase is configured in the web layer. Only the Google sign-in client needs the right SHA-1s (above). |
| Gradle on a non-Latin path | Worked around with `subst` ([build-apk.mjs:23-29](../scripts/build-apk.mjs:23)) | — | Reuse the same workaround in the release script. |

---

## 5. Store listing gaps

Asset specs from [Add preview assets](https://support.google.com/googleplay/android-developer/answer/9866151).

| Item | Status | Needed |
|---|---|---|
| **Privacy policy URL** | `/privacy` exists ([privacy.astro](../src/pages/privacy.astro)); on GitHub Pages, likely `https://zohr21.github.io/rewarding-work/privacy/` (check `SITE_URL` in the deploy workflow) | **Must be updated before submitting:** it says nothing about **bank alerts from notifications**, **reading SMS** (if kept), or **screen time / usage access**. Add a section for each (what is read, what's kept, what leaves the phone). It also uses the personal address ([privacy.astro:11](../src/pages/privacy.astro:11)); use `SITE.supportEmail` (grovyn.support@gmail.com, already on `origin/main`). Must be linked from inside the app too (it is, via the footer/You). |
| App icon 512×512 PNG | `public/icons/icon-512.png` exists | Check it is 32-bit PNG, ≤1 MB, full-bleed square (Play rounds it). The maskable one may fit better. |
| Feature graphic 1024×500 | None | Make one. |
| Phone screenshots | None | At least 2, up to 8; recommend 4+ at 1080×1920 for promotion. |
| Short (80) and full (4000) description | None | Must name the sensitive features (bank alerts, Health Connect, screen time). |
| Content rating (IARC questionnaire) | Not done | Fill in under *App content*; expect "Everyone". |
| Target audience | Not done | Choose 18+ (or 13+). Don't include under-13s: Health Connect forbids apps that target children, and it pulls in the Families policy. |
| Health apps declaration | Not done | Required for every app (§1c). |
| Financial features declaration | Not done | Play Console asks every app about financial features; answer for a budgeting/expense tracker (no loans, no payments). Verify the options in the console. |
| Data safety + account deletion URL | Not done | §2, §3. |
| Developer account testing | — | **New personal accounts** (created after 13 Nov 2023): closed test with **≥12 testers opted in for 14 consecutive days**, then *Apply for production* (review usually ≤7 days) ([answer/14151465](https://support.google.com/googleplay/android-developer/answer/14151465)). Start recruiting testers now; this is the longest wait. An organisation account (needs a D-U-N-S number) skips it. |

---

## Prioritised list

### Blockers (Play will refuse or remove the app)

1. **Remove `READ_SMS` and the *Past SMS* import for v1** (§1a). Keep bank alerts via notifications.
   *Done on `claude/store-flavors`:* `play` and `full` build flavors. Only `full` (`app.grovyn.full`, installed by hand)
   has `READ_SMS` and the *Past SMS* button; `play` (`app.grovyn`) has neither.
2. **Replace `USE_EXACT_ALARM` with `SCHEDULE_EXACT_ALARM`** plus an inexact fallback (§1e).
3. **Update the privacy policy**: bank alerts/notification access, screen time, (SMS if kept), retention, support email (§5).
4. **Web account-deletion page** and put its URL in Data safety (§2).
5. **Signed release AAB**: upload keystore + `bundleRelease` script (§4).
6. **Lock the final name and `applicationId`** before the first upload, and register its SHA-1s in Firebase (§4).
7. **Play Console forms**: Data safety (§3), Health Connect declaration with a reason per type, Health apps declaration,
   content rating, target audience, financial features.
8. **Closed test: 12 testers × 14 days** before production access (§5). Start as soon as items 1–6 are done.
9. **Store assets**: feature graphic, ≥2 screenshots, descriptions that name the sensitive features.

### Should fix (likely review feedback or wrong declarations)

1. *Allow* in the bank warning row goes straight to Android settings without the disclosure (§1b).
2. Explicit *Agree* / *Not now* disclosures for notification access and usage access, stating what is read (§1b, §1d).
3. Turn off Auto Backup or exclude `bank` prefs and WebView data, so the "not in backups" line is true (§3).
4. Drop Health Connect types the Health page doesn't show (e.g. one of the two calorie types) (§1c).
5. Test the real Health Connect read on a phone before the declaration (§1c).
6. Add `*.jks`, `*.keystore`, `keystore.properties` to `.gitignore` (§4).

### Nice to have

1. R8 minify + resource shrinking, with mapping upload (§4).
2. A versionCode scheme that bumps automatically (§4).
3. Bring back the past-SMS import later, with its own Permissions Declaration and a demo video, if users ask for it (§1a).
4. A custom domain for the site, so the privacy and deletion URLs don't change if the repo is renamed.
