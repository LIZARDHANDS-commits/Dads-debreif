# Turn Sim: plan

How to read this plan: steps are in the order to do them. Step 1 is a review, not a build: nothing in the Turn Sim is built, merged or archived until Patrick has decided what the review recommends (`pf/reset/consolidation-plan.md:268`). A line marked "Patrick decides" waits for his yes (his answer TQ-1: `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Requirement numbers such as TS-R7 are in `requirements.md`; how each is checked is in `testing.md`.

## Where it stands

1. The Turn Sim is live as a PROTOTYPE on main and flies the SMM turns in plan mode only (set up a turn, press Play, watch it). Patrick's 3 October finding is that it needs a full overhaul before any more features or sign-off (`docs/handover/turn-sim.md:4`, `pf/reset/1-requirements/requirements.md:322`).
2. Patrick wants two modes: plan mode, and live mode where the formation flies along and a manoeuvre button makes it fly that manoeuvre; whether to rebuild, start a new core or fix what is there is decided by the review in Step 1 (`pf/reset/1-requirements/requirements.md:327`, `pf/reset/consolidation-plan.md:285`).
3. Four old branches and one backup bundle hold about 1,200 lines of Turn Sim work that is not on main; they are flagged in Step 1 as work to reuse and are not to be deleted until this plan carries the flag (`pf/reset/2-inventory/agents/agent-4-outside.md:8`, `pf/reset/2-inventory/file-register.md:47`).

## Step 1. The Turn Sim review (analysis only; Patrick decides)

Aim: decide between rebuilding, building a new live core with named parts reused, or fixing what is there, for both modes. The review writes its answer down in `decisions.md` and rewrites Steps 2 onward of this plan. Nothing here changes the flying code.

**Hold**
- [ ] Hold all Turn Sim code where it is: no Turn Sim file is archived, no branch is merged and no Turn Sim feature is built until the review is decided (Patrick, 4 Oct 02:16Z) (`pf/reset/consolidation-plan.md:268`).
- [ ] Turn Sim tests stay as they are; their keep, rewrite or retire marks wait for the review (`pf/reset/5-testing/test-register.md:1`).

**What the review decides** (Patrick's brief for it, 4 Oct 02:16Z)
- [ ] Plan mode and live mode. Live mode starts with a 2-ship (4-ship later) and a button menu of every manoeuvre in the SMM and the formation briefs; error practice is a later layer (`pf/reset/consolidation-plan.md:290`).
- [ ] The review's own recommendation, for Patrick to accept or change: option (b), a new flying core that flies live step by step with each wingman reacting to the aircraft it flies off, keeping the named parts (the screen frame, the 2D and 3D pictures, the playback loop, the judging, the graph data), about 40% of the code kept (`pf/reset/1-requirements/agents/turn-sim-architecture-review.md:13`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:12`).
- [ ] Pilot behaviour for the live core is not written down: ask Dad for what each aircraft does and when it corrects in each manoeuvre (`pf/reset/1-requirements/agents/turn-sim-architecture-review.md:181`).
- [ ] Five design questions from the architecture review, each with its best guess, for Patrick: A live wingman controllers or smooth planned paths (guess: Lead on a planned path, wingmen live); B speed as indicated or true (guess: indicated); C height, the 300 ft stack, in this version or flat with a note; D clock cue as the one timing behaviour (guess: yes); E per-wingman error knobs or a skill slider and one-click faults (`pf/reset/1-requirements/agents/turn-sim-architecture-review.md:189`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:190`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:191`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:192`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:193`).
- [ ] How the Turn Sim is driven (TS-Q25; Patrick leans to the same smooth wind-shaped paths as Traffic, not decided) and the settled answer to the question "how should aircraft be driven" for this module (`pf/reset/1-requirements/questions.md:170`, `pf/reset/1-requirements/questions.md:32`).
- [ ] The manoeuvre menu for the first 2-ship version: fly along in line abreast and offer the ten turns B1 to B10 of the manoeuvre catalogue (58 rows in all; the others are the later waves); the catalogue marks where sources disagree as ASK (`pf/reset/1-requirements/agents/turn-sim-manoeuvre-catalogue.md:12`, `pf/reset/1-requirements/agents/turn-sim-manoeuvre-catalogue.md:11`).

