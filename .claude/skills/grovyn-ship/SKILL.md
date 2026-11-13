---
name: grovyn-ship
description: Finish a piece of Grovyn work — branch, commit message style, pull request to zohr21/rewarding-work, stacked-PR pitfalls, and the memory note that records it. Use when committing, opening a PR, starting a new feature branch, or wrapping up a feature in this repo.
---

# Shipping Grovyn work

Repo: `zohr21/rewarding-work`, default branch `main`. Pushing to `main` deploys the site to
GitHub Pages (`.github/workflows/deploy.yml`). Every PR runs `.github/workflows/check.yml`
(translation check, tests, type check and site build); run `npm run verify` yourself before
pushing. The user reviews on the phone and merges themselves. Commit, push and open PRs only when the user asks.

## Branch

- One feature per branch: `claude/<short-name>` (`claude/budget-lock`, `claude/findings`).
- Cut it from an up-to-date `main` unless it truly needs an unmerged branch:
  `git fetch origin && git switch -c claude/<name> origin/main`.
- **Stacked branches trap:** when PR B is based on PR A's branch and A is merged *into its
  stacked base* instead of `main`, A's commits never reach `main` (this happened with PRs
  51–53). Prefer basing PRs on `main`; if stacked, say the merge order in each PR and check
  `git log origin/main..HEAD` before opening the next.
- Don't commit the untracked personal folders (`art/trailer/`, `videos/`, `reports/`,
  `research_notes/`, `docs/*.docx`, `*.apk`) unless asked. Stage files by name, not `git add -A`.

## Commit message

`Area: what the user gets, in plain words` — lowercase after the colon, no full stop,
no conventional-commit prefixes. Areas in use: Health, Budget, Grove, Focus, Tasks, Timer,
Coach, Exam prep, You, Sprig, Screen time, Android, Privacy. Examples from history:

```
Budget: an optional lock, and an eye that hides amounts
Health: an empty ring draws no dot
Screen time: count the first pick-up, and keep an app's time across its own screens
```

Body (optional): a few lines on *why* and anything not obvious. End with the attribution line
from the session's instructions.

## Pull request

```bash
git push -u origin claude/<name>
gh pr create --base main --title "<same style as the commit>" --body-file <scratch file>
```

Body sections, short:
- **What** — the change from the user's point of view.
- **How** — files and stores touched (new store? synced? rules change?).
- **Checked** — where it was really tested: dev / dev-app with seeded data / on the phone.
- **Not done / needs you** — e.g. "publish firestore.rules in the Firebase console",
  "install the new APK before adding data", untested paths.
- End with the attribution line from the session's instructions.

## Decisions log

When the user picks an option or a feature ships, add a dated line to `docs/decisions.md`
(the repo is public: no canvas links, no personal details). It is what a session on another
machine reads.

## Memory note

After a feature is built (or a canvas made), write or update one note in the project memory
folder, named after the feature (`budget-lock-canvas.md`), and add a line to `MEMORY.md`:

- Date (absolute), what the user asked, which option they picked.
- Canvas link if any; branch, commit hash, PR link and state (open / merged).
- Files and stores, in a short list.
- What was tested where, and what is **not** built or not tested.
- Which choices were mine and not confirmed by the user.
- `**How to apply:**` one line for next time, plus `[[links]]` to related notes.

Update an existing note when the PR merges instead of adding a new one.
