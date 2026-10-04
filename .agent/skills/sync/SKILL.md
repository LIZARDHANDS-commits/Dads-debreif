---
name: sync
description: Start of a session. Pull the latest main, read the rule book, the plan and the module's README, and say where things stand before any work.
---

# /sync

1. `git fetch origin` and `git checkout main && git pull`. If you were on a work branch, merge `main` into it.
2. `npm ci` if `package-lock.json` changed.
3. Read, in order: `AGENTS.md` (the rule book), `docs/PLAN.md`, and the README of the module in hand (`docs/modules/<module>/README.md`). Read the rest of that module's folder only as the work needs it.
4. Check open PRs on GitHub for the module, and whether `main` is green.
5. Tell Patrick in a few lines: what was done last, what is next in the module's `plan.md`, and anything on the waiting-on-Patrick list in `docs/PLAN.md`. Lead with what needs him. Then wait for his go.
