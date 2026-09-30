# Tasks: Turn Sim

Plan: [`plan.md`](plan.md). Spec: [`specs/SPEC-turn-sim.md`](../../specs/SPEC-turn-sim.md). Every task is verified with `npm test`; screen tasks also with `npm run test:e2e` and a look with `/run`. Line numbers are in `original/shell.html`.

Skills: test-driven-development and incremental-implementation for every task; frontend-ui-engineering for screen tasks (4, 5, 9, 11, 12, 13); performance-optimization for 4 and 14; security-and-hardening for 13; debugging-and-error-recovery whenever something breaks; code-review-and-quality before each PR leaves draft.

## Phase 1: engine base and a first screen (PR A)

- [ ] **1. Settings and the golden fake.** `settings.js`: every Turn Sim setting with V6's defaults, allowed values and ranges (Speed at least 1 kt, Turn degrees 10 to 180, finite numbers only). A test helper that turns a settings object into V6's `$('id').value` so V6's own functions run in Node.
  - Acceptance: defaults equal V6's markup (lines 527 to 600); bad values refused; the fake drives V6's `speedfps`, `baseG`, `turnRadius` to the same numbers as the page.
  - Files: `src/modules/turn-sim/settings.js`, `tests/unit/turn-sim/settings.test.js`, `tests/golden/turn-sim-fake-page.js`. Size S.
- [ ] **2. Formation slots and position errors, pinned.** `engine/formation.js` from `desiredFormationAircraft` (797), `syncAircraftErrorValues` and `applyErrors` (905 to 914), `inferLineAbreastFormFromCurrentState` (1407).
  - Acceptance: every preset and error combination matches V6 exactly (golden). Nothing changed yet: D42 and D48 come in task 12.
  - Files: `engine/formation.js`, `tests/golden/turn-sim-formation.test.js`. Size S.
- [ ] **3. One step and one run, pinned.** `engine/step.js` and `engine/run.js` from `moveAircraftList` (1579, without the G correction), `setupTurnStartsFor` for time delay (1174), the shackle legs, `stepSim`, `recordHist` (1689), `allAircraftFinishedTurn` (1435). History kept by time.
  - Acceptance: whole runs (4312, 2134, two-ship × delayed 90/45, hook, shackle, cross × right/left, time delay) match V6's Step at 0.05 s, position by position each second. Closure over the real step equals V6's at 0.05 s. Two-ship has no NaN pairs.
  - Files: `engine/step.js`, `engine/run.js`, `engine/plan.js` (time delay only), `tests/golden/turn-sim-run.test.js`, `tests/unit/turn-sim/run.test.js`. Size M.
