# Tasks: Turn Sim

Plan: [`plan.md`](plan.md). Spec: [`specs/SPEC-turn-sim.md`](../../specs/SPEC-turn-sim.md). Every task is verified with `npm test`; screen tasks also with `npm run test:e2e` and a look with `/run`. Line numbers are in `original/shell.html`.

Patrick's answers to Q41 to Q47 (2026-09-30) are folded in below; each flight change is its own commit after the V6 pin (D10). So are the SMM formation additions (Patrick 06:40Z, spec "SMM formation additions", items 1 to 8).

Skills: test-driven-development and incremental-implementation for every task; frontend-ui-engineering for screen tasks (4, 5, 9, 11, 12, 13, 16); performance-optimization for 4 and 14; security-and-hardening for 13; debugging-and-error-recovery whenever something breaks; code-review-and-quality before each PR leaves draft.

## Phase 1: engine base and a first screen (PR A)

- [x] **1. Settings and the golden fake.** `settings.js`: every Turn Sim setting with V6's defaults, allowed values and ranges (Speed at least 1 kt, Turn degrees 10 to 180, finite numbers only). A test helper that turns a settings object into V6's `$('id').value` so V6's own functions run in Node.
  - Acceptance: defaults equal V6's markup (lines 527 to 600); bad values refused; the fake drives V6's `speedfps`, `baseG`, `turnRadius` to the same numbers as the page. Then, as its own commit once the task 3 golden runs pin V6's defaults: G 3.0 (D113) and offset box aft 7,000 ft (D114) (Patrick 05:37Z, SMM 16.18/16.19 and 16.41). The golden tests keep passing V6's own values explicitly.
  - Files: `src/modules/turn-sim/settings.js`, `tests/unit/turn-sim/settings.test.js`, `tests/golden/turn-sim-fake-page.js`. Size S.
- [x] **2. Formation slots and position errors, pinned.** `engine/formation.js` from `desiredFormationAircraft` (797), `syncAircraftErrorValues` and `applyErrors` (905 to 914), `inferLineAbreastFormFromCurrentState` (1407).
  - Acceptance: every preset and error combination matches V6 exactly (golden). Nothing changed yet: D42 and D48 come in task 12.
  - Files: `engine/formation.js`, `tests/golden/turn-sim-formation.test.js`. Size S.
- [x] **3. One step and one run, pinned.** `engine/step.js` and `engine/run.js` from `moveAircraftList` (1579, without the G correction), `setupTurnStartsFor` for time delay (1174), the shackle legs, `stepSim`, `recordHist` (1689), `allAircraftFinishedTurn` (1435). History kept by time.
  - Acceptance: whole runs (4312, 2134, two-ship × delayed 90/45, hook, shackle, cross × right/left, time delay) match V6's Step at 0.05 s, position by position each second. Closure over the real step equals V6's at 0.05 s. Two-ship has no NaN pairs.
  - Files: `engine/step.js`, `engine/run.js`, `engine/plan.js` (time delay only), `tests/golden/turn-sim-run.test.js`, `tests/unit/turn-sim/run.test.js`. Size M.
