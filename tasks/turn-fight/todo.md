# Turn Fight: tasks

Spec approved by Patrick on 2026-09-30. Build starts once the coordinator says it's the Turn Fight's turn. See [`plan.md`](plan.md). Every task also meets `.claude/references/definition-of-done.md`, and the skill for each step is in the spec's Skills used.

- [ ] **1. The fight (`sim.js`), pinned to V6.** `createFight(setup)` and `stepFight(state, dtSec)` in whole 0.02 s steps: start, merge, 1-circle and 2-circle turns, first nose-on, the chase, Climb and dive, the 10-minute stop. Turn math only from `core`. The golden test is written first and fails until `sim.js` exists (test-driven-development).
  - Acceptance: matches V6's `bfmFight` step by step on the golden grid within 1e-9 ft and 1e-12 rad for 10 minutes of fight time (R9); the same result at any frame rate.
  - Verify: `npm test`; `node --test tests/golden/turn-fight-sim.test.js`.
  - Dependencies: none. Size M.
  - Files: src/modules/turn-fight/sim.js, tests/golden/turn-fight-v6.js, tests/golden/turn-fight-sim.test.js, tests/unit/turn-fight/sim.test.js
- [ ] **2. Readouts.** Result and More detail lines from a fight state, with V6's rounding, built as text.
  - Acceptance: every number V6 writes to `bfmPerf`, `bfmLive`, `bfmTime` and `bfmPhase` matches on the golden grid.
  - Verify: golden comparison of V6's readout text; unit tests of rounding.
  - Dependencies: 1. Size S.
  - Files: src/modules/turn-fight/readouts.js, tests/unit/turn-fight/readouts.test.js, tests/golden/turn-fight-sim.test.js

**Checkpoint A:** tests pass; code-review-and-quality; open PR A.

- [ ] **3. The screen and playback.** Module registered; three columns with collapsible panels; setup controls with the spec's ranges; Play, Pause, Reset, speed, T+ and phase; the Result card; settings remembered with Reset to V6 defaults; Space and Home.
  - Acceptance: R22 (only the essentials show by default); nothing overlaps at 1366 × 768 (R2); closing the module stops the fight clock (R4); a bad number is refused and the fight keeps its last good setup.
  - Verify: `npm test`; `npm run dev` and play a fight; accessibility checklist.
  - Dependencies: 2. Size M.
  - Files: src/modules/turn-fight/{index,layout}.js, turn-fight.css, README.md, src/shell/registry.js (via the app frame thread)
- [ ] **4. The top-down view.** Grid, trails every 0.1 s, arrowheads labelled B and R, MERGE mark, first nose-on line; draws on change only; follows its box size.
  - Acceptance: a paused fight draws nothing; a 4× fight is smooth at 1920 × 1080 on a local build (performance log in the PR); matches V6's picture side by side.
  - Verify: e2e play, pause, reset, module switch (no frames or timers left, R4; no console errors, R7).
  - Dependencies: 3. Size M.
  - Files: src/modules/turn-fight/view.js, tests/unit/turn-fight/view.test.js (view scale), tests/e2e/turn-fight.spec.js (via the app frame thread)
- [ ] **5. The extras.** First nose chases; Climb and dive with pitch boxes, the side view and a working height scale; About this model.
  - Acceptance: each checkbox shows and hides only its own controls; the height scale changes the side view and doesn't reset the fight (#20); every control does something (R3).
  - Verify: e2e click-through; look at each against V6.
  - Dependencies: 4. Size M.
  - Files: src/modules/turn-fight/{profile,layout}.js, tests/unit/turn-fight/profile.test.js, tests/e2e/turn-fight.spec.js

**Checkpoint B:** tests pass, build under budget; code-review-and-quality; open PR B.

- [ ] **6. The decided changes (Q48 to Q51).** One commit each, each starting from a failing test that states exactly what differs from V6: Q48 a tie shows "Both"; Q49 the jets start weighted by speed and meet in the centre (the golden test's pre-merge expectation changes, everything after the merge stays V6's); Q50 the side view's "Simplified: constant speed and turn rate" label; Q51 "Off-nose angle (ATA)", true angle-off in More detail, and a 3D off-nose angle with Climb and dive on.
  - Acceptance: the golden test still matches V6 everywhere these decisions don't touch.
  - Verify: golden and unit tests; each decision's D number in the plan doc's Decisions tab.
  - Dependencies: 1, 2 (Q48, Q49, Q51's 3D angle); 5 (Q50's label, Q51's readouts). Size S each.
- [ ] **7. Polish and sign-off checklist.** code-simplification pass with the golden test still green; `docs/checklists/turn-fight.md` for Patrick or Dad, side by side with V6 (R21).
  - Dependencies: 5. Size S.

**Checkpoint C:** open PR C; Patrick or Dad runs the checklist.
