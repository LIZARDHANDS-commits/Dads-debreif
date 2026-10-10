# Task List: Turning Rejoin (TRJ) MAX Throttle & Expeditious Fighting Wing Entry

## Phase 0: Baseline Verification Matrix & Instruments (Observation 0053 Compliance)

### Task 0: Create Rejoin Verification Matrix & Instrument Suite

**Description:** Build an automated measurement script (`tests/turn-sim/rejoin-matrix.mjs`) that exercises all 7 rejoin scenarios and measures duration, initial throttle (t=0 to 3s), minimum range to Lead, peak G, min KIAS, and settlement error. Record baseline numbers prior to making flight modifications, and confirm that the instrument correctly flags the current defective behavior (Line Abreast to FW running `hardSec: 8` with `IDLE+BOARDS`).

**Acceptance criteria:**
- [x] Test harness script runs all 7 rejoin scenarios programmatically via `trackTwice` / `flyTurningRejoinWith`.
- [x] Script outputs structured JSON/markdown table with duration, initial power profile, min range, and settle status.
- [x] Baseline metrics recorded and saved for comparison.
- [x] Deliberate test confirms the gauge detects premature idle/boards and sluggish rejoins.

**Verification:**
- [x] Harness executes cleanly: `node tests/turn-sim/rejoin-matrix.mjs`
- [x] Report displays baseline metrics for all 7 scenarios without errors.

**Dependencies:** None
**Files likely touched:**
- `tests/turn-sim/rejoin-matrix.mjs` (new file)

**Estimated scope:** Small (1 file)

---

### Checkpoint 0: Baseline Frozen
- [x] Baseline metrics captured for all 7 scenarios.
- [x] Confirmation that instrument correctly measures throttle, closure, and settle precision.

---

## Phase 1: Engine & Tripwire Fixes

### Task 1: Wire `initialPclMax` & Revise `pclMaxActive` Tripwires in `tracker.js`

**Description:** Ensure that `initialPclMax` is passed into the tracker phase objects in `turning-rejoin.js`, and revise the tripwire logic in `tracker.js:828-835`. Specifically, do not cancel `pclMaxActive` when `W.kias >= 220` if starting from Line Abreast at 220 KIAS. In `tracker.js:483`, ensure `energyIntent === 'gain'` commands `aWant = Infinity` (MAX throttle) regardless of whether airspeed is at or near the 200 KIAS floor.

**Acceptance criteria:**
- [x] `turning-rejoin.js` passes `initialPclMax` into the phase array for both `to === 'fw'` and `to === 'echelon'` / `onX`.
- [x] `tracker.js:821-835` activates and sustains `pclMaxActive` during initiation.
- [x] `W.kias >= 220` does not immediately kill `pclMaxActive` at $t=0$ when initiating from Line Abreast.
- [x] `tracker.js:483` sets `aWant = Infinity` when `energyIntent === 'gain'`, commanding 100% torque (`pilot.pclMax`).

**Verification:**
- [x] Unit check: Node simulation confirms `throttle >= 1.0` from $t=0$ through at least the initial acceleration.
- [x] Build succeeds: `node --check src/modules/turn-sim/live/tracker.js`
- [x] Build succeeds: `node --check src/modules/turn-sim/live/turning-rejoin.js`

**Dependencies:** Task 0
**Files likely touched:**
- `src/modules/turn-sim/live/turning-rejoin.js`
- `src/modules/turn-sim/live/tracker.js`

**Estimated scope:** Small (2 files)

---

### Task 2: Fix Ride Phase Speed Floor Clamp in `tracker.js`

**Description:** In `tracker.js:280-282` (`closureOf` for `ph.kind === 'ride'`), decouple the line approach speed from the rigid 200 KIAS floor when initiating with MAX throttle / `pclMaxActive`. Allow the aircraft to carry line speed (`rideKias`, 210–220 KIAS) or MAX throttle during the intercept rather than actively commanding deceleration to 200 KIAS before reaching the line.

