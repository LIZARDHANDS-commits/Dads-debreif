---
name: save
description: End of a piece of work. Record decisions, ideas and questions in the module's folder and your own tracking folder (docs/dad/ or docs/pat/), commit on a work branch and push.
---

# /save

1. Record what happened, in the module's own folder (`docs/modules/<module>/`), one line or row each:
   - decisions in `decisions.md`, with the module's prefix and the next free number, and update the spec, requirements or testing file it changes in the same piece of work;
   - new ideas in `future.md` (not built);
   - approaches tried and dropped in `decisions.md`, with why;
   - questions for Dad in `docs/questions-for-dad.md`, each with its working answer.
2. Update the module's `README.md` (where it stands, what's next, open questions) and tick the finished tasks in its `plan.md`.
3. **Single-Writer Tracking Rule (`docs/dad/` vs `docs/pat/`):**
   - **Dad's sessions:** record status updates in `docs/dad/status-and-plan.md` and anything waiting on Patrick in `docs/dad/waiting-on-patrick.md`. Never edit `docs/pat/*` or `docs/PLAN.md`.
   - **Patrick's sessions:** record status updates in `docs/pat/status-and-plan.md` and messages/approvals for Dad in `docs/pat/bulletin-for-dad.md`. Never edit `docs/dad/*` or `docs/PLAN.md`.
   - **No version-file collisions:** Do **not** edit `index.html` or `src/modules/traffic/version.js` on a feature branch—`vite.config.js` computes and stamps the next `V2.xxx` version number automatically from Git history on every build and merge.
4. Don't run tests locally before the pull request: CI on the pull request is the one check, and Patrick may merge before it finishes (`AGENTS.md`, Testing). A build check (`npm run build`) before pushing code is fine. If CI or main goes red, say so in the PR and the status and fix it next; never skip or disable a test to get green.
5. Commit on a work branch branched fresh from `origin/main` with a plain-English name that says what changed, for example "Traffic: break turn follows the wind" (decision or task numbers may follow in brackets), and push. Open or update the PR against `main`.
6. Tell Dad or Patrick in a few lines what was saved, what is next, and what is untested or unseen.
