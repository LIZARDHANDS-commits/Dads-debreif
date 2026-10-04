# Dad's Debrief Tool: the overall plan

This is the one overall plan. Each module has its own plan with the ordered steps and checkboxes: [Debrief](modules/debrief/plan.md), [SOF](modules/sof/plan.md), [Traffic](modules/traffic/plan.md), [Turn Fight](modules/turn-fight/plan.md), [Turn Sim](modules/turn-sim/plan.md) and [Shared](modules/shared/plan.md). Only what is in a plan gets built; a new idea goes on that module's `future.md`, or on [FUTURE.md](FUTURE.md), until Patrick moves it up (`AGENTS.md:33`). The one list of everything waiting on Patrick is at the end of this file (`AGENTS.md:103`).

## What the tool is

Dad's Debrief Tool is a set of flight-training screens for the T-6 at Moose Jaw: a flight Debrief viewer, a SOF weather dashboard, a Traffic pattern sim, Turn Fight and Turn Sim (`pf/reset/1-requirements/requirements.md:19`, `CLAUDE.md:3`).
Anyone can open it from a web link in a current desktop browser, and nothing to install is the goal, not an absolute rule (`pf/reset/1-requirements/requirements.md:17`).

## Why we rebuilt

- The tool began as one HTML file of 119 MB, 96% of it videos, map images and example tracks; the code itself was under 1 MB but patched over many times (`pf/reset/2-inventory/agents/sources/plan-doc-main.md:6`).
- On 29 September Patrick chose option C, rebuild module by module (D30), over patching the old file or splitting it in place (`pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:4`, `pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:36`).
- The reason: a patch could fix 31 of the 49 known issues, but 10 were structural (overlapping screens, hidden modules still running) and 8 needed Dad's decision first (`pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:21`).
- One promise in that old tab no longer holds: it said the old file's numbers would be carried over unchanged and pinned by tests. Patrick's later rule is that flying numbers come from the manuals and standard aerodynamics, and the old file is a source of feature ideas only (`pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:19`, `pf/reset/1-requirements/requirements.md:50`).
- The old file stays untouched in `original/` until every module has moved (see "Finishing the reset", last step) (`pf/reset/0-lessons/lessons.md:145`).

## How work runs

Patrick's answers of 4 October, 03:12Z (`pf/reset/4-decisions/answers.md:12`):

- **TQ-1, judgement calls wait for Patrick's yes.** A judgement call that changes what the tool does (for example a flight-math or weather-limit result, a new outside data source or a default standard) waits for his yes. Small fixes that are easy to undo can go ahead (`AGENTS.md:34`).
- **TQ-2, one module at a time.** Anyone can run a module's sign-off checklist (the checklist is in that module's `testing.md`) and send Patrick the result. The next module starts only after Patrick's yes (`pf/reset/4-decisions/answers.md:13`, `AGENTS.md:36`).
- **TQ-3, each brief names its model.** Every brief for an agent says which AI model and effort it uses; the default is Opus for planning, judging and writing flight code, and Sonnet for reading and research (`pf/reset/4-decisions/answers.md:14`, `AGENTS.md:37`).
- The testing rules in force: no tight time gates, the old D371 tolerance table is a default margin and not a pass mark, and a test never bends the flight physics; if a flight fix fails twice, work stops and Patrick is asked (`pf/reset/5-testing/testing-policy.md:22`, `pf/reset/5-testing/testing-policy.md:27`).
- Every push to main publishes the live site; a failing check shows as a warning and does not stop publishing (`pf/reset/5-testing/testing-policy.md:40`).
- Orders and SMM limits are references the tool follows by default and cites by page; only what the aircraft physically can't do is a hard limit (`pf/reset/1-requirements/requirements.md:50`, `pf/reset/1-requirements/requirements.md:48`).

## Status of every module

