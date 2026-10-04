# Vector Guidance Migration Todo Checklist (D406, R34)

> **Spec**: [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md)  
> **Pattern Matrix**: [`docs/traffic-pattern-matrix.md`](../../docs/traffic-pattern-matrix.md)  
> **Plan**: [`tasks/traffic/plan.md`](plan.md) | **General Todo**: [`tasks/traffic/todo.md`](todo.md)  
> **Decisions**: D389–D400, D406 | **Requirements**: R34  

---

## Pre-Phase: Documentation Sync (Completed)

- [x] **Pre-Phase, Task 0.1: Merge `SPEC-traffic.md` + `SPEC-traffic-vector.md` into unified spec**
  - **Details**: Unified `specs/SPEC-traffic.md` incorporates all vector migration sections (§1–§8), references `docs/traffic-pattern-matrix.md`, and supersedes `SPEC-traffic-vector.md`.
  - **Acceptance**: Single authoritative traffic spec in place; `SPEC-traffic-vector.md` archived with pointer.

- [x] **Pre-Phase, Task 0.2: Commit `refined_pattern_matrix.md` to `docs/traffic-pattern-matrix.md`**
  - **Details**: Overwrite legacy placeholder with authoritative coordinates, headings, altitudes, and speeds for Moose Jaw RWY 29L/11R and PFL profiles.
  - **Acceptance**: Ground truth waypoint table available in repo for nav plan construction.

- [x] **Pre-Phase, Task 0.3: Register D406 in `plan-decisions.md` & `decisions-log.md`**
  - **Details**: Formally register decision D406 (Vector Guidance Migration ratification).
  - **Acceptance**: Master decisions register and decisions log updated with rationale, impact, and rollback plan.

- [x] **Pre-Phase, Task 0.4: Register R34 in `plan-requirements.md`**
  - **Details**: Formally register requirement R34 (Traffic Sim 3D Vector Flight Engine).
  - **Acceptance**: Requirements register updated with functional, aerodynamic, and verification standards.

- [x] **Pre-Phase, Task 0.5: Update project tracking documents**
  - **Details**: Update `HANDOVER.md`, `docs/handover/traffic.md`, `tasks/traffic/todo.md`, `tasks/traffic/plan.md`, `docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md`, and `.agent/memory/handoff.md`.
  - **Acceptance**: All project documents reference the unified spec and D406; no stale 1D polyline references remain.

- [x] **Pre-Phase, Task 0.6: Create standalone checklist `tasks/traffic/vector-migration-todo.md`**
  - **Details**: Standalone checklist file tracking Pre-Phase through Phase 5 with explicit acceptance criteria.
  - **Acceptance**: Checklist created and synchronized with `tasks/traffic/plan.md`.

---

## Phase 1: Core Flight Engine (`flight-engine.js`)

- [ ] **Phase 1, Task 1.1: Create `flight-engine.js` — track intercept guidance**
  - **Details**: Implement `stepAircraft(aircraft, dt, wind, navPlan)` to update position, heading, bank, airspeed, groundspeed, and phase. Track intercept with cross-track error and along-track distance. Lead-turn initiation: $\text{leadDist} = R \times \tan(\theta/2)$. Wind correction via `windTriangle()` on every step.
  - **Acceptance**: Unit tests for straight flight, level turns, climbing turns, wind drift, and cross-track correction pass.

- [ ] **Phase 1, Task 1.2: KIN performance model**
  - **Details**: Implement `updateSpeedKIN(a, dt, target)` with linear accel/decel (4 kt/s up, 6 kt/s down). Implement `updateAltKIN(a, dt, target)` (climb 2,100 fpm, descend 1,500 fpm). Break special: $V^2$ drag decel formula $V(u) = 220 \times e^{-0.452u}$. Final turn special: cubic descent $z(u) = 3500 - 800(3u^2 - 2u^3)$.
  - **Acceptance**: Speed and altitude converge cleanly; break decel matches formula; cubic descent has zero vertical rate ($dz = 0$) at both endpoints.

- [ ] **Phase 1, Task 1.3: NRG performance model**
  - **Details**: Implement `updateSpeedNRG(a, dt)` via `excessThrustPerWeight()` or best glide. Implement `updateAltNRG(a, dt)` via `glideSinkFpm(config, ias, alt)`. Energy gate: evaluate `energyHeightFt()` vs distance to threshold. Configuration management: clean $\to$ gear down $\to$ landing flaps based on energy window. $V_{fe}$ guard: no gear/flaps extension above 147 KIAS.
  - **Acceptance**: Glide sink rates match `T6A_GLIDE`; energy gate correctly branches high/low energy PFL profiles.

- [ ] **Phase 1, Task 1.4: Phase state machine**
  - **Details**: Implement phase transitions for `initial`, `break`, `inner_downwind`, `final_turn`, `final`, `landing`, `takeoff_climb`, `closed_pattern`, `si_descent`, `si_downwind`, `si_base`, `si_final`, `breakout`, `go_around`, `pfl_inbound`, `high_key`, `low_key`, `base_key`, `pfl_final`, and `entry`. Configure target bank, target speed, target altitude, guidance mode, and transition triggers.
  - **Acceptance**: Full OHB circuit, SI pattern, PFL, breakout, and go-around phase transitions verified in unit tests.

