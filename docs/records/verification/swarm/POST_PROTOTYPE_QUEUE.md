# Post-Prototype Queue (Phase 2 Roadmap) & Zero Work Lost Register
**Project:** Dad's Debrief (OODA Loop Debrief Webtool Rebuild — Moose Jaw V6)  
**Deliverable:** Authoritative Phase 2 Feature Register & Work Preservation Catalog  
**Date:** 2026-09-30T20:35:00Z  
**Standard:** Verification Swarm Standards (§1.5 Citation Contract) & Streamlined Build Rules (Decisions D357–D367)  
**Output Path:** `docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md`  

---

## 1. Executive Summary & Zero Work Lost Guarantee

Under Patrick's Streamlined Build Rules (30 Sep 2026, Decisions D357–D367), all non-essential features, complicated prediction engines, and deep aerodynamic simulations were deferred to Phase 2 to prevent delaying the **Minimum Viable Working Prototype (Phase 1)**.

### The Zero Work Lost Guarantee
**Zero engineering work has been lost or abandoned.**  
All 8 unmerged remote branches comprising **9,278 lines of code and tests across 110 file changes** are anchored in Git history and accounted for in this register. Every partially completed feature, drafted specification, and mathematical algorithm has a permanent record, an exact Git commit anchor, and concrete step-by-step instructions to resume work immediately following Phase 1 prototype sign-off.

---

## 2. Preserved Branch Inventory

