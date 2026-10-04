# Turn Sim: plan

How to read this plan: steps are in the order to do them. Step 1, the review, is done: Patrick decided on 4 Oct and approved the first version's spec. A line marked "Patrick decides" waits for his yes (his answer TQ-1: `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Requirement numbers such as TS-R7 are in `requirements.md`; how each is checked is in `testing.md`.

## Where it stands

1. From V2.6 the Turn Sim shows the first version of live mode: a 2-ship in line abreast with manoeuvre buttons, flown on a new core (`spec.md` Part 1). Before that it flew the SMM turns in plan mode only, and Patrick's 3 October finding was that it needed a full overhaul (`docs/handover/turn-sim.md:4`).
2. Patrick wants two modes: plan mode, and live mode where the formation flies along and a manoeuvre button makes it fly that manoeuvre; whether to rebuild, start a new core or fix what is there is decided by the review in Step 1 (`pf/reset/1-requirements/requirements.md:327`, `pf/reset/consolidation-plan.md:285`).
3. Four old branches and one backup bundle hold about 1,200 lines of Turn Sim work that is not on main; they are flagged in Step 1 as work to reuse and are not to be deleted until this plan carries the flag (`pf/reset/2-inventory/agents/agent-4-outside.md:8`, `pf/reset/2-inventory/file-register.md:47`).

## Step 1. The Turn Sim review (done, 4 Oct 2026)

Patrick started the review early, alongside Traffic, on 4 Oct. Notes are in the project files at `turn-sim-review/` (README with every ruling and its time, `compare-and-recommend.md`, `architecture/architecture.md`, `line-abreast/line-abreast.md`, `first-version/`).

