# Task List: Post-Slice 7 Trajectory Optimizer (Slices 8 & 9)

## Phase 1: Slice 8 — 13-Term Score Table & Doctrine Price Tag Engine

### Task 1: Core 13-Term Score Engine (`optimise/score.js`, `modes.js`)

**Description:** Implement the 13-term score table evaluating flight plans in seconds-equivalent. Each term implements `{ key, label, source, weight, on(mode), value(flight) }`. Terms include time to in-band, energy dumped, control jerk, G rule margin, bubble margin, 3/9 line lane, stall/roll limits, window arrival, speed floor, line speed target, canopy X picture, not blind on Lead, and wing plane alignment. Define evaluation modes `BY_THE_BOOK`, `CHOSEN`, and `UNRESTRICTED` in `modes.js`. Calibrate starting weights using CasADi Lagrange shadow prices ($3.03\text{ s/G}$, $0.194\text{ s/deg}$).

**Acceptance criteria:**
- [ ] `score(flight, mode, rates)` computes total seconds-equivalent and per-term breakdown.
- [ ] Energy dumped converts height lost and idle/boards time to seconds of MAX thrust recovery.
- [ ] Bubble breach (< 500 ft) and 3/9 line violation return reject / extreme penalty.
- [ ] Modes (`BY_THE_BOOK`, `CHOSEN`, `UNRESTRICTED`) toggle appropriate terms.
- [ ] Unit tests in `tests/unit/turn-sim/score.test.js` pass with 100% assertions green.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-sim/score.test.js`
- [ ] Build succeeds: `node --check src/modules/turn-sim/live/optimise/score.js`
- [ ] Manual check: Evaluated baseline rejoins match expected shadow price ranges.

**Dependencies:** None
**Files likely touched:**
- `src/modules/turn-sim/live/optimise/score.js`
- `src/modules/turn-sim/live/optimise/modes.js`
- `tests/unit/turn-sim/score.test.js`

**Estimated scope:** Medium (3 files)

---

### Task 2: Score Integration & Pilot Card Readout (`transitions-panel.js`, `layout.js`)

**Description:** Integrate the score engine into the Formation screen without altering flight paths. At the press, evaluate the chosen plan under both `BY_THE_BOOK` and `UNRESTRICTED` modes. Render the comparative doctrine price tag breakdown on the pilot card (e.g. *By-the-Book: 26 s | Unrestricted: 12 s | Traded: 14 s (Bank cap: 6.2 s, G cap: 4.5 s, 3/9 lane: 3.3 s)*).

**Acceptance criteria:**
- [ ] Formation card renders the doctrine trade readout below the maneuver description.
- [ ] Flight paths and aircraft motion are completely unchanged.
- [ ] Price tags update dynamically when changing formation or starting positions.
- [ ] Regression suites pass with zero failures.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-sim/transitions.test.js`
- [ ] Build succeeds: `node --check src/modules/turn-sim/transitions-panel.js`
- [ ] Manual check: Pilot card displays clean, readable trade summary on `http://localhost:5175/`.

**Dependencies:** Task 1
**Files likely touched:**
- `src/modules/turn-sim/transitions-panel.js`
- `src/modules/turn-sim/layout.js`
- `src/modules/turn-sim/live/formation.js`

**Estimated scope:** Small (2-3 files)

---

### Checkpoint 1: Slice 8 Verified
- [ ] All score and transition unit tests pass.
- [ ] Card accurately shows price breakdown across standard rejoins and rolls.
- [ ] Review with user before proceeding to Slice 9 implementation.

---

## Phase 2: Slice 9 — In-Browser Nelder-Mead "Polish" Optimizer

### Task 3: Knot Parameterization & Honest Speed Flight Step (`optimise/controls.js`, `optimise/fly.js`)

**Description:** Implement knot parameterization and candidate simulation. Define 25 control knots (8 bank, 8 G, 8 throttle, 1 duration scale factor) with smootherstep interpolation. Implement `sampleFrom(track, K)` to seed knots from the winning technique track. Clamp knots to Rates profile bounds (Student $\le 60^\circ$ bank, $\le 3\text{ G}$; Instructor $\le 4\text{ G}$; AI full envelope). Implement candidate flight simulation in `fly.js` running at coarse $dt = 0.2\text{ s}$ during search and $dt = 0.05\text{ s}$ for final confirmation. Integrate honest speed via `slow-down.js` and `power.js` without calling `setKias`.

