# Implementation Plan: Mid-Air Collision Hitbox, TCPA Deconfliction, Ballistic Tumble & UI Settings

## Overview
Integrate a physically grounded 35 ft mid-air collision model, an analytical closed-form Time-to-Closest-Point-of-Approach (TCPA) predictive deconfliction system, an authentic CT-156 Harvard II post-collision ballistic tumble state machine, and dedicated UI toggles in the Turn Fight settings dialog. This system replaces artificial bounding freezes with authentic air combat physics, where pilots deconflict out-of-plane (generating realistic flight-path overshoots and scissors reversals), while high-speed mutual collisions produce real-time unguided ballistic tumbling down to the terrain.

---

## Architectural & Domain Decisions (Ratified via /grill-me)

1. **Four Thin Vertical Slices (Tasks 27–30):**
   - Implemented serially by Flash subagents (`flash` tier) with coordinator verification and a 5-minute watchdog timer.
2. **Hard Physical Hitbox (35 ft):**
   - Based on CT-156 Harvard II dimensions (wingspan 33.4 ft, length 33.3 ft).
   - Triggered when 3D Euclidean range $R_{3D} < 35.0\text{ ft}$.
3. **Sequential Combat Telemetry:**
   - If an attacker secures a WEZ Gun Kill and continues pressing recklessly into collision, both events are preserved in telemetry (`Gun Kill at T+..., followed by Mid-Air Collision at T+...`).
4. **Context-Dependent Deconfliction Doctrine:**
   - In neutral / head-on passes, both aircraft deconflict port-to-port / canopy-to-canopy.
   - In offensive tail-chase pursuits, the attacker is strictly responsible for rolling out-of-plane over the defender along the defender's turn-plane normal $\hat{n} = \frac{\vec{V}_{\text{def}} \times \vec{a}_{\text{def}}}{|\vec{V}_{\text{def}} \times \vec{a}_{\text{def}}|}$, creating an 80 ft clearance and natural flight-path overshoot.
5. **Real-Time Ballistic Tumble Down to Terrain:**
   - Simulation does NOT freeze immediately on collision; both aircraft enter an unguided tumble with controls severed, throttle at 0, bluff-body drag $C_D \approx 1.2$, pure gravity $\ddot{z} = -32.174\text{ ft/s}^2$, and severity-scaled rotational rates ($I_{xx} \ll I_{yy} \ll I_{zz}$).
   - Simulation automatically stops and announces terrain impact when reaching the ground ($0\text{ ft MSL}$).
6. **UI Settings Toggles in Main Turn Fight Settings Dialog:**
   - Two checkboxes: `collisionDetection` (35 ft hitbox) and `collisionAvoidance` (TCPA deconfliction), both enabled by default, accessible in the main "Turn Fight settings" dialog without needing `?debug=aero`.
7. **D379 Supersession (D425):**
   - D379 is superseded: Turn Fight opens directly into 3D BFM Energy Fight by default, as the modern curriculum prioritizes 3D aerodynamics and tactical decision-making over flat 2D turn circles. Simple 2D flat mode remains accessible via toggle.

---

## Dependency Graph

```
Task 27: Physical Hitbox (35 ft) & State Integration
    │
    ▼
Task 28: Analytical TCPA & Context-Dependent Lag Roll Deconfliction
    │
    ▼
Task 29: Post-Collision Ballistic Tumble Physics, Real-Time Flow & HUD Banners
    │
    ▼
Task 30: UI Settings Toggles, D379 Supersession & Full Test Harmonization
```

---

## Task List

### Phase 1: Collision Detection & State Tracking

#### Task 27: Physical Hitbox (35 ft) & Collision State
- **Description:** Implement the 35 ft 3D Euclidean distance check in `energy-sim.js`, record `state.collision` metrics (time, impact speed, closure rate, altitude), and ensure sequential telemetry logging when a gun kill precedes a collision.
- **Acceptance Criteria:**
  - Range check triggers when `state.rangeFt < 35.0`.
  - Captures `state.collision` object with `timeSec`, `impactKias`, `relativeSpeedKt`, `closingRateKt`, and `altitudeFt`.
  - Preserves prior `state.kill` so debrief records both gun kill and subsequent collision.
  - Dedicated unit tests verify trigger at 34.9 ft and non-trigger at 35.1 ft.
- **Files:** `src/modules/turn-fight/energy-sim.js`, `tests/unit/turn-fight/energy-tactical.test.js`
- **Verification:** `node --test tests/unit/turn-fight/energy-tactical.test.js`

---

### Phase 2: Predictive Deconfliction Engine

