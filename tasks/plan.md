# Implementation Plan: Completing Slice 7 (The Real Architectural Solution)

## 1. Overview & Context

During the Phase 3 tracker migration, Slices 0 through 6 were implemented cleanly and faithfully. However, **Slice 7** collapsed into a facade:
- `rejoin-law.js` wrapped the legacy turning intercept math inside a `pursuit` callback that forced `bankDeg` and `aCmd` directly onto `tracker.js`, bypassing the tracker's native `headingBank` and `powerOf` guidance loops.
- `turning-rejoin.js` and `straight-rejoin.js` were never unified into continuous tracker phase sequences; they still execute in two fragmented stages (`part` followed by a stitched `trackTwice` hand-over).
- Standalone legacy planners `echelon-to-fw.js` and `open-out.js` were left in the codebase and are still raced by `chooser.js`.
- Tactical station changes in Fighting Wing (FW) and Line Abreast (LAB) suffer from severe lateral vs. vertical rate asymmetry (140 ft/s lateral vs. a close-formation 15 ft/s vertical cap).

This plan completes the **genuine architectural migration of Slice 7**, resolving the -81.5° bank spike, eliminating the FW cone blow-through, harmonizing tactical vertical rates, and unblocking the Phase 4 3D point-mass and optimizer engine.

---

## 2. Relevant Project Documents & Plans Cited

1. **Master Tracker-Only Migration Plan**: `C:\Users\patri\.gemini\antigravity\brain\73c96d76-a618-4f38-a4da-8f6a21d09521\tracker-only-plan.md`
   - *Slice 7 Specification (lines 238–270)*: Rejoin line, echelon-to-FW, and full-power opening out flown natively by the tracker.
   - *Phase 4 Transition (lines 272–276)*: 100% of standard moves flown by one unified controller outputting (phi, n, tau, b).
2. **Turn-Sim Master Plan & Decisions**:
   - `docs/modules/turn-sim/plan.md`: Step 6 (Tracker-Only Migration and Invariant Enforcement, lines 192–203).
   - `docs/modules/turn-sim/decisions.md`:
     - **TS-150**: All 2-ship formation changes and rejoin lines flown by the unified tracker; drawn kinematic lines deleted.
     - **TS-151**: 3D Point-Mass Guidance Law Bridge and Invariant Enforcement.
     - **TS-75**: Never below 200 KIAS unless close in and hot; settling where #2 arrives in the fighting wing cone.
     - **TS-106**: Canopy-X lock for close rejoins; window arrival at 250–100 ft, 10–20 KIAS.
3. **Fable's Architectural Review**:
   - `Pat's claude work/formation-review-package/report/lines-removal-report.md` (Sections 1.2 A & D, 6.4 C & D: Elimination of dual-planner stitching and unifying under one pilot model).
4. **Post-Slice 7 Optimizer Plan**:
   - Preserved in `tasks/optimizer-slices-8-9-plan.md` and `tasks/optimizer-slices-8-9-todo.md`.

---

## 3. Dependency Graph

```
Task 1: Native Line & Canopy-X Aim in tracker.js (aimOf)
  │     Remove bankOwn / aCmdOwn bypass hooks
  │
  ├───► Task 2: Turning Rejoin as Single Continuous Phase Sequence
  │       (Eliminate flyTurningLine & flyOnTheX; Cone bank-match blend)
  │
  ├───► Task 3: Straight-Ahead Rejoin as Single Continuous Phase Sequence
  │       (Eliminate flyToDecision; 3-phase six-line array)
  │
  ├───► Task 4: Retire echelon-to-fw.js & open-out.js
  │       (Migrate to recipes.js; delete standalone files; clean chooser.js)
  │
  └───► Task 5: Harmonize Tactical Vertical Kinematics
          (Split close 15 ft/s vs tactical 45 ft/s in moves.js & tracker.js)
```

---

## 4. Task Breakdown

### Task 1: Native Line & Canopy-X Aim Point Generation in `tracker.js`

**Description:**  
Extend `aimOf` to natively evaluate `ph.kind === 'line'` and `ph.kind === 'x'` in world coordinates, providing target position and velocity directly to `headingBank` and `closureOf`. Remove `bankOwn`, `aCmdOwn`, `floorThrOwn`, and `extraSlowKtpsOwn` bypass hooks from `tracker.js`.

