# Todo: Traffic Sim 3D Tactical Camera System & Target Focus

## Task 1.1: Core Target Binding & Cycling in `view3d.js`

**Description:** Extend the 3D scene controller in `view3d.js` to track a specific user-selected target aircraft (`targetId`), add public API methods `target(id)` and `nextTarget(direction)`, and wire keyboard hotkeys `[` and `]` to cycle through airborne aircraft.

**Acceptance criteria:**
- [ ] `view3d.target(id)` binds tracking to that specific aircraft callsign if airborne.
- [ ] If the selected aircraft lands, the camera gracefully falls back to the next airborne plane without throwing.
- [ ] Pressing `[` cycles to previous airborne aircraft; pressing `]` cycles to next airborne aircraft.
- [ ] The current target callsign is exposed via `view3d.currentTarget()`.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/view3d.test.js`
- [ ] Build succeeds: `npm run typecheck`
- [ ] Manual check: Calling `view3d.target('A2')` shifts chase camera directly to A2.

**Dependencies:** None

**Files likely touched:**
- `src/modules/traffic/view3d.js`
- `tests/unit/traffic/view3d.test.js`

**Estimated scope:** Small (2 files)

---

## Task 1.2: Click-to-Target in Sidebar Aircraft Cards (`aircraft.js`)

**Description:** Wire the aircraft list cards in the right-hand sidebar so clicking an aircraft card highlights it and notifies the 3D scene to focus the camera on that aircraft.

**Acceptance criteria:**
- [ ] Clicking an aircraft card in `aircraft.js` triggers `onSelectAircraft(row.id)` without interfering with tactical buttons (`Breakout`, `PFL`, etc.).
- [ ] The selected aircraft row gains an `.is-selected` CSS class for visual feedback.
- [ ] Keyboard accessible: pressing Enter on an aircraft list item selects it.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/aircraft.test.js`
- [ ] Build succeeds: `npm run typecheck`
- [ ] Manual check: Clicking aircraft A3 in sidebar highlights A3 and snaps 3D camera.

**Dependencies:** Task 1.1

**Files likely touched:**
- `src/modules/traffic/aircraft.js`
- `tests/unit/traffic/aircraft.test.js`

**Estimated scope:** Small (2 files)

---

## Checkpoint: Phase 1 (Target Selection Complete)
- [ ] Target aircraft binding functional in unit tests and manual execution.
- [ ] Sidebar clicks smoothly lock camera onto any active aircraft.
- [ ] Review progress with operator before proceeding to Phase 2.

---

## Task 2.1: Tower Cab Viewpoint (`towerCamera`)

**Description:** Implement a dedicated virtual Control Tower view in `view3d.js` positioned inside the 140 ft CYMJ Control Tower cab `(X = 30, Y = 2575, Z = floor + 140)` looking southeast toward Runway 29L threshold and final approach.

**Acceptance criteria:**
- [ ] Pure function `towerCamera(floor, size, targetPoint)` returns `{ center, cam: { yawDeg, pitchDeg, zoom, altScale } }`.
- [ ] Positioned at exact Moose Jaw tower coordinates `(30, 2575, floor + 140)`.
- [ ] Default view direction points down Runway 29L approach path (heading ~152°T, pitch ~75°).
- [ ] If an aircraft is targeted while in Tower mode, camera yaw and pitch track the aircraft across the field.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/view3d.test.js`
- [ ] Math check: Assert camera coordinates match tower height and field elevation.

**Dependencies:** Task 1.1

**Files likely touched:**
- `src/modules/traffic/view3d.js`
- `tests/unit/traffic/view3d.test.js`

**Estimated scope:** Small (2 files)

---

## Task 2.2: Cockpit Forward & Padlock Runway Viewpoints

**Description:** Implement Cockpit Forward POV and Cockpit "Padlock Runway" viewpoints in `view3d.js`. Forward view looks 12 o'clock along aircraft heading. Padlock view tracks Runway 29L threshold coordinates `(3104, -3194)` to reproduce authentic SMM downwind spacing, perch, and final turn visual sight pictures.

**Acceptance criteria:**
- [ ] `cockpitForwardCamera(ac, size)` positions camera at pilot eye level looking along aircraft heading and pitch.
- [ ] `cockpitPadlockCamera(ac, runwayThreshold, size)` locks camera line-of-sight onto the runway threshold as the aircraft turns downwind, perch, and final.
- [ ] Angles follow Pilot Domain Tolerances (yaw ±5°, pitch ±5°).
- [ ] Smooth transition damping prevents disorienting micro-jitters during rapid bank changes.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/view3d.test.js`
- [ ] Math check: On downwind at (X = 0, Y = -4500, Alt = 3500), padlock camera yaw is directed toward Runway 29L threshold.

**Dependencies:** Task 1.1

**Files likely touched:**
- `src/modules/traffic/view3d.js`
- `tests/unit/traffic/view3d.test.js`

**Estimated scope:** Medium (2 files)

---

## Checkpoint: Phase 2 (Tactical Viewpoints Complete)
- [ ] Tower Cab, Cockpit Forward, and Cockpit Padlock viewpoints fully implemented and tested.
- [ ] Zero WebGL memory leaks or camera projection glitches.
- [ ] Review progress with operator before proceeding to Phase 3.

---

## Task 3.1: Camera Menu & Target Controls in Playback Bar

**Description:** Add a unified Camera Mode dropdown and Target selector to the 3D playback bar or overlay, offering `Fit`, `High (Overhead)`, `Tower Cab`, `Chase`, `Cockpit (Forward)`, and `Cockpit (Padlock Runway)`.

**Acceptance criteria:**
- [ ] Camera dropdown provides all 6 modes with clear pilot-friendly labels.
- [ ] Selecting a camera mode immediately switches the 3D perspective without restarting simulation.
- [ ] Target selector dropdown lists all active aircraft and updates dynamically as planes take off and land.
- [ ] Preserves WCAG accessibility (keyboard navigable, aria-labels).

**Verification:**
- [ ] Tests pass: `node --test tests/unit/traffic/playback-bar.test.js`
- [ ] Build succeeds: `npm run typecheck && npm run build`
- [ ] Manual check: Switching between Tower Cab and Cockpit Padlock is seamless.

**Dependencies:** Tasks 1.2, 2.1, 2.2

**Files likely touched:**
- `src/modules/traffic/playback-bar.js`
- `src/modules/traffic/view3d.js`
- `tests/unit/traffic/playback-bar.test.js`

**Estimated scope:** Medium (3 files)

---

## Checkpoint: Phase 3 (Final Verification & Gate Check)
- [ ] Full local test suite passes 100% green.
- [ ] `npm run typecheck` clean.
- [ ] `npm run build` succeeds within size budget.
- [ ] Ready for human sign-off on live dev server.
