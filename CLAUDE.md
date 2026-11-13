# Grovyn

A focus timer, tasks in small steps, and a grove (the mascot Sprig) that grows with focus
time. One Astro 7 + TypeScript + plain CSS codebase builds two things:

- the **website** (GitHub Pages, base path `/rewarding-work/`, deployed on every push to `main`);
- the **Android app** (Capacitor 8, base `/`, `NATIVE_APP` true). Two flavors install side by
  side: `full` (`app.grovyn.full`, the one the owner uses daily) and `play` (`app.grovyn`, for
  Google Play: no SMS import, no weekly board).

No backend of its own. Data lives in `localStorage` (`rw:v1:<store>`); an optional Firebase
account syncs some stores. No ads, no analytics.

## Commands

| | |
|---|---|
| `npm run verify` | type check + translation check + tests. **Run before saying a change works.** |
| `npm test` | Vitest, `tests/*.test.ts` (pure logic in `src/lib`) |
| `npm run build` | `astro check` + site build into `dist/` |
| `npm run dev` | website at `localhost:4321/rewarding-work/` |
| `npm run apk` / `apk:play` | app web build + debug APK (`grovyn.apk`) |
| `npm run release` | Play bundle (`docs/release.md`) |
| `npm run i18n:check -- --english` | list English still left in markup |

Preview servers for the Browser pane are in `.claude/launch.json`: `dev` (site), `dev-app`
(the app's look, phone width), `preview-build` (built `dist/`).

## Where things are

- `src/pages/` one file per route · `src/components/` UI · `src/scripts/` larger page scripts
- `src/lib/` logic: `storage.ts` (all stores and their guards), `budget.ts`, `bank.ts`
  (reads bank alerts), `timer/`, `i18n/` (`en.ts` is the source; `ru.ts`, `az.ts`),
  `device.ts` (the only door to native code)
- `src/config/site.ts` navigation, optional modules, support email · `src/styles/tokens.css` colours
- `android/app/src/main/java/app/grovyn/` native code (`DevicePlugin.java`, `MainActivity.java`)
- `docs/` Play listing, console answers, release steps · `scripts/` build, icons, store screenshots
- `tests/` Vitest

## Skills (read the one that fits before working)

`.claude/skills/`: **grovyn-ui** (component and page rules), **grovyn-store** (adding or
changing saved data), **grovyn-native** (Android side), **grovyn-verify** (checking in the
preview), **grovyn-phone** (build, install, read the real phone), **grovyn-canvas** (design
before building), **grovyn-ship** (branch, commit, PR).

## Rules that are easy to break

- **Design first.** A new screen or redesign starts as a canvas the owner picks from
  (`grovyn-canvas`). Don't build an unrequested redesign.
- **Component scripts use `onPage`** and return a cleanup; the client router runs a script
  once per visit, not once per page.
- **Every visible string has a key** in `src/lib/i18n/en.ts` (`data-t="…"` in markup, `t()` in
  script) and a line in `ru.ts` and `az.ts`. Dates and numbers go through `dateFormat` /
  `locale()`, money through `formatMoney`.
- **Stored data is real people's data.** A store's shape changes only with a guard that still
  reads the old shape (`grovyn-store`). Never clear app data, uninstall, or seed test data on
  the owner's phone.
- **Keep the old names** `rw:` / `rw-` keys, the Firebase project id and the `/rewarding-work/`
  base path. Never rename them without asking.
- **App-only layout** goes under `html[data-app]`; native calls only through `src/lib/device.ts`.
- **The dark palette is written twice** in `tokens.css` (auto and dark). Edit both.
- **Glow green is for actions and earned things, sun gold for rewards only.** Tap targets
  are at least 44 px. Copy is plain, short and kind: no guilt, no "browser" inside the app.
- **Play build** (`PUBLIC_PLAY_STORE`): no `READ_SMS`, no weekly board. A sensitive permission
  needs a disclosure in the app before Android's own screen, and a line in the privacy policy.
- Commit, push and open pull requests only when asked. One feature per `claude/<name>` branch
  from `main`. Stage files by name.

## Known traps

- **A project folder inside OneDrive breaks things**: `astro dev` can hang without opening its
  port, long paths drop CSS from the build, Gradle fails on cloud placeholders, and `.git`
  refs sync before their objects. Work from a plain folder such as `C:\code\grovyn`. If you
  must use git in a OneDrive copy: `git -c windows.appendAtomically=false …`, fetch with
  `-c fetch.negotiationAlgorithm=noop`, and never `git worktree prune`.
- **adb**: use the Android SDK's (`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`); a
  stray `C:\Android` copy on PATH sees no devices. The phone shows up twice over Wi-Fi, so
  pass `-s <ip>:<port>`.
- **Stale web files in the APK**: after a build, check the APK holds the new code before
  installing (`unzip -p grovyn.apk assets/public/...`).
- A new clone needs `.env` (Firebase web config, see `.env.example`) and
  `android/local.properties` (`sdk.dir=…`), or the app builds without accounts or not at all.

## Decisions and history

What was chosen and why is in `docs/decisions.md`. Add a dated entry there when the owner
picks an option, so the next session on any machine knows.