- [x] Catalogue the code and draw the architecture (a Sonnet agent; `turn-sim-review/architecture/`).
- [x] Explain line abreast from the manuals: spacing, each manoeuvre, timing and errors (a Sonnet agent; `turn-sim-review/line-abreast/`).
- [x] Compare the SMM with what the code flies, and recommend (`turn-sim-review/compare-and-recommend.md`).
- [x] Patrick decided: a new flying core, keeping and trimming the screen (TS-35); planned, kinematically accurate paths (TS-36, settles TS-Q25 and question A); roll 90°/s with a quick ease (TS-37, TS-Q7); constant 220 KIAS as true airspeed (TS-38, question B, TS-Q8 for now); exact geometry for delayed turns, replacing TS-R5's slanted line (TS-40); a real 300 ft vertical miss (TS-42, question C for the 2-ship); V6 corrections removed (TS-43, TS-Q17); 4312 swaps sides (TS-44, TS-Q5).
- [x] Patrick approved the first-version spec and screen (`spec.md` Part 1), 4 Oct 10:03Z.
- Question D (the clock cue) and E (error settings) wait for the errors layer; the cue is not the trigger in the first version (TS-40).
- Carried forward, not settled by the review: TS-Q9 (box shackle), TS-Q10 (Dad's first email), TS-Q13 (CSV), TS-Q14 (spacing graph), TS-Q15 (LATE and EARLY), TS-Q16 (one-click faults), TS-Q19 (G-warm), TS-Q20 (second wave order), TS-Q23 (old checklist), TS-Q24 (Dad's four-ship answers), TS-R3 (the offset box), TS-R27 (the setting count; the first screen has about 20 controls).
- [ ] Check the right-turn end-point helper (`simulateDelayedTurnFinalPos`, `src/modules/turn-sim/engine/plan.js`), which V6 mirrored for right turns (issue #15): only if plan mode's engine is kept; otherwise it goes with the retirement in Step 3.

The three lists below are kept from the review's brief as references. Nothing in them is built unless a later step names it (TS-35: the branches are not merged).

**Old work to reuse: the four branches and the bundle** (flag for the Turn Sim plan; Patrick, 3 Oct 23:54Z)
- [ ] `handover/turn-sim-223-fixes`: the Delayed 45 check turn flies only at 45 degrees; the offset box keeps its shape at 5,000 to 6,000 ft aft (`docs/handover/turn-sim.md:22`).
- [ ] `handover/turn-sim-215-recheck`: an in-place 90 judged in trail from each wingman's own reference aircraft; a check turn reads "Not judged"; label and menu fixes; the optional `app.scenarioStore` (`docs/handover/turn-sim.md:21`).
- [ ] `handover/turn-sim-screen-audit`: aircraft errors under "More ...", wingman dragging and keyboard nudge, NM rings (`drag.js` and `rings.js` exist only on this branch) (`docs/handover/turn-sim.md:20`, `pf/reset/2-inventory/file-register.md:98`).
- [ ] `handover/turn-sim-sequences`: `engine/sequence.js`, a runner for turns flown one after another, with the two-ship G-warm; engine only (`docs/handover/turn-sim.md:23`).
- [ ] The old merge order was 223-fixes, 215-recheck, screen-audit, sequences. The review decides which parts to cherry-pick; the guess in TS-Q12 is the dragging and the in-trail judge (`docs/handover/turn-sim.md:25`, `pf/reset/1-requirements/questions.md:157`).
- [ ] The backup is `archive/bundles/turn-sim-paused-branches.bundle` in this repo (same four tips; also in project files at `pf/archive/2026-09/turn-sim/paused/`). Keep it as the backup; thread 8 may delete the four remote branches now that this plan carries the flag (`pf/reset/2-inventory/file-register.md:102`, `pf/reset/consolidation-plan.md:261`).

**Every document that helps the review** (read-only; each is also listed in `agents/plans-futures.md` with its tag)
- [ ] Specs and plans in the repo: the old spec, `specs/SPEC-turn-sim.md` (`specs/SPEC-turn-sim.md:1`); the old plan and to-do list in `tasks/turn-sim/` (`tasks/turn-sim/plan.md:1`, `tasks/turn-sim/todo.md:1`); the handover note, which carries Patrick's 3 October directive (`docs/handover/turn-sim.md:1`); the old sign-off checklist (`docs/checklists/turn-sim.md:1`).
- [ ] Verification notes in the repo: `docs/records/verification/turn-sim.md`, `turn-sim-2026-09-30.md`, `turn-sim-recheck-189.md`, `turn-sim-recheck-215.md` and `turn-sim-recheck-223.md` (`docs/records/verification/turn-sim.md:1`, `docs/records/verification/turn-sim-recheck-223.md:1`).
- [ ] Roadmap Milestone 3 and its trap 6 (`archive/docs/REMEDIATION_ROADMAP.md:366`, `archive/docs/REMEDIATION_ROADMAP.md:192`); the swarm queue rows for the Turn Sim, PPQ-09 to PPQ-11 (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:53`).
- [ ] Questions and references: Dad's list of questions (`archive/docs/records/dads-questions.md`) (`archive/docs/records/dads-questions.md:1`); the manuals discrepancy matrix (`docs/references/manuals-discrepancy-matrix.md:1`); the SMM aerobatics catalogue, whose "Immelmann" and G lines are references, not walls (`docs/references/smm-aerobatics-catalog.md:1`); the audit findings in `docs/references/v6-audit/findings.json` (`docs/references/v6-audit/README.md:1`); the future-ideas list rows FF38 to FF41 and FF46 (`archive/docs/records/future-ideas.md:22`); the skill on wind-shaped flight paths (`.agent/skills/wind-shaped-flight-paths/SKILL.md:6`).
- [ ] Code and tests (evidence only, not gates): `src/modules/turn-sim/` (the screen, the settings, the 3D view, and 9 engine files); 21 unit test files in `tests/unit/turn-sim/`; `tests/e2e/turn-sim.spec.js`; and the old V6 comparison tests kept in `archive/tests/golden/` (`turn-sim-*`) (`pf/reset/5-testing/test-register.md:33`, `tests/e2e/turn-sim.spec.js:2`).
- [ ] The two PC-only reports: `pf/reset/inputs/turn-sim-architecture-and-bloat-report.md` (the bloat report's own plan keeps improving the old "set up one turn and watch" model; the review judged it does not match the new direction) and, for contrast, the Turn Fight report `pf/reset/inputs/turn-fight-architecture-and-mpt-remediation-report.md` (`pf/reset/inputs/turn-sim-architecture-and-bloat-report.md:3`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:15`).
- [ ] Reset research: the architecture review and the manoeuvre catalogue (`pf/reset/1-requirements/agents/turn-sim-architecture-review.md:3`, `pf/reset/1-requirements/agents/turn-sim-manoeuvre-catalogue.md:3`); the briefs research `1-requirements/agents/research-turn-sim-briefs.md`; the Turn Sim agent notes `1-requirements/agents/turn-sim.md`; `1-requirements/turn-sim-at-a-glance.md` (`pf/reset/1-requirements/turn-sim-at-a-glance.md:3`).
- [ ] Reset decisions and tests: `4-decisions/partb-turnsim.md` and `4-decisions/agents/turn-sim.md` (`pf/reset/4-decisions/partb-turnsim.md:61`); `5-testing/agents/turn-sim.md` and the Turn Sim section of the test register (`pf/reset/5-testing/test-register.md:377`).
- [ ] Project files: `pf/manuals/formation-and-turn-numbers.md` (page references only; the SMM text stays out of the repo); `pf/archive/2026-09/memory/turn-sim.md`; `pf/archive/2026-09/flight-math-check/turnsim.js` and `turnsim2.js` (scripts that drove V6's real Turn Sim); `pf/archive/2026-09/verification/turn-sim*.md`; Dad's check list and round-2 questions in `pf/archive/2026-09/dad-email/` (`pf/reset/1-requirements/questions.md:155`).

**Old to-do tasks the review took over** (none is built until a later step names it)
- [ ] Task 12, aircraft errors panel and dragging (built on the screen-audit branch, one more review read needed) (`tasks/turn-sim/todo.md:60`).
- [ ] Task 16, spacing graph and solver screen (`tasks/turn-sim/todo.md:68`).
- [ ] Task 13, saved profiles and CSV; the shell's `scenarioStore` line (see the Shared plan) (`tasks/turn-sim/todo.md:80`).
- [ ] Tasks 17 and 18, sequences and G-warm on screen, and their browser test (`tasks/turn-sim/todo.md:93`, `tasks/turn-sim/todo.md:96`).
- [ ] Task 14, browser tests and checklist: replaced by Step 5 below (`tasks/turn-sim/todo.md:83`).
- [ ] Old roadmap notes: Milestone 3 Task 3.1 (consolidate the three branches, rebuild the hook as a true 180 degrees, update the browser-test regexes) and Task 3.2 are replaced by this review; the hook's 180-degree end picture is already TS-R4 (`archive/docs/REMEDIATION_ROADMAP.md:371`, `pf/reset/1-requirements/requirements.md:331`). The roadmap's Gate 3 is replaced by Step 5 below (`archive/docs/REMEDIATION_ROADMAP.md:376`).

## Step 2. First version: the 2-ship in line abreast (`spec.md` Part 1)

- [x] New flying core: one aircraft per step (`live/flight.js`), one builder per manoeuvre (`live/manoeuvres.js`), the pair with presses, queue, tracks, rolling record and roll-out judging (`live/formation.js`).
- [x] The lean screen: buttons, Spacing and #2's side, follow camera, ground tracks, 3/9 line, planned paths, Formation card; 3D shows height, bank and pitch. Version V2.6.
- [x] Light checks written with the code (`tests/unit/turn-sim/live.test.js`): end pictures, bank and G, 300 ft at the cross, smooth hand-overs, the queue.
- [ ] Patrick flies every button in the real app from the default start (the sign-off checklist in `testing.md`, "First version").

## Step 3. Retire the plan-mode code (Patrick decides)

- [ ] With Patrick's yes: retire the plan-mode engine (`engine/`), `settings.js`, `fields.js`, `readouts.js`, their 20 unit test files and the plan-mode browser test `tests/e2e/turn-sim.spec.js` (sign-off only; it tests the old screen and fails on the new one). Before deleting, list what each did (rule book); ideas worth keeping go to `future.md`. Until then they stay, untouched.

## Step 4. Next, one at a time on the same core

- [ ] In this order unless Patrick reorders: G-warm, entry to line abreast, rejoins (turning rejoin first, then fighting wing and fluid manoeuvring, TS-Q20), other formations, the 4-ship (TS-44's 4312 order), then the V6 features on `future.md`. Each gets its own short spec and Patrick's yes before it is built; the four-ship G-warm picture is checked with him first.
- [ ] The error-practice layer (TS-R8), with questions D and E.

## Step 5. Sign-off

- [ ] Sign-off: anyone runs the checklist in `testing.md` and sends Patrick the result; the next module starts only after his yes (TQ-2) (`pf/reset/4-decisions/answers.md:13`).
- [ ] Remove the PROTOTYPE flag from the Turn Sim card only if Patrick says so (ALL-R4) (`pf/reset/1-requirements/requirements.md:20`).
