---
name: grovyn-native
description: How to add or change native Android code in Grovyn — the RewardDevice Capacitor plugin (DevicePlugin.java) and its web side src/lib/device.ts, permissions, the full/play flavors, Health Connect, usage stats, notifications and widgets. Use when a feature needs something only Android can do.
---

# Native Android work (RewardDevice plugin)

Package `app.grovyn`, Java only (no Kotlin), code in
`android/app/src/main/java/app/grovyn/`. One Capacitor plugin, `RewardDevice`:
`DevicePlugin.java` (registered in `MainActivity.java`), with helpers per area —
`TimerNotices`, `Widgets`/`ChainWidget`/`FirstUpWidget`, `HealthData`, `UsageData`,
`BankListener`/`BankInbox`, `Routes` (where a notification or widget asked to go).

## Adding a method — always both sides

1. **Java**: a `@PluginMethod public void fooBar(PluginCall call)` in `DevicePlugin.java`;
   keep the work in the area's helper class. `call.resolve(JSObject)` / `call.reject(msg)`.
   Return per-field `failed` instead of rejecting when part of a read fails (Health Connect
   refuses reads in the background; the page keeps its cached numbers).
2. **TypeScript**: add it to `interface DevicePlugin` in `src/lib/device.ts` plus an exported
   wrapper that **does nothing on the site** (the `plugin` promise is `null` when not
   `NATIVE_APP`, and Capacitor isn't loaded there). UI only ever imports the wrapper.
3. Event from native → page: `notifyListeners("name", data)` in Java, listened to from
   `device.ts`; app-wide listeners live in `src/scripts/device-sync.ts` / `bank-sync.ts`.

Native code can't change the page's stored data directly — it queues (SharedPreferences) and
the page picks it up (`bankPending` → `bankAck`). Design that way.

## Permissions

- Runtime ones: `@Permission(strings = {...}, alias = "...")` on the `@CapacitorPlugin`
  annotation **and** `<uses-permission>` in `android/app/src/main/AndroidManifest.xml`.
- Health Connect: one alias per kind (`HealthData.SLEEP` …), framework `android.health.connect`
  API, Android 14+ only. Writing needs `WRITE_*` permissions too.
- Special access (Usage access, Notification access) is switched on by the **user** in Android
  Settings; open the screen for them (`usageSettings`, `bankSettings`). Package visibility needs
  `<queries>` on Android 11+.
- **Never grant permissions with adb yourself** — the user taps Allow.
- Anything Play review dislikes (READ_SMS) goes in the **full flavor only**:
  `android/app/src/full/AndroidManifest.xml`. Flavors: `full` = `app.grovyn.full`
  (what `npm run apk` builds and the user runs), `play` = `app.grovyn` (`npm run apk:play`).
- Biometric: `androidx.biometric` with `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`.

## Testing without the real plugin

In the `dev-app` preview there is no native side. Stub it temporarily, e.g. in the console:
`window.Capacitor = { Plugins: { RewardDevice: { usageState: async () => ({...}) } } }` or a
throwaway fake in `device.ts` — and **remove the stub before committing**. Then test the real
thing on the phone (`grovyn-phone`): call `window.Capacitor.Plugins.RewardDevice.<method>()`
over CDP, and check Android's side with `adb shell dumpsys healthconnect`,
`dumpsys usagestats`, `dumpsys notification`, `dumpsys window | grep mCurrentFocus`
(biometric prompts are blank in screencaps).

## Known facts about the user's phone

Galaxy S24 Ultra, Android 16, en-US locale. Samsung Health doesn't share phone-estimated sleep
to Health Connect; a Xiaomi band (Mi Fitness) is the planned sleep source. Bank alert formats
seen so far are in the `bank-alerts-import` memory note.