- [ ] **4. First screen.** Mount and unmount, the three columns, the Setup essentials, the playback bar above the canvas, Fit, the picture (grid, MOA box, aircraft, trails), Play/Pause/Step/Reset and speed on the scheduler. #4 white with a dark outline.
  - Acceptance: opens fitted (#30); flies a time-delay turn; nothing overlaps at 1366 × 768 (R2); leaving leaves no frames or timers (R4); a setup change stops and resets the run (#31). First performance measurement logged.
  - Files: `index.js`, `layout.js`, `view.js`, `turn-sim.css`, shell registry entry (through the coordinator). Size M.
- [ ] **5. Readouts and standards.** Formation card, More detail, Lead 3/9 line, error labels, turn circles, Layers menu with V6's defaults. Standards read from their shared home and shown read-only (Q46); a switched-off standard gives no label.
  - Acceptance: with the default preset, labels from `core` `classifyTurnSimPosition` match V6 at every second of the task 3 runs; an edited standard changes the labels; turn circle G matches the flying G.
  - The stall-limit G warning (D128): beside the G box and on a wingman's line when G plus its G error is above `core` `stallLimitG(speed)`, speed taken as IAS. Warning only; a test states it fires at 220 kt above about 6.5 G and not at 3 G.
  - SMM item 6: the "Under 300 ft" (or "Crossing: 300 ft vertical needed" in the shackle and cross turn) and "Mutual support lost" (over 9,000 ft) flags, as named engine constants with their SMM references. Readouts only.
  - Dependencies: the shared standards home, agreed with the debrief and app frame threads through the coordinator.
  - Files: `readouts.js`, `view.js`, `tests/unit/turn-sim/readouts.test.js`. Size M.

### Checkpoint A: all tests pass, the build is clean, a time-delay turn flies with correct labels. PR A.

## Phase 2: turn logic and timing (PR B)

- [ ] **6. Turning order and per-wingman logic, pinned, then D41.** `displayedOutsideInOrder` (1116), `tacticalOrderForDelayIn` (1132), `sideOfLeadIn` (930), `sideOfAircraftFrom` (941), `turnDirFromLogic` (1095). Then D41 as its own commit: toward and away swapped back.
  - Acceptance: golden match first; after D41, "toward cue aircraft" turns #3 toward Lead (test states it). The maneuver note says the outside aircraft goes first.
  - Files: `engine/plan.js`, `tests/golden/turn-sim-plan.test.js`. Size S.
- [ ] **7. G correction (core Task 12, D74).** Call `core`'s G correction in the step; the Correction model behind its own checkbox under More setup, off by default (Q41).
  - Acceptance: with G fix at base G 1.2 and a large error, no NaN; V6's NaN case is pinned in `core`.
  - Dependencies: core Task 12. Files: `engine/step.js`, its tests. Size S.
- [ ] **8. Auto timing, pinned, then D43 and D44.** `computeAutoDelay` (1369) and the lead gate in `cueSatisfied` (1525) pinned; then D43 (no waiting for Lead) and D44 (step = spacing ÷ speed × cot(half the turn angle)) as two commits. The step is shown, never written into Base delay.
  - Acceptance: after both, at V6's defaults the step is 16.16 s and the rollout is line abreast at 6,000 ft within a tolerance the test states; Base delay is untouched.
  - Files: `engine/plan.js`, `tests/golden/turn-sim-plan.test.js`, `tests/unit/turn-sim/auto-timing.test.js`. Size S.
- [ ] **9. Clock cue, pinned, then the tolerance box.** `clockCascadeOrder` (1152), `clockCueCrossed` (1493), `cueSatisfied` (1511). Tolerance read from its setting (default 4°, so the default is unchanged). Live per-aircraft status lines. The offset-box 5:30 message (Q44c, flagged for Dad). Then, as its own commit, the selectors (Q45): "Manual targets" uses each wingman's Clock target (or Clock cue aircraft), its own clock position and its turn logic; "Outside-in" stays V6's.
  - Then, as its own commit, SMM item 2: the clock position default becomes "Auto (5 or 7 by direction)" (7 o'clock right, 5 o'clock left, confirmed from the engine's picture); fixed positions, 5:30 included, stay pickable.
  - Acceptance: golden match at 4° with Outside-in and 5:30; a changed tolerance changes when the turn starts; with Manual targets, #4 set to watch #2 turns when #2 reaches #4's clock position; with Auto, a right turn cues at 7 and a left at 5; status lines update during play.
  - Files: `engine/cues.js`, `readouts.js`, tests. Size S.
- [ ] **10. Compass heading (D45) and legs.** Start heading in compass degrees, default 000 (TS2); continuing a leg fills in the compass heading; a new leg resets the rear check and breadcrumbs.
  - Acceptance: 090 flies east; the pinned runs still match V6 when given V6's math heading; a second leg performs the rear check.
  - Files: `settings.js`, `engine/run.js`, tests. Size S.

### Checkpoint B: every timing mode flies; D41, D43, D44, D45, D74 and Q45 each have their own commit and test. PR B.

## Phase 3: offset box, errors and layers (PR C)

- [ ] **11. Offset box and rear element check, pinned.** `offsetFrontElementOrder` (966), `simulateDelayedTurnFinalPos` (946), `searchDelayToTarget` (979), `computeOffsetBoxPlan` (994), `rearCheckConfig`, `stepRearCheckTurn` (1533 to 1569). Offset-box controls and the rear check shown only with the offset box, with a live status line.
  - Acceptance: golden match for the offset box × delayed 90/45 × right/left × LATE/EARLY, with and without the rear check.
  - Then two commits: **#4 by ground track** (Q44b), the new default, solving #4's delay to roll out 3,000 ft outside #2 at the box aft distance (tested for both directions, where V6's LATE left turn ends about 21,000 ft aft); and the **rear check** starting at its set time or once #3 and #4 finish turning, whichever is later (Q47).
  - Then SMM item 5: #3's and #4's solved delays shown against the 10-15 s band (16.41 para 112) with "outside 10-15 s"; in in-place, shackle and check turns the rear element turns with the front (V6 pinned first; its own commit if it changes anything).
  - Files: `engine/plan.js`, `engine/rear-check.js`, `layout.js`, tests. Size M.
- [ ] **12. Aircraft errors, dragging and the other layers, then D42 and D48.** Aircraft errors panel; drag before Play (with follow lead working); clock marks, breadcrumbs, NM. Then D42 (wide/tight from Lead) and D48 (#2's side, default left) as two commits.
  - Acceptance: after D42, "Wide 1,000 ft" moves each wingman 1,000 ft further from Lead on its own side; after D48, the side setting mirrors #2 only.
  - Files: `engine/formation.js`, `layout.js`, `view.js`, tests. Size M.

- [ ] **15. Hook turn and shackle to Patrick's definitions (Q43, Q44a).** V6's hook and shackle are pinned in task 3. First draw the new rollout pictures from the engine and check them with Patrick. Then, as two commits: the hook (same direction through 180°, fuselages lined up in the middle) and the shackle (45° into each other, a worked-out hold, roll back; original heading, same spacing, sides swapped, an X from above; 4-ship mirrors across the centre line). In-place 90 stays V6's.
  - Acceptance: tests state each ending (hook: 180° heading change and the agreed line-up; shackle: same heading, spacing within a stated tolerance, each aircraft on the other side); spacing too small for a shackle gives a message, not a bad picture.
  - Then the SMM turn items, each its own commit: **check turn** (item 1, a new Turn entry, 5° to 30°, default 30°); **delayed 45 into and away from the wingman** (item 3, paras 56-57, V6's delayed 45 pinned first, pictures checked with Patrick); **cross turn in two stages** (item 4, 2 G to 90° then the G setting, first-stage G and switch point under More setup, V6's one-G cross turn pinned first).
  - Files: `engine/plan.js`, `engine/step.js`, tests. Size L.
- [ ] **16. Spacing graph and solver (Q41).** Each behind its own checkbox, off by default. The graph: chosen pairs, minimum separation and closure over the run, one colour each with a legend, drawn only while open. The solver: V6's sweep (base delay, spacing or G for a target spacing) pinned to V6, run only when asked.
  - Acceptance: solver answers match V6's; the graph uses no frames while closed; nothing new shows on a first visit.
  - Files: `engine/solver.js`, `graph.js`, `layout.js`, tests. Size M.

### Checkpoint C: every V6 feature kept by the spec is on screen; D42, D48, Q43, Q44 and Q47 landed. PR C.

## Phase 4: profiles, CSV and sign-off (PR D)

- [ ] **13. Profiles and CSV.** Named profiles and the startup default over `app.storage`, checked field by field on load; confirm before overwrite, delete and factory reset; factory reset without reloading. CSV of the whole run by 0.05 s.
  - Acceptance: a profile with errors, a rear check, dragged positions and a custom turn angle round-trips exactly; storage blocked still works (#33); a tampered profile is refused field by field.
  - Files: `profiles.js`, `engine/run.js` (CSV rows), `layout.js`, tests. Size M.
- [ ] **14. Browser tests, performance, checklist, README.** `tests/e2e/turn-sim.spec.js` (spec's list), performance log at 4× with all layers, `docs/checklists/turn-sim.md`, module README.
  - Acceptance: the e2e suite passes; 60 fps target met or the gap logged; checklist ready for Patrick or Dad.
  - Files: `tests/e2e/turn-sim.spec.js`, `docs/checklists/turn-sim.md`, `src/modules/turn-sim/README.md`. Size M.

### Checkpoint D: success criteria in the spec met; checklist handed to Patrick.

## Phase 5: G-warm (PR E)

The spec's "SMM formation additions", item 7 (Patrick 06:40Z). New, so nothing in V6 to pin; each test states what the SMM reference says. New settings bump the settings version and go into profiles (task 13's field-by-field check covers them). Item 8 (rejoins, fighting wing, fluid manoeuvring) is a future feature (Patrick 06:59Z), not a task.

- [ ] **17. Sequences and G-warm (item 7).** `engine/sequence.js`: a list of turns flown one after another, each starting when the last ends, with an optional wings-level gap. The Exercises panel (collapsed) with a G-warm button: from LAB at 220 KIAS or more, in-place 90 at 3 G toward the wingman, 5 s wings level labelled "½ G push", hook at 4 G, in-place 90 at 3 G back (16.22 paras 70-71). 4-ship as spread-4 (16.44), picture checked with Patrick first.
  - Acceptance: two-ship G-warm ends on the start heading in LAB; each leg's G and the 5 s gap are stated in the test; a speed under 220 is raised to 220 with a note.
  - Files: `engine/sequence.js`, `exercises.js`, `settings.js`, tests. Size M.
- [ ] **18. G-warm in the browser tests and checklist.** Add the Exercises panel to `tests/e2e/turn-sim.spec.js` (closed on a first visit, the button flies the sequence) and a checklist line.
  - Files: `tests/e2e/turn-sim.spec.js`, `docs/checklists/turn-sim.md`. Size S.

### Checkpoint E: G-warm has a stated test; the first-time screen is unchanged; checklist updated. PR E.
