# Turn Fight: tasks

Spec approved by Patrick on 2026-09-30. See [`plan.md`](plan.md), [`SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md), and master plan [`turn_fight_completion_plan.md`](file:///C:/Users/patri/.gemini/antigravity/brain/38b8f170-9ed5-4022-a9fb-683e79d5cd7e/turn_fight_completion_plan.md).

**Streamlined build & Governance Rules:**
- V6 Decoupling (D368/D372): Baseline is standard aerodynamics and 15 Wing Moose Jaw flight manuals (`../manuals/`). Zero runtime `eval()` or bit-exact float matching.
- Pilot Domain Tolerances (D369/D371): Airspeed $\pm10$ kt, Alt $\pm100$ ft, Angles $\pm5^\circ$, G $\pm0.5$ G, Turn Rate $\pm2.5^\circ$/s.
- Milestone 2 Scope: Normal unit and Playwright tests only; no mutation runs. Gate 2 sign-off pauses for Patrick upon full verification.

**Where it stands:** Tasks 1–7 and the Energy Engine (8–9) are on `main` (through #235). Remaining: Task 10 (Energy Mode UI, Tactical 3D Suite, Elimination of Traps 1–8, and Master Documentation Synchronization).

---

## Tasks 1–7: Simple Mode Baseline (Merged on main)

- [x] **1. The fight (`sim.js`).** (#141) `createFight(setup)` and `stepFight(state, dtSec)` in whole 0.02 s steps.
- [x] **2. Readouts.** (#141) Result and More detail lines from fight state, built as text.
- [x] **Checkpoint A:** tests pass; PR A merged.
- [x] **3. The screen and playback.** (#145) Three columns, setup controls, playback controls, Space and Home shortcuts.
- [x] **4. The top-down view.** (#145) Grid, trails every 0.1 s, MERGE mark, first nose-on line.
- [x] **5. The extras.** (#145) First nose chases, Climb and dive with pitch boxes and side view.
- [x] **Checkpoint B:** tests pass; PR B merged.
- [x] **5b. 2D/3D switch and 3D view.** (#145) `view3d.js` on Three.js; CT-156 Harvard II 3D model; camera presets.
- [x] **6. Decided changes (Q48 to Q51).** (#219) "Both" tie (Q48); weighted start (Q49); simplified label (Q50); 3D ATA (Q51).
- [x] **6b. Start geometry and altitudes (R28).** (#219) Range, off-nose angle, aspect angle, pass detection.
- [x] **7. Polish and sign-off checklist.** (#219) Fallback handling, `docs/checklists/turn-fight.md`.
- [x] **Checkpoint C:** PR C merged.

---

## Tasks 8–9: Energy Mode Engine (Merged on main)

- [x] **8-9. T-6A performance model and point-mass step.** (#209, #227, #235) `energy-sim.js` (1,360 lines): point-mass 3D aero model, full torque, thrust minus drag from turn charts, MPT capture at 160 KIAS, `evenFight`.

---

## Task 10: Energy Screen, Tactical 3D Suite & Trap Remediation (PR 4 / Milestone 2)

- [x] **10.1 Clean branch integration & CRLF normalization.**
  - Merge `origin/handover/turn-fight-energy-screen` (`226729d`) using `-Xignore-space-change`.
  - Normalize line endings to LF across all 16 staged files to prevent phantom git diffs.
  - Acceptance: 497 unit tests passing, exactly 3 failing (corresponding to paused WIP hooks).

- [x] **10.2 Aero limits, MPT range calibration & test repair (Traps 4, 5, 7, D393).**
  - Point `topKiasAt(altFt)` in `src/modules/turn-fight/state.js` directly to `energyTopKias(altFt)` from `energy-sim.js:55` (Mach 0.67 corner, 269 kt at 25k ft).
  - Align refusal note: `"(269 KIAS in the model, Mach 0.67; the NFM's 279 is the same Mach on the gauge)"`.
  - Enforce MPT range 125–175 KIAS in `state.js` (D349).
  - Enforce D381 in `energy-sim.js:110, 113` and `state.js`: update `immelmannMinTopKias` and `splitSBelowKias` to 140 kt (prohibit Immelmann $\le 140$ KIAS).
  - Enforce D393 in `energy-sim.js:832` (`controlImmelmann`): pull 5.0 G until at stick shaker, then ride the shaker (`Math.min(5.0, ctx.shaker)`).
  - Rename `v6Defaults()` to `standardDefaults()` in `src/modules/turn-fight/state.js:313` with `export const v6Defaults = standardDefaults;` alias (D384).
  - Update test expectations in `tests/unit/turn-fight/energy-layout.test.js:34` (125 to 175 KIAS) and `tests/unit/turn-fight/energy-state.test.js:99, 196`.
  - Acceptance: `node --test tests/unit/turn-fight/energy-*.test.js` passes 100% green (all 500 tests pass).

- [x] **10.3 Engine setup error containment & playback robustness.**
  - In `src/modules/turn-fight/state.js:292` (`startEnergyRun`), verify `isSetupError` / `setupErrorText` catches setup `RangeError` (message starting `"Turn Fight energy setup: "`) and populates `energyProblem`.
  - Ensure any non-setup `RangeError` is rethrown cleanly without suppression.
  - Add unit tests in `tests/unit/turn-fight/energy-state.test.js` verifying setup error capture and unexpected error rethrow.

- [x] **10.4 Simple Mode aerodynamic & kinematic traps remediation (Traps 1, 2, 3, 8).**
  - **10.4a (Trap 1 - Coordinate Snap):** In `sim.js:337`, remove `if (state.headOn) { blue.xFt = 0; ... }`. Allow continuous mathematical positions through the pass.
  - **10.4b (Trap 2 - Mutual Pursuit):** In `sim.js:348-352`, assign chase steering only to the first-nose winner (`state[first]`). Loser continues defensive turn geometry instead of mutual head-on steering.
  - **10.4c (Trap 3 - D386 10° Capture Cone):** In `sim.js:102-120`, implement D386: evaluate line-of-sight with an explicit **10° elevation capture cone** when vertical fight is active.
  - **10.4d (Trap 8 - Head-On Bypass):** In `sim.js:276` (`checkNoseAtStart`), update guard to: `if (state.firstNose) return; if (state.headOn && !state.setup.vertical) return;`.

- [x] **10.5 UI scrubbing & standard defaults (Trap 6 & polish).**
  - **10.5a (Trap 6 - V6 Scrubbing):** In `layout.js:150`, relabel button `'Head-on (V6)'` to `'Neutral Head-on'` (D368/D372).
  - **10.5b (D384):** Relabel Reset buttons to **"Reset to Standard Defaults"** (loading 15 Wing SMM 3.0 G standards).
  - **10.5c:** In `readouts.js`, label More detail time row `"Time since the turns started"` when turns start at once or without a pass mark.
  - **10.5d:** In `layout.js`, grey out Red's height input when Climb & Dive is disabled.

- [x] **10.6 Tactical 3D Suite implementation (D392).**
  - **10.6a:** Export pure helpers `computePlumbGeometry(pose, floorZ)` and `computeFloorZ(fight, bounds)` in `src/modules/turn-fight/view3d.js`.
  - **10.6b:** Construct Blue (`#58a6ff`) and Red (`#ff6b6b`) vertical plumb lines using `THREE.Line` with `THREE.LineDashedMaterial` (`dashSize: 20, gapSize: 15, opacity: 0.65`). Call `computeLineDistances()` on each frame.
  - **10.6c:** Construct Blue and Red 35-ft ground-shadow contact discs using `THREE.Mesh` with `THREE.RingGeometry(0, 35, 32)` and `THREE.MeshBasicMaterial` (`opacity: 0.35, depthWrite: false`) positioned at $(x, y, floorZ + 1.0\text{ ft})$.
  - **10.6d:** Reference floor logic: tracks terrain grid floor in Simple Mode, and **Hard Deck** (`hardDeckFt`) in Energy Mode (plunges to 0 ft MSL if hard deck breached).
  - **10.6e:** Clean geometry and material disposal in `teardown()`.
  - **10.6f:** Add unit tests in `tests/unit/turn-fight/view3d.test.js` validating plumb line geometry, uniform dash cadence, and hard deck tracking.

- [x] **10.7 Playwright E2E stabilization.**
  - Update MPT hint assertion to `'125 to 175 KIAS, default 160 KIAS.'` (D349).
  - Update `'Head-on (V6)'` locator assertions to `'Neutral Head-on'` (D368/D372).
  - Make `resetDefaults` locator case-insensitive (`/Reset to (Standard|V6) defaults/i`).
  - Add `{ intervals: [50] }` to the forced Split S polling assertion to prevent timing flakiness.
  - Ensure assertions evaluate within pilot domain tolerances (D369/D371).

- [x] **10.8 Full verification suite run.**
  - `node --test "tests/unit/turn-fight/**/*.test.js"`: 504 passed, 0 failed.
  - `npm run typecheck`: passed cleanly (0 errors).
  - `npm run build`: passed cleanly (dist created, size budgets kept).
  - `npx playwright test tests/e2e/turn-fight.spec.js`: 67 passed, 0 failed.
  - Formal report [`docs/records/verification/turn-fight-verification.md`](../../docs/records/verification/turn-fight-verification.md).

- [x] **10.9 Master documentation synchronization (9-file ledger).**
  - [x] 1. `HANDOVER.md`: Update Turn Fight state to 100% complete; advance active focus to Turn Sim (Milestone 3).
  - [x] 2. `docs/handover/turn-fight.md`: Update status to 100% Complete; record passing tests.
  - [x] 3. `docs/checklists/turn-fight.md`: Update Section 8 (Checkpoint D); replace V6 labels with SMM standards; add D381, D384, D386, D392, D393.
  - [x] 4. `docs/REMEDIATION_ROADMAP.md`: Mark Milestone 2 tasks 2.1, 2.2, 2.3 complete `[x]`; mark Gate 2 READY.
  - [x] 5. `docs/REMEDIATION_PATCH_LOG.md`: Append PATCH-024 ("Energy Screen & Tactical 3D Suite"), PATCH-025 ("Combat Pursuit Default D403"), PATCH-026 ("Azimuth Acquisition across Vertical Separation D404"), PATCH-027 ("Pilot Stall Authority Loss D405").
  - [x] 6. `tasks/turn-fight/todo.md` & `tasks/turn-fight/plan.md`: Mark 100% complete.
  - [x] 7. `specs/SPEC-turn-fight.md`: Update tolerances, reset button labels, and ratified decisions.
  - [x] 8. `docs/records/decisions-log.md` & `docs/records/plan-decisions.md`: Record D401 (Tactical Plumb Lines & Ground Shadows), D402 (Immelmann Pull G Law), D403 (chaseAfterHeadOn Default), D404 (3D Azimuth Acquisition), D405 (Pilot Stall Authority Loss).
  - [x] 9. `docs/records/verification/index.md`: Register verification report.

- [x] **10.10 Checkpoint D & Patrick's Gate 2 Sign-Off Readiness.**
  - READY FOR PATRICK. Manual checklist walkthrough at `docs/checklists/turn-fight.md`.

---

## Remediation Plan v2 (Post-Audit Ratified Tasks)

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md). Plan: [`plan.md`](plan.md).
Master Plan: [`turn_fight_remediation_v2.md`](file:///C:/Users/patri/.gemini/antigravity/brain/38b8f170-9ed5-4022-a9fb-683e79d5cd7e/turn_fight_remediation_v2.md).

- [x] **11. Phase 1: Flight Math — Immelmann G-Law (D407).**
  - [x] 11.1 Update `MANEUVER_PULL_G = 5` in `src/modules/turn-fight/energy-sim.js:66` (Harvard II routinely pulls 5 G in tactical maneuvers) and guard rolling G with `T6A_LIMITS.rollingMaxG = 4.7`. (Completed; clean authentic physics).
  - [x] 11.2 Update unit tests in `tests/unit/turn-fight/energy-sim.test.js` to assert 5.0 G maneuver pull within pilot domain tolerances (D371) and 4.7 G rolling limits. (Completed; all 185 tests green).

- [x] **12. Phase 2: Engagement Logic — D386, Ghost Pursuit, Schema, Altitude Gate (D408/D410).**
  - [x] 12.1 Wire D386 `isNoseOn()` into `src/modules/turn-fight/sim.js:checkFirstNose()`: activate the 10° elevation capture cone for Simple Mode Climb/Dive merges.
  - [x] 12.2 Implement D386 elevation cone in `src/modules/turn-fight/energy-sim.js:isAcNoseOn()`: evaluate azimuth $\le 5^\circ$ AND elevation $\le 10^\circ$ across altitude differences.
  - [x] 12.3 Fix ghost pursuit in `src/modules/turn-fight/energy-sim.js:1303-1311`: assign pursuit steering strictly to winner (`!both`) when altitude separation fallback triggers pursuit.
  - [x] 12.4 Dynamic altitude separation gate: update `setup.blueAltFt !== setup.redAltFt` to dynamic check `Math.abs(state.blue.zFt - state.red.zFt) >= 100` (D371).
  - [x] 12.5 Standardize `firstNose` schema across both modes: unify on `{ by: 'both' }` pattern; update `src/modules/turn-fight/readouts.js:45` to check `mark.by === 'both'`.

- [x] **13. Phase 3: Display & Readouts.**
  - [x] 13.1 Fix inverted Aspect Angle calculation in `src/modules/turn-fight/readouts.js:113` (`180 - ataDeg(state, other, from)`).
  - [x] 13.2 Add Aspect Angle row to Energy Mode readouts table in `src/modules/turn-fight/energy-readouts.js`.
  - [x] 13.3 Add API key adapter in `src/modules/turn-fight/playback.js` / `state.js` mapping Simple Mode keys (`startAtaDeg`, `startAaDeg`, `turnsAt`) to Energy Mode keys (`ataDeg`, `aaDeg`, `turnsStart`).
  - [x] 13.4 Remove residual user-facing V6 text references in `src/modules/turn-fight/layout.js:215` and `geometry.js:150`; tighten test regex in `tests/e2e/turn-fight.spec.js:17`.

- [x] **14. Phase 4: UI Labels & Mode Descriptions (D409).**
  - [x] 14.1 Rename modes with one-line descriptions in `src/modules/turn-fight/layout.js`: "Turn Circle Geometry" vs. "BFM Energy Fight".
  - [x] 14.2 Add bank angle readout derived from G ($\phi = \arccos(1/G)$) to Geometry Mode readouts table.
  - [x] 14.3 Update 1-circle / 2-circle help text per BFM doctrine: Rate Fight (2-circle) vs. Radius Fight (1-circle).
  - [x] 14.4 Relabel `chaseAfterHeadOn` to "Chase from head-on" in More Settings with one-line tooltip.

- [x] **15. Phase 5: Documentation Sync & Verification.**
  - [x] 15.1 Record decisions D406–D411 in `docs/records/decisions-log.md` and `docs/records/plan-decisions.md`.
  - [x] 15.2 Update `docs/handover/turn-fight.md`, `HANDOVER.md`, and `.agent/memory/handoff.md`.
  - [x] 15.3 Run full verification: `npm test` (all 3,046 pass), `npm run typecheck` (0 errors), `npm run build` (clean in 502ms).

---

## Remediation Plan v3: Tactical AI Maneuver Selection Engine (Tasks 16–20)

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md). Plan: [`plan.md`](plan.md).
Design Ratification: `/grill-me` alignment with Patrick (2026-10-02).

