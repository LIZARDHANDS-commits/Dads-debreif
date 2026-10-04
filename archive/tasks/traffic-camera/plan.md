# Implementation Plan: Traffic Sim 3D Tactical Camera System & Target Focus

## Overview
Deconstruct and implement an instructional camera system for the Traffic Pattern Sim (3D view) that enhances debriefing and pilot training at 15 Wing Moose Jaw (CYMJ). The system introduces:
1. Target aircraft binding (click-to-track in sidebar or 3D scene, hotkeys `[` and `]`).
2. Virtual Control Tower Cab perspective (SOF / Runway Control Officer view from 140 ft MSL).
3. Cockpit Forward POV (gunsight / HUD perspective looking along aircraft heading).
4. Cockpit "Padlock Runway" View (pilot eyepoint automatically tracking Runway 29L threshold to reproduce authentic downwind spacing, perch, and final turn visual sight pictures).
5. Tactical Camera Menu & Target Selector in the playback bar.

## Architecture Decisions
- **Unified Projection Pipeline:** Re-use the existing pure camera transform pipeline (`matchProjection`, `{ center, cam: { yawDeg, pitchDeg, zoom, altScale } }`) in `view3d.js` so that all new perspectives (Tower, Cockpit, Padlock) inherit smooth panning, scaling, and zero WebGL state churn.
- **Pure Math Module Extensions:** Place geometric viewpoint calculations (`towerCamera`, `cockpitCamera`, `padlockCamera`) as pure, unit-tested functions in `src/modules/traffic/view3d.js` or dedicated helper, avoiding side-effects.
- **Decoupled Selection & State:** The active target aircraft ID (`follow.id`) is tracked in `view3d.js`. Clicking an aircraft card in `aircraft.js` notifies `onSelectAircraft(id)`, which routes to `view3d.target(id)`.
- **Zero Physics Intrusion:** Strictly zero changes to `sim.js`, `index.js` physics routines, or `moose-jaw.json` aerodrome data, adhering strictly to D411 and project isolation rules.

## Task List

### Phase 1: Target Aircraft Selection & Tracking
- [ ] Task 1.1: Core Target Binding in `view3d.js` (`view3d.target(id)`, target cycling, and hotkeys `[` / `]`).
- [ ] Task 1.2: Click-to-Target Integration in `aircraft.js` (sidebar aircraft cards trigger camera snap).
- [ ] Checkpoint: Target Selection Functional & Unit Tested.

### Phase 2: Tactical Viewpoints (Tower & Cockpit POV)
- [ ] Task 2.1: Tower Cab Viewpoint (`towerCamera` at CYMJ tower coordinates `(30, 2575, floor + 140)` looking at 29L threshold/approach).
- [ ] Task 2.2: Cockpit Forward & Padlock Runway Viewpoints (`cockpitCamera`, `padlockCamera` tracking Runway 29L threshold coordinates `(3104, -3194)`).
- [ ] Checkpoint: Camera Math Verified with Pilot Domain Tolerances.

### Phase 3: UI Camera Menu & Controls
- [ ] Task 3.1: Camera Mode Dropdown & Target Selector in `playback-bar.js` (Fit, High, Tower, Chase, Cockpit, Padlock).
- [ ] Task 3.2: Keyboard Shortcuts & Active HUD Indicators.
- [ ] Checkpoint: Full Local Verification, Accessibility, and Clean Typecheck.

## Risks and Mitigations
| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Fast-moving aircraft causing jitter in padlock camera | Medium | Apply heading/position interpolation (`CHASE_LERP`) to damp sharp attitude steps. |
| Selected aircraft lands or is removed from simulation | Low | Gracefully fall back to nearest airborne aircraft or default Tower/Fit view without null-pointer errors. |
| Orthographic camera clipping near aircraft cockpit | Medium | Adjust `near`/`far` clip planes and cockpit offset vector so the aircraft nose/canopy frames the view naturally. |

## Open Questions
- None blocking. Runway 29L threshold coordinates `(3104, -3194, 1880)` and Tower coordinates `(30, 2575, 2020)` are already ratified in codebase ground truths.
