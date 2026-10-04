# Traffic Remediation Living Task Checklist

**Document ID:** `tasks/traffic/remediation-todo.md`  
**Master Plan:** [`tasks/traffic/remediation-plan.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/remediation-plan.md)  
**Authoritative Reference:** [`docs/traffic-pattern-matrix.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/traffic-pattern-matrix.md)  

---

## Phase 1: Route Decoupling & Authentic Procedures (The V6 Route Deception)
- [ ] **Slice 1.1: Route Decoupling in `moose-jaw.json`**
  - [ ] Define pure `PAT1` visual circuit (Threshold, Departure End, Break Pt 9, Perch, Window)
  - [ ] Define independent `PAT_OUTER` rectangular box pattern
  - [ ] Define independent `PAT_SI` straight-in recovery pattern
  - [ ] Define `PAT_BREAKOUT` vector routing toward $\vec{P}_{\text{breakout}}$
  - [ ] Define `PAT_PFL_HIGH_KEY` and `PAT_PFL_PATTERN` profiles
  - [ ] Retire legacy split hacks (`SPL1`, `SPL2`, `SPL3`, `SPL4`, `ENT4`, 22k-ft chord jump)
  - [ ] Align `ENT1` as extended line to base leg of `PAT_OUTER` at $3,500\text{ ft MSL}$
  - [ ] Align `ENT2` as extended line to base leg of `PAT_SI` at $2,700\text{ ft MSL}$
- [x] **Slice 1.2: Straight-In 0.75 NM Speed Gate**
  - [x] Implement $3,500 \to 2,700\text{ ft MSL}$ step-down abeam departure end
  - [x] Hold $120\text{ KIAS}$ at $2,700\text{ ft}$ until distance to threshold $\le 0.75\text{ NM}$ ($4,558\text{ ft}$)
  - [x] Decelerate $120 \to 100\text{ KIAS}$ from $0.75\text{ NM}$ to threshold on 3.0° glide slope
- [x] **Slice 1.3: Authentic Breakout Vector Guidance**
  - [x] Compute $\vec{P}_{\text{breakout}}$ ($2.0\text{ NM}$ south of outer pattern center, $\sim 208^\circ$ true)
  - [x] Replace heading 118° hack with climbing turn to $3,500\text{ ft MSL}$ at $140\text{ KIAS}$ climb, accelerating to $180\text{ KIAS}$
  - [x] Direct pure pursuit vectoring to $\vec{P}_{\text{breakout}}$ and transition to ENT1/ENT2
- [x] **Slice 1.4: Authentic Go-Around Wave-Off Climbout**
  - [x] Advance full power (100% PCL) and climb along runway axis ($298^\circ$ true) at $\sim 140\text{ KIAS}$ to $2,500\text{ ft MSL}$
  - [x] Level off at $2,500\text{ ft MSL}$ and accelerate under full power down runway axis toward departure end
  - [x] At departure end, zoom climb trading excess speed for altitude until speed stabilizes at $180\text{ KIAS}$ climbing to $3,500\text{ ft MSL}$
  - [x] Level off at $3,500\text{ ft MSL}$, accelerate to $220\text{ KIAS}$, turn crosswind to rejoin `PAT_OUTER` downwind
- [x] **Slice 1.5: Critical Kinematic Bug Fixes**
  - [x] Fix heading-velocity decoupling in `sim.js:426-435` (use `a.customHeading ?? a.headingDeg`)
  - [x] Fix state machine phase squash in `sim.js:300-302` (preserve downwind phase)
  - [x] Eliminate 35,000-ft teleportation trap in `sim.js:413-421` (continuous Cartesian coordinates)
  - [x] Align zero-wind track in `route.js:271` with the $34,346\text{ ft}$ visual circuit
  - [x] Standardize Moose Jaw elevation to $1,892\text{ ft MSL}$ across `sim.js`, `route.js`, `moose-jaw.json`

---