**Acceptance criteria:**
- [ ] `sampleFrom` accurately reproduces baseline control curves within $\pm 2^\circ$ bank and $\pm 0.1\text{ G}$.
- [ ] `flyCandidate` executes a full flight in $< 0.3\text{ ms}$ on modern CPU.
- [ ] Speed and energy integrate honestly from thrust minus drag equations.
- [ ] Control knots remain strictly clamped to the active Rates persona.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-sim/controls.test.js`
- [ ] Build succeeds: `node --check src/modules/turn-sim/live/optimise/controls.js`
- [ ] Manual check: Simulated candidate produces continuous, smooth flight track.

**Dependencies:** Task 1
**Files likely touched:**
- `src/modules/turn-sim/live/optimise/controls.js`
- `src/modules/turn-sim/live/optimise/fly.js`
- `tests/unit/turn-sim/controls.test.js`

**Estimated scope:** Medium (3 files)

---

### Task 4: Nelder-Mead Simplex Search & Planner Bridge (`optimise/search.js`, `optimise/planner.js`)

**Description:** Build the 60-line textbook Nelder-Mead simplex search (reflect, expand, contract, shrink) and the optimizer planner. Construct the initial simplex around the seed knots ($\pm 10^\circ$ bank, $\pm 0.5\text{ G}$, $\pm 0.2$ throttle, $\pm 10\%$ duration). Stop search when improvement is $< 0.1\text{ s}$ over 20 iterations or at 300 candidate flights ($< 100\text{ ms}$ total). In `planner.js`, implement dual seeding (seed from technique winner, plus second-best if within `TIE_SEC`), and warm-start mid-move replanning. If confirmed flight violates 500 ft bubble or 3/9 line, return the technique seed untouched.

**Acceptance criteria:**
- [ ] Search completes in $\le 300$ flights and $< 100\text{ ms}$ execution time.
- [ ] Search improves or matches the technique seed score across all test geometries.
- [ ] Confirmed flight strictly respects 500 ft bubble and 3/9 line.
- [ ] Planner returns candidate object matching chooser format (`plan`, `durationSec`, `score`, `breakdown`).

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-sim/optimise.test.js`
- [ ] Build succeeds: `node --check src/modules/turn-sim/live/optimise/planner.js`
- [ ] Manual check: Simplex search converges and saves seconds on hot start.

**Dependencies:** Tasks 1, 3
**Files likely touched:**
- `src/modules/turn-sim/live/optimise/search.js`
- `src/modules/turn-sim/live/optimise/planner.js`
- `tests/unit/turn-sim/optimise.test.js`

**Estimated scope:** Medium (3 files)

---

### Task 5: Chooser Race & UI "Polish" Switch (`chooser.js`, `transitions-panel.js`)

**Description:** Wire the optimizer into `chooser.js` behind a user-facing `Polish` switch in Formation controls / More Settings (default: OFF). When `Polish` is ON, race the optimized candidate against standard technique candidates. When `Polish` is OFF, the standard technique planners win as before. Display optimization readouts on the pilot card (e.g. *"Optimised from turning rejoin: 41 s (technique 47 s). Traded: X picture 3.1 s, energy 1.4 s"*).

**Acceptance criteria:**
- [ ] `Polish` switch in UI toggles optimizer activation.
- [ ] When OFF, exact baseline behavior and timing are preserved with zero performance impact.
- [ ] When ON, chooser selects optimized candidate when it yields better score.
- [ ] Pilot card displays comparative savings and trade breakdown.
- [ ] Full regression test suite passes cleanly.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-sim/transitions.test.js`
- [ ] Tests pass: `node --test tests/unit/core/canopy.test.js`
- [ ] Manual check: Toggling `Polish` on `http://localhost:5175/` shows optimized trajectory and card readout.

**Dependencies:** Tasks 2, 4
**Files likely touched:**
- `src/modules/turn-sim/live/chooser.js`
- `src/modules/turn-sim/transitions-panel.js`
- `src/modules/turn-sim/live/tuning.js`
- `tests/unit/turn-sim/transitions.test.js`

**Estimated scope:** Small (3 files)

---

### Checkpoint 2: Final Verification (Slices 8 & 9 Complete)
- [ ] All unit and regression tests pass (`canopy.test.js`, `transitions.test.js`, `score.test.js`, `optimise.test.js`).
- [ ] `Polish` switch tested interactively on `http://localhost:5175/`.
- [ ] Traded seconds and doctrine price tags verified against CasADi benchmark.
