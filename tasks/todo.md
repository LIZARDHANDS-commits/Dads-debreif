# Task List: Finishing 3D Point-Mass Wiring

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

## Checkpoint: Core Integration
- [x] Aircraft holds steady airspeed under point-mass physics.
- [x] All 10 unit tests in `tests/unit/core/canopy.test.js` pass.
- [x] Rejoin change commands successfully start and track toward target slots.

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

**Estimated scope:** Small (1 file)

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

**Estimated scope:** Small (1 file)

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

**Estimated scope:** Small (1-2 files)

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

**Estimated scope:** Small (completed)

---

## Checkpoint: Final Verification
- [x] `tests/unit/core/canopy.test.js` passes (10/10).
- [x] `tests/unit/turn-sim/transitions.test.js` passes (4/4).
- [x] Task 3 tactical maneuvers implemented and verified green.