| Module | Where it stands | Folder |
|---|---|---|
| Debrief | Built and live; the next step is Patrick (or anyone) running its checklist. The roadmap and the handover disagree on whether it was already signed off (see the order section) (`HANDOVER.md:87`). | [modules/debrief/](modules/debrief/) |
| SOF | Built and live, but Patrick's 4 October answers rebuild it to one desk screen, so the checklist runs after the rebuild; the amber "Incomplete" state is a build task (`docs/modules/sof/plan.md:7`, `docs/REMEDIATION_ROADMAP.md:81`). | [modules/sof/](modules/sof/) |
| Traffic | Built; the sign-off box is still open. The PFL review (promised in TR-R14) comes first, with six new PFL commits waiting on it (`HANDOVER.md:89`, `pf/reset/6-plan-and-rules/new-since-pin.md:5`). | [modules/traffic/](modules/traffic/) |
| Turn Fight | Built much further than the old file; the roadmap calls it ready for Patrick, and the reset found gaps between what Patrick decided and what is built (top-speed and hard-deck flags, pull G on screen, extra-stats panel) (`HANDOVER.md:90`, `pf/reset/4-decisions/partb-turnfight.md:15`). | [modules/turn-fight/](modules/turn-fight/) |
| Turn Sim | Live as a PROTOTYPE, but Patrick's directive is a full overhaul first; the Turn Sim review is the first step of its plan, and four paused branches hold work to reuse (`HANDOVER.md:91`). | [modules/turn-sim/](modules/turn-sim/) |
| Shared (flight core, app frame, weather, airfields, storage, ui-kit) | Built and merged on main; waiting on the flight-math list, the one-import-point review and the combined sign-off at the end (`HANDOVER.md:92`, `HANDOVER.md:94`). | [modules/shared/](modules/shared/) |
| PT-PT Sim | Not started; needs a full spec and question session first (`pf/reset/consolidation-plan.md:275`). | [modules/pt-pt-sim/](modules/pt-pt-sim/) |
| Briefing Board | Not started; needs a full spec and question session first (`pf/reset/consolidation-plan.md:275`). | [modules/briefing-board/](modules/briefing-board/) |

## Module order and gates

### Order of work (Patrick, 4 Oct 2026 05:19Z: "I want to sort out traffic")

Patrick's rule is one module at a time, and the next starts only after his yes (`pf/reset/4-decisions/answers.md:13`). The roadmap's gates ran Debrief and SOF, then Traffic, then Turn Fight, then Turn Sim (`docs/REMEDIATION_ROADMAP.md:66`). Patrick moved Traffic to the front on 4 Oct 05:19Z. It starts, with the PFL review, once the reset is finished and the workspace is clean: the clean-up pull requests and the GitHub tidy done (Patrick, 05:19Z: "lets fully finish off our plan and then start with traffic once the workspace is clean").

1. **Traffic, first, once the workspace is clean.** The PFL review is the first thing reviewed when Traffic work resumes, then the real faults, the gaps against the ratified requirements, the camera, graphics and scenery check and the sign-off (`pf/reset/consolidation-plan.md:189`). Plan: [Traffic](modules/traffic/plan.md).
2. **Turn Sim review, analysis only,** after Traffic is signed off. Nothing is built, merged or archived for the Turn Sim until Patrick decides what the review recommends (`pf/reset/consolidation-plan.md:285`, `pf/reset/briefs/stage-3-briefs.md:80`). Steps are in [the Turn Sim plan](modules/turn-sim/plan.md).
3. **Debrief, then SOF.** Anyone runs the Debrief checklist and sends Patrick the result; SOF follows after its rebuild to one desk screen (`docs/REMEDIATION_ROADMAP.md:305`, `HANDOVER.md:100`). Plans: [Debrief](modules/debrief/plan.md), [SOF](modules/sof/plan.md).
4. **Before Turn Fight: the flight-math list and the one-import-point review** in the Shared plan, so Turn Fight and Turn Sim reuse flight math instead of writing it again (`pf/reset/inputs/2026-10-03-why-agents-reinvent-the-wheel.md:1`, `pf/reset/0-lessons/lessons.md:137`). Plan: [Shared](modules/shared/plan.md).
5. **Gate 2: Turn Fight,** with the four build gaps from the reset (`pf/reset/consolidation-plan.md:269`). Plan: [Turn Fight](modules/turn-fight/plan.md).
6. **Gate 3: Turn Sim,** built from what the review chose (`pf/reset/consolidation-plan.md:290`). Plan: [Turn Sim](modules/turn-sim/plan.md).
7. **Gate 5: the combined sign-off:** the full test run in Chrome, Firefox and Safari, the PROTOTYPE flags taken off the module cards (`prototype: true` in the module registry) and Patrick signs off the whole app (`HANDOVER.md:103`). It is the last step of the [Shared plan](modules/shared/plan.md).
8. **Retire the old file,** only when every module has moved (last step under "Finishing the reset").

There is no Gate 4. The roadmap's Milestone 4 was a documentation pass, and its two open tasks are covered below (`docs/REMEDIATION_ROADMAP.md:378`).

### Where the sources disagree on order

