# Turn Fight: tasks

Spec approved by Patrick on 2026-09-30. See [`plan.md`](plan.md) and the handover note [`docs/handover/turn-fight.md`](../../docs/handover/turn-fight.md). The skill for each step is in the spec's Skills used.

**Streamlined build (Patrick, 2026-09-30 16:37Z).** Until the module is finished, a PR needs only GitHub's automatic tests to pass. The full local run, screenshots, accessibility checks and the Verification check happen once, at the end of the module. New numbers may be within a tolerance (about ±1 kt, ±50 ft, ±1° or ±1%); V6's math that already matches stays exact. No mutation runs, fuzzing or stress runs. 3D is a bonus: keep what is built, no more 3D tests or polish.

**Where it stands:** tasks 1 to 7 and the Energy engine are on main (through #235). Left: task 10's screen half, on branch `handover/turn-fight-energy-screen`, then Checkpoint D and the end-of-module test.

- [x] **1. The fight (`sim.js`), pinned to V6.** (#141) `createFight(setup)` and `stepFight(state, dtSec)` in whole 0.02 s steps: start, merge, 1-circle and 2-circle turns, first nose-on, the chase, Climb and dive, the 10-minute stop. Turn math only from `core`. The golden test is written first and fails until `sim.js` exists (test-driven-development).
  - Acceptance: matches V6's `bfmFight` step by step on the golden grid within 1e-9 ft and 1e-12 rad for 10 minutes of fight time (R9); the same result at any frame rate.
  - Verify: `npm test`; `node --test tests/golden/turn-fight-sim.test.js`.
  - Dependencies: none. Size M.
  - Files: src/modules/turn-fight/sim.js, tests/golden/turn-fight-v6.js, tests/golden/turn-fight-sim.test.js, tests/unit/turn-fight/sim.test.js
- [x] **2. Readouts.** (#141) Result and More detail lines from a fight state, with V6's rounding, built as text.
  - Acceptance: every number V6 writes to `bfmPerf`, `bfmLive`, `bfmTime` and `bfmPhase` matches on the golden grid.
  - Verify: golden comparison of V6's readout text; unit tests of rounding.
  - Dependencies: 1. Size S.
  - Files: src/modules/turn-fight/readouts.js, tests/unit/turn-fight/readouts.test.js, tests/golden/turn-fight-sim.test.js

**Checkpoint A:** tests pass; code-review-and-quality; open PR A.

- [x] **3. The screen and playback.** Module registered; three columns with collapsible panels; setup controls with the spec's ranges; Play, Pause, Reset, speed, T+ and phase; the Result card; settings remembered with Reset to V6 defaults; Space and Home; the T-6 limit warning beside each G box.
  - Acceptance: R22 (only the essentials show by default); nothing overlaps at 1366 × 768 (R2); closing the module stops the fight clock (R4); a bad number is refused and the fight keeps its last good setup.
  - Verify: `npm test`; `npm run dev` and play a fight; accessibility checklist.
  - Dependencies: 2. Size M.
  - Files: src/modules/turn-fight/{index,layout}.js, turn-fight.css, README.md, src/shell/registry.js (via the app frame thread)
- [x] **4. The top-down view.** Grid, trails every 0.1 s, arrowheads labelled B and R, MERGE mark, first nose-on line; draws on change only; follows its box size.
  - Acceptance: a paused fight draws nothing; a 4× fight is smooth at 1920 × 1080 on a local build (performance log in the PR); matches V6's picture side by side.
  - Verify: e2e play, pause, reset, module switch (no frames or timers left, R4; no console errors, R7).
  - Dependencies: 3. Size M.
  - Files: src/modules/turn-fight/view.js, tests/unit/turn-fight/view.test.js (view scale), tests/e2e/turn-fight.spec.js (via the app frame thread)
- [x] **5. The extras.** First nose chases; Climb and dive with pitch boxes, the side view and a working height scale; About this model.
  - Acceptance: each checkbox shows and hides only its own controls; the height scale changes the side view and doesn't reset the fight (#20); every control does something (R3).
  - Verify: e2e click-through; look at each against V6.
  - Dependencies: 4. Size M.
  - Files: src/modules/turn-fight/{profile,layout}.js, tests/unit/turn-fight/profile.test.js, tests/e2e/turn-fight.spec.js

**Checkpoint B:** tests pass, build under budget; code-review-and-quality; open PR B.

- [x] **5b. 2D/3D switch and the 3D view (Patrick 07:51Z).** `view3d.js` on ui-kit's `three-aircraft.js` and `ct156-model.js` (loaded through `loadThree()` only when 3D is switched on); ui-kit's `controls.viewSwitch()` on the stage toolbar, 2D by default and remembered; the Paint choice (Harvard default) in Turn Fight settings; Overhead, Chase Blue and Chase Red views; the no-connection and no-WebGL messages; frees WebGL on switch-back and unmount.
  - Acceptance: the spec's "2D and 3D views"; switching never resets the fight; the 2D bundle doesn't grow by three.js.
  - Verify: unit tests of attitude and trail conversion; e2e switch while playing, no console errors, context released.
  - Dependencies: 4; ui-kit's 3D pieces are on main (#145). Size M.
  - Files: src/modules/turn-fight/{view3d,layout}.js, tests/unit/turn-fight/view3d.test.js, tests/e2e/turn-fight.spec.js
- [x] **6. The decided changes (Q48 to Q51).** One commit each, each starting from a failing test that states exactly what differs from V6: Q48 a tie shows "Both"; Q49 the jets start weighted by speed and meet in the centre (the golden test's pre-merge expectation changes, everything after the merge stays V6's); Q50 the side view's "Simplified: constant speed and turn rate" label; Q51 "Off-nose angle (ATA)", true angle-off in More detail, and a 3D off-nose angle with Climb and dive on.
  - Acceptance: the golden test still matches V6 everywhere these decisions don't touch.
  - Verify: golden and unit tests; each decision's D number in the plan doc's Decisions tab.
  - Built: `firstNose.both` (Q48); `createFight` options `v6Start` (Q49) and `v6OffNose` (Q51) keep V6 reachable, and the golden grid runs V6, centre start, and all decisions; Q50's label was already in the stage footer. Left for the finalizer: the e2e first-nose-on regex must accept "Both", and the D numbers.
  - Dependencies: 1, 2 (Q48, Q49, Q51's 3D angle); 5 (Q50's label, Q51's readouts). Size S each.
- [x] **6b. Start geometry and altitudes (R28, approved 2026-09-30).** Place the start from range, off-nose angle and aspect angle; find the pass; each aircraft turns toward the other; the Start geometry panel with its picture and Head-on (V6) button; Red's starting height with Climb and dive on; turns at the pass or at once; live AA, HCA and range in More detail. Test-first.
  - Acceptance: the spec's three unit tests (head-on, crossing, pass at closest approach); at the defaults the golden test is unchanged.
  - Verify: `npm test`; e2e: set a beam start, play, Head-on (V6) puts it back.
  - Built: `geometry.js` (`startGeometry`, `turnDirections`, `START_DEFAULTS`), `createFight` takes the six new settings (head-on keeps V6's own start arithmetic, so the golden test is unchanged), the Start geometry section and picture in the settings menu, `geometryRows` in More detail, the MERGE mark only when there is a pass. Judgement calls for the finalizer: the "When the turns start" choice sits in the Start geometry section of the settings menu (the spec's screen table lists it there; R22 keeps More detail for readouts); "Head-on (V6)" resets all six start settings, not just the two angles; the turn side is read when the turns start, a tie (dead ahead or astern) keeps V6's way; HCA shows twice in More detail (Q51's "Angle-off" is the same number).
  - Dependencies: 6. Size M.
  - Files: src/modules/turn-fight/{geometry,sim,layout,readouts}.js, tests/unit/turn-fight/geometry.test.js
- [x] **7. Polish and sign-off checklist.** (#219: the 3D graphics-reset fallback and `docs/checklists/turn-fight.md`) code-simplification pass with the golden test still green; `docs/checklists/turn-fight.md` for Patrick or Dad, side by side with V6 (R21), including the spec's first-time-user check (default fight and Energy fight play with nothing typed and no panel opened).
  - Left from the #219 re-check (small): label More detail's time row "Time since the turns started" when the turns start at once or there is no pass; fix three checklist sentences (trails are blue and red; the side view splits only after the pass; after a graphics reset View stays 2D until 3D is chosen again). The other 3D fallback items are cut (3D is a bonus).
  - Dependencies: 5. Size S.

**Checkpoint C:** open PR C; Patrick or Dad runs the checklist.

## Energy mode (FF23), approved 2026-09-30

- [x] **8-9. T-6A performance and the point-mass step: built by `core`, not here.** The Flight math core thread builds them as tasks 14 to 17 in `tasks/flight-math/todo.md` (SPEC-core, "API, fifth PR: T-6A performance"; D128). The Turn Fight uses them. The chart checks and known answers in the spec's Energy mode are those tasks' tests.
  - Dependencies: none here; task 10 waits on them.
- [ ] **10. Energy mode in the Turn Fight.** Engine done (#209, #227, #235: `energy-sim.js`, top speed `energyTopKias` = core's `modelMaxIasT6A`, MPT 125 to 175, `evenFight`). Screen built on `handover/turn-fight-energy-screen`; to finish it: merge main in, point `topKiasAt` in `state.js` at `energyTopKias` and match the engine's refusal wording, tests for the WIP error-catch commit, the Split S e2e pause (`intervals: [50]`), wrap the Energy e2e tests in `test.describe('Energy (T-6)')`, re-read the checklist's Energy numbers. Details in the handover note. `energy-sim.js` with Auto (pick the move from the merge speed, capture and hold the 160 KIAS max-performance turn) and the forced moves, the Energy checkbox and its settings, the extra readouts, the two flags (OVER G and STALL), the altitude side view with the hard deck as a reference line, the 3D view's two Energy pieces (the see-through hard-deck plane, and each aircraft's own bank from the energy state in place of the level-turn bank, in `view3d.js`'s `aircraftPose`), and the level MPT at the hard deck, the stall cost, the mid-range throttle for straight MPT entries, per-aircraft start altitudes, and Pure, Lead or Lag pursuit after first nose-on.
  - Acceptance: each move does what the spec's table says (unit tests, e.g. a split S ends level with the heading reversed and lower); Auto picks the move from the merge speed as the spec table says, and from every merge speed between 100 and 250 KIAS reaches 160 ± 5 KIAS, then holds it; at the hard deck the level MPT settles at 150 KIAS minus altitude in thousands, within 5 kt; a stall gives 1 G for 1 s; the pursuit chaser never pulls past the shaker or 7 G; the simple fight's golden test is unchanged; R22 (everything behind the checkbox).
  - Verify: `npm test`; e2e toggle; Dad flies each move.
  - Dependencies: 5, and core's tasks 14 to 17 (tasks 8-9 above). Size M.
  - Files: src/modules/turn-fight/{energy-sim,layout,profile,readouts}.js, tests/unit/turn-fight/energy-sim.test.js

**Checkpoint D:** open PR D (the Energy lines are already in the branch's checklist); CI green; merge. Then the end-of-module test once: full local unit and e2e run, screenshots, axe, the Verification check, and Patrick's or Dad's checklist run.
