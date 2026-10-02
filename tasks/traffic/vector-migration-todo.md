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

## Phase 1: Core Flight Engine (`flight-engine.js`) — ✅ COMPLETE

- [x] **Phase 1, Task 1.1: Create `flight-engine.js` — track intercept guidance**
  - **Committed**: `13444b5` — `stepAircraft()`, cross-track, along-track, lead turns, wind crab. 62 unit tests.
  - **Acceptance**: Unit tests for straight flight, level turns, climbing turns, wind drift, and cross-track correction pass.

- [x] **Phase 1, Task 1.2: KIN performance model**
  - **Committed**: `13444b5` — linear accel/decel (+4.0/-2.7 kt/s), break V² decel, cubic descent. 11 challenge tests.
  - **Acceptance**: Speed and altitude converge cleanly; break decel matches formula; cubic descent has zero vertical rate at both endpoints.

- [x] **Phase 1, Task 1.3: NRG performance model**
  - **Committed**: `13444b5` — `excessThrustPerWeight()`, `glideSinkFpm()`, energy gate, config management, Vfe guard. 13 stress tests.
  - **Acceptance**: Glide sink rates match `T6A_GLIDE`; energy gate correctly branches high/low energy PFL profiles.

- [x] **Phase 1, Task 1.4: Phase state machine**
  - **Committed**: `13444b5` — all circuit and emergency phases covered.
  - **Acceptance**: Full OHB circuit, SI pattern, PFL, breakout, and go-around phase transitions verified in unit tests.

---

## Phase 2: Pattern Definitions (`nav-plans.js`)

- [x] **Phase 2, Task 2.1: Define all nav plans in `nav-plans.js`**
  - **Committed**: `3fc3cee` — 7 patterns + 3 factories + spawn presets + 39 tests. Typecheck clean.

- [ ] **Phase 2, Task 2.2: Pattern-specific guidance overrides**
  - **Details**: Break: arc guidance (constant bank, induced drag decel). Inner downwind: pure pursuit to dynamic Perch. Final turn: cubic descent + modulated bank (30°–45°). Final approach: localizer cross-track guidance + 3.0° glide slope. PFL orbit: circular arc at 30° bank.
  - **Acceptance**: Each guidance override produces correct geometry in isolation.

---

## Phase 3: Integration (`sim.js` Swap)

- [x] **Phase 3, Task 3.1: Replace rails in `sim.js` (SIM-1 & SIM-2)**
  - **Committed**: `88f4406` (SIM-1 hybrid dispatcher) and `7374abf` (SIM-2 OHB break + final turn dynamic physics + 2.0s Hermite smoothstep blend). All 3,165 tests pass.

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