- [x] **16. Task 16: Predictor Synchronization & Exit Traps Neutralization.**
  - [x] 16.1 Synchronize `judge()` in `src/modules/turn-fight/energy-sim.js:noseOnSec`: evaluate `onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you)`.
  - [x] 16.2 Optimize dry-run step: evaluate tactical pursuit breakout in lookahead; mirror `pursuit === 'none'` guard in `shouldPursueTactical`.
  - [x] 16.3 Fix rollout exit traps: In `controlImmelmann` and `controlSplitS`, set `c.next = 'mpt'` instead of `c.next = 'pick'`, transitioning `ac.move = 'mpt'` to prevent violent slice snapping and Split S dive loops.

- [x] **17. Task 17: Candidate Generation & Tactical Utility Scoring Engine.**
  - [x] 17.1 Implement `getFeasibleMoves(ac, setup)` with authentic Harvard II operational envelopes (Immelmann $\le 316$ kt, Pitch Back 150–260 kt, Slice 90–175 kt, Split S 86–140 kt, MPT always).
  - [x] 17.2 Implement `pickTacticalMove(state, who, lookaheadSec)`: rank candidate trajectories by earliest victory ($T_{\text{win}}$), tactical advantage differential ($\Delta Adv$), and specific energy ($H_e$).
  - [x] 17.3 Generate structured explanation string (`why`) articulating tactical justification for the chosen maneuver.

