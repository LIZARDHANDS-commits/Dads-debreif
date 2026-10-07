# Tasks: Track B - PFL Full Rewrite as a Segment Planner

## Phase 1: Foundation & The Unified Zoom Segment

### Task 1: Kinematic Zoom & Decel Segment Generator
**Description:** Implement the unified zoom and level deceleration segment generator based on `src/core/t6-performance.js:flyZoomT6A`. For entries above 150 KIAS, generate the 2 G pull to 20° pitch, hold to 145 KIAS, and 0.25 G push-over to 125 KIAS with up to 30° bank turn toward the join. For entries at or below 150 KIAS, generate the level deceleration to 125 KIAS.
**Acceptance criteria:**
- [x] Returns segment metadata: `{ type: 'zoom'|'decel', points, deltaAltFt, deltaDistFt, exitKias, exitHeadingDeg, timeSec }`
- [x] Uses `flyZoomT6A` kinematics without custom divergent climb caps (eliminates F7's 200 ft overshoot)
- [x] Turn vector while zooming rolls up to 30° toward the target join point
- [x] Deceleration below 150 KIAS maintains altitude and bleeds speed level to 125 KIAS
**Verification:**
- [x] Unit verification script asserts height gain from 220 KIAS at 3,500 ft matches NFM zoom gain (~959 ft) to within 2%
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** None
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Task 2: PFL Join Point Energy Predictor
**Description:** Build the join-point search and energy predictor using the exact output of Task 1's zoom/decel segment. Calculate available energy height at the top of the zoom ($H_e = h_{\text{apex}} + V^2/2g$) and score candidate join points (High Key, False High Key, Low Key, or Straight-in) using a single, unified energy formula.
**Acceptance criteria:**
- [x] Join point evaluation uses Task 1's calculated apex altitude directly
- [x] Eliminates the F9 discrepancy where the join search and decision layer assumed different zoom heights
- [x] Selects reachable key point with minimum required turn angle and safe altitude margin
**Verification:**
- [x] Unit verification script checks join selection for standard starts (Initial 220 kt, Break 190 kt, Downwind 140 kt)
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** Task 1
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Checkpoint: Foundation & Zoom (Tasks 1-2)
- [x] Zoom gain and time-to-apex match `flyZoomT6A` exactly
- [x] Join point decision accurately reflects the apex state
- [x] Review with human / inspect traces before proceeding to segment chain primitives

---

## Phase 2: Core Segment Chain & Flight Primitives

### Task 3: PFL Arc and Straight Segment Evaluators
**Description:** Implement kinematic evaluators for held-bank turns (`arc`) and constant-descent wings-level glides (`straight`). Each arc evaluates coordinated turn rate at current glide speed in wind, roll-in/roll-out easing, ground-track curvature, and height loss ($\Delta z = -v_{\text{TAS}} \cdot t / (L/D)$ with configuration drag factor).
**Acceptance criteria:**
- [x] `arc` segment models bank $\phi \in [30^\circ, 60^\circ]$ with wind-drift compensation
- [x] `straight` segment models steady-state glide along ground track at target KIAS (125 clean, 120 gear)
- [x] Exact height loss calculated per segment without cutting corners
**Verification:**
- [x] Unit check: 360° orbit at 45° bank and 120 KIAS loses ~1,700 ft clean and ~2,600 ft gear down per SMM 13.5
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** Task 2
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Task 4: Standard Route Segment Chain Builders
**Description:** Build complete PFL segment chains for standard starts (High Key pattern, Low Key join, Area entry, Downwind break). The chain sequences: (1) Zoom/Decel segment, (2) Intercept turn arc to the circle, (3) Straight/arc glide to High/Low Key, (4) Orbit/half-circle to Low Key, (5) Final turn arc to Final Key, (6) Final glide to threshold.
**Acceptance criteria:**
- [x] Returns connected chain `[seg0, seg1, ...]` where each segment's start position/heading/speed matches previous segment's end
- [x] Total height required matches sum of segment losses ($\sum \Delta z_i$)
- [x] Altitude margin at High Key (2,500–3,000 ft AGL) and Low Key (1,500 ft AGL) within SOP criteria
**Verification:**
- [x] Trace script logs segment continuity and height-sum across standard starts
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** Task 3
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Checkpoint: Core Segment Chain (Tasks 3-4)
- [x] Segment chains form continuous, smooth 3D flight paths without jumps
- [x] Height needed matches the path flown (eliminates F1 corner-cutting and F9 144 ft error)
- [x] Ready for dynamic follower implementation

---

## Phase 3: Segment Stepper & Event-Driven Re-planner

### Task 5: Step Follower for PFL Segment Chains
**Description:** Implement the step runner `stepPflSegment(pilot, chain, dt, wind)` that flies the aircraft along the planned chain of segments. The aircraft holds the segment's prescribed bank and descent rate, advancing along the true kinematic arc rather than chasing a carrot lookahead.
**Acceptance criteria:**
- [x] Aircraft bank rolls in/out smoothly at segment boundaries
- [x] Eliminates carrot-follower corner-cutting (F1/F16)
- [x] Records trajectory points `{ x, y, alt, kt, g, phase, decision, config }` for traffic visualization
**Verification:**
- [x] Verification script compares flown coordinates against planned segment geometry (error < 5 ft)
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** Task 4
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Task 6: Event-Driven Re-planning at Key Points and Energy Thresholds
**Description:** Implement event-based re-planning logic. Instead of re-aiming every tick, re-plan only at key events: at the top of the zoom, upon reaching High Key, Low Key, Final Key, or if the actual height deviates from the plan by more than $\pm 300\text{ ft}$.
**Acceptance criteria:**
- [x] Re-plan occurs at designated milestones (zoom apex, High Key, Low Key, Final Key)
- [x] Re-plan triggered if height margin exceeds $\pm 300\text{ ft}$ hysteresis threshold
- [x] Enforces grace period (`planGraceSec`) to avoid rapid back-to-back re-plans
**Verification:**
- [x] Trace confirms re-planning triggers 3–5 times per forced landing rather than every frame
- [x] Flown trajectory remains rock-stable in steady winds
**Dependencies:** Task 5
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Checkpoint: Dynamic Flying & Event Re-planning (Tasks 5-6)
- [x] Aircraft flies standard High Key and Low Key starts smoothly end-to-end
- [x] Pilot sets bank, holds attitude, and re-plans only at events
- [x] Ready to handle special cases, directs, and touchdown flare

---

## Phase 4: Direct Approaches, Staged Drag & Touchdown Flare

### Task 7: Direct-to-Runway & Base/Final Turn Recovery
**Description:** Implement segment chains for low-energy starts that cannot reach High or Low Key (base leg, final turn, low altitude). If inside Final Key, waives the first-third touchdown constraint to land safely on available runway (Fable Q2). If unable to make the runway, triggers ejection at Low Key altitude.
**Acceptance criteria:**
- [x] Low-energy starts build direct-to-runway segment chains (carry-on turn onto runway centerline)
- [x] Inside Final Key, aims for available runway length rather than ejecting prematurely
- [x] Inevitable crashes trigger orderly ejection sequence per SOP
**Verification:**
- [x] Matrix tests for final turn failure points verify safe runway landing or clean ejection
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** Task 6
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Task 8: Staged Drag Governance and Two-Stage Round-Out Flare
**Description:** Implement staged gear and flap progression and the SMM 13.10 two-stage round-out flare. Gear extends by 2,400 ft MSL or Low Key; T/O flap extends between Low Key and Final Key when on/above profile; Landing flap extends when touchdown is assured. At 50 ft AGL, execute two-stage round-out easing descent to touch down at 80–90 KIAS.
**Acceptance criteria:**
- [x] Drag changes are staged at least 5 s apart (resolves F6 drag dump)
- [x] Two-stage round-out models pitch-up and speed decay from 120 KIAS glide to 80–90 KIAS touchdown
- [x] Wheels touch within the first 1,000–1,500 ft of runway on normal profile starts
**Verification:**
- [x] Touchdown speed and distance verification across calm, 20 kt wind, -30°C and +30°C
- [x] Syntax check: `node --check src/modules/traffic/pfl.js`
**Dependencies:** Task 7
**Files touched:**
- `src/modules/traffic/pfl.js`

---

### Checkpoint: Full Flight Envelope & Touchdown (Tasks 7-8)
- [x] All standard and emergency starts execute cleanly from failure to touchdown
- [x] Drag is staged realistically and round-out touches down at authentic speed
- [x] Ready for UI integration and legacy cleanup

---

## Phase 5: UI/2D/3D Integration & Dead Code Cleanup

### Task 9A: Wire Simulation Stepper to Segment Planner
**Description:** Connect `startPflFlight`, `resumePflFlight`, and `tickAircraft` in `sim.js` and `tick-aircraft.js` to use the segment planner flight engine. Forward rich segment telemetry (`pflSegment`, `pflDecision`, `pflMarginFt`, `pflMarginTag`, `config`) to the active aircraft state each step so downstream visualization layers receive live energy and phase data.
**Acceptance criteria:**
- [x] `startPflFlight` and `resumePflFlight` initialize and step using the segment planner trajectory
- [x] Aircraft state updates `pflSegment`, `pflDecision`, `pflMarginFt`, and `config` on every simulation tick
- [x] Emergency ejections and successful landings hand off to `pflEnded` with zero coordinate discontinuity
**Verification:**
- [x] Syntax check: `node --check src/modules/traffic/sim.js` and `node --check src/modules/traffic/tick-aircraft.js`
- [x] Standalone test script verifies `createSim(setup).command(acId, 'pfl_current')` advances through segments and populates telemetry
**Dependencies:** Task 8
**Files touched:**
- `src/modules/traffic/sim.js`
- `src/modules/traffic/tick-aircraft.js`

---

### Task 9B: 2D Map Overlays, Tactical Badges & Planned Track
**Description:** Update `map2d.js` and `scene.js` to render live segment planner telemetry and ground tracks. Format `getPflBadge(ac)` to output standard tactical badges (e.g., `[PFL: High Key (+250 ft) • Clean]`, `[PFL: Zoom • Clean]`, `[PFL: Direct Runway]`). In `scene.js`, supply the planned segment chain to `scene.routes` with `kind: 'pfl'` (dash-dot styling `[10, 4, 2, 4]`) when a PFL aircraft is selected or active.
**Acceptance criteria:**
- [x] `getPflBadge(ac)` displays active milestone, energy margin in feet, and configuration label
- [x] 2D map renders the planned segment chain with dash-dot style `[10, 4, 2, 4]` when PFL is active
- [x] Glide footprint ring matches segment planner configuration drag (L/D) and ambient temperature
**Verification:**
- [x] Syntax check: `node --check src/modules/traffic/map2d.js` and `node --check src/modules/traffic/scene.js`
- [x] Verification script checks badge string outputs across all segment types and energy conditions
**Dependencies:** Task 9A
**Files touched:**
- `src/modules/traffic/map2d.js`
- `src/modules/traffic/scene.js`

---

### Task 9C: 3D Scene Visualization & Telemetry Hooks
**Description:** Integrate segment planner readouts and path displays into `view3d.js`. Connect the 3D aircraft label writer to display the updated tactical PFL badge with theme palette styling, ensure the 3D ground glide ring reflects current configuration reach, and align PFL key markers with wind-adjusted geometry.
**Acceptance criteria:**
- [x] 3D aircraft text label renders tactical PFL badge with proper vertical offset and color
- [x] 3D ground glide ring dynamically scales with configuration drag from the segment planner
- [x] Zero WebGL/three.js console errors during PFL flight execution in 3D mode
**Verification:**
- [x] Syntax check: `node --check src/modules/traffic/view3d.js`
- [x] Standalone node script verifies 3D badge text formatting and ground circle coordinates
**Dependencies:** Task 9B
**Files touched:**
- `src/modules/traffic/view3d.js`

---

### Task 10: Retire Legacy Carrot Follower & F14 Dead Code Cleanup
**Description:** Retire the legacy carrot follower (`carrot()`, proportional heading tracking, virtual lookahead) and promote `pfl-segment-planner.js` to the canonical `src/modules/traffic/pfl.js`. Clean dead code identified in Fable audit F14 (`generatePflTrack` in `route.js`, unused `pflRail` references in `sim.js`/`behaviour.js`, duplicate stall-bank formulas), and update module documentation.
**Acceptance criteria:**
- [x] Legacy carrot follower is completely excised and replaced by kinematic segment follower
- [x] `route.js:generatePflTrack` and legacy `pflRail` fields are removed without regression
- [x] `docs/modules/traffic/spec.md`, `docs/modules/traffic/plan.md`, and `docs/modules/traffic/decisions.md` are updated and ticked
**Verification:**
- [x] Run `verify-pfl-planner.mjs` asserting all 27 failure combinations pass across all wind conditions
- [x] `git diff` confirms complete removal of dead code and zero duplicate flight maths
**Dependencies:** Task 9C
**Files touched:**
- `src/modules/traffic/pfl.js`
- `src/modules/traffic/route.js`
- `src/modules/traffic/sim.js`
- `docs/modules/traffic/spec.md`
- `docs/modules/traffic/plan.md`

---

## Checkpoint 5: Full System Integration, Visualization & Sign-Off (Tasks 9A-10)
- [x] All 27 failure combinations land safely or eject cleanly across calm and 20 kt winds
- [x] 2D map displays live segment badges, margins, and planned dash-dot path
- [x] 3D view renders tactical badges and glide rings without WebGL errors
- [x] Legacy carrot follower and F14 dead code completely eliminated
- [x] Ready for Patrick's flight evaluation

---

# Tasks: 3D Point-Mass Wiring & Tactical Aerobatics (Turn Sim)

## Task 1: Closed-Loop Throttle Trim & Speed Hold in `flight.js` and `power.js`
**Description:** Eliminate open-loop throttle heuristics (`0.5` / `0.8`) in the 3D point-mass integration bridge. Use `throttleFor` to compute exact thrust-equals-drag equilibrium throttle at the current airspeed and flight conditions, plus a small proportional/integral speed error trim so that cruise holds exactly on target (e.g. 220.0 KIAS) without accelerating or bleeding energy.
**Acceptance criteria:**
- [x] At steady level flight at 8,000 ft MSL, throttle settles at equilibrium trim (~69.3% at 220 KIAS).
- [x] Speed remains locked within $\pm 0.1$ kt of commanded KIAS during straight-and-level flight over 60 seconds.
- [x] Acceleration commands (`plan.accelKtps` or `a.power`) seamlessly translate into appropriate excess thrust.
**Verification:**
- [x] Tests pass: zero speed drift in 60s cruise at 220.0 KIAS.
- [x] Build succeeds: `node --check src/modules/turn-sim/live/flight.js`
- [x] Manual check: Tag displays steady power reading (`TQ 72%`).
**Dependencies:** None
**Files touched:**
- `src/modules/turn-sim/live/flight.js`

---

## Task 2: 3D Guidance Law Bridge (`liftTowardAim` + `gAndBankForLift`) in `pilot.js` and `tracker.js`
**Description:** Wire `liftTowardAim` and `gAndBankForLift` from `src/core/point-mass.js` into the tracker and pilot models. For 3D tracking phases, compute the 3D aim vector in world coordinates, derive the required 3D lift vector that satisfies gravity compensation and line-of-sight pointing, and convert it to load factor ($G$) and roll angle. For standard formation changes, enforce 2,000 ft step-down gate, and 1,200 ft canopy sightline lock (`isLeadInCanopy`). Do NOT impose an artificial bank limit (envelope gate is the only governor per Patrick ruling).
**Acceptance criteria:**
- [x] `tracker.js` can steer toward 3D aim points via `liftTowardAim` when flying 3D tracking phases.
- [x] Canopy line-of-sight invariant ($\text{LOS} \cdot \hat{c} \ge 0$) holds true at all points inside 1,200 ft range during rejoins.
- [x] Standard formation changes enforce 2,000 ft step-down below Lead with no artificial bank limit (physical gate only).
**Verification:**
- [x] Tests pass: `node --test tests/unit/core/canopy.test.js` (10/10 green)
- [x] Build succeeds: `node --check src/modules/turn-sim/live/tracker.js`
- [x] Manual check: Wing stays stepped down below Lead inside 2,000 ft throughout turning rejoins.
**Dependencies:** Task 1
**Files touched:**
- `src/modules/turn-sim/live/tracker.js`
- `src/core/canopy.js`
- `tests/unit/core/canopy.test.js`

---

## Task 3.1: Wire 3D Lift Vector Guidance into `lag-roll.js`
**Description:** Connect `liftTowardAim` and `gAndBankForLift` from `src/core/point-mass.js` into `lag-roll.js`. Replace 1D nose tracking in `flyPmRoll` with continuous 3D lift vector pointing directed at the dynamic out-and-up lag point above Lead's six, smoothly transitioning into the opposite fighting wing slot. Ensure roll pulls through $>90^\circ$ bank inverted with positive G ($G \ge 1.0$) and positive canopy line of sight throughout.
**Acceptance criteria:**
- [x] Lag roll steers via continuous 3D lift vector pointing (`liftTowardAim` + `gAndBankForLift`).
- [x] Inverted apex over Lead's six maintains positive load factor ($G \ge 1.0$) and line-of-sight pointing.
- [x] Trajectory cleanly rolls out wings-level in the fighting wing cone on the opposite side.
**Verification:**
- [x] Tests pass: `node --check src/modules/turn-sim/live/lag-roll.js`
- [x] Unit simulation verification: lag roll completes within SMM limits without gimbal lock.
- [x] Manual check: Triggering Lag Roll executes over-the-top pull and rolls out in position.
**Dependencies:** Task 2
**Files touched:**
- `src/modules/turn-sim/live/lag-roll.js`

---

## Task 3.2: Wire 3D Lift Guidance into `rolling-rejoin.js`
**Description:** Integrate `liftTowardAim` and `gAndBankForLift` into candidate roll generation in `rolling-rejoin.js` (`flyRoll`). Apply 3D lift vector guidance to barrel roll and high yo-yo maneuvers steering toward the turning rejoin entry tangent while strictly staying outside Lead's 500 ft bubble.
**Acceptance criteria:**
- [x] Rolling rejoin candidate trajectories compute normal G and bank via 3D lift vector guidance.
- [x] 500 ft bubble invariant is strictly preserved throughout the roll.
- [x] Roll-out handoff into `searchTurningRejoin` connects smoothly on position, track, and speed.
**Verification:**
- [x] Tests pass: `node --check src/modules/turn-sim/live/rolling-rejoin.js`
- [x] Unit simulation verification: candidate rolls evaluate and rank cleanly.
- [x] Manual check: Rejoin with roll selection completes and rejoins on line.
**Dependencies:** Task 3.1
**Files touched:**
- `src/modules/turn-sim/live/rolling-rejoin.js`

---

## Task 3.3: Doctrinal Decoupling & Regression Verification
**Description:** Validate strict doctrinal decoupling across `chooser.js` and transition interfaces. Verify that standard formation changes (`f.change('fw')`, `'lab'`, `'echelon'`, `'route'`, `'astern'`) NEVER execute or trigger unprompted rolls past $90^\circ$ (retaining Patrick's 6 Oct 16:22Z ruling). Verify that dedicated button triggers (`lagRoll` and `TRJ + roll`) remain the sole pathways for aerobatic over-the-top pulls.
**Acceptance criteria:**
- [x] Standard formation changes are mathematically and architecturally precluded from triggering rolls unprompted.
- [x] Dedicated buttons (`lagRoll` and `TRJ + roll`) execute tactical 3D guidance maneuvers when selected.
- [x] Zero regressions in existing test suites (`transitions.test.js` and `canopy.test.js`).
**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/transitions.test.js` (4/4 green)
- [x] Tests pass: `node --test tests/unit/core/canopy.test.js` (10/10 green)
- [x] Manual check: Standard formation changes stay upright; dedicated roll buttons execute rolls.
**Dependencies:** Tasks 3.1, 3.2
**Files touched:**
- `src/modules/turn-sim/live/chooser.js`
- `tests/unit/turn-sim/transitions.test.js`

---

## Task 4: Handover Pitch Rate Continuity & Transition Polish in `transitions.test.js`
**Description:** Polish the transition handover assertions in `tests/unit/turn-sim/transitions.test.js`. Per Patrick's direct ruling ("do not impose a bank limit" / 6 Oct 04:07Z "no bank cap in formation — only physics through the gate"), do not impose an artificial 60° bank limit on formation changes. Ensure smooth handover pitch rate continuity ($\le 1.5^\circ/\text{s}$ at $0.05$ s step) in line abreast to echelon, and ensure terminal speed settles cleanly on the target formation speed (200.0 KIAS).
**Acceptance criteria:**
- [x] No artificial bank limit imposed (envelope gate enforces physical T-6A limits).
- [x] Pitch rate at handover ($t = 0.10$ s) remains within physical G onset rate bounds across all formation transitions.
- [x] Terminal indicated airspeed in lab to fw settles within target tolerance (200.0 KIAS).
- [x] Transition tests in `tests/unit/turn-sim/transitions.test.js` pass (4/4).
**Verification:**
- [x] Tests pass: `node --test tests/unit/turn-sim/transitions.test.js` (4/4 green)
- [x] Build succeeds: `node --check src/modules/turn-sim/live/transitions.js`
- [x] Manual check: Transitions panel shows smooth, continuous profile from start to roll-out.
**Dependencies:** Tasks 1, 2
**Files touched:**
- `src/modules/turn-sim/live/turning-rejoin.js`
- `src/modules/turn-sim/live/formation.js`
- `src/modules/turn-sim/live/events.js`
- `tests/unit/turn-sim/transitions.test.js`

---

## Checkpoint: Final Verification
- [x] `tests/unit/core/canopy.test.js` passes (10/10).
- [x] `tests/unit/turn-sim/transitions.test.js` passes (4/4).
- [x] Task 3 tactical maneuvers implemented and verified green.
