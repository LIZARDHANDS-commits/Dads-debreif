---
name: sync
description: Start of a session. Pull the latest main, read the rule book, the bulletin for Dad, the module's README, and say where things stand before any work.
---

# /sync

1. `git fetch origin` and `git checkout main && git pull`. If starting a new piece of work, branch fresh from `origin/main` (`git switch -c <branch> origin/main`)—never stack new branches onto older feature branches.
2. `npm ci` if `package-lock.json` changed.
3. Read, in order:
   - `AGENTS.md` (the rule book).
   - **If working for Dad:** read `docs/pat/bulletin-for-dad.md` (**show Patrick's message to Dad at the very top of your reply**), `docs/dad/status-and-plan.md`, and `docs/dad/waiting-on-patrick.md`.
   - **If working for Patrick:** read `docs/pat/status-and-plan.md` and `docs/dad/waiting-on-patrick.md`.
   - Read the README of the module in hand (`docs/modules/<module>/README.md`), and the rest of that module's folder only as the work needs it.
4. Check open PRs on GitHub for the module, and whether `main` is green.
5. Tell Dad or Patrick in a few lines: any message in `docs/pat/bulletin-for-dad.md`, what was done last, what is next in the module's `plan.md`, and anything waiting on Patrick. Then wait for his go.