- [x] **18. Task 18: UI Integration & Settings Wiring.**
  - [x] 18.1 Add `'tactical'` to `ENERGY_MOVES` in `src/modules/turn-fight/energy-sim.js` and `state.js` while preserving `'auto'` as textbook baseline.
  - [x] 18.2 Dispatch to `pickTacticalMove` in `src/modules/turn-fight/energy-sim.js:chooseFirstMove` when move is `'tactical'`.
  - [x] 18.3 Add `'Tactical AI (Dynamic Utility)'` to Blue/Red move dropdowns in `src/modules/turn-fight/layout.js`.
  - [x] 18.4 Add `tacticalLookaheadSec` control (10–45 s, default 20 s) to "Model settings for checking" in `src/modules/turn-fight/layout.js`.
  - [x] 18.5 Display tactical choice rationale and score breakdown in `src/modules/turn-fight/energy-readouts.js` / Result view.

- [x] **19. Task 19: Mid-Fight Opportunity Re-evaluation in `controlMpt`.**
  - [x] 19.1 Add throttled re-evaluation cadence (every 3–4 s in MPT) for aircraft in `'tactical'` mode.
  - [x] 19.2 Trigger maneuver breakout into Pitch Back or Slice when opportunistic positional advantage arises.
  - [x] 19.3 Enforce hysteresis lockout timer (minimum 4 s) to prevent state fluttering or rapid bank reversals.

