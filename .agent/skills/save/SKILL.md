---
name: save
description: End of a piece of work. Record decisions, ideas and questions, update the handover files, test, commit and push.
---

# /save

1. Record what happened, one line or row each:
   - judgement calls in `docs/records/decisions-log.md` (time, module, decision, why, other options, PR or commit, how to undo);
   - new ideas in `docs/records/future-ideas.md` (not built);
   - questions for Dad in `docs/records/dads-questions.md`;
   - approaches tried and dropped in `.agent/memory/graveyard.md`, with why;
   - check reports in `docs/records/verification/<module>-<what>.md`.
2. Update `docs/handover/<module>.md` (done, left, open) and the module status table in `HANDOVER.md` if it changed.
3. Rewrite `.agent/memory/handoff.md`: date, branch, what was done, the exact next step, anything waiting on Patrick. Clear finished notes from `.agent/memory/scratchpad.md`.
4. Run `npm test` and `npm run typecheck` (and `npm run build` if code changed). Don't commit red tests; note them in the handoff instead.
5. Commit on the work branch (never straight to `main`) with a plain message saying what changed, and push. Open or update the PR.
6. Tell Patrick in a few lines what was saved and what is next.