| Branch Identifier | Tip Commit Hash | Base Commit | Files Touched | Diff Lines (+ / -) | Preserved Assets & Capabilities | Working State | Target Phase |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **`origin/claude/traffic-spec-j17uqw`** (PR #229) | `13f23977` | `0b3323b` | 18 | +2,441 / -30 | `view3d.js` (Three.js 3D viewer), `map2d.js` (Esri satellite tiles), unit & e2e tests | Built, CI passed | **Phase 1 (Immediate)** |
| **`origin/handover/traffic-polish`** | `68e59d97` | `3d7f58c` | 27 | +1,453 / -110 | Spawner validation, playback bar wrapping, profile store check, crosscheck tables | Audited twice, tests pass | **Phase 1 (Immediate)** |
| **`origin/handover/traffic-rewind-fix`** | `eed055b9` | `6b3ac16` | 9 | +676 / -59 | Replay event loop in `sim.js`, Clear Finished counter, sliced replay step tests | Built, tests pass | **Phase 1 (Immediate)** |
| **`origin/handover/turn-fight-energy-screen`** | `226729d0` | `8091f5e` | 18 | +2,893 / -63 | `energy-graph.js` (uPlot), `energy-readouts.js`, state machine, 6 unit suites, 18 e2e tests | 491 unit tests pass | **Phase 1 (Immediate)** |
| **`origin/handover/turn-sim-223-fixes`** | `f18cac10` | `adf165c` | 4 | +117 / -6 | Delayed 45 check turn 45° guard, offset box aft 6,000 ft stability fix | Built, tests pass | **Phase 1 (Immediate)** |
| **`origin/handover/turn-sim-215-recheck`** | `a3a62b66` | `0f1cb1a` | 17 | +619 / -75 | In-place 90 trail judging, turn note fallback, circle label collision avoidance | Built, tests pass | **Phase 1 (Immediate)** |
| **`origin/handover/turn-sim-screen-audit`** | `b568d0f8` | `6f14b7c` | 13 | +620 / -18 | Pre-play wingman dragging (`drag.js`), NM range rings (`rings.js`), Playwright a11y | Built, 105 e2e pass | **Phase 1 (Immediate)** |
| **`origin/handover/turn-sim-sequences`** | `54783397` | `07bb473` | 4 | +459 / -3 | `engine/sequence.js` (multi-turn runner, wings-level pauses, 2-ship G-warm physics) | Engine 100% complete | **Phase 2 (PPQ-09)** |
| **TOTALS** | — | — | **110** | **+9,278 / -364** | **8 Active / Paused Branches Cataloged** | — | — |

---

## 3. Authoritative Post-Prototype Feature Register (Phase 2)

> [!NOTE]
> **Traffic Vector Engine Integration (D392–D400, D406):**  
> Core PFL aerodynamics (High Key, Low Key, Base Key, `glideSinkFpm`), Breakout vectors, Go-Around wave-off climbout, and Closed Pattern aerodynamics (50° bank climb, 118° rollout to Perch) are now integrated directly into the core 3D vector guidance engine ([`specs/SPEC-traffic.md`](../../../specs/SPEC-traffic.md)).  
> Only custom interactive PFL route builders, multi-key plan sequencing, and advanced ATC hold/prediction logic remain in the Phase 2 queue.

| Feature ID | Feature Name | Target Module | Preserved Anchor | Code Lines Preserved | Prerequisites | Phase 2 Priority |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **PPQ-01** | Custom PFL Route Builder & Orbit Editor *(Core PFL built in vector engine: D396, D400, D406)* | Traffic Sim | `specs/SPEC-traffic.md` | Specification & Core math | Vector engine merged | High |
| **PPQ-02** | Multi-Key Plan Sequencing & In-Flight Triggers *(Core glide & zoom built: D392, D393, D406)* | Traffic Sim | `specs/SPEC-traffic.md` | Specification & `src/core/` | PPQ-01, T-6A glide model | High |
| **PPQ-03** | Prediction Engine & Automated SMM Rules | Traffic Sim | `specs/SPEC-traffic.md` | Specification & Rules list | Vector engine merged | Medium |
| **PPQ-04** | Fly-Through & Departure-End Break | Traffic Sim | `specs/SPEC-traffic.md` | Specification & Triggers | PPQ-03 | Medium |
| **PPQ-05** | Dynamic Closed Pattern ATC Hold Logic *(Closed pattern aero built: D400, D406)* | Traffic Sim | `specs/SPEC-traffic.md` | Specification & SMM 13.11 | PPQ-03 | Medium |
| **PPQ-06** | Interactive "Set Up a Conflict" Tool | Traffic Sim | `specs/SPEC-traffic.md` | Specification & Spawner | PPQ-03 | Low |
| **PPQ-07** | Engine-Out Reach Map Layer & Pre-Flight Check | Traffic Sim | `specs/SPEC-traffic.md` | Specification & Geometry | PPQ-02 | Medium |
| **PPQ-08** | Multi-Aircraft Custom Scripted Plans | Traffic Sim | `specs/SPEC-traffic.md` | Specification & Aircraft state | Vector engine merged | Low |
| **PPQ-09** | Sequence Integrator & G-Warm Exercises UI | Turn Sim | `origin/handover/turn-sim-sequences` | 459 lines engine | Turn Sim Core merged | High |
| **PPQ-10** | Spacing Graph & Optimization Solver Screen | Turn Sim | `src/modules/turn-sim/engine/solver.js` | Engine merged on `main` | Turn Sim Core merged | Medium |
| **PPQ-11** | SMM Dynamic Maneuvers (Rejoins, Fighting Wing) | Turn Sim | `specs/SPEC-turn-sim.md:213-219` | Specification & Future ideas | PPQ-09 | Low |
| **PPQ-12** | Live Traffic ADS-B Cloudflare Relay Deploy | SOF Dashboard | `relay/traffic.js` (merged on `main`) | 350 lines relay & client | Cloudflare Account | Medium |
| **PPQ-13** | SOF 12-Hour All-Day Soak Testing | SOF Dashboard | `tasks/sof/todo.md:68-72` | Test scenario specs | Prototype Sign-Off | Low |
| **PPQ-14** | Debrief Native Weather File Schema Migration | Debrief | `tasks/debrief/todo.md:93` | Format specifications | Debrief Sign-Off | Low |
| **PPQ-15** | Turn Fight Chaser Dynamic Pursuit AI | Turn Fight | `docs/handover/turn-fight.md:86` (FF42) | Pursuit geometry formulas | Prototype Sign-Off | Low |
| **PPQ-16** | Standalone Apps (PT-PT Sim, Briefing Board) | Standalone | `docs/records/future-ideas.md:8` (FF1, FF2) | Concept architecture | Project Switchover | Future |

---

## 4. Comprehensive Step-by-Step Feature Resume Instructions

### PPQ-01: Traffic Practice Forced Landings (PFLs)
- **Specification:** `specs/SPEC-traffic.md:309-315`; `tasks/traffic/todo.md:106-110` (Task 16).
- **Aeronautical Basis:** 1 CAD SMM Chapter 13.
  - High Key: 5,000 ft MSL (Moose Jaw RWY 28L/10R), gear down, 120 KIAS.
  - Low Key: ~3,700 ft MSL, 30° bank orbit, flaps takeoff.
  - Final Key: ~3,050 ft MSL, roll out onto final approach course.
  - Descent Rate: 2,600 ft per 360° orbit (gear down, 120 KIAS).
- **Prerequisites:** Traffic Core merged on `main` (Tasks 10, 11, 12, 15, 18).
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-pfl origin/main`
  2. In `src/modules/traffic/route.js`, add `createPflRoute(threshold, runwayHeading, orbitDirection)` returning circular orbit path with 2,600 ft altitude drop per turn.
  3. In `src/modules/traffic/sim.js`, update physics loop to adjust bank angle for crosswind to maintain a circular ground track over the key.
  4. In `src/modules/traffic/map2d.js`, draw High Key, Low Key, and Final Key visual rings with altitude flags.
  5. Add unit tests in `tests/unit/traffic/pfl.test.js` validating key altitudes in calm air and 20 kt crosswind.
  6. Verify with `npm test`, open PR, merge on green.

---

### PPQ-02: Traffic Simulated Engine-Outs & Glide Engine
- **Specification:** `specs/SPEC-traffic.md:316-337`; `tasks/traffic/todo.md:111-115` (Task 17).
- **Aeronautical Basis:** SMM 13.17, 13.18.
  - Zoom climb: converts airspeed above 125 KIAS into altitude (e.g. 220 KIAS at 3,500 ft yields +960 ft zoom gain).
  - Glide performance: 2 NM per 1,000 ft clean feathered (125 KIAS); 1 NM per 1,000 ft windmilling.
- **Prerequisites:** PPQ-01 (PFL routes) and Traffic Core.
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-engine-out origin/main`
  2. In `src/modules/traffic/aircraft.js`, add "Engine Out" trigger button to aircraft row.
  3. In `src/modules/traffic/sim.js`, invoke `zoomT6A(speedKt, altFt)` from `src/core/t6-performance.js` on engine cut.
  4. Implement tangent-join solver: calculate trajectory from zoom peak to nearest reachable PFL key. If no key reachable, flag aircraft banner: `"Can't make runway: eject"`.
  5. Add unit tests in `tests/unit/traffic/engine-out.test.js` verifying glide distance and zoom climb numbers against SMM figures.
  6. Verify with `npm test`, open PR, merge on green.

---

### PPQ-03: Traffic Prediction Engine & Automated SMM Rules
- **Specification:** `specs/SPEC-traffic.md:363-364`; `tasks/traffic/todo.md:125-129` (Task 19).
- **Aeronautical Basis:** SMM pattern separation rules.
- **Prerequisites:** Traffic Core merged on `main`.
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-prediction origin/main`
  2. Create `src/modules/traffic/prediction.js`: extrapolate each aircraft position $N$ seconds forward along its route using current ground speed and bank.
  3. Implement conflict trigger evaluation: detect if two aircraft are predicted to breach 3,000 ft lateral or 500 ft vertical separation.
  4. In `src/modules/traffic/layout.js`, add collapsible "Rules & Commands" panel.
  5. Add unit tests in `tests/unit/traffic/prediction.test.js` verifying trigger detection 5 seconds prior to conflict.
  6. Verify with `npm test`, open PR, merge on green.

---

### PPQ-04: Traffic Fly-Through & Departure-End Break
- **Specification:** `specs/SPEC-traffic.md:346-347`; `tasks/traffic/todo.md:130-134` (Task 20).
- **Prerequisites:** PPQ-03 (Prediction engine).
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-fly-through origin/main`
  2. Implement Fly-Through trigger: if preceding aircraft is on runway or low approach, following aircraft initiates climb to 2,000 ft MSL on runway heading.
  3. Implement Break at Departure End: offset break turn initiated at upwind threshold.
  4. Add unit tests in `tests/unit/traffic/fly-through.test.js`.
  5. Open PR, merge on green.

---

### PPQ-05: Closed Pattern Simulation (Extend or Unable)
- **Specification:** `specs/SPEC-traffic.md:348`; `tasks/traffic/todo.md:135-139` (Task 21).
- **Prerequisites:** PPQ-03 (Prediction engine).
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-closed-pattern origin/main`
  2. In `src/modules/traffic/sim.js`, evaluate downwind capacity when aircraft requests closed pattern.
  3. If traffic on downwind conflicts, command `"Extend upwind"` or `"Unable closed, proceed straight ahead"`.
  4. Add unit tests in `tests/unit/traffic/closed-pattern.test.js`.
  5. Open PR, merge on green.

---

### PPQ-06: Interactive "Set Up a Conflict" Tool
- **Specification:** `specs/SPEC-traffic.md:367-374`; `tasks/traffic/todo.md:143-147` (Task 22).
- **Prerequisites:** PPQ-03 (Prediction engine).
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-conflict-tool origin/main`
  2. In `src/modules/traffic/aircraft.js`, add "Set Up Conflict" dialog under Spawner More.
  3. Implement reverse solver: given target collision waypoint and time $T$, calculate required spawn times and speeds for Aircraft 1 and 2.
  4. Add unit tests in `tests/unit/traffic/conflict-tool.test.js`.
  5. Open PR, merge on green.

---

### PPQ-07: Engine-Out Reach Map Layer & Check
- **Specification:** `specs/SPEC-traffic.md:375-383`; `tasks/traffic/todo.md:148-153` (Task 23).
- **Prerequisites:** PPQ-02 (Engine-out glide engine).
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-reach-layer origin/main`
  2. In `src/modules/traffic/map2d.js`, draw glide reach polygon (expanding oval taking wind into account).
  3. Color polygon green where runway is reachable, red where forced landing in terrain is required.
  4. Add unit tests in `tests/unit/traffic/reach.test.js`.
  5. Open PR, merge on green.

---

### PPQ-08: Multi-Aircraft Ordered Plan Programming
- **Specification:** `specs/SPEC-traffic.md:390-394`; `tasks/traffic/todo.md:79` (Task 12).
- **Prerequisites:** Traffic Core merged on `main`.
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/traffic-custom-plans origin/main`
  2. Create plan editor UI allowing pilots to script step sequences: `[Break, Touch-and-Go, Closed, PFL, Full Stop]`.
  3. In `src/modules/traffic/sim.js`, execute sequential plan triggers upon completing each leg.
  4. Open PR, merge on green.

---

### PPQ-09: Turn Sim Sequence Integrator & G-Warm Exercises Panel
- **Preserved Anchor:** Branch `origin/handover/turn-sim-sequences` (`54783397f0c43bc2847609c8e7450bb8d55ab10d`).
- **Preserved Status:** Engine implementation 100% complete in `src/modules/turn-sim/engine/sequence.js` (220 lines). All 3,096 unit tests pass. UI not started.
- **Prerequisites:** Turn Sim Phase 1 Prototype signed off.
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/turn-sim-g-warm origin/handover/turn-sim-sequences`
  2. `git merge origin/main`
  3. Create `src/modules/turn-sim/exercises.js` implementing collapsible "Exercises" panel with "G-Warm" button.
  4. Wire G-Warm button to `createSequenceRun()` for standard 2-ship profile (In-place 90 @ 3G -> 5s pause -> 4G hook -> In-place 90 @ 3G back).
  5. Verify 4-ship spread-4 geometry with Patrick before enabling 4-ship toggle (SMM 16.44).
  6. Add e2e Playwright test in `tests/e2e/turn-sim.spec.js`.
  7. Open PR, merge on green.

---

### PPQ-10: Turn Sim Spacing Graph & Optimization Solver Screen
- **Preserved Anchor:** Merged on `main` in `src/modules/turn-sim/engine/solver.js` and `engine/series.js` (PR #234).
- **Preserved Status:** Pure numerical engine complete and verified by golden tests. UI (`graph.js`) omitted.
- **Prerequisites:** Turn Sim Phase 1 Prototype signed off.
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/turn-sim-solver-ui origin/main`
  2. Add checkboxes "Spacing graph" and "Solver" under Turn Sim More Setup.
  3. Create `src/modules/turn-sim/graph.js` using Canvas 2D or uPlot to render separation and closure time-series.
  4. Connect Solver button to `solveSpacing()` with an asynchronous busy state for the 60 simulation trials.
  5. Add unit and visual tests for graph canvas rendering.
  6. Open PR, merge on green.

---

### PPQ-11: Turn Sim SMM Dynamic Maneuvers (Rejoins, Fighting Wing, Fluid)
- **Specification:** `specs/SPEC-turn-sim.md:213-219`; `docs/records/future-ideas.md:11` (FF39, FF40, FF41).
- **Prerequisites:** PPQ-09 (Sequence engine).
- **Step-by-Step Resume Procedure:**
  1. `git checkout -b feature/turn-sim-smm-maneuvers origin/main`
  2. Implement turning rejoins with varying closure geometry.
  3. Implement Fighting Wing cone boundary validation (30° to 45° aspect, 500–1,500 ft).
  4. Add unit tests for wingman tracking algorithms.
  5. Open PR, merge on green.

---

### PPQ-12: SOF Live Traffic ADS-B Cloudflare Relay Deployment
- **Preserved Anchor:** Merged on `main` in `relay/traffic.js`, `relay/lib.js`, and `src/modules/sof/traffic.js`.
- **Preserved Status:** Code 100% written and tested in `tests/unit/relay/traffic.test.js`.
- **Prerequisites:** Patrick provides active Cloudflare Workers URL.
- **Step-by-Step Resume Procedure:**
  1. Deploy `relay/traffic.js` to Cloudflare Worker instance.
  2. Add worker hostname to Content Security Policy in `index.html` and `docs/records/csp-hosts.md`.
  3. In SOF Dashboard Settings -> Traffic Relay box, configure live URL.
  4. Enable "Live Traffic" layer on SOF radar map; verify military aircraft callsigns and 10s poll cycle.

---

### PPQ-13: SOF 12-Hour All-Day Soak Testing
- **Specification:** `tasks/sof/todo.md:68-72` (Task 9).
- **Prerequisites:** Phase 1 Prototype sign-off.
- **Step-by-Step Resume Procedure:**
  1. Run Playwright headless instance for 12 hours polling live Moose Jaw weather and mock radar frames.
  2. Monitor heap growth with `performance.memory.usedJSHeapSize`.
  3. Confirm no memory leak over 10,000 DOM refresh cycles.

---

### PPQ-14: Debrief Native Weather File Schema Migration
- **Specification:** `tasks/debrief/todo.md:93`; `docs/records/plan-decisions.md:212` (D276).
- **Prerequisites:** Phase 1 Prototype sign-off.
- **Step-by-Step Resume Procedure:**
  1. Expand `src/flight-data/debrief-file.js` to support top-level `weather: { metar, radarFrames, lightning }` block.
  2. Implement backward-compatible reader for older debrief JSON files.
  3. Update file export and import unit tests.

---

### PPQ-15: Turn Fight Chaser Dynamic Pursuit AI
- **Specification:** `docs/handover/turn-fight.md:86` (FF42).
- **Prerequisites:** Phase 1 Prototype sign-off.
- **Step-by-Step Resume Procedure:**
  1. In `src/modules/turn-fight/sim.js`, implement dynamic pursuit selection (pure, lead, or lag pursuit based on range and closing velocity).
  2. Add unit tests verifying target aspect angle evolution.

---

### PPQ-16: Standalone Applications (PT-PT Sim, Formation Briefing Board)
- **Specification:** `docs/records/future-ideas.md:8` (FF1, FF2).
- **Status:** Independent future web applications. Out of scope for this repository.
