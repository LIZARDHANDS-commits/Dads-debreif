---
trigger: always_on
description: "Always-on rules for Dad's Debrief V6 rebuild: flight ground truths, pilot tolerances, build policy, and skills"
---

# Project: rebuild of Dad's OODA LOOP debrief webtool (V6) in github.com/LIZARDHANDS-commits/Dads-debreif

Live site: https://lizardhands-commits.github.io/Dads-debreif/ (GitHub Pages, deployed on every merge to main).

## Master Execution Roadmap & Authoritative Document Directory
The single source of truth for living tasks, milestone checklists, architecture gap analyses, and the Phase 2 feature queue is [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md).

| Document | Purpose / Role | Location |
| :--- | :--- | :--- |
| **Living Execution Roadmap** | Sole authoritative checklist (`- [x]`) for Milestones 0–5, critical gaps 1–7, and Phase 2 queue | [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md) |
| **Remediation Patch Log** | Ledger of every technical fix, file change, bug fix, and quarantine action | [`docs/REMEDIATION_PATCH_LOG.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_PATCH_LOG.md) |
| **Flight Manuals Index** | Ground truth aero numbers, pattern geometries, and SMM procedures (private) | [`manuals/README.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/manuals/README.md) |
| **Decisions & Requirements** | Formal master registers for ratified decisions (D1–D388) and requirements (R1–R33) | [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md), [`plan-requirements.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-requirements.md) |
| **Module Handover & Status** | Live completion status table across modules and current workstream context | [`HANDOVER.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/HANDOVER.md) |
| **Sign-Off Checklists** | Human verification checklists run by Patrick at each milestone gate | `docs/checklists/<module>.md` |

> [!IMPORTANT]
> **Single Source of Truth for Tasks:** Living task tracking occurs **exclusively** in [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md). Never duplicate active task checklists into system rules or memory files.

## Invariant Ground Truths & Pilot Domain Tolerances
- **Complete V6 Decoupling & Archival Quarantine (D368, D372):** V6 in `original/` is an archival visual and UX layout reference only. Zero runtime `eval()`, `new Function()`, or bit-exact float matching against `original/shell.html`. The physical and aerodynamic baseline is standard aerodynamics and the 15 Wing Moose Jaw flight manuals (`../manuals/`).
- **Pilot Domain Tolerances (D369, D371):**
  - Airspeed: `±10 kt` standard, `±20 kt` loose / tactical.
  - Altitude & Separation: `±100 ft` standard, `±200 ft` loose / tactical (close formation: `±20 ft` standard, `±50 ft` loose).
  - Angles (Bank, Pitch, Heading, Aspect): `±5°` standard, `±10°` loose.
  - G-Force: `±0.5 G` standard, `±1.0 G` loose.
  - Turn Rate: `±2.5°/s` standard, `±5.0°/s` loose / tactical.
  - Relative Math / Density: `±5%` (0.05) standard, `±10%` (0.10) loose.
  - Time / Merge Timestamps: `±0.5 s` standard, `±1.0 s` loose.
- **CYMJ Moose Jaw Airfield Ground Truth (D373, D378):** The **Harvard II IS the CT-156** (CT-156 Harvard II). Break altitude is **3,500 ft MSL**; straight-in is **2,700 ft MSL** (descend abeam departure end to 2,700 ft, slow to 140 KIAS on base, 120 in final turn, 100 at threshold). Field elevation is 1,892 ft MSL. Default active runway in Traffic Sim is **Runway 29L (298° true)** with **left-hand circuits**.
- **Closed-Loop Flight Correction & Station Keeping (D370, D374):** In simulation, aircraft drifting off-track triggers closed-loop pilot control corrections (e.g. stick/throttle nudges) to return to nominal. It is **never** treated as a simulation failure or artificially capped in duration.
- **Key Ratified Aerodynamic Standards (D379–D388):**
  - Overhead break restored to 60° (2.0 G) at 3,500 ft MSL; descending final turn restored to 45° to 2,700 ft MSL straight-in on Runway 29L left-hand (D382).
  - Formation spacing is closed-loop geometry; wingmen turn when spacing works (D380). Hook Turn is a true 180° formation turn (D380, SMM Ch 16).
  - Turn Fight opens to Simple 2D flat 1v1 fight by default; Energy Mode is a toggle switch (R22, D379). At ≤140 KIAS, aircraft must fly Split S or slice turn, never Immelmann (D381).
  - Reset buttons relabeled "Reset to Standard Defaults" loading SMM 3.0 G standards (D384).
  - T-6 stall speed calibrated at 86 kt with ±10 kt pilot domain tolerance (D387).
  - 3-point median filtering of GPS jitter / G dips authorized in Debrief (D383).