- [x] **20. Task 20: Verification, Test Harmonization & Gate 2 Sign-Off.**
  - [x] 20.1 Add dedicated unit test suite `tests/unit/turn-fight/energy-tactical.test.js` validating envelopes, ranking, exits, and MPT breakout.
  - [x] 20.2 Harmonize legacy test assertions under D371/D411 pilot domain tolerances without microsecond trajectory locking.
  - [x] 20.3 Full verification: `npm test` (all 3,174 pass), `npm run typecheck`, `npm run build`, and Playwright E2E.
  - [x] 20.4 Synchronize documentation (`decisions-log.md`, `plan-decisions.md`, `HANDOVER.md`, `turn-fight.md`, `REMEDIATION_ROADMAP.md`).




---

## Remediation Plan v4: Tactical AI Anti-Stalemate, 3D Dynamic Centroid Tracking & UI Streamlining (Tasks 21–26)

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md). Plan: [`plan.md`](plan.md).  
Design Ratification: `/grill-me` alignment with Patrick (2026-10-02, Decisions D420–D424).

- [x] **21. Task 21: Breaking the MPT Trap & Circle-Cutting BFM Maneuvers (Low & High Yo-Yo).**
  - [x] 21.1 Preserve textbook SMM profile for `'auto'` while empowering `'tactical'` mode with dynamic opportunity re-evaluation (`if (forced === 'tactical')`).
  - [x] 21.2 Implement `lowYoYo` and `highYoYo` candidate generation in `getFeasibleMoves` and flight controllers in `energy-sim.js`.
  - [x] 21.3 Implement cumulative MPT turn angle tracking (`c.mptTurnDeg`) and apply $25\%$ utility penalty after $> 360^\circ$ of turn without ATA closure.
  - [x] 21.4 Loosen pursuit breakout threshold in `shouldPursueTactical` to $\text{ATA} < 65^\circ$ when $\Delta\text{Adv} > 0.15$.

