# Implementation Plan: Turning Rejoin (TRJ) MAX Throttle & Expeditious Fighting Wing Entry

## Overview

This plan restores doctrinal **MAX Throttle** initiation and expeditious 3D energy management for Turning Rejoins in `src/modules/turn-sim/`, adhering strictly to Standard Maneuvering Manual (SMM) formation principles. 

Currently, Turning Rejoins from Line Abreast suffer from premature throttling to idle, speed brake deployment (`idleBoards`), and prolonged execution times because:
1. `initialPclMax` is calculated in `turning-rejoin.js` but never passed into tracker phases.
2. `pclMaxActive` in `tracker.js` trips immediately on step 0 because Line Abreast starts at 220 KIAS (`W.kias >= 220`).
3. `closureOf` in `tracker.js` clamps line approach airspeed to the 200 KIAS floor before line establishment, commanding deceleration.
4. Rigid line capture tolerances ($|\text{drift}| \le 10\text{ ft/s}$) cause zero-hard-pull candidates to fail validation, triggering a fallback to `hardSec = 8` (`idleBoards`).

This plan fixes all tripwires, makes MAX throttle the baseline default, enables direct, expeditious Fighting Wing cone intercept with 3D energy transfer (vertical zoom, G drag, and power anticipation), establishes an instrumented gauge across all 7 rejoin scenarios to guarantee zero regressions (per Observation 0053), and documents all behavioral differences.

---

## Architectural Decisions

1. **MAX Throttle by Default (Doctrinal Priority):**
   - Per SMM 12.24 & 16.20, Turning Rejoins initiate with MAX throttle to build closure immediately.
   - `searchTurningRejoin` searches MAX-throttle direct intercept candidates first. Partial throttle or speed brakes are evaluated only as a contingency if all MAX-throttle candidates result in an unavoidable 3/9 overshoot or bubble violation.

2. **Tripwire De-coupling:**
   - `initialPclMax` is passed directly to the phase definitions for both Fighting Wing and Echelon rejoins.
   - In `tracker.js`, `pclMaxActive` remains active until either:
     a) The aircraft reaches the intercept capture window or line, OR
     b) Range to Lead closes inside $1,500\text{ ft}$, OR
     c) Airspeed reaches the active Rates rejoin line speed ceiling ($\ge 235\text{ KIAS}$ or persona limit), not 220 KIAS.
   - `closureOf` for `kind === 'ride'` allows the aircraft to carry line speed or MAX throttle during the intercept rather than clamping to the 200 KIAS floor.

3. **Tactical Fighting Wing Geometry:**
   - Fighting Wing is a $30^\circ\text{–}60^\circ$ cone, $500\text{–}1,500\text{ ft}$ range, stepped down $0\text{–}200\text{ ft}$.
   - The approach to Fighting Wing does not require tracking a 1D echelon ride line at $10\text{ ft/s}$ drift. The drift rate tolerance is relaxed ($30\text{–}50\text{ ft/s}$), and the transition into cone tracking occurs smoothly as #2 enters the cone boundary.

4. **3D Energy Transfer & Power Anticipation:**
   - Excess closure upon entering the cone is absorbed naturally through:
     a) Vertical stack exchange (`zoomFtps` / `coneEnergy`) within the allowable $0\text{–}200\text{ ft}$ step-down.
     b) Turn rate and induced drag from bank and G matching.
     c) Power anticipation: rolling off MAX throttle smoothly inside $1,500\text{ ft}$ before settling in the cone.

5. **Instrumentation & Invariant Preservation (Observation 0053 Compliance):**
   - Before modifying flight logic, a verification matrix is established covering all 7 rejoin types.
   - Each scenario measures duration, initial throttle, minimum range, peak G, and settle precision.
   - Every invariant has an explicit instrument to prevent silent regressions.

---

## Rejoin Matrix: Scope & Behavioral Impact

