---
name: sync
description: Start of a session. Pull the latest main, read the handover and memory files, and say where things stand before any work.
---

# /sync

1. `git fetch origin` and `git checkout main && git pull`. If you were on a work branch, merge `main` into it.
2. `npm ci` if `package-lock.json` changed.
3. Read, in order: `AGENTS.md`, `HANDOVER.md`, `.agent/memory/handoff.md`, `.agent/memory/scratchpad.md`, `.agent/memory/graveyard.md`, and `docs/handover/<module>.md` for the module in hand.
4. Check open PRs on GitHub for the module, and whether `main` is green.
5. Tell Patrick in a few lines: what was done last, what is next, and anything waiting on him. Lead with what needs him. Then wait for his go.