## Platform Constraints & Execution Spine
- **Antigravity Limitation & Small-Slice Architecture (D375):** Operating without Opus auditors and relying on fast Flash/inherit models. Parallel subagents perform *only* isolated prep work (pre-rebasing, resolving WIP hooks, single unit tests). Main integration is strictly **serial, one PR at a time**, with prerequisite host wiring landed before dependent branches. Zero multi-branch simultaneous merges.
- **Human Sign-Off Gates & Build Flow (D376, D377):**
  - Verification checklists (`docs/checklists/<module>.md`) are run module-by-module (**Gate 0:** Debrief/SOF, **Gate 1:** Traffic, **Gate 2:** Turn Fight, **Gate 3:** Turn Sim, **Gate 5:** Final Prototype). Execution pauses for Patrick at each gate.
  - Traffic builds end-to-end first before Turn Fight or Turn Sim (D357).

## Streamlined build (Patrick, 30 Sep 16:12Z to 17:22Z)
These replace the older rules below where they differ.
- One module builds at a time. Each round's fixes go in one PR. Patrick signs off a module before the next one starts.
- Testing happens once, at the end of each module: the full local test run, screenshots, accessibility checks and the Verification check. Until then, a PR only needs GitHub's automatic tests to pass before it merges, so the live site doesn't break.
- Verification does one short check per module at the end, covering only safety items and flight numbers against the manuals.
- Only the thread's own reviewer checks each change. The separate skills check stops.
- Anything new goes on the future features list, not into the build.
- A logged judgement call counts as accepted unless Patrick rejects it.
- Numbers sit within pilot domain tolerances instead of matching exactly. Flight math is baselined on aerodynamics and manuals, and each deviation/change is logged as a judgement call.
- Traffic builds its core only: wind, aircraft types, the break and traffic on final. PFLs, engine-outs, the prediction engine, setting up a conflict, fly-through and the closed pattern go on the future features list (`POST_PROTOTYPE_QUEUE.md`).
- No heavy stress runs (mutation runs, fuzzing or exact memory counts). Normal tests only.
- Browser tests: Chrome only on each PR; Chrome, Firefox and Safari once at each module's sign-off.
- The 3D view is a bonus. Keep what's built, but do no more 3D tests or polish in modules that are still being built.

## Where records live (Patrick, 30 Sep 16:59Z, updated for repo layout)
Check README.md and HANDOVER.md at the top of the project files first; each lists the home for each kind of record:
1. Judgement call: one row in `docs/records/decisions-log.md`.
2. New idea: one row in `docs/records/future-ideas.md`. It is not built.
3. Merge: a note on the PR; git history is the log.
4. Question for Patrick: asked in the thread. Question for Dad: added to `docs/records/dads-questions.md`.
5. Test or check report: `docs/records/verification/<module>-<what>.md`.
6. Decisions and requirements: `docs/records/plan-decisions.md` and `docs/records/plan-requirements.md`.
7. Session state and handover: `.agent/memory/handoff.md`, `scratchpad.md`, `graveyard.md`, and `docs/handover/<module>.md`.
8. Remediation patch & fix log: `docs/records/remediation-patch-log.md` (and `docs/REMEDIATION_PATCH_LOG.md`).
9. Anything else: the module's own folder. No new top-level folders, and no second copy of a file that already has a home. Finished or out-of-date files go to archive/.