**Acceptance criteria:**
- `aimOf` computes the line intercept point and velocity in the world frame given line angle, side, and capture distance.
- `aimOf` computes the canopy-X visual intercept aim point (Lead held at 45° off tail).
- `headingBank` natively commands bank angle with Lead turn feedforward and bank capping, without requiring any external `bankDeg` override.
- `bankOwn` and `aCmdOwn` bypass hooks are removed from `runTracker`.
- Unit tests for tracker aim generation pass cleanly.

**Verification:**
- Tests pass: `node --test tests/unit/turn-sim/tracker.test.js`
- Build succeeds: `node --check src/modules/turn-sim/live/tracker.js`

**Dependencies:** None  
**Files likely touched:**
- `src/modules/turn-sim/live/tracker.js`
- `tests/unit/turn-sim/tracker.test.js`

**Estimated scope:** Medium (2 files)

---

### Task 2: Turning Rejoin as a Single Continuous Phase Sequence (`turning-rejoin.js`)

**Description:**  
Refactor `planTurningRejoin` and `flyTurningRejoinWith` to build and execute a single continuous tracker phase array `[phase(lineAim, ...), ...closePhases]`.
For rejoins to Fighting Wing (`to === 'fw'`):
- As #2 closes within 1,000 ft and approaches the cone (30°–45° sweep), the bank cap smoothly eases toward Lead's bank (-30°), nulling line-of-sight angular rate.
- Handover to `fwGoal` occurs as a native phase advance (`isIn`) at the cone boundary.
For rejoins to close formation (`to !== 'fw'`):
- Phase 1 runs the canopy-X phase (`kind: 'x'`) closing to the window (250–100 ft, 10–20 kt).
- Phase 2 flows into wing-plane ease and close-in legs.
Eliminate `flyTurningLine` and completely delete procedural `flyOnTheX`.

**Acceptance criteria:**
- HOTRJ to FW executes in a single continuous tracker flight with zero stitched handovers.
- #2's peak bank during FW arrival does not spike to -81.5° (stays <= 50°).
- #2 settles inside the Fighting Wing cone (500–1,000 ft, 30°–60° sweep) without blowing through the 60° rear boundary.
- Settling time to in-position drops from >62 s to <25 s.
- Procedural `flyOnTheX` loop is completely removed.

**Verification:**
- Tests pass: `node --test tests/unit/turn-sim/transitions.test.js`
- Manual script: verify cone capture and bank <= 50° on `change:fw`.

**Dependencies:** Task 1  
**Files likely touched:**
- `src/modules/turn-sim/live/turning-rejoin.js`
- `src/modules/turn-sim/live/rejoin-law.js`

**Estimated scope:** Medium (2 files)

---

### Task 3: Straight-Ahead Rejoin as a Single Continuous Phase Sequence (`straight-rejoin.js`)

**Description:**  
Refactor `planStraightRejoin` and `flyStraightRejoinWith` to build a single continuous phase array:
1. Phase 1: Full-power cut toward Lead's six line (`STRAIGHT_AHEAD.sixFt`, -1,000 ft).
2. Phase 2: Line run-up and 500 ft vector point.
3. Phase 3: Route flow-through into the close slot.
Eliminate `flyToDecision` and procedural concatenation of `[...part.points, ...run.points]`.

**Acceptance criteria:**
- SARJ executes as a single continuous tracker flight.
- #2 cuts toward Lead's six line, holds speed target, and vectors smoothly to the echelon/route slot.
- Handover concatenation `[...part.points, ...run.points]` is completely removed.
- Unit tests for straight-ahead rejoin pass 100%.

**Verification:**
- Tests pass: `node --test tests/unit/turn-sim/transitions.test.js`
- Regression check across AI, Instructor, and Student rates.

**Dependencies:** Task 1  
**Files likely touched:**
- `src/modules/turn-sim/live/straight-rejoin.js`

**Estimated scope:** Small (1 file)

---

