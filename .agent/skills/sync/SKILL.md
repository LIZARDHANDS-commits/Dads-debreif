---
name: sync
description: Start of a session. Pull the latest main, read the rule book, the bulletin for Dad, the plan and the module's README, and say where things stand before any work.
---

# /sync

1. `git fetch origin` and `git checkout main && git pull`. If starting a new piece of work, branch fresh from `origin/main` (`git switch -c <branch> origin/main`)—never stack new branches onto older feature branches.
2. `npm ci` if `package-lock.json` changed.
3. Read, in order: `docs/BULLETIN-FOR-DAD.md` (if present, **show Patrick's message to Dad at the very top of your reply**), `AGENTS.md` (the rule book), `docs/PLAN.md`, and the README of the module in hand (`docs/modules/<module>/README.md`). Read the rest of that module's folder only as the work needs it.
4. Check open PRs on GitHub for the module, and whether `main` is green.
5. Tell Dad or Patrick in a few lines: any message in `docs/BULLETIN-FOR-DAD.md`, what was done last, what is next in the module's `plan.md`, and anything waiting on Patrick. Then wait for his go.