**Items deferred to this review** (copied from the plan's "After the reset" note)
- [ ] TS-Q2: rebuild, new core or fix (`pf/reset/1-requirements/questions.md:147`).
- [ ] TS-Q10: Dad's first email (the source of the old decisions D41 to D45) is not in the archive; ask Patrick for it, and whether to send Dad his two Turn Sim questions (Delayed 45 cue; box rear delay) (`pf/reset/1-requirements/questions.md:155`, `docs/handover/turn-sim.md:49`).
- [ ] TS-R27: the setting count. The module has 81 setting keys and a five-choice offset-box timing menu; the review decides how few the instructor sees (`pf/reset/1-requirements/requirements.md:357`).
- [ ] TS-Q24: Dad's three four-ship working answers (rear check only between turns; box #3 delays 10 to 15 s and #4 turns on the cue; each formation's own #3 rule) stay as working answers until the review works them out properly (`pf/reset/1-requirements/questions.md:169`).
- [ ] TS-Q20: rejoins, fighting wing and fluid manoeuvring are the second wave of live mode, starting with the turning rejoin; the review sets the order. The old future ideas FF39, FF40 and FF41 land here, not on a future list (`pf/reset/1-requirements/questions.md:165`, `docs/records/future-ideas.md:11`).
- [ ] Old decisions that follow the review: D123, D170 and D214 (the cross turn's second-half G: the SMM draws 2 G then 3 G, the code solves about 1.6 G at 6,000 ft so the pair rolls out at the set spacing); D324 and D385 (the spacing solver, scored at roll-out); D428a (three-tier screen), D428d (closed-form solver) and D428e (merge the four branches; make the run length automatic) (`pf/reset/4-decisions/partb-turnsim.md:12`, `pf/reset/4-decisions/partb-turnsim.md:13`).
- [ ] "Auto" names two different controls in the code and the checklist; the review says which is which (`pf/reset/consolidation-plan.md:290`).
- [ ] The offset box may not keep its shape both ways with a fixed 10 to 15 s delay for #3 (TS-R3) (`pf/reset/consolidation-plan.md:290`).
- [ ] The shipped default is still the time delay; TS-R7 asks for the clock cue as the default (`pf/reset/consolidation-plan.md:290`, `pf/reset/1-requirements/questions.md:149`).
- [ ] Wind: none for now, said on screen; the review may add it (TS-R10) (`pf/reset/1-requirements/requirements.md:337`).
- [ ] Saved setups: the Profiles panel is a placeholder; build it or hide it (TS-Q11), with the shell's optional store line (see the Shared plan) (`pf/reset/1-requirements/questions.md:156`).
- [ ] Open "Later" questions that depend on the design: TS-Q8 (constant speed and the sustained-G warning), TS-Q9 (box shackle), TS-Q13 (Export CSV), TS-Q14 (spacing graph and solver: first release or later, scored at roll-out), TS-Q15 (remove LATE and EARLY), TS-Q16 (one-click faults instead of the per-wingman error grid), TS-Q19 (G-warm), TS-Q21 (judge at roll-out only, one standard with the Debrief), TS-Q22 (MOA box), TS-Q23 (which of the checklist and the code to correct) (`pf/reset/1-requirements/questions.md:153`, `pf/reset/1-requirements/questions.md:154`, `pf/reset/1-requirements/questions.md:158`, `pf/reset/1-requirements/questions.md:159`, `pf/reset/1-requirements/questions.md:160`, `pf/reset/1-requirements/questions.md:161`, `pf/reset/1-requirements/questions.md:164`, `pf/reset/1-requirements/questions.md:166`, `pf/reset/1-requirements/questions.md:167`, `pf/reset/1-requirements/questions.md:168`).
- [ ] Questions for Dad that stay with the review: TS-Q5 (the 4312 label order), TS-Q7 (a roll-in rate instead of instant bank), TS-Q17 (the correction model: lag, lead and G adjustment; default remove) (`pf/reset/1-requirements/questions.md:150`, `pf/reset/1-requirements/questions.md:152`, `pf/reset/1-requirements/questions.md:162`).
- [ ] The four-ship G-warm (spread-4) picture is checked with Patrick before it is built (`docs/handover/turn-sim.md:50`).

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
- [ ] Roadmap Milestone 3 and its trap 6 (`docs/REMEDIATION_ROADMAP.md:366`, `docs/REMEDIATION_ROADMAP.md:192`); the swarm queue rows for the Turn Sim, PPQ-09 to PPQ-11 (`docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:53`).
- [ ] Questions and references: Dad's list of questions (`docs/records/dads-questions.md`) (`docs/records/dads-questions.md:1`); the manuals discrepancy matrix (`docs/records/manuals-discrepancy-matrix.md:1`); the SMM aerobatics catalogue, whose "Immelmann" and G lines are references, not walls (`docs/smm-aerobatics-catalog.md:1`); the audit findings in `docs/audit/findings.json` (`docs/audit/README.md:1`); the future-ideas list rows FF38 to FF41 and FF46 (`docs/records/future-ideas.md:22`); the skill on wind-shaped flight paths (`.agent/skills/wind-shaped-flight-paths/SKILL.md:6`).
- [ ] Code and tests (evidence only, not gates): `src/modules/turn-sim/` (the screen, the settings, the 3D view, and 9 engine files); 21 unit test files in `tests/unit/turn-sim/`; `tests/e2e/turn-sim.spec.js`; and the old V6 comparison tests kept in `archive/tests/golden/` (`turn-sim-*`) (`pf/reset/5-testing/test-register.md:33`, `tests/e2e/turn-sim.spec.js:2`).
- [ ] The two PC-only reports: `pf/reset/inputs/turn-sim-architecture-and-bloat-report.md` (the bloat report's own plan keeps improving the old "set up one turn and watch" model; the review judged it does not match the new direction) and, for contrast, the Turn Fight report `pf/reset/inputs/turn-fight-architecture-and-mpt-remediation-report.md` (`pf/reset/inputs/turn-sim-architecture-and-bloat-report.md:3`, `pf/reset/1-requirements/agents/turn-sim-architecture-review.md:15`).
- [ ] Reset research: the architecture review and the manoeuvre catalogue (`pf/reset/1-requirements/agents/turn-sim-architecture-review.md:3`, `pf/reset/1-requirements/agents/turn-sim-manoeuvre-catalogue.md:3`); the briefs research `1-requirements/agents/research-turn-sim-briefs.md`; the Turn Sim agent notes `1-requirements/agents/turn-sim.md`; `1-requirements/turn-sim-at-a-glance.md` (`pf/reset/1-requirements/turn-sim-at-a-glance.md:3`).
- [ ] Reset decisions and tests: `4-decisions/partb-turnsim.md` and `4-decisions/agents/turn-sim.md` (`pf/reset/4-decisions/partb-turnsim.md:61`); `5-testing/agents/turn-sim.md` and the Turn Sim section of the test register (`pf/reset/5-testing/test-register.md:377`).
- [ ] Project files: `pf/manuals/formation-and-turn-numbers.md` (page references only; the SMM text stays out of the repo); `archive/2026-09/memory/turn-sim.md`; `archive/2026-09/flight-math-check/turnsim.js` and `turnsim2.js` (scripts that drove V6's real Turn Sim); `archive/2026-09/verification/turn-sim*.md`; Dad's check list and round-2 questions in `archive/2026-09/dad-email/` (`pf/reset/1-requirements/questions.md:155`).

**Old to-do tasks the review takes over** (none of these is built until the review decides)
- [ ] Task 12, aircraft errors panel and dragging (built on the screen-audit branch, one more review read needed) (`tasks/turn-sim/todo.md:60`).
- [ ] Task 16, spacing graph and solver screen (`tasks/turn-sim/todo.md:68`).
- [ ] Task 13, saved profiles and CSV; the shell's `scenarioStore` line (see the Shared plan) (`tasks/turn-sim/todo.md:80`).
- [ ] Tasks 17 and 18, sequences and G-warm on screen, and their browser test (`tasks/turn-sim/todo.md:93`, `tasks/turn-sim/todo.md:96`).
- [ ] Task 14, browser tests and checklist: replaced by Step 5 below (`tasks/turn-sim/todo.md:83`).
- [ ] Old roadmap notes: Milestone 3 Task 3.1 (consolidate the three branches, rebuild the hook as a true 180 degrees, update the browser-test regexes) and Task 3.2 are replaced by this review; the hook's 180-degree end picture is already TS-R4 (`docs/REMEDIATION_ROADMAP.md:371`, `pf/reset/1-requirements/requirements.md:331`). The roadmap's Gate 3 is replaced by Step 5 below (`docs/REMEDIATION_ROADMAP.md:376`).

**End of the review**
- [ ] Patrick decides: rebuild, new core with named parts reused, or fix. Record it in `decisions.md`, then replace Steps 2 to 4 below with the steps the choice needs (`pf/reset/consolidation-plan.md:290`).
- [ ] Check the right-turn end-point helper (`simulateDelayedTurnFinalPos`, `src/modules/turn-sim/engine/plan.js`), which V6 mirrored for right turns (issue #15).

## Step 2. Refresh spec.md against the new requirements (after the review)

- [ ] Refresh `spec.md` against the new requirements when work resumes, rewriting every "same answer V6 gives" or "pinned to V6" line. The old spec says every Turn Sim number is pinned to V6 by a golden test (`specs/SPEC-turn-sim.md:23`), runs V6's own functions as the first test (`specs/SPEC-turn-sim.md:287`), pins V6's step and its Euler move (`specs/SPEC-turn-sim.md:26`), scores the solver "as in V6" (`specs/SPEC-turn-sim.md:162`), and lists golden tests and a V6 cross-check as the way to finish (`specs/SPEC-turn-sim.md:290`). Patrick's answer: V6 is a source of ideas, not answers (`pf/reset/1-requirements/questions.md:31`).
- [ ] Rewrite the spec lines the ratified answers replaced: the Delayed 45 end picture (TS-R5), the clock cue as the default (TS-R7), KIAS with a block choice (TS-R6), wind none (TS-R10), and the solver scored at roll-out (D385) (`pf/reset/1-requirements/requirements.md:332`).
- [ ] Fix the sign-off checklist and the code where they disagree (start heading 360 versus 0, the reset button's wording, the settings-menu sections it names, "closed-loop" auto timing), once the review decides which side moves (TS-Q23) (`pf/reset/1-requirements/questions.md:168`).

## Step 3. Build what the review chose

- [ ] Written by the review. It must cover the ratified lines TS-R1 to TS-R27 that the built screen does not meet today: the Profiles panel is a placeholder, and there is no Export CSV, no spacing graph, no solver button, no wingman dragging and no G-warm panel on main (`pf/reset/1-requirements/requirements.md:322`).
- [ ] Each flying choice is settled in writing before it is coded, with its source, and the 300 ft stack height rule (TS-R11) is decided with it (`pf/reset/1-requirements/requirements.md:338`).
- [ ] When a requirement is built, the check marked "New" in `testing.md` is written with it. A check that fails twice stops the work and Patrick is asked; the flying formulas are never bent to make a test pass (T7) (`pf/reset/5-testing/testing-policy.md:27`).

## Step 4. Second wave of live mode

- [ ] Turning rejoin first, then fighting wing and fluid manoeuvring (level), in the order the review sets (TS-Q20). The vertical fluid manoeuvres (FF38) stay on the future list (`pf/reset/1-requirements/questions.md:165`).
- [ ] Four-ship live mode and the error-practice layer (TS-R8) follow the 2-ship core (`pf/reset/1-requirements/requirements.md:335`).

## Step 5. Sign-off

- [ ] Sign-off: anyone runs the checklist in `testing.md` and sends Patrick the result; the next module starts only after his yes (TQ-2) (`pf/reset/4-decisions/answers.md:13`).
- [ ] Remove the PROTOTYPE flag from the Turn Sim card only if Patrick says so (ALL-R4) (`pf/reset/1-requirements/requirements.md:20`).