**Acceptance criteria:**
- [x] `closureOf` does not clamp `kiasCmd` to 200 KIAS while `pclMaxActive` is true or during intercept approach.
- [x] Aircraft does not chop throttle to idle when starting at 220 KIAS from Line Abreast.
- [x] Normal line speed targets (`rideKias`, 210 KIAS for Echelon) are respected once established on the ride line.

**Verification:**
- [x] Simulation check: Airspeed stays $\ge 220\text{ KIAS}$ during initial intercept turn rather than decaying to 200 KIAS.
- [x] Build succeeds: `node --check src/modules/turn-sim/live/tracker.js`

**Dependencies:** Task 1
**Files likely touched:**
- `src/modules/turn-sim/live/tracker.js`

**Estimated scope:** Small (1 file)

---

### Checkpoint 1: Tripwires Cleared
- [x] Line Abreast rejoin starts at MAX throttle ($100\%$ torque) without initial idle or speed brake deployment.
- [x] Speed does not bleed down to 200 KIAS on initiation.

---

## Phase 2: Expeditious Fighting Wing Geometry & Cone Energy

### Task 3: Refine Fighting Wing Rejoin Geometry & Capture Gates

**Description:** In `turning-rejoin.js` and `tracker.js`, optimize the TRJ to Fighting Wing (`to === 'fw'`). Replace the rigid single-line echelon capture constraints with tactical cone intercept geometry: relax the cross-track drift rate threshold ($|\text{drift}| \le 10\text{ ft/s} \to 30\text{–}50\text{ ft/s}$), adjust `windowFt` and arrival gates, and allow smooth transition into cone tracking once within cone azimuth and range.

**Acceptance criteria:**
- [x] TRJ to Fighting Wing does not fail line capture due to high closure or cross-track drift.
- [x] Transition from approach phase to `FW_FOLLOW` occurs smoothly at the cone perimeter ($1,000\text{–}1,500\text{ ft}$ range, $30^\circ\text{–}60^\circ$ sweep).
- [x] Zero instances of candidate timeout or abort during standard Line Abreast to FW rejoins.

**Verification:**
- [x] Simulation check: TRJ to FW from Line Abreast (right turn and left turn) succeeds with `ok: true`.
- [x] Duration drops from $> 45\text{–}70\text{ s}$ to $\le 35\text{ s}$.

**Dependencies:** Task 2
**Files likely touched:**
- `src/modules/turn-sim/live/turning-rejoin.js`
- `src/modules/turn-sim/live/tracker.js`

**Estimated scope:** Small (2 files)

---

### Task 4: Cone Energy Management & Power Anticipation in FW Follow

**Description:** In `tracker.js` and `turning-rejoin.js`, ensure that when entering the cone with excess energy, #2 naturally uses vertical zoom climb (`zoomFtps` / `coneEnergy`) to trade closure for altitude within the allowable $0\text{–}200\text{ ft}$ step-down, induced drag from bank and G matching to bleed speed, and power anticipation rolling off MAX throttle smoothly inside $1,500\text{ ft}$ before settling in the cone.

**Acceptance criteria:**
- [x] #2 uses vertical zoom / step-down trade to absorb excess closure when entering the cone.
- [x] Throttle rolls off smoothly from MAX as range closes into the cone, avoiding abrupt boards or idle chops.
- [x] Aircraft settles in the SMM Fighting Wing volume: $500\text{–}1,000\text{ ft}$ range, $30^\circ\text{–}60^\circ$ sweep, $0\text{–}200\text{ ft}$ stepped down, matched speed.

**Verification:**
- [x] Simulation check: `isFwConeSettled` evaluates true at completion.
- [x] Telemetry confirms smooth throttle roll-off without speedbrake deployment.

**Dependencies:** Task 3
**Files likely touched:**
- `src/modules/turn-sim/live/tracker.js`
- `src/modules/turn-sim/live/turning-rejoin.js`

