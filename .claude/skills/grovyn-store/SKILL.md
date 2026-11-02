---
name: grovyn-store
description: Checklist for adding a new localStorage store or changing the shape of an existing one in Grovyn (src/lib/storage.ts, account sync, firestore.rules, backups). Use whenever a feature needs to save new data, add keys to a stored object, sync something to the account, or migrate old data.
---

# Adding or changing a Grovyn data store

`src/lib/storage.ts` is the only code that touches localStorage. Keys are `rw:v1:<name>`
(both in dev and in the app). Each feature has its own `src/lib/<feature>.ts` with typed
getters/setters on top (`budget.ts`, `workouts.ts`, `findings.ts`, `board.ts`…).

## 1. Decide: local or synced? Ask if unsure.

Default to **local to the device** for anything sensitive or read from the phone
(Health Connect `body`, `screen`, `bank`, `workouts`, `lock`, `findings`). Sync only when the
user wants it across devices. Health and money data: ask the user before syncing.

## 2. New store, every time

- [ ] Add the name to the `StoreName` union with a one-line comment saying what it holds and
      which file owns it.
- [ ] Add it to `ALL_STORES` (so "Delete all data" clears it).
- [ ] Write a type guard (`isX(v: unknown): v is X`) and read with `read(name, fallback, guard)`.
      Corrupted or hand-edited data must fall back to a safe default, never throw.
- [ ] Ids from `newId(prefix)`. Edits that must sync are **remove + add with a new id**, or
      carry `updatedAt`, so merge by id works.
- [ ] Bound it: keep N days / N items (e.g. 90 days of `body`, 300 screen sessions).
- [ ] UI subscribes with `subscribe(name, render)` inside `onPage` (see `grovyn-ui`).

## 3. Only if synced

- [ ] Add to `SYNCED_STORES` in `storage.ts`.
- [ ] Add the same name to the `store in [...]` list in `firestore.rules`. **The user publishes
      the rules by hand** in the Firebase console (project `rewarding-work-f9021`); until then the
      live project answers permission-denied. Tell them.
- [ ] Decide on `SYNCED_AT_FIRST`: a store that already has data on signed-in devices must
      **not** be in it, or their local copy is wiped by the account's empty one on first sync.
- [ ] Add a merge for it in `src/lib/account/merge.ts` (lists merge by id/day; deletions keep
      a small tombstone, e.g. `removedAt`, so they reach other devices — and `get…()` hides
      tombstones while writes use the full records).
- [ ] Writes made before sync starts are marked unsent by `markUnsent`; don't bypass `write()`.

## 4. Changing an existing shape

- [ ] Prefer **new optional keys** on the same version (as Budget did on `v: 2`), read with a
      default. Old data must still read.
- [ ] Breaking changes: add an in-object `v` and read the old form (see `budget.ts`), or a
      `MIGRATIONS[n]` step in `storage.ts` bumping `SCHEMA_VERSION`.
- [ ] **Old-APK risk:** an older app build on the phone normalises new data with old rules and
      may drop entries or new keys when it writes and syncs. Say so in the PR and make sure the
      new APK is installed on the phone before the user adds data (`grovyn-phone`).

## 5. Backup file

`exportBackup()` in `storage.ts` writes `{ app: "grovyn", schemaVersion, exportedAt, data }`.
Sensitive stores (`health`, `body`, `screen`, `workouts`) are deliberately **not** in it —
add a store only if the user wants it, and update the parser + import merge to match.
Import must keep accepting `"app": "rewarding-work"`.

## 6. Test

- Seed data in the preview (see `grovyn-verify`), including an old-format copy and garbage.
- Never write test data into the user's real phone store; read it over CDP instead.