---

## Phase 2: Pattern Definitions (`nav-plans.js`)

- [ ] **Phase 2, Task 2.1: Define all nav plans in `nav-plans.js`**
  - **Details**: Define PAT_INNER, PAT_SI, ENT_OHB, ENT_SI, PFL_HIGH_KEY, PFL_FROM_AREA, TAKEOFF, BREAKOUT, and GO_AROUND. Populate waypoints directly from `docs/traffic-pattern-matrix.md`. Dynamic Perch calculation via `computeWindPerch()` called at runtime. PFL_FROM_AREA: calculate spawn position and heading from radial/distance/altitude inputs.
  - **Acceptance**: All nav-plan waypoints match the pattern matrix; geometry verified at calm and 10–20 kt crosswind.

- [ ] **Phase 2, Task 2.2: Pattern-specific guidance overrides**
  - **Details**: Break: arc guidance (constant bank, induced drag decel). Inner downwind: pure pursuit to dynamic Perch. Final turn: cubic descent + modulated bank (30°–45°). Final approach: localizer cross-track guidance + 3.0° glide slope. PFL orbit: circular arc at 30° bank.
  - **Acceptance**: Each guidance override produces correct geometry in isolation.

---

## Phase 3: Integration (`sim.js` Swap)

- [ ] **Phase 3, Task 3.1: Replace rails in `sim.js`**
  - **Details**: In `fly(a)`: route flight execution directly to `stepAircraft()` from `flight-engine.js`. Remove all `a.customX/Y/Heading/Alt/Kt` fields so aircraft state is canonical. Remove `posOnRoute()` calls from sim loop (preserve in display editor only). Retain `distFt` as secondary display metric.
  - **Acceptance**: Aircraft fly correct patterns at 0 wind, 10 kt, and 20 kt crosswind. No regressions in rewind, conflict detection, or spawn/remove.

- [ ] **Phase 3, Task 3.2: Migrate existing command blocks**
  - **Details**: Convert breakout (lines 294–405), PFL (407–715), go-around (717–811), and closed pattern (905–963) into flight-engine phase definitions. Replace bank snaps with `rollToward()`, hardcoded sink rates with `glideSinkFpm()`, and add wind crab angle.
  - **Acceptance**: All commands produce identical or improved behavior via the unified flight engine.

- [ ] **Phase 3, Task 3.3: Sync display via `scene.js`**
  - **Details**: Update `scene.js` to propagate `phase`, `model`, and `bankDeg`. Retain `generateWindAdjustedTrack()` as a display-only reference line. Remove dead code `buildRoundedPoints()`.
  - **Acceptance**: Flown visual path matches aircraft 2D/3D position across all wind conditions.

- [ ] **Phase 3, Task 3.4: Update tests**
  - **Details**: Adapt 56 sim tests, 22 vector-sim tests, and 39 route tests. Merge vector-sim tests into flight-engine tests. Rebaseline crosscheck scenarios.
  - **Acceptance**: All unit and crosscheck tests green (`npm test` clean, `npm run typecheck` clean).

---

## Phase 4: Spawn UI Redesign

- [ ] **Phase 4, Task 4.1: Build two-dropdown spawn UI**
  - **Details**: Dropdown 1: Pattern, Dropdown 2: Start Point (dynamically filtered). Implement PFL "From Area" inputs (radial, distance, altitude).
  - **Acceptance**: All pattern and start point spawn combinations place aircraft on correct vectors.

- [ ] **Phase 4, Task 4.2: Clean up aircraft types**
  - **Details**: Remove fictional CT-157 from `types.js` and `moose-jaw.json`. Set CT-156 (Harvard II) as sole military trainer default. Confirm Harvard paint scheme default (`PAINT_DEFAULT = 'harvard'`).
  - **Acceptance**: Zero fictional aircraft types; CT-156 Harvard II is default.

- [ ] **Phase 4, Task 4.3: Fix aircraft disappearance**
  - **Details**: Ensure aircraft never transition to inactive without explicit full-stop landing. Fallback to OHB circuit if no further instruction provided. Remove `a.active = false` from non-landing branches.
  - **Acceptance**: Continuous flight flow without random dropouts.

---

## Phase 5: Polish & Cleanup

- [ ] **Phase 5, Task 5.1: Settings panel cleanup**
  - **Details**: Remove obsolete settings (`flyRoundedTurns`, `manualRadiusFt`, `radiusFromG`). Retain conflict limits, rules, wind, and photo controls behind "More".
  - **Acceptance**: Clean, relevant settings UI matching modern vector architecture.

- [ ] **Phase 5, Task 5.2: Visual polish**
  - **Details**: Render entry routes with dotted lines and pattern routes with solid lines. Apply standard color coding (OHB blue, SI green, entries standard).
  - **Acceptance**: Visual clarity and seamless rendering across 2D/3D views.

- [ ] **Phase 5, Task 5.3: Reset button label**
  - **Details**: Update UI label from "Reset" to "Reset to Standard Defaults" per D384.
  - **Acceptance**: Standard defaults label verified in UI and tests.