### Checkpoint 1 (After Tasks 1–3)
- `runTracker` contains zero bypass hooks (`bankOwn`, `aCmdOwn`).
- Both turning rejoin and straight-ahead rejoin execute as single continuous tracker flights.
- HOTRJ to FW settles inside the cone in <25 s without blowing through to 75° sweep.
- All unit tests pass: `node --test tests/unit/turn-sim/`.

---

### Task 4: Retire Standalone `echelon-to-fw.js` & `open-out.js` into Tracker Recipes

**Description:**  
Migrate the drop-back and sweep maneuvers of `echelon-to-fw.js` and the full-power opening out dive of `open-out.js` into standard tracker recipes in `recipes.js`. Update `chooser.js` to race the tracker recipes directly under standard technique cards, and delete both legacy standalone files.

**Acceptance criteria:**
- Echelon to FW is flown by tracker recipe (`sweepOut` with `fwGoal`) in ~10–12 s.
- Opening out at full power is flown by tracker recipe (`openOut` with `energyIntent: 'gain'`).
- `src/modules/turn-sim/live/echelon-to-fw.js` is deleted.
- `src/modules/turn-sim/live/open-out.js` is deleted.
- `chooser.js` cleanly races named techniques backed by tracker phases.

**Verification:**
- Tests pass: `node --test tests/unit/turn-sim/*.test.js`
- Grep verification: `git grep "echelon-to-fw"` and `git grep "open-out"` return zero stale imports.

**Dependencies:** Task 2  
**Files likely touched:**
- `src/modules/turn-sim/live/recipes.js`
- `src/modules/turn-sim/live/chooser.js`
- Delete: `src/modules/turn-sim/live/echelon-to-fw.js`
- Delete: `src/modules/turn-sim/live/open-out.js`

**Estimated scope:** Medium (4 files)

---

### Task 5: Harmonize Tactical Vertical Kinematics (`moves.js` / `tracker.js`)

**Description:**  
Resolve the severe lateral vs. vertical rate mismatch in station changes. In `moves.js`, split `KINEMATIC.verticalFtps` into close formation (15 ft/s = 900 fpm) vs. tactical formation (45 ft/s = 2,700 fpm). Update `tracker.js` (`heightOf`) to apply the appropriate rate limit based on formation context, and coordinate lateral and vertical phase durations so #2 arrives across and vertically at the same time.

**Acceptance criteria:**
- In tactical formations (FW and LAB), vertical altitude adjustments use realistic tactical rates (40–50 ft/s).
- Close formations (echelon, route, astern) retain safety-calibrated 15 ft/s rate limits.
- Position changes in FW and LAB achieve synchronized lateral and vertical arrival without lingering vertical drift.
- Zero bubble violations (< 500 ft) or G limit exceedances.

**Verification:**
- Tests pass: `node --test tests/unit/turn-sim/`
- Flight set runner: `node "Pat's claude work/turn-sim-review/fset.mjs" .` executes all 57 presses cleanly.

**Dependencies:** Task 2, Task 4  
**Files likely touched:**
- `src/modules/turn-sim/live/moves.js`
- `src/modules/turn-sim/live/tracker.js`
- `src/modules/turn-sim/live/recipes.js`

**Estimated scope:** Small to Medium (3 files)

---

### Checkpoint 2 (Final Verification & Sign-Off)
- All 57 flight set presses pass cleanly with no safety violations.
- HOTRJ to FW and SARJ are verified in the live browser (`http://localhost:5174/#/turn-sim`).
- Station changes in FW and LAB show synchronized, authentic T-6A lateral and vertical kinematics.
- Entire test suite passes 100%.

---

## 5. Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :---: | :--- |
| **Search Convergence in `searchTurningRejoin`** | Medium | The search over aims and overtakes will now evaluate single-pass tracker phases. Keep the search ranges aligned with existing step increments. |
| **Roll-out Timing Disconnect** | Low | Lead's turn duration is computed to whole-degree steps (`wholeDegree`). Tracker phases advance via `isIn` when settled. |
| **Existing Incomplete Plan Collision** | Low | Slices 8 & 9 are preserved in `tasks/optimizer-slices-8-9-plan.md` and `tasks/optimizer-slices-8-9-todo.md`. |
