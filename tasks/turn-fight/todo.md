# Turn Fight: tasks

Build starts once the spec is approved and the coordinator says it's the Turn Fight's turn. See [`plan.md`](plan.md).

- [ ] **1. The fight (`sim.js`), pinned to V6.** `createFight(setup)` and `stepFight(state, dtSec)` in whole 0.02 s steps: start, merge, 1-circle and 2-circle turns, first nose-on, the chase, Climb and dive, the 10-minute stop. Turn math only from `core`.
  - Acceptance: matches V6's `bfmFight` step by step on the golden grid within 1e-9 ft and 1e-12 rad for 10 minutes of fight time (R9); the same result at any frame rate.
  - Verify: `npm test`; `tests/golden/turn-fight-sim.test.js`.
  - Files: src/modules/turn-fight/sim.js, tests/golden/turn-fight-v6.js, tests/golden/turn-fight-sim.test.js, tests/unit/turn-fight/sim.test.js
- [ ] **2. Readouts.** Result and More detail lines from a fight state, with V6's rounding, built as text.
  - Acceptance: every number V6 writes to `bfmPerf`, `bfmLive`, `bfmTime` and `bfmPhase` matches on the golden grid.
  - Verify: golden comparison of V6's readout text; unit tests of rounding.
  - Files: src/modules/turn-fight/readouts.js, tests/unit/turn-fight/readouts.test.js

**Checkpoint A:** tests pass; open PR A.

- [ ] **3. The screen.** Three columns with collapsible panels; setup controls with the spec's ranges; Play, Pause, Reset, speed, T+ and phase; the top-down view drawn on change only; settings remembered with Reset to V6 defaults; Space and Home.
  - Acceptance: R22 (only the essentials show by default); nothing overlaps at 1366 × 768 (R2); closing the module stops everything (R4); a paused fight draws nothing.
  - Verify: `npm test`; `npm run dev`; e2e play, reset, controls, module switch.
  - Files: src/modules/turn-fight/{index,layout,view}.js, turn-fight.css, README.md, src/shell/registry.js (via the app frame thread), tests/e2e/turn-fight.spec.js (via the app frame thread)
- [ ] **4. The extras.** First nose chases; Climb and dive with pitch boxes, the side view and a working height scale; About this model.
  - Acceptance: each checkbox shows and hides only its own controls; the height scale changes the side view and doesn't reset the fight (#20); every control does something (R3).
  - Verify: e2e click-through; look at each against V6.
  - Files: src/modules/turn-fight/{profile,layout}.js

**Checkpoint B:** open PR B.

- [ ] **5. Answered questions.** Each of Q-TF1 to Q-TF4 that Patrick or Dad answers lands as its own commit, changing the golden test to say exactly what differs from V6, and is logged in Decisions.
  - Verify: golden and unit tests; the plan doc's Decisions tab.
- [ ] **6. Sign-off checklist.** `docs/checklists/turn-fight.md` for Patrick or Dad, side by side with V6 (R21).

**Checkpoint C:** open PR C; Patrick or Dad runs the checklist.