## Ground rules
- Keep it a plain-JavaScript static web app, with no framework, that anyone can open from a link on a desktop or laptop.
- Keep every screen simple, user friendly, intuitive and not overwhelming, and give every parameter a default entry (Patrick, 2026-09-30, 07:13Z). Show only the essentials by default. Put extra detail (graphs, extra readouts, advanced settings) behind toggles or "more" panels that the user opens when they want them (progressive disclosure, R22).
- V6 in `original/` is an archival feature and screen-layout reference only, and is never edited.
- The flight math and physics baseline is standard aerodynamics and the 15 Wing Moose Jaw flight manuals in `../manuals/`. Tests verify within pilot domain tolerances, not bit-exact V6 float matching.
- Numbers, speeds, patterns and geometry come from the flying manuals index in `../manuals/` (Patrick, 2026-09-30). `README.md` there is the index, and the `*-numbers.md` files have the readings with page references. Check there before asking Patrick. Where Patrick has already overridden a manual in a logged decision, his decision wins. The manuals are not public: page references may go in the repo, but quoted text and images stay in project files. A number that disagrees with a manual goes to the coordinator, and the manuals thread takes it to Patrick.
- Log every decision, requirement, open question and future-feature idea in `docs/records/plan-decisions.md`, `docs/records/plan-requirements.md`, and `docs/records/dads-questions.md`. Cite requirement numbers (R#) in specs and issues.
- Modules build in parallel (Patrick, 2026-09-30 07:07Z and 07:15Z, D134). Start each only once its spec is approved.
  - Code merges as each piece passes. Once the app frame hooks a module in, its home-screen card is marked PROTOTYPE until one combined sign-off at the end.
  - In each building thread, writers run on Sonnet at high effort, one auditor runs on Opus at medium effort and never writes code, and the thread's own Claude is the finalizer.
  - An open question for Patrick or Dad doesn't stop a build: build with the current default (the manual's number) as a setting and change it when the answer lands.
- Judgement calls run on the recommendation (Patrick, 2026-09-30 09:31Z: "go with their recommendation on any more judgement calls and log it as a decision for me to review. I want fully automated work until I check in next"). Until Patrick checks in and says otherwise:
  - Any judgement call a thread would have put to Patrick or Dad (including flight math, weather rules, changing an existing decision, or a new spec or spec change) goes ahead on the thread's own recommendation, without asking and without waiting.
  - Keep each such change reversible: its own commit, and a setting holding the old value where that makes sense.
  - Log each one as a row in `docs/records/decisions-log.md`: Time (Z) | Thread | Decision | Why (the recommendation) | Other options | PR or commit | How to undo. Create the file with that header if it is missing; re-read it before appending and again about 10 s later, and re-apply the row if it was lost. Don't number the rows.
  - The app frame copies each row into `docs/records/plan-decisions.md` with the next D number, status Proposed and "for Patrick's review", and writes the D number back into the row.
  - Merges of this work follow the merge rule below. Tell the coordinator in the one-line note that a decision was logged for review.
  - Still stop and wait only for: something that can't be undone or reaches outside the project (emails, new accounts, deleting data or history), adding a library, and anything that needs Patrick's own hands (credentials, his browser, a checklist run). Leave those as open items and carry on with other work.
- Merges run on their own (Patrick, 2026-09-30 02:10Z). Once the spec or decision behind a PR is approved (or taken on the recommendation under the rule above), its thread does the rest without asking Patrick. The merge, and the live-site deploy that follows it, need no further approval words. The steps are:
  - Bring in current main.
  - Resolve any conflicts with a merge commit.
  - Get CI green.
  - Merge.
