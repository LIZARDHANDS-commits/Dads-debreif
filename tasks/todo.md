# Task List: Completing Slice 7 (The Real Architectural Solution)

## Phase 1: Native Aim & Continuous Turning Rejoin

### Task 1: Native Line & Canopy-X Aim Point Generation in `tracker.js`

**Description:** Extend `aimOf` to natively evaluate `ph.kind === 'line'` and `ph.kind === 'x'` in world coordinates, providing target position and velocity directly to `headingBank` and `closureOf`. Remove `bankOwn`, `aCmdOwn`, `floorThrOwn`, and `extraSlowKtpsOwn` bypass hooks from `tracker.js`.

**Acceptance criteria:**
- [x] `aimOf` computes the line intercept point and velocity in the world frame given line angle, side, and capture distance.
- [x] `aimOf` computes the canopy-X visual intercept aim point (Lead held at 45° off tail).
- [x] `headingBank` natively commands bank angle with Lead turn feedforward and bank capping, without requiring any external `bankDeg` override.
- [x] Native arrival and advance in `isIn` for line and canopy-X phases.
- [x] Unit tests for transitions and formation-moves pass cleanly (11/11 pass).

**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/transitions.test.js tests/unit/turn-sim/formation-moves.test.js`
- [x] Build succeeds: `node --check src/modules/turn-sim/live/tracker.js`

**Dependencies:** None  
**Files likely touched:**
- `src/modules/turn-sim/live/tracker.js`
- `tests/unit/turn-sim/tracker.test.js`

**Estimated scope:** Medium (2 files)

---

### Task 2: Turning Rejoin as a Single Continuous Phase Sequence (`turning-rejoin.js`)

**Description:** Refactor `planTurningRejoin` and `flyTurningRejoinWith` to build and execute a single continuous tracker phase array `[phase(lineAim, ...), ...closePhases]`. For FW rejoins, ease bank cap toward Lead's bank (-30°) within 1,000 ft / 30°–45° sweep to null angular rate and avoid blowing through the cone. For close rejoins, run canopy-X phase into wing-plane ease and close-in legs. Eliminate `flyTurningLine` and procedural `flyOnTheX`.

**Acceptance criteria:**
- [x] HOTRJ to FW executes in a single continuous tracker flight with zero stitched handovers.
- [x] #2's peak bank during FW arrival does not spike to -81.5° (stays <= 50°).
- [x] #2 settles inside the Fighting Wing cone (500–1,000 ft, 30°–60° sweep) without blowing through the 60° rear boundary.
- [x] Settling time to in-position drops from >62 s to <25 s.
- [x] Procedural `flyOnTheX` loop is completely removed.

**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/formation-moves.test.js` (hot turning rejoin passes cleanly)
- [x] Manual check: verify cone capture and bank <= 50° on `change:fw`.

**Dependencies:** Task 1  
**Files likely touched:**
- `src/modules/turn-sim/live/turning-rejoin.js`
- `src/modules/turn-sim/live/rejoin-law.js`

**Estimated scope:** Medium (2 files)

---

### Task 3: Straight-Ahead Rejoin as a Single Continuous Phase Sequence (`straight-rejoin.js`)

**Description:** Refactor `planStraightRejoin` and `flyStraightRejoinWith` to build a single continuous phase array (full power cut to six line, line run-up & 500 ft vector point, route flow-through). Eliminate `flyToDecision` and procedural concatenation `[...part.points, ...run.points]`.

**Acceptance criteria:**
- [x] SARJ executes as a single continuous tracker flight.
- [x] #2 cuts toward Lead's six line, holds speed target, and vectors smoothly to the echelon/route slot.
- [x] Handover concatenation `[...part.points, ...run.points]` is completely removed.
- [x] Unit tests for straight-ahead rejoin pass 100%.

**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/transitions.test.js`
- [x] Regression check across AI, Instructor, and Student rates.

**Dependencies:** Task 1  
**Files likely touched:**
- `src/modules/turn-sim/live/straight-rejoin.js`

**Estimated scope:** Small (1 file)

---

### Checkpoint 1: Single Continuous Tracker Rejoins Verified
- [x] `runTracker` contains zero bypass hooks (`bankOwn`, `aCmdOwn`).
- [x] Both turning rejoin and straight-ahead rejoin execute as single continuous tracker flights.
- [x] HOTRJ to FW settles inside the cone in <25 s without blowing through to 75° sweep.
- [x] All unit tests pass: `node --test tests/unit/turn-sim/`.

---

## Phase 2: Planner Retirement & Tactical Vertical Harmonization

### Task 4: Retire Standalone `echelon-to-fw.js` & `open-out.js` into Tracker Recipes

**Description:** Migrate drop-back and sweep maneuvers of `echelon-to-fw.js` and full-power dive of `open-out.js` into standard tracker recipes in `recipes.js`. Update `chooser.js` to race tracker recipes directly under standard technique cards, and delete both legacy standalone files.

**Acceptance criteria:**
- [x] Echelon to FW is flown by tracker recipe (`sweepOut` with `fwGoal`) in ~10–12 s.
- [x] Opening out at full power is flown by tracker recipe (`openOut` with `energyIntent: 'gain'`).
- [x] `src/modules/turn-sim/live/echelon-to-fw.js` is deleted.
- [x] `src/modules/turn-sim/live/open-out.js` is deleted.
- [x] `chooser.js` cleanly races named techniques backed by tracker phases.

**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/*.test.js`
- [x] Grep verification: `git grep "echelon-to-fw"` and `git grep "open-out"` return zero stale imports.

**Dependencies:** Task 2  
**Files likely touched:**
- `src/modules/turn-sim/live/recipes.js`
- `src/modules/turn-sim/live/chooser.js`
- Delete: `src/modules/turn-sim/live/echelon-to-fw.js`
- Delete: `src/modules/turn-sim/live/open-out.js`

**Estimated scope:** Medium (4 files)

---

### Task 5: Harmonize Tactical Vertical Kinematics (`moves.js` / `tracker.js`)

**Description:** In `moves.js`, split `KINEMATIC.verticalFtps` into close formation (15 ft/s = 900 fpm) vs. tactical formation (45 ft/s = 2,700 fpm). Update `tracker.js` (`heightOf`) to apply the appropriate rate limit based on formation context, and coordinate lateral and vertical phase durations so #2 arrives across and vertically at the same time.

**Acceptance criteria:**
- [x] In tactical formations (FW and LAB), vertical altitude adjustments use realistic tactical rates (40–50 ft/s).
- [x] Close formations (echelon, route, astern) retain safety-calibrated 15 ft/s rate limits.
- [x] Position changes in FW and LAB achieve synchronized lateral and vertical arrival without lingering vertical drift.
- [x] Zero bubble violations (< 500 ft) or G limit exceedances.

**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/`
- [x] Flight set runner: `node "Pat's claude work/turn-sim-review/fset.mjs" .` executes all 57 presses cleanly.

**Dependencies:** Task 2, Task 4  
**Files likely touched:**
- `src/modules/turn-sim/live/moves.js`
- `src/modules/turn-sim/live/tracker.js`
- `src/modules/turn-sim/live/recipes.js`

**Estimated scope:** Small to Medium (3 files)

---

### Checkpoint 2: Final Verification & Sign-Off
- [ ] All 57 flight set presses pass cleanly with no safety violations.
- [ ] HOTRJ to FW and SARJ are verified in the live browser (`http://localhost:5174/#/turn-sim`).
- [ ] Station changes in FW and LAB show synchronized, authentic T-6A lateral and vertical kinematics.
- [ ] Entire test suite passes 100%.