| Source | Order it gives | What I did |
|---|---|---|
| Roadmap, Gates 0 to 5 | Debrief and SOF, Traffic, Turn Fight, Turn Sim, combined (`docs/REMEDIATION_ROADMAP.md:66`) | Used as the base of the proposal |
| `SPEC.md` build order | After the data pieces and the Debrief, the Turn Sim, Turn Fight, Traffic and SOF all at once, tested together (`SPEC.md:161`) | Not used: Patrick's TQ-2 answer is one module at a time (`pf/reset/4-decisions/answers.md:13`) |
| Old plan's roadmap tab | Up to three pieces built at once; Turn Sim and Turn Fight listed ahead of Traffic and SOF (`pf/reset/2-inventory/agents/sources/plan-doc-roadmap.md:3`) | Not used, same reason |
| Old build-order note (30 Sep) | Option A one after another (Turn Sim first, SOF last), option B two lanes (recommended then), option C everything (`pf/archive/2026-09/plans/build-order.md:36`) | Not used: written before TQ-2, and its Turn Sim-first order predates the Turn Sim overhaul directive |
| Old "Rebuild or fix" tab | Rebuild in the build order with the SOF last (`pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:34`) | ASK: the roadmap puts SOF in Gate 0, before Traffic, so the SOF-last line is out of date (`docs/REMEDIATION_ROADMAP.md:66`). Patrick to confirm SOF stays in the first gate |
| `HANDOVER.md` suggested order | Debrief and SOF; Traffic core and Turn Fight together; Turn Sim; combined (`HANDOVER.md:98`) | Traffic and Turn Fight split into two gates, because TQ-2 says one at a time |
| `.agent/memory/handoff.md` | Calls Milestone 4 "Debrief 3D View & Tacview Integration" (queued) while the roadmap calls it a documentation pass (`.agent/memory/handoff.md:34`) | Tacview export went to the Debrief future list; the documentation pass is done except two tasks (below) (`docs/modules/debrief/future.md:21`) |
| Debrief signed off or not | The roadmap says Debrief was signed off in #241; the handover says the checklist run is still to come (`docs/REMEDIATION_ROADMAP.md:301`, `HANDOVER.md:87`) | ASK: no run is recorded (no box is ticked in any of the six checklists), so the Debrief plan keeps the checklist run as the last step (`pf/reset/2-inventory/agents/agent-2-records.md:60`, `docs/modules/debrief/plan.md:58`) |

### What the roadmap's other open boxes became

- Milestone 4, Task 4.3 (tick tasks in the SOF to-do file): dropped; the old task files are archived and the SOF plan is the list that counts (`docs/REMEDIATION_ROADMAP.md:381`).
- Milestone 4, Task 4.4 (move non-core Traffic tasks to the post-prototype queue): done by the reset; those tasks are in the Traffic plan or the Traffic future list (`docs/REMEDIATION_ROADMAP.md:382`, `docs/modules/traffic/plan.md:13`).
- Milestone 5, Task 5.1 (remake the picture-comparison snapshots): dropped; Patrick retired the screenshot tests (`docs/REMEDIATION_ROADMAP.md:387`, `pf/reset/5-testing/testing-policy.md:103`).
- Milestone 5, Task 5.2 (drop the PROTOTYPE badges): kept, as the combined sign-off in step 7 above (`docs/REMEDIATION_ROADMAP.md:388`).
- Milestone 5, Task 5.3 (a one-click `.bat` launcher): not carried over as a requirement; nothing to install is a goal, and Patrick kept the `.bat` only for his own checks (`docs/REMEDIATION_ROADMAP.md:389`, `pf/reset/6-plan-and-rules/ask-rows.md:19`).

## Finishing the reset

The reset is finished when every file in the register is either in the new layout or in `archive/`, and the checks in each step below are ticked (`pf/reset/consolidation-plan.md:310`). Each step waits for Patrick's yes before the next starts.

### Step 1. Clean-up pull requests (thread 7), in this order

Each waits for the one before to merge; Patrick reviews each from a plain summary and merges, or says merge (`pf/reset/briefs/stage-3-briefs.md:72`).