| Rejoin Scenario | Pre-Fix Behavior | Target Post-Fix Behavior | Primary Invariant / Gauge |
|---|---|---|---|
| **1. TRJ Line Abreast $\to$ FW (Right Turn)** | Idle + boards fallback (`hardSec: 8`), 201 KIAS, >70 s or abort | MAX throttle start, direct cone drive, energy zoom, ~25–35 s | Settle in FW cone ($30^\circ\text{–}60^\circ$, 500–1000 ft), no 3/9 overshoot |
| **2. TRJ Line Abreast $\to$ FW (Left Turn)** | Idle to 200 KIAS, wide lag turn, 44 s | MAX throttle start, rapid closure, ~25–30 s | Settle in FW cone, min range $> 500\text{ ft}$ |
| **3. TRJ Line Abreast $\to$ Echelon (Right Turn)** | Sluggish capture, 200 KIAS floor clamp | MAX throttle to ride line, smooth capture, ~30–40 s | Establish on $45^\circ$ line, window arrival 10–20 kt, settle in echelon |
| **4. TRJ Line Abreast $\to$ Echelon (Left Turn)** | Sluggish capture, 200 KIAS floor clamp | MAX throttle to ride line, smooth capture, ~30–40 s | Establish on $45^\circ$ line, window arrival 10–20 kt, settle in echelon |
| **5. TRJ Fighting Wing $\to$ Echelon (Cold)** | Already starts close, nominal power | Unchanged or slight crispness increase | No overshoot, clean transition to echelon |
| **6. SARJ Trail / Six $\to$ Echelon** | Straight-rejoin law | Unchanged (already uses full power to six) | Six line capture, route/echelon flow |
| **7. 4-Ship Turning Rejoin (#2, #3, #4)** | Uses `four-rejoin.js` with `searchTurningRejoin` | #2 joins with MAX throttle; #3 and #4 maintain spacing | Stack clearance, no inter-aircraft conflicts, formation settles |

---

## Task List

### Phase 0: Baseline Verification Matrix & Instruments (Observation 0053)
- [x] **Task 0: Create Rejoin Verification Matrix & Instrument Suite**
  - Build automated verification test script covering all 7 rejoin scenarios.
  - Record pre-fix baseline metrics (time, initial throttle, min range, max G, settle precision).
  - Verify instrument catches known failures (e.g. `hardSec: 8` idleBoards).

### Checkpoint 0: Baseline Frozen
- [x] All 7 rejoin baseline numbers captured and logged.
- [x] Failure detection verified on known-bad configurations.

### Phase 1: Engine & Tripwire Fixes
- [x] **Task 1: Wire `initialPclMax` & Revise `pclMaxActive` Tripwires in `tracker.js`**
  - Pass `initialPclMax` into `phases.push(...)` in `turning-rejoin.js`.
  - Fix `atSpeed` tripwire in `tracker.js:831` (do not abort at 220 KIAS for LAB start).
  - Fix `energyIntent === 'gain'` condition in `tracker.js:483`.
- [x] **Task 2: Fix Ride Phase Speed Floor Clamp in `tracker.js`**
  - Allow line approach speed to sustain MAX throttle / line speed rather than clamping to 200 KIAS.

### Checkpoint 1: Tripwires Cleared
- [x] Node tests confirm #2 initiates TRJ with MAX throttle (throttle $\ge 1.0$) from Line Abreast.
- [x] Speed does not bleed to 200 KIAS on initiation.

### Phase 2: Expeditious Fighting Wing Geometry & Cone Energy
- [x] **Task 3: Refine Fighting Wing Rejoin Geometry & Capture Gates**
  - Relax drift rate threshold for FW cone intercept.
  - Allow direct, smooth transition into cone tracking.
- [x] **Task 4: Cone Energy Management & Power Anticipation in FW Follow**
  - Leverage `zoomFtps` vertical trade inside the cone.
  - Implement smooth power anticipation rolling off MAX throttle as #2 enters cone perimeter.

### Checkpoint 2: Fighting Wing Expedited
- [x] TRJ to FW from Line Abreast completes in $< 35\text{ s}$ with zero idle/boards fallback.
- [x] #2 settles cleanly inside the $30^\circ\text{–}60^\circ$ cone, $500\text{–}1,000\text{ ft}$, stepped down $0\text{–}200\text{ ft}$.

### Phase 3: Optimizer Hierarchy & Rejoin Safety Fallbacks
- [x] **Task 5: Prioritize MAX Throttle in `searchTurningRejoin`**
  - Prioritize `hardSec: 0` candidates before evaluating hard pulls.
  - Reserve `hardPullsSec` (`idleBoards`) exclusively for emergency overshoots where no MAX-throttle solution exists.

### Checkpoint 3: Optimizer Prioritization Confirmed
- [x] Optimizer selects `hardSec: 0` MAX-throttle candidate for standard Line Abreast rejoins.

### Phase 4: Full Matrix Verification & Parameter Tuning
- [x] **Task 6: Execute Full Rejoin Matrix & Verify Invariants**
  - Run the full suite across all 7 rejoin scenarios.
  - Verify zero regressions, no 3/9 overshoots, and clean settling.
  - Document all before/after metric changes (time saved, speeds, power).
  - Fine-tune capture windows, time on line, and established gates as needed.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Excessive closure causes 3/9 overshoot** | High | Power anticipation rolls off throttle inside $1,500\text{ ft}$; vertical zoom climb absorbs excess kinetic energy. |
| **Echelon line capture hunting at higher speed** | Medium | `rideHeadingTauSec` and `rideSettleSec` keep heading damped as aircraft settles onto the line. |
| **4-Ship rejoin inter-aircraft interference** | Medium | Matrix specifically tests 4-ship rejoin to ensure #3 and #4 sequencing and spacing remain intact. |
| **Silent regression in other formation maneuvers** | Medium | Pre-refactor invariant suite (Task 0) verifies non-rejoin maneuvers are unaffected. |

---

## Open Questions for User
- **Plan File Location:** We wrote this plan to `tasks/trj-max-throttle-plan.md` and `tasks/trj-max-throttle-todo.md` to avoid clobbering the unexecuted Slice 8 & 9 optimizer plan in `tasks/plan.md`. Do you want us to keep it here, or overwrite `tasks/plan.md`?
- **Rates Setting Tuning:** For Student rates (which aims for 210 KIAS line speed vs 220 for Instructor and 235 for AI), should MAX throttle initial acceleration be capped at the active Rates profile speed, or should all personas start at MAX throttle and only vary in power anticipation distance?