- Log every merge with a merge note on the PR: the checks and results on the final head, the main commits brought in, any conflicts and how they were resolved, and the merge commit. Git history serves as the merge log.
- Don't post a thread reply for a routine merge. Update the status checklist instead, and send the coordinator a one-line note so waiting threads can start.
- Go to Patrick only for an issue (while the judgement-call rule is in force, judgement calls are logged for review instead of asked):
  - CI still red after a real fix attempt, or a failure with no fix available.
  - A conflict where both sides changed the same logic (resolve it on the recommendation and log it for review).
  - Anything that would change flight math, a weather rule or an existing decision.
  - A new spec to approve, or a question only Patrick or Dad can answer.
- PT-PT Sim and the Briefing Board are future features, not part of the rebuild.
- Read any new skill before adding it, and never bulk-install.
- Ask before anything else that can't be undone.

## Skills available
The repo's `.claude/skills/` holds vetted copies from addyosmani/agent-skills. They load automatically in any session working in the repo. You can also ask for one by name (for example, "use test-driven-development for this"). When a new skill is vetted and added, list it here.

Every thread assigns and uses the relevant skills (Patrick, 2026-09-30):
- Each spec has a "Skills used" section naming the skill for each step. For an already-approved spec, the list goes in `tasks/<workstream>/plan.md`.
- The thread invokes each skill when it reaches that step.
- Every PR description lists the skills applied.

The skills:
- **spec-driven-development:** write the spec before any code, then the plan, the tasks and the build. Patrick approves each spec and any decision. After that, plans, tasks and code merge on green under the merge rule above. Use it when starting any module (specs go in `specs/SPEC-<module>.md`).
- **planning-and-task-breakdown:** turns an approved spec into small, ordered tasks. Each workstream keeps its own `tasks/<workstream>/plan.md` and `todo.md` so threads don't collide (for example `tasks/app-frame/`, `tasks/flight-math/`, `tasks/wx/`).
- **incremental-implementation:** build in thin slices that each still work and are committed, so the app is never half-broken.
- **test-driven-development:** write the failing test first. For flight math, that means a golden test that runs V6's own function and must match its numbers.
- **code-simplification:** clean up code without changing what it does.
- **code-review-and-quality:** review a PR or diff on five axes (correctness, readability, architecture, security, performance) with severity labels. Use it on every PR before it leaves draft.
- **debugging-and-error-recovery:** find the root cause step by step: reproduce, localize, reduce, fix, then add a regression test. Use it when CI goes red, a golden test stops matching V6, or the browser throws an error.
- **frontend-ui-engineering:** accessible, keyboard-friendly screens with clear empty, error and stale-data states, where colour is never the only signal. Use it for the ui-kit, the shell and every module screen. Take its rules, not its React/Tailwind examples, and target desktop.
- **security-and-hardening:** treat KML/debrief files and live weather or map replies as untrusted. Never put them into innerHTML, check their shape and size where they enter, audit dependencies, and set a Content Security Policy. Use it for flight data and the SOF, together with `/security-review`.
- **performance-optimization:** measure first, change one thing at a time, re-measure, and revert anything that doesn't beat the noise. Keep a log of attempts in the PR. Use it for load time, bundle and media size, the offline cache and smooth playback.
  - Measure a local build with `npm run build` and `npm run preview`.
  - Threads started in the project's full-network environment can also load the live site. Older threads can't, so ask Patrick for live-site numbers there.
  - Ask before adding Lighthouse or bundlesize.
- **Which skill when:** `.claude/skills/README.md` maps each skill to the build phases. The one skill still held is shipping-and-launch, which is vetted and added at switchover from V6.
- **References** in `.claude/references/`: a definition-of-done checklist, testing patterns, and accessibility, security and performance checklists, which the skills above point to.

Built-in Claude Code commands that also help here:
- `/code-review`: check a PR or diff for bugs.
- `/simplify`: tidy changed code.
- `/security-review`: check pending changes.
- `/run`: launch the app to see a change working.
