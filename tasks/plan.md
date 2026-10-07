# Implementation Plan: Track B - PFL Full Rewrite as a Segment Planner

## Overview
This plan implements the complete architectural rewrite of Practice Forced Landings (PFL) in Traffic Sim ([`src/modules/traffic/pfl.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/pfl.js)) as specified in [`pfl-full-rewrite-handover.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/Pat%27s%20claude%20work/traffic-review/pfl-full-rewrite-handover.md) and Fable's audit ([`fable-report.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/Pat%27s%20claude%20work/traffic-review/fable-report.md)). It replaces the legacy proportional carrot follower (`lookaheadFt = 1000..6000`) with an aerodynamically disciplined segment planner: planning the entire glide as an explicit chain of held-bank turns, straights, gear/flap milestones, and a two-stage round-out. It unifies the zoom climb with [`src/core/t6-performance.js:flyZoomT6A`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/core/t6-performance.js#L330) (resolving F7), calculates height loss on the exact path flown (resolving F9's 144 ft error), and re-plans at discrete events rather than chasing a moving target each frame.

## Architecture Decisions
1. **Discrete Segment Chain:** A PFL trajectory is modeled as an array of discrete kinematic flight segments:
   - `zoom`: 2 G pull to 20° nose-up, hold to 145 KIAS, 0.25 G push-over to 125 KIAS best glide, banking up to 30° toward the join.
   - `decel`: Level deceleration from $\le 150\text{ KIAS}$ to $125\text{ KIAS}$ clean glide speed.
   - `arc`: Coordinated turn at constant bank angle $\phi$ ($30^\circ$, $45^\circ$, up to $60^\circ$ maximum) at current glide speed in wind.
   - `straight`: Constant glide slope along ground track $\vec{V}_{\text{TAS}} + \vec{W}$ with configuration sink rate $\dot{z} = -V / (L/D)$.
   - `roundout`: Two-stage round-out (SMM 13.10 para 19) easing descent to touch down at 80–90 KIAS in the first third of the runway.
2. **Unified Zoom (F7):** The planner and the flight step share the exact same equations from [`src/core/t6-performance.js:flyZoomT6A`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/core/t6-performance.js#L330). Predicted altitude at zoom apex matches flown altitude to within numerical integration tolerance, eliminating the 200 ft overshoot.
3. **One Height Sum (F9):** Height needed is evaluated directly on the planned segments ($\Delta z = \sum \Delta z_{\text{segment}}$) rather than approximated by separate straight-line search and curved follower models.
4. **Event-Driven Re-planning ("Fly Like a Pilot, Not a Controller"):**
   The chain is flown as planned and re-evaluated only at:
   - Apex of the zoom / end of level decel.
   - High Key (or join point on the circle).
   - Low Key.
   - Final Key / committed direct.
   - Height margin crossing the tolerance threshold ($\pm 300\text{ ft}$).
5. **Configuration Governance (Q1, Q2, Q3):**
   - Gear extended by Low Key or 2,400 ft MSL (or when lined up on direct).
   - T/O flap between Low Key and Final Key if on or above profile.
   - Landing flap when runway landing is assured.
   - Direct approach waives the first-third touchdown rule inside Final Key if emergency landing requires using extended runway length.

---

## Task List Index

### Phase 1: Foundation & The Unified Zoom Segment
- [ ] Task 1: Kinematic Zoom & Decel Segment Generator (`zoom-segment.js`)
- [ ] Task 2: PFL Join Point Energy Predictor (`pfl-join-energy.js`)
- [ ] Checkpoint 1: Zoom & Decel Verification

### Phase 2: Core Segment Chain & Flight Primitives
- [ ] Task 3: PFL Arc and Straight Segment Evaluators (`pfl-segments.js`)
- [ ] Task 4: Standard Route Segment Chain Builders (High Key, Low Key, Area, Downwind)
- [ ] Checkpoint 2: Static Segment Chain Geometry & Height-Sum Verification

### Phase 3: Segment Stepper & Event-Driven Re-planner
- [ ] Task 5: Step Follower for PFL Segment Chains
- [ ] Task 6: Event-Driven Re-planning at Key Points and Energy Thresholds
- [ ] Checkpoint 3: Standard Starts Flying End-to-End

### Phase 4: Direct Approaches, Staged Drag & Touchdown Flare
- [ ] Task 7: Direct-to-Runway & Base/Final Turn Recovery
- [ ] Task 8: Staged Drag Governance and Two-Stage Round-Out Flare
- [ ] Checkpoint 4: Complete Failure Matrix Verification (Calm, 20 kt Wind, Hot/Cold Days)

### Phase 5: UI/2D/3D Integration & Dead Code Cleanup
- [x] Task 9A: Wire Simulation Stepper to Segment Planner (`sim.js`, `tick-aircraft.js`)
- [x] Task 9B: 2D Map Overlays, Tactical Badges & Planned Track (`map2d.js`, `scene.js`)
- [x] Task 9C: 3D Scene Visualization & Telemetry Hooks (`view3d.js`)
- [x] Task 10: Retire Legacy Carrot Follower & F14 Dead Code Cleanup (`pfl.js`, `route.js`, `sim.js`)
- [x] Checkpoint 5: Full System Integration, Visualization & Sign-Off

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex wind drift during held-bank turns | High | Use closed-form wind-drift arc integration with local wind triangle rather than numerical stepping during planning. |
| Re-planning instability near key points | Med | Implement hysteresis band ($\pm 300\text{ ft}$) and grace period (`PFL.planGraceSec`) so re-plans do not jitter. |
| Test suite regressions during follower retirement | High | Keep old and new implementations toggleable or develop in dedicated files until the full matrix passes. |
| Local test command restriction (Observation 0050) | High | Never run `node --test` or `npm test` locally. Rely on targeted validation scripts and PR CI. |

## Open Questions
- None blocking start: Fable's review questions Q1 (gear drag), Q2 (inside Final Key), Q3 (direct gear/flaps), Q4 (zoom), and Q6 (round-out) provide settled working directions.
