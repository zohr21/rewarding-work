---
name: grovyn-phone
description: Build the Grovyn Android APK, install it on the user's phone (or the emulator), and read the app's live data over adb + DevTools. Use when asked to build/install the app, test on the phone, check what the phone shows, debug Health Connect / screen time / bank alerts on the device, or after any change that should be tried in the real app.
---

# Grovyn on the phone

## Build and install

```bash
npm run build:app                 # astro check + build with BASE_PATH=/ and PUBLIC_NATIVE_APP, then cap sync
node scripts/build-apk.mjs full   # Gradle assembleFullDebug → grovyn.apk (npm run apk does both)
```

- `npm run apk` builds the **full** flavor, package `app.grovyn.full` — the one the user runs.
  `npm run apk:play` builds `app.grovyn` (no SMS). They install side by side.
- The script maps the Cyrillic project path to a spare drive letter and finds Android
  Studio's Java; don't fight those.
- **OneDrive breaks Gradle** ("not a regular file"): it turns `android/app/src/main/assets/public`
  into cloud placeholders. Delete that folder, rerun `npm run build:app`, then the APK step.
- **The phone shows up twice** in `adb devices` (an `<phone-ip>:<port>` entry and an
  `adb-…_adb-tls-connect._tcp` entry), so the script's own install is skipped. Install with:
  ```bash
  adb -s <phone-ip>:<port> install -r grovyn.apk
  ```
  Read the IP and port from `adb devices`; the port changes when wireless debugging restarts.
- Built on a branch that lacks another open PR's change? Say which changes the installed APK
  has and doesn't.
- **Before installing over real data**, check the change is safe for stored data the phone
  already has (see `grovyn-store`, old-APK risk). Installing is normal practice here, but
  never clear app data or uninstall without asking.

## Read the app (CDP)

`phone.mjs` in this folder runs an expression in the app's web view and prints JSON:

```bash
node .claude/skills/grovyn-phone/phone.mjs "location.href"
node .claude/skills/grovyn-phone/phone.mjs "Object.keys(localStorage)"
node .claude/skills/grovyn-phone/phone.mjs "JSON.parse(localStorage['rw:v1:sessions']).length"
node .claude/skills/grovyn-phone/phone.mjs "await Capacitor.Plugins.RewardDevice.usageState()"
node .claude/skills/grovyn-phone/phone.mjs "location.assign('/health/index.html')"
```

- Options: `--serial`, `--pkg app.grovyn` for the play build, `--port`.
- The phone must be **unlocked with Grovyn in front**, or Android freezes the app and the
  script says it isn't answering. Ask the user to open it.
- Pages are at `https://localhost/<page>/index.html`.
- **Read freely, write only with the user's OK**: the phone holds the user's real data. Never seed test data into it, never grant permissions or
  turn on access settings for them.
- To preview with the phone's data: copy the stores out with the script into a file under
  `node_modules/.phone-data.json`, load them in the dev preview, and delete the copy afterwards.

## Other checks

- Screenshot: `adb -s <id> exec-out screencap -p > shot.png` (biometric prompts come out blank;
  use `adb shell dumpsys window | grep mCurrentFocus`).
- `adb shell dumpsys healthconnect` (which apps contribute data), `dumpsys usagestats`,
  `dumpsys notification`.
- Logs: `adb -s <id> logcat -d | grep -i -E "grovyn|Capacitor|chromium"`.

## Emulator (when the phone isn't there or must not be touched)

AVD `Medium_Phone_API_36.1`, headless. Set both `ANDROID_SDK_ROOT` and `ANDROID_HOME` to
the Android SDK, usually `%LOCALAPPDATA%\Android\Sdk` (a stray `ANDROID_HOME=C:\Android` breaks it), then
install with `adb -s emulator-5554 install -r grovyn.apk`. The script works there with
`--serial emulator-5554`.

## Google sign-in in the full flavor

`app.grovyn.full` fails with "[16] Account reauth failed" until it is added in Firebase as a
second Android app with the debug SHA-1 — the user does that in the console.

Finish by telling the user what to try on the phone, and record "tested on phone" (or not) in
the memory note.
