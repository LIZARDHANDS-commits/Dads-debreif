# Tasks: Track B - PFL Full Rewrite as a Segment Planner

## Phase 1: Foundation & The Unified Zoom Segment

### Task 1: Kinematic Zoom & Decel Segment Generator
**Description:** Implement the unified zoom and level deceleration segment generator based on `src/core/t6-performance.js:flyZoomT6A`. For entries above 150 KIAS, generate the 2 G pull to 20° pitch, hold to 145 KIAS, and 0.25 G push-over to 125 KIAS with up to 30° bank turn toward the join. For entries at or below 150 KIAS, generate the level deceleration to 125 KIAS.
**Acceptance criteria:**
- [ ] Returns segment metadata: `{ type: 'zoom'|'decel', points, deltaAltFt, deltaDistFt, exitKias, exitHeadingDeg, timeSec }`
- [ ] Uses `flyZoomT6A` kinematics without custom divergent climb caps (eliminates F7's 200 ft overshoot)
- [ ] Turn vector while zooming rolls up to 30° toward the target join point
- [ ] Deceleration below 150 KIAS maintains altitude and bleeds speed level to 125 KIAS
**Verification:**
- [ ] Unit verification script asserts height gain from 220 KIAS at 3,500 ft matches NFM zoom gain (~959 ft) to within 2%
- [ ] Syntax check: `node --check src/modules/traffic/pfl-zoom.js`
**Dependencies:** None
**Files likely touched:**
- `src/modules/traffic/pfl-zoom.js`
- `tests/unit/traffic/pfl.test.js`
**Estimated scope:** S (1-2 files)

---

### Task 2: PFL Join Point Energy Predictor
**Description:** Build the join-point search and energy predictor using the exact output of Task 1's zoom/decel segment. Calculate available energy height at the top of the zoom ($H_e = h_{\text{apex}} + V^2/2g$) and score candidate join points (High Key, False High Key, Low Key, or Straight-in) using a single, unified energy formula.
**Acceptance criteria:**
- [ ] Join point evaluation uses Task 1's calculated apex altitude directly
- [ ] Eliminates the F9 discrepancy where the join search and decision layer assumed different zoom heights
- [ ] Selects reachable key point with minimum required turn angle and safe altitude margin
**Verification:**
- [ ] Unit verification script checks join selection for standard starts (Initial 220 kt, Break 190 kt, Downwind 140 kt)
- [ ] Syntax check: `node --check src/modules/traffic/pfl-plan.js`
**Dependencies:** Task 1
**Files likely touched:**
- `src/modules/traffic/pfl-plan.js`
- `src/modules/traffic/pfl.js`
**Estimated scope:** S (1-2 files)

---

### Checkpoint: Foundation & Zoom (Tasks 1-2)
- [ ] Zoom gain and time-to-apex match `flyZoomT6A` exactly
- [ ] Join point decision accurately reflects the apex state
- [ ] Review with human / inspect traces before proceeding to segment chain primitives

---

## Phase 2: Core Segment Chain & Flight Primitives

### Task 3: PFL Arc and Straight Segment Evaluators
**Description:** Implement kinematic evaluators for held-bank turns (`arc`) and constant-descent wings-level glides (`straight`). Each arc evaluates coordinated turn rate at current glide speed in wind, roll-in/roll-out easing, ground-track curvature, and height loss ($\Delta z = -v_{\text{TAS}} \cdot t / (L/D)$ with configuration drag factor).
**Acceptance criteria:**
- [ ] `arc` segment models bank $\phi \in [30^\circ, 60^\circ]$ with wind-drift compensation
- [ ] `straight` segment models steady-state glide along ground track at target KIAS (125 clean, 120 gear)
- [ ] Exact height loss calculated per segment without cutting corners
**Verification:**
- [ ] Unit check: 360° orbit at 45° bank and 120 KIAS loses ~1,700 ft clean and ~2,600 ft gear down per SMM 13.5
- [ ] Syntax check: `node --check src/modules/traffic/pfl-segments.js`
**Dependencies:** Task 2
**Files likely touched:**
- `src/modules/traffic/pfl-segments.js`
**Estimated scope:** M (2-3 files)

---

### Task 4: Standard Route Segment Chain Builders
**Description:** Build complete PFL segment chains for standard starts (High Key pattern, Low Key join, Area entry, Downwind break). The chain sequences: (1) Zoom/Decel segment, (2) Intercept turn arc to the circle, (3) Straight/arc glide to High/Low Key, (4) Orbit/half-circle to Low Key, (5) Final turn arc to Final Key, (6) Final glide to threshold.
**Acceptance criteria:**
- [ ] Returns connected chain `[seg0, seg1, ...]` where each segment's start position/heading/speed matches previous segment's end
- [ ] Total height required matches sum of segment losses ($\sum \Delta z_i$)
- [ ] Altitude margin at High Key (2,500–3,000 ft AGL) and Low Key (1,500 ft AGL) within SOP criteria
**Verification:**
- [ ] Trace script logs segment continuity and height-sum across standard starts
- [ ] Syntax check: `node --check src/modules/traffic/pfl-chain.js`
**Dependencies:** Task 3
**Files likely touched:**
- `src/modules/traffic/pfl-chain.js`
- `src/modules/traffic/pfl-segments.js`
**Estimated scope:** M (2-3 files)

---

### Checkpoint: Core Segment Chain (Tasks 3-4)
- [ ] Segment chains form continuous, smooth 3D flight paths without jumps
- [ ] Height needed matches the path flown (eliminates F1 corner-cutting and F9 144 ft error)
- [ ] Ready for dynamic follower implementation

---

## Phase 3: Segment Stepper & Event-Driven Re-planner

### Task 5: Step Follower for PFL Segment Chains
**Description:** Implement the step runner `stepPflSegment(pilot, chain, dt, wind)` that flies the aircraft along the planned chain of segments. The aircraft holds the segment's prescribed bank and descent rate, advancing along the true kinematic arc rather than chasing a carrot lookahead.
**Acceptance criteria:**
- [ ] Aircraft bank rolls in/out smoothly at segment boundaries
- [ ] Eliminates carrot-follower corner-cutting (F1/F16)
- [ ] Records trajectory points `{ x, y, alt, kt, g, phase, decision, config }` for traffic visualization
**Verification:**
- [ ] Verification script compares flown coordinates against planned segment geometry (error < 5 ft)
- [ ] Syntax check: `node --check src/modules/traffic/pfl-follower.js`
**Dependencies:** Task 4
**Files likely touched:**
- `src/modules/traffic/pfl-follower.js`
- `src/modules/traffic/pfl.js`
**Estimated scope:** M (2-3 files)

---

### Task 6: Event-Driven Re-planning at Key Points and Energy Thresholds
**Description:** Implement event-based re-planning logic. Instead of re-aiming every tick, re-plan only at key events: at the top of the zoom, upon reaching High Key, Low Key, Final Key, or if the actual height deviates from the plan by more than $\pm 300\text{ ft}$.
**Acceptance criteria:**
- [ ] Re-plan occurs at designated milestones (zoom apex, High Key, Low Key, Final Key)
- [ ] Re-plan triggered if height margin exceeds $\pm 300\text{ ft}$ hysteresis threshold
- [ ] Enforces grace period (`planGraceSec`) to avoid rapid back-to-back re-plans
**Verification:**
- [ ] Trace confirms re-planning triggers 3–5 times per forced landing rather than every frame
- [ ] Flown trajectory remains rock-stable in steady winds
**Dependencies:** Task 5
**Files likely touched:**
- `src/modules/traffic/pfl-replan.js`
- `src/modules/traffic/pfl-follower.js`
**Estimated scope:** M (2-3 files)

---

### Checkpoint: Dynamic Flying & Event Re-planning (Tasks 5-6)
- [ ] Aircraft flies standard High Key and Low Key starts smoothly end-to-end
- [ ] Pilot sets bank, holds attitude, and re-plans only at events
- [ ] Ready to handle special cases, directs, and touchdown flare

---

## Phase 4: Direct Approaches, Staged Drag & Touchdown Flare

### Task 7: Direct-to-Runway & Base/Final Turn Recovery
**Description:** Implement segment chains for low-energy starts that cannot reach High or Low Key (base leg, final turn, low altitude). If inside Final Key, waives the first-third touchdown constraint to land safely on available runway (Fable Q2). If unable to make the runway, triggers ejection at Low Key altitude.
**Acceptance criteria:**
- [ ] Low-energy starts build direct-to-runway segment chains (carry-on turn onto runway centerline)
- [ ] Inside Final Key, aims for available runway length rather than ejecting prematurely
- [ ] Inevitable crashes trigger orderly ejection sequence per SOP
**Verification:**
- [ ] Matrix tests for final turn failure points verify safe runway landing or clean ejection
- [ ] Syntax check: `node --check src/modules/traffic/pfl-direct.js`
**Dependencies:** Task 6
**Files likely touched:**
- `src/modules/traffic/pfl-direct.js`
- `src/modules/traffic/pfl-chain.js`
**Estimated scope:** M (2-3 files)

---

### Task 8: Staged Drag Governance and Two-Stage Round-Out Flare
**Description:** Implement staged gear and flap progression and the SMM 13.10 two-stage round-out flare. Gear extends by 2,400 ft MSL or Low Key; T/O flap extends between Low Key and Final Key when on/above profile; Landing flap extends when touchdown is assured. At 50 ft AGL, execute two-stage round-out easing descent to touch down at 80–90 KIAS.
**Acceptance criteria:**
- [ ] Drag changes are staged at least 5 s apart (resolves F6 drag dump)
- [ ] Two-stage round-out models pitch-up and speed decay from 120 KIAS glide to 80–90 KIAS touchdown
- [ ] Wheels touch within the first 1,000–1,500 ft of runway on normal profile starts
**Verification:**
- [ ] Touchdown speed and distance verification across calm, 20 kt wind, -30°C and +30°C
- [ ] Syntax check: `node --check src/modules/traffic/pfl-drag.js`
**Dependencies:** Task 7
**Files likely touched:**
- `src/modules/traffic/pfl-drag.js`
- `src/modules/traffic/pfl-follower.js`
**Estimated scope:** M (2-3 files)

---

### Checkpoint: Full Flight Envelope & Touchdown (Tasks 7-8)
- [ ] All standard and emergency starts execute cleanly from failure to touchdown
- [ ] Drag is staged realistically and round-out touches down at authentic speed
- [ ] Ready for UI integration and legacy cleanup

---

## Phase 5: UI/2D/3D Integration & Dead Code Cleanup

### Task 9A: Wire Simulation Stepper to Segment Planner
**Description:** Connect `startPflFlight`, `resumePflFlight`, and `tickAircraft` in `sim.js` and `tick-aircraft.js` to use the segment planner flight engine. Forward rich segment telemetry (`pflSegment`, `pflDecision`, `pflMarginFt`, `pflMarginTag`, `config`) to the active aircraft state each step so downstream visualization layers receive live energy and phase data.
**Acceptance criteria:**
- [ ] `startPflFlight` and `resumePflFlight` initialize and step using the segment planner trajectory
- [ ] Aircraft state updates `pflSegment`, `pflDecision`, `pflMarginFt`, and `config` on every simulation tick
- [ ] Emergency ejections and successful landings hand off to `pflEnded` with zero coordinate discontinuity
**Verification:**
- [ ] Syntax check: `node --check src/modules/traffic/sim.js` and `node --check src/modules/traffic/tick-aircraft.js`
- [ ] Standalone test script verifies `createSim(setup).command(acId, 'pfl_current')` advances through segments and populates telemetry
**Dependencies:** Task 8
**Files likely touched:**
- `src/modules/traffic/sim.js`
- `src/modules/traffic/tick-aircraft.js`
**Estimated scope:** S (2 files)

---

### Task 9B: 2D Map Overlays, Tactical Badges & Planned Track
**Description:** Update `map2d.js` and `scene.js` to render live segment planner telemetry and ground tracks. Format `getPflBadge(ac)` to output standard tactical badges (e.g., `[PFL: High Key (+250 ft) • Clean]`, `[PFL: Zoom • Clean]`, `[PFL: Direct Runway]`). In `scene.js`, supply the planned segment chain to `scene.routes` with `kind: 'pfl'` (dash-dot styling `[10, 4, 2, 4]`) when a PFL aircraft is selected or active.
**Acceptance criteria:**
- [ ] `getPflBadge(ac)` displays active milestone, energy margin in feet, and configuration label
- [ ] 2D map renders the planned segment chain with dash-dot style `[10, 4, 2, 4]` when PFL is active
- [ ] Glide footprint ring matches segment planner configuration drag (L/D) and ambient temperature
**Verification:**
- [ ] Syntax check: `node --check src/modules/traffic/map2d.js` and `node --check src/modules/traffic/scene.js`
- [ ] Verification script checks badge string outputs across all segment types and energy conditions
**Dependencies:** Task 9A
**Files likely touched:**
- `src/modules/traffic/map2d.js`
- `src/modules/traffic/scene.js`
**Estimated scope:** S (2 files)

---

### Task 9C: 3D Scene Visualization & Telemetry Hooks
**Description:** Integrate segment planner readouts and path displays into `view3d.js`. Connect the 3D aircraft label writer to display the updated tactical PFL badge with theme palette styling, ensure the 3D ground glide ring reflects current configuration reach, and align PFL key markers with wind-adjusted geometry.
**Acceptance criteria:**
- [ ] 3D aircraft text label renders tactical PFL badge with proper vertical offset and color
- [ ] 3D ground glide ring dynamically scales with configuration drag from the segment planner
- [ ] Zero WebGL/three.js console errors during PFL flight execution in 3D mode
**Verification:**
- [ ] Syntax check: `node --check src/modules/traffic/view3d.js`
- [ ] Standalone node script verifies 3D badge text formatting and ground circle coordinates
**Dependencies:** Task 9B
**Files likely touched:**
- `src/modules/traffic/view3d.js`
**Estimated scope:** XS (1 file)

---

### Task 10: Retire Legacy Carrot Follower & F14 Dead Code Cleanup
**Description:** Retire the legacy carrot follower (`carrot()`, proportional heading tracking, virtual lookahead) and promote `pfl-segment-planner.js` to the canonical `src/modules/traffic/pfl.js`. Clean dead code identified in Fable audit F14 (`generatePflTrack` in `route.js`, unused `pflRail` references in `sim.js`/`behaviour.js`, duplicate stall-bank formulas), and update module documentation.
**Acceptance criteria:**
- [ ] Legacy carrot follower is completely excised and replaced by kinematic segment follower
- [ ] `route.js:generatePflTrack` and legacy `pflRail` fields are removed without regression
- [ ] `docs/modules/traffic/spec.md`, `docs/modules/traffic/plan.md`, and `docs/modules/traffic/decisions.md` are updated and ticked
**Verification:**
- [ ] Run `verify-pfl-planner.mjs` asserting all 27 failure combinations pass across all wind conditions
- [ ] `git diff` confirms complete removal of dead code and zero duplicate flight maths
**Dependencies:** Task 9C
**Files likely touched:**
- `src/modules/traffic/pfl.js`
- `src/modules/traffic/route.js`
- `src/modules/traffic/sim.js`
- `docs/modules/traffic/spec.md`
- `docs/modules/traffic/plan.md`
**Estimated scope:** M (3-5 files)

---

## Checkpoint 5: Full System Integration, Visualization & Sign-Off (Tasks 9A-10)
- [ ] All 27 failure combinations land safely or eject cleanly across calm and 20 kt winds
- [ ] 2D map displays live segment badges, margins, and planned dash-dot path
- [ ] 3D view renders tactical badges and glide rings without WebGL errors
- [ ] Legacy carrot follower and F14 dead code completely eliminated
- [ ] Ready for Patrick's flight evaluation