- [ ] **4. First screen.** Mount and unmount, the three columns, the Setup essentials, the playback bar above the canvas, Fit, the picture (grid, MOA box, aircraft, trails), Play/Pause/Step/Reset and speed on the scheduler. #4 white with a dark outline.
  - Acceptance: opens fitted (#30); flies a time-delay turn; nothing overlaps at 1366 × 768 (R2); leaving leaves no frames or timers (R4); a setup change stops and resets the run (#31). First performance measurement logged.
  - Files: `index.js`, `layout.js`, `view.js`, `turn-sim.css`, shell registry entry (through the coordinator). Size M.
- [ ] **5. Readouts and standards.** Formation card, More detail, Lead 3/9 line, error labels, turn circles, Layers menu with V6's defaults.
  - Acceptance: labels from `core` `classifyTurnSimPosition` match V6 at every second of the task 3 runs; turn circle G matches the flying G.
  - Files: `readouts.js`, `view.js`, `tests/unit/turn-sim/readouts.test.js`. Size M.

### Checkpoint A: all tests pass, the build is clean, a time-delay turn flies with correct labels. PR A.

## Phase 2: turn logic and timing (PR B)

- [ ] **6. Turning order and per-wingman logic, pinned, then D41.** `displayedOutsideInOrder` (1116), `tacticalOrderForDelayIn` (1132), `sideOfLeadIn` (930), `sideOfAircraftFrom` (941), `turnDirFromLogic` (1095). Then D41 as its own commit: toward and away swapped back.
  - Acceptance: golden match first; after D41, "toward cue aircraft" turns #3 toward Lead (test states it). The maneuver note says the outside aircraft goes first.
  - Files: `engine/plan.js`, `tests/golden/turn-sim-plan.test.js`. Size S.
- [ ] **7. G correction (core Task 12, D74).** Call `core`'s G correction in the step; Correction model under More setup, default None (TS1).
  - Acceptance: with G fix at base G 1.2 and a large error, no NaN; V6's NaN case is pinned in `core`.
  - Dependencies: core Task 12. Files: `engine/step.js`, its tests. Size S.
- [ ] **8. Auto timing, pinned, then D43 and D44.** `computeAutoDelay` (1369) and the lead gate in `cueSatisfied` (1525) pinned; then D43 (no waiting for Lead) and D44 (step = spacing ÷ speed × cot(half the turn angle)) as two commits. The step is shown, never written into Base delay.
  - Acceptance: after both, at V6's defaults the step is 16.16 s and the rollout is line abreast at 6,000 ft within a tolerance the test states; Base delay is untouched.
  - Files: `engine/plan.js`, `tests/golden/turn-sim-plan.test.js`, `tests/unit/turn-sim/auto-timing.test.js`. Size S.
- [ ] **9. Clock cue, pinned, then the tolerance box.** `clockCascadeOrder` (1152), `clockCueCrossed` (1493), `cueSatisfied` (1511). Tolerance read from its setting (default 4°, so the default is unchanged). Live per-aircraft status lines. The offset-box 5:30 message.
  - Acceptance: golden match at 4°; a changed tolerance changes when the turn starts; status lines update during play.
  - Files: `engine/cues.js`, `readouts.js`, tests. Size S.
- [ ] **10. Compass heading (D45) and legs.** Start heading in compass degrees, default 000 (TS2); continuing a leg fills in the compass heading; a new leg resets the rear check and breadcrumbs.
  - Acceptance: 090 flies east; the pinned runs still match V6 when given V6's math heading; a second leg performs the rear check.
  - Files: `settings.js`, `engine/run.js`, tests. Size S.

### Checkpoint B: every timing mode flies; D41, D43, D44, D45 and D74 each have their own commit and test. PR B.

## Phase 3: offset box, errors and layers (PR C)

- [ ] **11. Offset box and rear element check, pinned.** `offsetFrontElementOrder` (966), `simulateDelayedTurnFinalPos` (946), `searchDelayToTarget` (979), `computeOffsetBoxPlan` (994), `rearCheckConfig`, `stepRearCheckTurn` (1533 to 1569). Offset-box controls and the rear check shown only with the offset box, with a live status line.
  - Acceptance: golden match for the offset box × delayed 90/45 × right/left × LATE/EARLY, with and without the rear check.
  - Files: `engine/plan.js`, `engine/rear-check.js`, `layout.js`, tests. Size M.
- [ ] **12. Aircraft errors, dragging and the other layers, then D42 and D48.** Aircraft errors panel; drag before Play (with follow lead working); clock marks, breadcrumbs, NM. Then D42 (wide/tight from Lead) and D48 (#2's side, default left) as two commits.
  - Acceptance: after D42, "Wide 1,000 ft" moves each wingman 1,000 ft further from Lead on its own side; after D48, the side setting mirrors #2 only.
  - Files: `engine/formation.js`, `layout.js`, `view.js`, tests. Size M.

### Checkpoint C: every V6 feature kept by the spec is on screen; D42 and D48 landed. PR C.

## Phase 4: profiles, CSV and sign-off (PR D)

- [ ] **13. Profiles and CSV.** Named profiles and the startup default over `app.storage`, checked field by field on load; confirm before overwrite, delete and factory reset; factory reset without reloading. CSV of the whole run by 0.05 s.
  - Acceptance: a profile with errors, a rear check, dragged positions and a custom turn angle round-trips exactly; storage blocked still works (#33); a tampered profile is refused field by field.
  - Files: `profiles.js`, `engine/run.js` (CSV rows), `layout.js`, tests. Size M.
- [ ] **14. Browser tests, performance, checklist, README.** `tests/e2e/turn-sim.spec.js` (spec's list), performance log at 4× with all layers, `docs/checklists/turn-sim.md`, module README.
  - Acceptance: the e2e suite passes; 60 fps target met or the gap logged; checklist ready for Patrick or Dad.
  - Files: `tests/e2e/turn-sim.spec.js`, `docs/checklists/turn-sim.md`, `src/modules/turn-sim/README.md`. Size M.

### Checkpoint D: success criteria in the spec met; checklist handed to Patrick.
