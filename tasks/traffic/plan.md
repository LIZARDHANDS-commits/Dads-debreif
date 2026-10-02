# Traffic Pattern Sim: Vector Guidance Migration Plan

> **Authoritative Master Spec:** [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md) (unified spec superseding `SPEC-traffic-vector.md` per D406, R34)  
> **Master Pattern Matrix:** [`docs/traffic-pattern-matrix.md`](../../docs/traffic-pattern-matrix.md) (coordinates and waypoints)  
> **Task Checklist:** [`vector-migration-todo.md`](vector-migration-todo.md) and [`todo.md`](todo.md)  
> **Ratified Decisions**: D389–D400, D406 | **Requirements**: R34  

---

## 1. Executive Summary & Objective

Migrate Traffic Sim from the fragile hybrid 1D polyline ("rails") flight system to a unified 3D Cartesian aerodynamic vector physics engine. Every aircraft is always physics-driven. Published routes become visual overlays.

---

## 2. Phase Execution Plan (SPEC v2 §9)

### Pre-Phase: Documentation Sync (Immediate)
1. Merge `SPEC-traffic.md` + `SPEC-traffic-vector.md` into unified spec in repo.
2. Commit `refined_pattern_matrix.md` to `docs/traffic-pattern-matrix.md`.
3. Register D406 (Vector Guidance Migration ratification) in `docs/records/plan-decisions.md` and `docs/records/decisions-log.md`.
4. Register R34 (Traffic Sim 3D Vector Flight Engine) in `docs/records/plan-requirements.md`.
5. Synchronize all project handover and tracking docs (`HANDOVER.md`, `docs/handover/traffic.md`, `tasks/traffic/todo.md`, `tasks/traffic/plan.md`, `POST_PROTOTYPE_QUEUE.md`, `.agent/memory/handoff.md`).
6. Create standalone checklist `tasks/traffic/vector-migration-todo.md`.
- **Acceptance**: All docs reference unified spec; zero stale 1D polyline references.

### Phase 1: Core Flight Engine (New File: `flight-engine.js`, Zero Risk)
- **Task 1.1**: Create `flight-engine.js` — track intercept guidance
  - `stepAircraft(aircraft, dt, wind, navPlan)` → updates state
  - Cross-track error ($e_{\text{xtrack}}$) and along-track distance
  - Lead-turn initiation: $\text{leadDist} = R \cdot \tan(\Delta\psi / 4)$
  - Wind correction via `windTriangle()` on every step
- **Task 1.2**: KIN performance model
  - Linear accel/decel (4 kt/s up, 6 kt/s down), climb 2,100 fpm, descend 1,500 fpm
  - Break special: $V(u) = 220 \cdot e^{-0.452 u}$
  - Final turn special: cubic descent $z(u) = 3500 - 800(3u^2 - 2u^3)$
- **Task 1.3**: NRG performance model
  - Speed from `excessThrustPerWeight()` or best glide; altitude from `glideSinkFpm(config, ias, alt)`
  - Energy gate: `energyHeightFt()` vs threshold distance
  - Config management (clean → gear down → flaps) and $V_{fe}$ guard (147 KIAS)
- **Task 1.4**: Phase state machine
  - State machine covering all circuit and emergency phases
- **Acceptance**: Unit tests for straight flight, turns, climbing turns, wind drift, cross-track correction, speed/altitude convergence, cubic descent endpoints.

### Phase 2: Pattern Definitions (Data: `nav-plans.js`, No sim.js Changes)
- **Task 2.1**: Define all nav plans in `nav-plans.js`
  - PAT_INNER, PAT_SI, ENT_OHB, ENT_SI, PFL_HIGH_KEY, PFL_FROM_AREA, TAKEOFF, BREAKOUT, GO_AROUND
  - Waypoints from `docs/traffic-pattern-matrix.md`
  - Dynamic Perch computation (`computeWindPerch()`) called at runtime
  - PFL_FROM_AREA: radial/distance/altitude → spawn position + heading
- **Task 2.2**: Pattern-specific guidance overrides
  - Break arc guidance (constant 60° bank, induced drag decel)
  - Inner downwind pure pursuit to dynamic Perch
  - Final turn cubic descent + modulated bank (30°–45°)
  - Final approach localizer + 3.0° glide slope
  - PFL orbit circular arc at 30° bank
- **Acceptance**: All nav-plan waypoints verified against pattern matrix; geometry correct at 0 wind and 20 kt crosswind.

### Phase 3: Integration (The Critical sim.js Swap)
- **Task 3.1**: Replace rails in `sim.js`
  - In `fly(a)`: call `stepAircraft()` from `flight-engine.js`
  - Remove all `a.customX/Y/Heading/Alt/Kt` — aircraft state is canonical
  - Remove `posOnRoute()` calls from flight path (keep for display editor only)
  - Keep `distFt` as secondary metric for display only
- **Task 3.2**: Migrate existing command blocks
  - Convert breakout, PFL, go-around, and closed pattern into flight-engine phase definitions
  - Fix quality issues: replace bank snaps with `rollToward()`, hardcoded sink rates with `glideSinkFpm()`, add wind crab
- **Task 3.3**: Sync display
  - `scene.js` propagates new fields (`phase`, `model`, `bankDeg`)
  - `generateWindAdjustedTrack()` becomes display-only reference line
  - Remove dead `buildRoundedPoints()` code
- **Task 3.4**: Update tests
  - Adapt sim tests, merge vector-sim tests into flight-engine tests, rebaseline crosscheck scenarios
- **Acceptance**: All tests green, `npm test` clean, `npm run typecheck` clean.

### Phase 4: Spawn UI Redesign
- **Task 4.1**: Build two-dropdown spawn UI (Dropdown 1: Pattern, Dropdown 2: Start Point) with PFL "From Area" inputs
- **Task 4.2**: Clean up aircraft types (remove fictional CT-157, confirm Harvard II default)
- **Task 4.3**: Fix aircraft disappearance (never drop without explicit landing; fallback to OHB)
- **Acceptance**: All spawn combinations place aircraft correctly; continuous flight flow without drops.

### Phase 5: Polish & Cleanup
- **Task 5.1**: Settings panel cleanup (remove legacy `flyRoundedTurns`, `manualRadiusFt`, `radiusFromG`)
- **Task 5.2**: Visual polish (solid patterns, dotted entries, color standards)
- **Task 5.3**: Reset button label ("Reset to Standard Defaults", D384)
- **Acceptance**: Clean, relevant controls only; live visual verification.

---

## 3. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Flight engine changes break existing tests | Phases 1 & 2 build `flight-engine.js` and `nav-plans.js` with isolated unit tests before touching `sim.js` |
| Zero-wind vs crosswind behavior drift | All tests explicitly test 0 kt and 20 kt crosswind using the same equations |
| Visual path vs aircraft position mismatch | `scene.js` receives canonical $(x, y, z, \psi, \phi)$ from the physics engine |
| Rewind determinism compromised | Stepping remains pure fixed $0.05\text{ s}$ steps with deterministic snapshots |