- [ ] Pause or not: Patrick decides whether pushes to main stop while these pull requests land, so his Antigravity work and the pull requests do not collide (`pf/reset/consolidation-plan.md:45`). This is on the waiting list below.
- [ ] PR 1, the rule book: `AGENTS.md`, `CLAUDE.md`, `.claude/agents/` and `docs/README.md`. Until it merges, use plain general-purpose agents, not the old `writer` and `auditor` (`pf/reset/briefs/stage-3-briefs.md:73`). Skills go to `.agent/skills` with `.claude/skills` as a link (`pf/reset/consolidation-plan.md:189`).
- [ ] PR 2, the docs: this plan, `FUTURE.md`, `REQUIREMENTS.md`, `TESTING.md`, `DECISIONS.md`, `questions-for-dad.md`, `references/` and the module folders (`pf/reset/briefs/stage-3-briefs.md:74`).
- [ ] PR 3, the archive: every file marked for archive moves into `archive/` with a README map (old path to where its content lives now); nothing is deleted without Patrick's word. No Turn Sim code is archived before the Turn Sim review decides (`pf/reset/briefs/stage-3-briefs.md:75`, `pf/reset/briefs/stage-3-briefs.md:80`).
- [ ] PR 4, tests and CI: retire and rewrite tests as the test register says, turn CI back on with the "every change" set, and set publishing as the policy says. The live site stays offline until Patrick picks public or Pro (`pf/reset/briefs/stage-3-briefs.md:76`).
- [ ] PR 5, links: fix every broken link and stale pointer, such as test headers pointing at `tests/golden/` and specs citing replaced decisions (`pf/reset/briefs/stage-3-briefs.md:77`).
- [x] Decide which Traffic faults block CI from turning back on: Play not restarting after Pause or Reset, three layout problems at 1280 and 1366 pixels, and two 3D files returning 404 (`pf/reset/consolidation-plan.md:266`). Patrick, 4 Oct 06:54Z: "Just delete those shitty tests". The failing Traffic checks are out of CI: PFL Test 4 went to `archive/tests/unit/traffic/pfl-test-4.js`, and Traffic left the layout and every-button browser walks. The faults are on `modules/traffic/future.md`.
- [ ] No change to flight math or any number a simulator flies in any of these pull requests (`pf/reset/briefs/stage-3-briefs.md:81`).

### Step 2. GitHub tidy (thread 8)

Starts once Patrick approves this plan. Nothing is closed, merged or deleted before his yes (`pf/reset/briefs/stage-3-briefs.md:95`).

- [ ] PR #162 (Dependabot, Playwright 1.56 to 1.63): merge only with a green run (`HANDOVER.md:105`). It is also a pointer in the [Shared plan](modules/shared/plan.md).
- [ ] The 75 remote branches (31 have commits not on main): none is deleted unless the register shows the work is on main or in a bundle (`pf/reset/briefs/stage-3-briefs.md:101`).
- [ ] The four old Turn Sim branches stay until the Turn Sim plan carries the flag; it does, in [Turn Sim Step 1](modules/turn-sim/plan.md) (`pf/reset/briefs/stage-3-briefs.md:101`).
- [ ] The 47 issues: each gets a row and a closing comment saying where it landed (`pf/reset/briefs/stage-3-briefs.md:102`).
- [ ] Old memory called PRs #240 and #242 open; they are already merged (`pf/reset/0-lessons/lessons.md:144`).

### Step 3. The live-site choice

- [ ] **Patrick's choice: pending.** Public site, or private with GitHub Pro. Patrick answered "Decide later" on 4 October at 03:49Z; until he picks, the requirement stays "anyone" and the site stays offline (`pf/reset/6-plan-and-rules/ask-rows.md:17`, `pf/reset/1-requirements/questions.md:28`, `pf/reset/briefs/stage-3-briefs.md:76`).

### Step 4. Turn the paused routines back on

- [ ] Rewrite the prompts of the two paused routines, "End-of-day recap" and "Weekly repo check" (paused 3 October), against the new rule book (`pf/reset/0-lessons/agents/records-git-and-archive.md:169`).
- [ ] Then turn them back on, after Patrick's yes (`pf/reset/0-lessons/lessons.md:136`, `pf/reset/6-plan-and-rules/ask-rows.md:14`).
- [ ] Replace the team memory and project-files index with the new drafts (`pf/reset/6-plan-and-rules/ask-rows.md:14`). Drafts: `pf/reset/6-plan-and-rules/outside/team-memory.md`, `pf/reset/6-plan-and-rules/outside/project-files-index.md`.

### Step 5. Point Antigravity at the new rule book (with Patrick, after the rule book PR merges)

- [ ] Patrick and an agent point Antigravity at the new `AGENTS.md`. Its global rules and its saved plans and knowledge on his PC were only checked by name, so this step looks at them with him (`pf/reset/briefs/stage-3-briefs.md:49`).
- [ ] Check that no old rule file under `.agent/rules/` still instructs Antigravity (`pf/reset/consolidation-plan.md:349`).

### Step 6. Send Dad's questions