## Phase 2: Core Physics & Unit Standardization (`src/core/`) — Smart Implementation Blueprint (D392)
- [x] **Slice 2.1: Promote Reusable Flight Control Utilities to `src/core/flight-math.js`**
  - [x] Promote `rollToward(bankRad, targetRad, maxDeltaRad, prefer)` with $\pi$-wrapping
  - [x] Add `dampedClimbG(climbRad, targetClimbRad, speedFtps, omega)` ($\omega_{\text{level}} = 1.0\text{ rad/s}$) for smooth level-offs
  - [x] Add tests in `tests/unit/core/flight-math.test.js` (18/18 passing)
- [ ] **Slice 2.2: Direct Core Wiring into `src/modules/traffic/sim.js`**
  - [ ] Replace hardcoded $16.7\text{ ft/s}$ glide descent with `glideSinkFpm('clean', kias, alt)` from `src/core/t6-performance.js`
  - [ ] Bleed airspeed in overhead break using `dragPerWeight(kias, alt, 2.0)`
  - [ ] Wire `flyZoomT6A` / specific excess power into go-around and PFL zoom climbs
  - [ ] Wire `rollToward` and rolling G limits (`availableG(kias, rolling)`) for turns
  - [ ] Wire `G_FTPS2` from `src/core/units.js`
- [x] **Slice 2.3: Resolve Test Sensitivities & Verify Suite**
  - [x] Align `sim.test.js:108` speed blending fallback
  - [x] Realign `commands.test.js:32` (140 KIAS climb) and `commands.test.js:47` (vector climbout)
  - [x] Fix `plausibility.test.js:62` split coordinate continuity
  - [x] Fix `aircraft.test.js:179` entry completion timeout
  - [x] Ensure all 602 traffic tests are 100% green (602/602 pass)

---

## Phase 3: GUI & Pilot Controls Modernization
- [ ] **Slice 3.1: Critical P0 Transport & Spawner Fixes**
  - [x] Wire `reset: resetRun` in `index.js:58-71` to fix Playback Bar Reset button crash
  - [x] Fix "Fit all routes" in 3D mode in `index.js:68` (`view3d.preset('fit')`)
  - [x] Fix Spawner "Preset: (Custom point)" dead state in `aircraft.js:137-142` *(Superseded by D400 / PATCH-023: redundant preset dropdown removed)*
  - [x] Add two-way synchronization between manual route/point controls and preset dropdown *(Superseded by D400 / PATCH-023: standardized on "Start at point" with live dynamic caption)*
- [ ] **Slice 3.2: Archival Quarantine & Obsolete Control Deprecation (P1)**
  - [ ] Remove `moose-jaw-v6` from built-in profiles in `profile.js:307` (D368/D372)
  - [ ] Deprecate `flyRoundedTurns`, `radiusFromG`, and `manualRadiusFt` from `settings-panel.js`
  - [ ] Remove obsolete photo trim and manual offset sliders from `settings-panel.js`
  - [ ] Standardize settings menu reset button to "Reset to Standard Defaults" (D384)
  - [ ] Prioritize `CT-156` Harvard II as primary default in `SPAWN_TYPES` (`types.js`)
- [ ] **Slice 3.3: Interactive Pilot Controls & Aircraft Management (P2)**
  - [ ] Add interactive number input for `pairGapS` to Spawner panel in `aircraft.js`
  - [ ] Add individual "Remove" button (`✕`) to aircraft rows in `aircraft.js` wired to `sim.remove(id)`
  - [ ] Guard Breakout button against repeated multi-clicks; add >10 NM boundary auto-cleanup
  - [ ] Remove duplicate `Fit` button from 3D canvas overlay in `layout.js:80`
  - [ ] Disable/hide `Height drop lines (3D)` checkbox when in 2D mode
  - [ ] Add CSS styling for `.has-engine-fail` and clean dead selectors in `traffic.css`

---

## Phase 4: Test Realignment & Gate 1 Verification
- [ ] **Slice 4.1: Crosscheck & Unit Test Realignment**
  - [ ] Update `tests/crosscheck/traffic-scenarios.test.js` and re-generate `traffic-expected.json`
  - [ ] Verify 100% green test suite (`npm test`, `npm run typecheck`, `npm run build`)
- [ ] **Slice 4.2: Gate 1 Verification**
  - [ ] Review `docs/checklists/traffic.md` for milestone sign-off with Patrick
