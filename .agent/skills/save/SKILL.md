---
name: save
description: End of a piece of work. Record decisions, ideas and questions in the module's folder, update its README and plan ticks, commit on a work branch and push.
---

# /save

1. Record what happened, in the module's folder (`docs/modules/<module>/`), one line or row each:
   - decisions in `decisions.md`, with the module's prefix and the next free number, and update the spec, requirements or testing file it changes in the same piece of work;
   - new ideas in `future.md` (not built);
   - approaches tried and dropped in `decisions.md`, with why;
   - questions for Dad in `docs/questions-for-dad.md`, each with its working answer.
2. Update the module's `README.md` (where it stands, what's next, open questions) and tick the finished tasks in its `plan.md`. Anything now waiting on Patrick goes on the waiting list in `docs/PLAN.md`.
3. Don't run tests locally before the pull request: CI on the pull request is the one check, and Patrick may merge before it finishes (`AGENTS.md`, Testing). A build check (`npm run build`) before pushing code is fine. If CI or main goes red, say so in the PR and the status and fix it next; never skip or disable a test to get green.
4. Commit on a work branch with a plain-English name that says what changed, for example "Traffic: break turn follows the wind" (decision or task numbers may follow in brackets), and push. Open or update the PR.
5. Tell Patrick in a few lines what was saved, what is next, and what is untested or unseen.