- [ ] Patrick sends [questions-for-dad.md](questions-for-dad.md) when he chooses: the 13 current flying questions go as one message, each with a working answer that stays until Dad replies (`docs/questions-for-dad.md:9`, `pf/reset/consolidation-plan.md:39`).
- [ ] The Traffic landmark questions (grain elevators, Sukanen Ship, "Flat Farm" or "Fiat Farm", any landmark missing) can go in the same message (`docs/modules/traffic/plan.md:68`).
- [ ] When Dad answers, the answer goes into the module's `requirements.md` or `decisions.md` in the same change, and the question is marked answered (`docs/questions-for-dad.md:5`).

### Step 7. Ask again about the 1,050 old screenshots

- [ ] Patrick answered "keep for now" on 4 October; they stay until the reset ends and he is asked again then (1,050 files, 217 MB, in `archive/2026-09/`) (`pf/reset/2-inventory/file-register.md:52`).

### Step 8. Move `reset/` to the project-files archive

- [ ] When the steps above are done, `reset/` moves to `archive/2026-10-reset/` in the project files (`pf/reset/consolidation-plan.md:310`, `pf/reset/stage-3-walkthrough.md:54`).
- [ ] The old plan Claude Doc (the roadmap and "why we rebuilt" tabs are folded in above and in the module plans) is archived (`pf/reset/consolidation-plan.md:263`).

### Step 9. Retire the original V6 file, last

- [ ] Retire `original/` and the V6 file only when every module has moved; matching V6 is no longer the test (`pf/reset/0-lessons/lessons.md:145`, `pf/reset/6-plan-and-rules/ask-rows.md:20`). Until then `original/` is never edited (`CLAUDE.md:9`).

## The Turn Sim review (step 2 of the order)

After Traffic is signed off, the Turn Sim review runs before any Turn Sim building: plan mode and live mode, then decide to rebuild, build a new live core, or fix what is there (`pf/reset/consolidation-plan.md:285`).

- [ ] Run the Turn Sim review: [modules/turn-sim/plan.md](modules/turn-sim/plan.md), Step 1. It lists every document that helps, flags the four old branches and the backup bundle as work to reuse, and carries the items deferred to it (`docs/modules/turn-sim/plan.md:13`).
- [ ] Patrick decides what the review recommends; Steps 2 onward of the Turn Sim plan are then rewritten (`docs/modules/turn-sim/plan.md:15`).
- [ ] Only then does the module order above reach Gate 3.

## Waiting on Patrick

The one list. Each line is a question; the working answer applies until he says otherwise (`AGENTS.md:103`).

- [ ] **Live site: public, or private with GitHub Pro.** Patrick's choice: pending (`pf/reset/6-plan-and-rules/ask-rows.md:17`).
- [ ] **Pause pushes to main during the clean-up pull requests?** Not needed until this plan is approved (`pf/reset/consolidation-plan.md:45`).
- [ ] **PFL review items:** the new PFL work since the reset (D438 to D440), the pre-built PFL track (D436) and the PFL missing from the live manoeuvres, all held for the PFL review (`docs/modules/traffic/plan.md:13`).
- [ ] **Turn Sim review questions A to E,** on live controllers or planned paths, speed basis, the 300 ft stack, the clock cue and the error settings (`docs/modules/turn-sim/plan.md:25`).
- [ ] **DB-Q4:** no smoothing of the estimated G (D219) or a 3-point median filter (D383); neither is built (`pf/reset/1-requirements/questions.md:17`, `docs/modules/debrief/plan.md:37`).
- [ ] **Traffic replay test at sign-off only:** `tests/unit/traffic/rewind.test.js` never finishes, so it runs in the sign-off run, not on every change, until the Traffic work makes it finish reliably (flaky-test rule Q-T4; `docs/modules/traffic/testing.md`, "The rewind hang"; list in `tools/unit-tests.mjs`).
- [ ] **Turn Fight turn to the MPT, for Patrick and Dad:** from many starts the model takes 192 to 252 degrees of turn to reach the maximum performance turn, against the SMM's aim of under 180 (SMM 14.17 para 42), and flies the level MPT at 68.5 degrees of bank against the SMM's about 75. No physics was changed; the tests check "before a full circle" and print the gap (`tests/unit/turn-fight/energy-sim.test.js`, `tests/unit/turn-fight/energy-layout.test.js`).
- [ ] **PROTOTYPE flags** come off only at the combined sign-off (`HANDOVER.md:103`).
- [ ] **The two PC-only reports** (Turn Sim and Turn Fight architecture reports): where in the repo their content lands (`pf/reset/2-inventory/file-register.md:194`).
- [ ] **Dad's questions and the screenshots question:** when to send, and the second ask (steps 6 and 7).