**Estimated scope:** Small (2 files)

---

### Checkpoint 2: Fighting Wing Expedited
- [x] TRJ from Line Abreast to Fighting Wing completes in $\le 35\text{ s}$ with MAX throttle initiation and zero `idleBoards`.
- [x] Settlement inside the Fighting Wing cone is clean and stable.

---

## Phase 3: Optimizer Hierarchy & Rejoin Safety Fallbacks

### Task 5: Prioritize MAX Throttle Candidates in `searchTurningRejoin`

**Description:** Restructure candidate evaluation in `src/modules/turn-sim/live/turning-rejoin.js`. Place MAX-throttle, direct-geometry candidates (`hardSec: 0`, `initialPclMax: true`) at the top of the search hierarchy. Evaluate partial-power candidates (`hardSec > 0`, `idleBoards`) only as an emergency fallback if all MAX-throttle candidates result in an unavoidable 3/9 overshoot or minimum separation violation.

**Acceptance criteria:**
- [x] `searchTurningRejoin` selects a MAX-throttle candidate (`hardSec: 0`) for all standard rejoins.
- [x] `hardPullsSec` (`idleBoards`) is only evaluated if no zero-hard-pull candidate keeps #2 behind Lead's 3/9 line.
- [x] The optimizer never chooses an idle/boards candidate when a clean MAX-throttle solution exists.

**Verification:**
- [x] Optimizer verification: `searchTurningRejoin` returns `hardSec: 0` for Line Abreast (6,000 ft) right turn and left turn.
- [x] Build succeeds: `node --check src/modules/turn-sim/live/turning-rejoin.js`

**Dependencies:** Task 4
**Files likely touched:**
- `src/modules/turn-sim/live/turning-rejoin.js`

**Estimated scope:** Small (1 file)

---

### Checkpoint 3: Optimizer Prioritization Confirmed
- [x] `searchTurningRejoin` picks `hardSec: 0` with MAX throttle for standard rejoins.
- [x] Emergency fallback remains available only for genuine overshoots.

---

## Phase 4: Full Matrix Verification & Parameter Tuning

### Task 6: Execute Full Rejoin Matrix & Verify Invariants

**Description:** Execute the automated test suite from Task 0 across all 7 rejoin scenarios. Verify that:
1. No regressions occurred in any scenario.
2. 4-Ship Turning Rejoin preserves sequencing, stack clearance, and spacing for #2, #3, and #4.
3. Straight-Ahead Rejoins and cold Fighting Wing to Echelon rejoins continue to settle cleanly.
4. Record and publish the full before/after comparison table showing exact time savings, speed profiles, and power histories.
5. Fine-tune capture windows, time on line, and established gates as required based on flight verification.

**Acceptance criteria:**
- [x] All 7 rejoin scenarios pass with `ok: true` and zero timeouts.
- [x] 4-ship rejoin settles all 4 aircraft without lane violations or mid-air conflicts.
- [x] Comparison table published showing before vs after duration, initial throttle, and peak G.
- [x] No unrelated formation maneuvers degraded.

**Verification:**
- [x] Rejoin matrix passes: `node tests/turn-sim/rejoin-matrix.mjs`
- [x] UI manual check: Open Formation sim on `http://localhost:5173/`, trigger TRJ to FW and TRJ to Echelon from Line Abreast, visually confirm smooth, aggressive MAX throttle entry and clean settle.

**Dependencies:** Task 5
**Files likely touched:**
- `tests/turn-sim/rejoin-matrix.mjs`
- `src/modules/turn-sim/live/turning-rejoin.js`
- `src/modules/turn-sim/live/moves.js`

**Estimated scope:** Medium (3 files)

---

### Checkpoint 4: Complete & Ready for Review
- [x] All 7 rejoin scenarios verified green.
- [x] Full before/after telemetry report presented to user.
- [x] User confirms visual flight behavior matches SMM doctrine.

