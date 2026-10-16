# Dad's Debrief Tool: the overall plan

This is the one overall plan. Each module has its own plan with the ordered steps and checkboxes: [Debrief](modules/debrief/plan.md), [SOF](modules/sof/plan.md), [Traffic](modules/traffic/plan.md),[...]

## What the tool is

Dad's Debrief Tool is a set of flight-training screens for the T-6 at Moose Jaw: a flight Debrief viewer, a SOF weather dashboard, a Traffic pattern sim, Turn Fight and Turn Sim (`pf/reset/1-requir[...]
Anyone can open it from a web link in a current desktop browser, and nothing to install is the goal, not an absolute rule (`pf/reset/1-requirements/requirements.md:17`).

## Why we rebuilt

- The tool began as one HTML file of 119 MB, 96% of it videos, map images and example tracks; the code itself was under 1 MB but patched over many times (`pf/reset/2-inventory/agents/sources/plan-[...]
- On 29 September Patrick chose option C, rebuild module by module (D30), over patching the old file or splitting it in place (`pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:4`, `[...]
- The reason: a patch could fix 31 of the 49 known issues, but 10 were structural (overlapping screens, hidden modules still running) and 8 needed Dad's decision first (`pf/reset/2-inventory/agent[...]
- One promise in that old tab no longer holds: it said the old file's numbers would be carried over unchanged and pinned by tests. Patrick's later rule is that flying numbers come from the manuals[...]
- The old file stays untouched in `original/` until every module has moved (see "Finishing the reset", last step) (`pf/reset/0-lessons/lessons.md:145`).

## How work runs

Patrick's answers of 4 October, 03:12Z (`pf/reset/4-decisions/answers.md:12`):

- **TQ-1, judgement calls wait for Patrick's yes.** A judgement call that changes what the tool does (for example a flight-math or weather-limit result, a new outside data source or a default stan[...]
- **TQ-2, one module at a time.** Anyone can run a module's sign-off checklist (the checklist is in that module's `testing.md`) and send Patrick the result. The next module starts only after Patri[...]
- **TQ-3, each brief names its model.** Every brief for an agent says which AI model and effort it uses; which model does which job is now the agents and models rule in `AGENTS.md` (Patrick, 4 Oct[...]
- The testing rules in force: no tight time gates, the old D371 tolerance table is a default margin and not a pass mark, and a test never bends the flight physics; if a flight fix fails twice, wor[...]
- A failing check shows as a warning and does not stop publishing (`pf/reset/5-testing/testing-policy.md:40`). Since #451 (5 Oct), a hand Run workflow on Deploy to GitHub Pages always publishes, a[...]
- Dad joins as a collaborator and works on SOF and Debrief. His sessions follow `AGENTS.md`, open pull requests for Patrick to review and never merge; Patrick reviews every pull request, and only [...]

## Status of every module

| Module | Where it stands | Folder |
|---|---|---|
| Debrief | Built and live; the next step is Patrick (or anyone) running its checklist. The roadmap and the handover disagree on whether it was already signed off (see the order section) (`archive[...]
| SOF | Built and live, but Patrick's 4 October answers rebuild it to one desk screen, so the checklist runs after the rebuild; the amber "Incomplete" state is a build task (`docs/modules/sof/plan[...]
| EP Tabletop | **Spec approved (relayed by Dad, 12 Oct 2026); Step 1, the one-screen tabletop, built in V2.369, not yet seen in the app** (Dad's ask, 12 Oct 2026). Emergency procedures tabletop o[...]
| Traffic | Built; the sign-off box is still open. The flying layer is refactored (refactor PR 1 to 4, 4 Oct): every aircraft is flown once by a simulated pilot and followed by one path follower, [...]
| Turn Fight | Called "Pat's Fight and Turn Sim" on screen (TF-60); the folder stays `turn-fight`. Started early, alongside Traffic: the pilot-layer refactor (TF-57) PR 1 to 3 are merged, with one[...]
| Turn Sim | Called "Pat's Formation Simulator" on screen (V2.14, #321); the folder stays `turn-sim`. Live as a PROTOTYPE on a new flying core with planned paths (TS-35, TS-36), started early alon[...]
| Shared (flight core, app frame, weather, airfields, storage, ui-kit) | Built and merged on main. The flight-math list is written ([flight-math.md](modules/shared/flight-math.md), Traffic refacto[...]
| PT-PT Sim | Not started; needs a full spec and question session first (`pf/reset/consolidation-plan.md:275`). | [modules/pt-pt-sim/](modules/pt-pt-sim/) |
| Briefing Board | Not started; needs a full spec and question session first (`pf/reset/consolidation-plan.md:275`). | [modules/briefing-board/](modules/briefing-board/) |

## Module order and gates

### Order of work (Patrick, 4 Oct 2026 05:19Z: "I want to sort out traffic")

Patrick's rule is one module at a time, and the next starts only after his yes (`pf/reset/4-decisions/answers.md:13`). The roadmap's gates ran Debrief and SOF, then Traffic, then Turn Fight, then [...]

On 4 October Patrick also started the Turn Sim (now Pat's Formation Simulator) and the Turn Fight pilot refactor early, alongside Traffic. Each still signs off on its own, in this order.

1. **Traffic, first.** The PFL review's inputs are settled (Step 1); the flying layer is refactored, with the PFL rebuilt on it as refactor PR 3 (Patrick, 4 Oct 07:25Z and 07:53Z; PR 1 to 4 and th[...]
2. **Turn Sim review, analysis only.** Done early, on 4 Oct: Patrick chose a new flying core (TS-35) and building has started (item 6 below). Nothing was built, merged or archived for the Turn Sim[...]
3. **Debrief, then SOF.** Anyone runs the Debrief checklist and sends Patrick the result; SOF follows after its rebuild to one desk screen (`archive/docs/REMEDIATION_ROADMAP.md:301`, `archive/HAND[...]
4. **Before Turn Fight: the one-import-point review** in the Shared plan (the flight-math list moved up to Traffic refactor PR 1, Patrick 4 Oct 07:25Z, and is written), so Turn Fight and Turn Sim [...]
5. **Gate 2: Turn Fight,** with the four build gaps from the reset (`pf/reset/consolidation-plan.md:269`). Plan: [Turn Fight](modules/turn-fight/plan.md).
6. **Gate 3: Turn Sim,** built from what the review chose (`pf/reset/consolidation-plan.md:290`). Plan: [Turn Sim](modules/turn-sim/plan.md).
7. **Gate 5: the combined sign-off:** the full test run in Chrome, Firefox and Safari, the PROTOTYPE flags taken off the module cards (`prototype: true` in the module registry) and Patrick signs o[...]
8. **Retire the old file,** only when every module has moved (last step under "Finishing the reset").

There is no Gate 4. The roadmap's Milestone 4 was a documentation pass, and its two open tasks are covered below (`archive/docs/REMEDIATION_ROADMAP.md:378`).

### Where the sources disagree on order

| Source | Order it gives | What I did |
|---|---|---|
| Roadmap, Gates 0 to 5 | Debrief and SOF, Traffic, Turn Fight, Turn Sim, combined (`archive/docs/REMEDIATION_ROADMAP.md:66`) | Used as the base of the proposal |
| `archive/SPEC.md` build order | After the data pieces and the Debrief, the Turn Sim, Turn Fight, Traffic and SOF all at once, tested together (`archive/SPEC.md:161`) | Not used: Patrick's TQ-2 a[...]
| Old plan's roadmap tab | Up to three pieces built at once; Turn Sim and Turn Fight listed ahead of Traffic and SOF (`pf/reset/2-inventory/agents/sources/plan-doc-roadmap.md:3`) | Not used, same [...]
| Old build-order note (30 Sep) | Option A one after another (Turn Sim first, SOF last), option B two lanes (recommended then), option C everything (`pf/archive/2026-09/plans/build-order.md:36`) |[...]
| Old "Rebuild or fix" tab | Rebuild in the build order with the SOF last (`pf/reset/2-inventory/agents/sources/plan-doc-rebuild-or-fix.md:34`) | ASK: the roadmap puts SOF in Gate 0, before Traffi[...]
| `archive/HANDOVER.md` suggested order | Debrief and SOF; Traffic core and Turn Fight together; Turn Sim; combined (`archive/HANDOVER.md:98`) | Traffic and Turn Fight split into two gates, becaus[...]
| `archive/agent-memory/handoff.md` | Calls Milestone 4 "Debrief 3D View & Tacview Integration" (queued) while the roadmap calls it a documentation pass (`archive/agent-memory/handoff.md:34`) | Ta[...]
| Debrief signed off or not | The roadmap says Debrief was signed off in #241; the handover says the checklist run is still to come (`archive/docs/REMEDIATION_ROADMAP.md:301`, `archive/HANDOVER.md[...]

### What the roadmap's other open boxes became

- Milestone 4, Task 4.3 (tick tasks in the SOF to-do file): dropped; the old task files are archived and the SOF plan is the list that counts (`archive/docs/REMEDIATION_ROADMAP.md:381`).
- Milestone 4, Task 4.4 (move non-core Traffic tasks to the post-prototype queue): done by the reset; those tasks are in the Traffic plan or the Traffic future list (`archive/docs/REMEDIATION_ROAD[...]
- Milestone 5, Task 5.1 (remake the picture-comparison snapshots): dropped; Patrick retired the screenshot tests (`archive/docs/REMEDIATION_ROADMAP.md:387`, `pf/reset/5-testing/testing-policy.md:1[...]
- Milestone 5, Task 5.2 (drop the PROTOTYPE badges): kept, as the combined sign-off in step 7 above (`archive/docs/REMEDIATION_ROADMAP.md:388`).
- Milestone 5, Task 5.3 (a one-click `.bat` launcher): not carried over as a requirement; nothing to install is a goal, and Patrick kept the `.bat` only for his own checks (`pf/reset/REMEDIATI[...]

## Finishing the reset

The reset is finished when every file in the register is either in the new layout or in `archive/`, and the checks in each step below are ticked (`pf/reset/consolidation-plan.md:310`). Each step w[...]

### Step 1. Clean-up pull requests (thread 7), in this order

Each waits for the one before to merge; Patrick reviews each from a plain summary and merges, or says merge (`pf/reset/briefs/stage-3-briefs.md:72`).

- [x] Pause or not: Patrick decides whether pushes to main stop while these pull requests land, so his Antigravity work and the pull requests do not collide (`pf/reset/consolidation-plan.md:45`). [...]
- [x] PR 1, the rule book: `AGENTS.md`, `CLAUDE.md`, `.claude/agents/` and `docs/README.md`. Until it merges, use plain general-purpose agents, not the old `writer` and `auditor` (`pf/reset/briefs[...]
- [x] PR 2, the docs: this plan, `FUTURE.md`, `REQUIREMENTS.md`, `TESTING.md`, `DECISIONS.md`, `questions-for-dad.md`, `references/` and the module folders (`pf/reset/briefs/stage-3-briefs.md:74`)[...]
- [x] PR 3, the archive: every file marked for archive moves into `archive/` with a README map (old path to where its content lives now); nothing is deleted without Patrick's word. No Turn Sim cod[...]
- [x] PR 4, tests and CI: retire and rewrite tests as the test register says, turn CI back on with the "every change" set, and set publishing as the policy says. The live site stays offline until [...]
- [x] PR 5, links: fix every broken link and stale pointer, such as test headers pointing at `archive/tests/golden/` and specs citing replaced decisions (`pf/reset/briefs/stage-3-briefs.md:77`). M[...]
- [x] Decide which Traffic faults block CI from turning back on: Play not restarting after Pause or Reset, three layout problems at 1280 and 1366 pixels, and two 3D files returning 404 (`pf/reset/[...]
- [x] Trim the tests to the flying and safety checks (Patrick, card 5 Oct 05:15Z, "Yes, as listed"). Unit tests went from 3,125 to 1,608 and browser tests from 383 to 123, with no app code changed[...]
- [x] No change to flight math or any number a simulator flies in any of these pull requests (`pf/reset/briefs/stage-3-briefs.md:81`). Held across #243 to #247.

### Step 2. GitHub tidy (thread 8)

Starts once Patrick approves this plan. Nothing is closed, merged or deleted before his yes (`pf/reset/briefs/stage-3-briefs.md:95`).

- [x] PR #162 (Dependabot, Playwright 1.56 to 1.63): merge only with a green run (`archive/HANDOVER.md:105`). It is also a pointer in the [Shared plan](modules/shared/plan.md). Closed on Patrick'[...]
- [x] The 75 remote branches (31 have commits not on main): none is deleted unless the register shows the work is on main or in a bundle (`pf/reset/briefs/stage-3-briefs.md:101`). 73 branches del[...]
- [ ] The four old Turn Sim branches stay until the Turn Sim plan carries the flag; it does, in [Turn Sim Step 1](modules/turn-sim/plan.md) (`pf/reset/briefs/stage-3-briefs.md:101`).
- [x] The 47 issues: each gets a row and a closing comment saying where it landed (`pf/reset/briefs/stage-3-briefs.md:102`). All 47 closed on 4 Oct.
- [ ] Old memory called PRs #240 and #242 open; they are already merged (`pf/reset/0-lessons/lessons.md:144`).

### Step 3. The live-site choice

- [ ] **Patrick's choice: pending.** Public site, or private with GitHub Pro. Patrick answered "Decide later" on 4 October at 03:49Z; until he picks, the requirement stays "anyone" and the site s[...]

### Step 4. Turn the paused routines back on

- [ ] Rewrite the prompts of the two paused routines, "End-of-day recap" and "Weekly repo check" (paused 3 October), against the new rule book (`pf/reset/0-lessons/agents/records-git-and-archive.[...]
- [ ] Then turn them back on, after Patrick's yes (`pf/reset/0-lessons/lessons.md:136`, `pf/reset/6-plan-and-rules/ask-rows.md:14`).
- [ ] Replace the team memory and project-files index with the new drafts (`pf/reset/6-plan-and-rules/ask-rows.md:14`). Drafts: `pf/reset/6-plan-and-rules/outside/team-memory.md`, `pf/reset/6-pla[...]

### Step 5. Point Antigravity at the new rule book (with Patrick, after the rule book PR merges)

- [ ] Patrick and an agent point Antigravity at the new `AGENTS.md`. Its global rules and its saved plans and knowledge on his PC were only checked by name, so this step looks at them with him (`[...]
- [ ] Check that no old rule file under `archive/agent-rules/` still instructs Antigravity (`pf/reset/consolidation-plan.md:349`).

### Step 6. Send Dad's questions

- [ ] Patrick sends [questions-for-dad.md](questions-for-dad.md) when he chooses: the 13 current flying questions go as one message, each with a working answer that stays until Dad replies (`docs[...]
- [ ] The Traffic landmark questions (grain elevators, Sukanen Ship, "Flat Farm" or "Fiat Farm", any landmark missing) can go in the same message (`docs/modules/traffic/plan.md:82`).
- [ ] When Dad answers, the answer goes into the module's `requirements.md` or `decisions.md` in the same change, and the question is marked answered (`docs/questions-for-dad.md:5`).

### Step 7. Ask again about the 1,050 old screenshots

- [ ] Patrick answered "keep for now" on 4 October; they stay until the reset ends and he is asked again then (1,050 files, 217 MB, in `pf/archive/2026-09/`) (`pf/reset/2-inventory/file-register.[...]

### Step 8. Move `reset/` to the project-files archive

- [ ] When the steps above are done, `reset/` moves to `archive/2026-10-reset/` in the project files (`pf/reset/consolidation-plan.md:310`, `pf/reset/stage-3-walkthrough.md:54`).
- [ ] The old plan Claude Doc (the roadmap and "why we rebuilt" tabs are folded in above and in the module plans) is archived (`pf/reset/consolidation-plan.md:263`).

### Step 9. Retire the original V6 file, last

- [ ] Retire `original/` and the V6 file only when every module has moved; matching V6 is no longer the test (`pf/reset/0-lessons/lessons.md:145`, `pf/reset/6-plan-and-rules/ask-rows.md:20`). Unt[...]

## The Turn Sim review (step 2 of the order)

After Traffic is signed off, the Turn Sim review runs before any Turn Sim building: plan mode and live mode, then decide to rebuild, build a new live core, or fix what is there (`pf/reset/consoli[...]

- [x] Run the Turn Sim review (done 4 Oct, started early alongside Traffic at Patrick's ask): [modules/turn-sim/plan.md](modules/turn-sim/plan.md), Step 1. It lists every document that helps, fla[...]
- [x] Patrick decided (new flying core, TS-35) and approved the first version's spec, 10:03Z; Steps 2 onward of the Turn Sim plan are rewritten (`docs/modules/turn-sim/plan.md:15`).
- [ ] Only then does the module order above reach Gate 3.

## Waiting on Patrick

- [ ] **CT-156 model, the fix list (Shared 3D, plan Step 3b item 4; 12 Oct 2026):** every area's rows are verified and ruled (13 Oct 2026). **Look in the app (V2.427, branch `shared-3d-delivery-i[...]
- [ ] **Formation, 12 Oct evening (V2.411 to V2.417):** push tags v2.411 to v2.417 and deploy; fly the fighting wing turns, the telegraphed close turns, echelon Wings level and Reversal, and flui[...]

- [ ] **EP Tabletop: EP-Q1, how the instructor's phone links to the student's screen (Dad's ask, 12 Oct 2026; `modules/ep-tabletop/`).** Spec, EP-1 to EP-3 and ALL-36 approved (relayed by Dad, 12[...]

- [ ] **Debrief: the wheel height under the reference point (Dad, 12 Oct 2026; DB-31).** The Debrief puts the wheels on the ground and sets the altitude check's ground level with a 6.2 ft wheels-[...]

- [ ] **CT-156 cockpit (Formation Sim, PR #697, TS-154 to TS-156): rule on the cockpit sizes and three questions.** Every cockpit size, the eye points and the panel layout are estimates off the m[...]

- [ ] **Dad's whole-tool ideas (8 Oct 2026; `docs/FUTURE.md`):** (1) remove the Dad/Pat tags and credit both as co-founders and co-creators in About (done in V2.212, ALL-29, Patrick approved via [...]

SOF items below are Dad's to decide (SOF-47, 7 Oct 2026); they stay listed here until he answers.

- [ ] **Offline cache and the US airspace files (Dad's session, 8 Oct; SOF-53):** `tools/service-worker.mjs` (shared tooling) keeps every built file for offline use, so first visits still fetch a[...]

- [x] **Shell: let the SOF's Home base choice set home and alternates (Dad's session, 8 Oct; SOF-49; done V2.213, SOF-62, Patrick approved via Dad 10 Oct):** `src/shell/host.js` hands modules a r[...]

The one list. Each line is a question; the working answer applies until he says otherwise (`AGENTS.md:103`). Updated 5 Oct 2026, 04:10Z.

- [ ] **See Traffic and the PFL on screen** (V2.388) from the default start: the Busy circuit, the refactored flying, the move-over, Spawn a conflict, the PFL from downwind, base and upwind, the [...]
- [x] **Traffic PFL aim point (TR-106, TR-110):** confirmed and updated in Traffic spec 4.5 item 13 and aim lines in line with v2.10.119. The glide aims at the threshold and the round-out carries[...]
- [ ] **See Pat's Fight and Turn Sim on screen** (v2.19): the Smart pilot, the OVERSPEED and BELOW DECK flags and the Advanced setup menu from the default start, against the Energy section of its[...]
- [ ] **Fly Pat's Formation Simulator** (V2.388) and ratify Patrick's rulings TS-76 to TS-85 (list: `pf/turn-sim-review/rulings-to-ratify.md`), and say what still looks wrong in fluid manoeuvring[...]
- [ ] **T-6 roll limit and G onset: confirm the estimates or give your numbers.** Core now holds about 0.45°/s per knot of true airspeed, at most 120°/s, full rate in about 0.3 s, and a G onset[...]
- [ ] **Formation B5 and B4, 14 Oct 2026 (read `Pat's claude work/formation-handover-14oct.md`):** approve spec 7e draft 4 after an Opus agent's audit (plan T29s; written 14 Oct 2026, `Pat's clau[...]
- [ ] **Formation, 13 Oct 2026 later (Step 12 of the Formation plan):** #1018 (V2.424) stays open on its branch until it flies right; it now also holds one Lead (TS-225) and the roll fix (TS-223)[...]

## CI: Temporary fix & testing notes (TO DO)

Short version: a CI test is an automated check that runs whenever code changes so the project catches obvious breakage without a human clicking around. In this repo, the GitHub Actions job is "the check" for a PR: light, end-result checks, not a pile of timing-sensitive assertions.

What CI should test here

- Tests focus on what a pilot would recognise, not brittle internals:
  - "it landed on the runway"
  - "it stayed above the deck"
  - "the aircraft responded correctly in a turn or flight phase"
- Avoid tight timing gates or exact frame counts
- Use realistic margins and source expected values from manuals, Patrick's rulings, or real recorded data
- Repo policy summary:
  - checks assert end results, not exact numbers
  - no mutation/stress/long runs
  - one test per PR is usually enough
  - never delete a failing test just to get green

Current build problem and short-term action

- The Pages build currently fails because `archive/docs/records/future-ideas.md` contains invalid (non‑UTF‑8) bytes; Jekyll/kramdown refuses to render it.
- Emergency workaround (temporary): add a pre-build normalization step in `.github/workflows/pages.yml` to detect and normalize Markdown files to UTF‑8 so the Pages job can complete and the site deploys while the source is fixed.
- Permanent fix: repair the bad file in the repo (convert/save as UTF‑8), then remove the normalization step from the workflow.

To do

1. Add an issue / PR that fixes `archive/docs/records/future-ideas.md` to valid UTF‑8 (source is likely ISO‑8859‑1 or contains a BOM). Mark as high priority so the temporary CI guard can be removed.
2. (Optional) Apply a one-line workflow patch that normalizes `.md` files before build to avoid blocking publishing during the fix window. This must be removed once the file is fixed.
3. Write a minimal CI testing policy file under `docs/TESTING.md` (or expand it) to capture the points above and the rule-book constraints about one test per PR and pilot-recognisable checks.
4. When you fix the file in your workspace, push and the Pages workflow will redeploy; after a clean run, remove the temporary normalization step.

Notes

- I tried to add a temporary normalization step to the pages workflow but do not have permission to push changes to this repo. If you want, I can open a PR with the workflow change and the small docs update if you grant write access or merge it yourself.
- If you want me to create the issue and PR, tell me whether to use a temporary branch name like `ci/normalize-md-utf8` and whether to include the exact script I proposed.