- [x] **22. Task 22: Combat Resolution — WEZ Gun Kill Solution & Tactical Freeze.**
  - [x] 22.1 Implement WEZ Gun tracking detection in `energy-sim.js` (in Control Zone, $\text{ATA} < 15^\circ$, Range $< 2,500\text{ ft}$ for $2.0\text{ s}$ continuous tracking).
  - [x] 22.2 Add auto-pause on kill event in `index.js`, prominent victor banner in HUD, and 1-click "Continue Engagement" and "Reset" buttons.
  - [x] 22.3 Wire victor announcement to `energy-readouts.js`.

- [x] **23. Task 23: Dynamic 3D Centroid Camera & Displaced HUD Data Tags.**
  - [x] 23.1 Implement dynamic centroid camera tracking in `view3d.js`: center camera on $(\vec{P}_{\text{blue}} + \vec{P}_{\text{red}})/2$ with adaptive distance framing.
  - [x] 23.2 Offset aircraft data tags in `turn-fight.css` and `view3d.js` with $+30\text{ px}$ elevation and $+40\text{ px}$ lateral leader line so aircraft models are never covered.
  - [x] 23.3 Render 3D lift vector arrows and $15^\circ$ WEZ aiming cone in `view3d.js`.

- [x] **24. Task 24: Geometry Re-Baselining & 1-Click Tactical Engagement Presets.**
  - [x] 24.1 Re-baseline default `separationNm` from 2.0 NM to 1.2 NM and default `startAtaDeg = 5°` (750 ft lateral turning room) in `state.js`.
  - [x] 24.2 Implement 1-click "Tactical Scenario" dropdown in `layout.js` (Neutral Merge, Offensive Perch, Defensive Break, Energy vs. Angles, Radius vs. Rate).
  - [x] 24.3 Wire preset handler in `index.js` / `state.js` updating speeds, altitudes, and geometry simultaneously.