#### Task 28: Analytical TCPA & Context-Dependent Lag Roll Deconfliction
- **Description:** Implement closed-form analytical TCPA prediction ($t_{\text{CPA}} = -\frac{\vec{r} \cdot \vec{V}_{\text{rel}}}{|\vec{V}_{\text{rel}}|^2}$) and projected miss distance $d_{\text{miss}}$. When $t_{\text{CPA}} \in [0.5, 1.5]\text{ s}$ and $d_{\text{miss}} < 75\text{ ft}$, execute context-dependent deconfliction: port-to-port in head-on passes, and out-of-plane rolling lag displacement (75–100 ft offset along $\hat{n}$) in offensive pursuit.
- **Acceptance Criteria:**
  - `computeTcpa(ac, target)` returns analytical $t_{\text{CPA}}$ and $d_{\text{miss}}$.
  - Deconfliction alert triggers when $t_{\text{CPA}} \in [0.5, 1.5]\text{ s}$ and $d_{\text{miss}} < 75\text{ ft}$.
  - In pursuit, aim point is displaced 85 ft along the defender's turn-plane normal $\hat{n}$, inducing an out-of-plane lag roll and safe clearance overshoot.
  - In head-on pass, both aircraft apply coordinated lateral/vertical deconfliction.
  - Unit tests verify TCPA calculation and deconfliction offsets.
- **Files:** `src/modules/turn-fight/energy-sim.js`, `tests/unit/turn-fight/energy-tactical.test.js`
- **Verification:** `node --test tests/unit/turn-fight/energy-tactical.test.js`

---

### Phase 3: Post-Collision Real-Time Dynamics & Visuals

#### Task 29: Ballistic Tumble State Machine & HUD Banners
- **Description:** Implement the ballistic departure state machine on collision (`ac.tumble`). Controls severed, throttle cut to 0, high bluff-body drag ($C_D \approx 1.2$), gravity drop $\ddot{z} = -32.174\text{ ft/s}^2$, and rotational integration using authentic CT-156 inertia ratios ($I_{xx} \approx 3,500 \ll I_{yy} \approx 12,000 \ll I_{zz} \approx 15,000$). The simulation continues in real time until reaching terrain ($0\text{ ft MSL}$), whereupon it stops. Add HUD collision banner and debrief telemetry row.
- **Acceptance Criteria:**
  - Collided aircraft tumble in real time with continuous roll, pitch, and yaw rotation.
  - Velocity decays rapidly due to $C_D = 1.2$; trajectory drops toward sea level.
  - Engine automatically stops and flags `state.stopped = true` when either aircraft breaches $0\text{ ft MSL}$ (terrain impact).
  - HUD displays `"MID-AIR COLLISION: Dual Departure & Hull Loss at T+... (Closure ... kt, Alt ... ft)"`.
  - Debrief table in `energy-readouts.js` shows prominent collision telemetry row.
  - 3D view in `view3d.js` renders tumbling orientation without NaN or crash.
- **Files:** `src/modules/turn-fight/energy-sim.js`, `src/modules/turn-fight/view3d.js`, `src/modules/turn-fight/layout.js`, `src/modules/turn-fight/energy-readouts.js`, `src/modules/turn-fight/index.js`
- **Verification:** `node --test tests/unit/turn-fight/energy-readouts.test.js`, `npm run build`

---

### Phase 4: UI Settings & Test Suite Harmonization

#### Task 30: UI Settings Toggles, D379 Supersession & Harmonization
- **Description:** Wire `collisionDetection` and `collisionAvoidance` checkboxes into the main Turn Fight settings modal (both `true` by default). Formalize D379 supersession by D425 (BFM Energy Fight as opening default). Harmonize unit tests and Playwright E2E tests under D411.
- **Acceptance Criteria:**
  - Turn Fight Settings modal includes checkboxes for `collisionDetection` and `collisionAvoidance`.
  - Disabling `collisionAvoidance` while leaving `collisionDetection` active causes AI aircraft to collide on zero-offset passes, proving teaching utility.
  - D379 updated to Superseded in `docs/records/plan-decisions.md` with D425 rationale.
  - All unit tests in `tests/unit/turn-fight/*.test.js` pass 100%.
  - Full repo test suite (`npm test`, 3,205+ tests) passes 100%.
  - `npm run typecheck` and `npm run build` succeed with 0 errors.
- **Files:** `src/modules/turn-fight/state.js`, `src/modules/turn-fight/layout.js`, `tests/e2e/turn-fight.spec.js`, `docs/records/decisions-log.md`, `docs/records/plan-decisions.md`, `docs/handover/turn-fight.md`, `docs/REMEDIATION_ROADMAP.md`
- **Verification:** `npm test`, `npm run typecheck`, `npm run build`

---

## Checkpoint: Full Gate 2 Verification
- [ ] 550+ unit tests in `tests/unit/turn-fight/` pass 100%
- [ ] All 3,205+ repo tests pass
- [ ] Typecheck and build pass cleanly
- [ ] Ready for Patrick's final Gate 2 sign-off checklist run (`docs/checklists/turn-fight.md`)