- [ ] **25. Task 25: UI Bloat Pruning, Mode Architecture & Progressive Disclosure (R22).**
  - [ ] 25.1 Default `energy: true` in `state.js` so the module opens directly into 3D BFM Energy Fight.
  - [ ] 25.2 Retire arcade "Climb and dive" from Simple Mode; standardize Simple Mode as clean flat 2D turn circle geometry.
  - [ ] 25.3 Move 16 checking parameters out of student menu into developer debug panel (`?debug=aero`).
  - [ ] 25.4 Consolidate move dropdowns into `Tactical AI (Dynamic Pilot)` [Default], `Textbook SMM Auto`, and `Manual Override`.

- [ ] **26. Task 26: Test Suite Harmonization & Documentation Ratification.**
  - [ ] 26.1 Update unit tests in `tests/unit/turn-fight/` for new defaults (1.2 NM, tactical default, kill auto-pause, presets).
  - [ ] 26.2 Update Playwright E2E tests in `tests/e2e/turn-fight.spec.js` asserting regex telemetry patterns.
  - [ ] 26.3 Full verification: `npm test` (all 3,174+ pass), `npm run typecheck` (0 errors), `npm run build` (clean).
  - [ ] 26.4 Record decisions D420–D424 in `docs/records/decisions-log.md` and `docs/records/plan-decisions.md`.
  - [ ] 26.5 Update `docs/handover/turn-fight.md`, `HANDOVER.md`, and `docs/REMEDIATION_ROADMAP.md`.
