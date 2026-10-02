# Turn Fight: Implementation & Remediation Plan

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md), approved by Patrick. Tasks: [`todo.md`](todo.md).
Master Plan Artifact: [`turn_fight_remediation_v2.md`](file:///C:/Users/patri/.gemini/antigravity/brain/38b8f170-9ed5-4022-a9fb-683e79d5cd7e/turn_fight_remediation_v2.md).
Historical Audit: [`AUDIT_DECISIONS_D112_D405.md`](file:///C:/Users/patri/.gemini/antigravity/brain/66038a38-d895-463b-ba27-91be766e007c/AUDIT_DECISIONS_D112_D405.md).

---

## 1. Current Status & Context

- **Initial Rebuild (Tasks 1–10):** 100% complete and verified on branch `next-module`:
  - Tasks 1–7: Simple 2D flat 1v1 fight, top-down view, 3D Harvard II view, start geometry, and readouts live.
  - Tasks 8–9: Energy simulation engine (`energy-sim.js`, 1,416 lines, point-mass 3D aero, full torque, MPT capture at 160 KIAS, `evenFight`).
  - Task 10: Energy Screen UI (uPlot), 8 forensic traps neutralized, Tactical 3D Suite (plumb lines & ground-shadow contact discs per D401), active combat pursuit default (D403), 3D merge azimuth tracking (D404), and pilot stall authority loss (D405).
  - Test suites: 508 unit tests green, 68 Playwright E2E tests green, typecheck clean, build clean.
- **Deconfliction with Traffic Sim Session (`4ff89e6a-1f5c-41ed-a7b0-f636c0f17775`):**
  - Traffic Sim session operates in `Dads-debreif/` on `main`, focusing exclusively on `src/modules/traffic/` (Option C: Full Vector Guidance Migration).
  - Turn Fight session operates in `next_module_worktree/` on `next-module`, focusing exclusively on `src/modules/turn-fight/` (Remediation Plan v2).
  - Zero file overlap. Shared documentation files are synchronized.
- **Remediation Plan v2 (Tasks 11–15):** Formulated from the 5-agent forensic audit and Patrick's `/grill-me` design ratification (D407–D411). Ready for serial execution.

---

## 2. Active Remediation Phases (Remediation Plan v2)

### Phase 1: Flight Math — Immelmann G-Law (Task 11 / D407)
- **Task 11.1:** Raise `MANEUVER_PULL_G` from 4 to 5 in `src/modules/turn-fight/energy-sim.js:66` and guard rolling G with `T6A_LIMITS.rollingMaxG = 4.7`. (Completed in code; authentic Harvard II physics).
- **Task 11.2:** Update 7 unit tests in `tests/unit/turn-fight/energy-sim.test.js` to assert 5.0 G maneuver pull within pilot domain tolerances (D371). (Deferred to Phase 5 per Patrick's directive).

### Phase 2: Engagement Logic — D386, Ghost Pursuit, Schema, Altitude Gate (Task 12 / D410)
- **Task 12.1:** Wire D386 `isNoseOn()` into `sim.js:checkFirstNose()`: activate the 10° elevation capture cone for Simple Mode Climb/Dive merges.
- **Task 12.2:** Implement D386 elevation cone in `energy-sim.js:isAcNoseOn()`: evaluate azimuth $\le 5^\circ$ AND elevation $\le 10^\circ$ across altitude differences.
- **Task 12.3:** Fix ghost pursuit in `energy-sim.js:1303-1311`: set `state.firstNose` and `state.chase` when altitude separation fallback triggers pursuit, ensuring UI displays winner.
- **Task 12.4:** Dynamic altitude separation gate: change `setup.blueAltFt !== setup.redAltFt` to dynamic check `Math.abs(state.blue.zFt - state.red.zFt) >= 100` (D371).
- **Task 12.5:** Standardize `firstNose` object schema: unify on `{ by: 'both' }` pattern; update `readouts.js:45` to check `mark.by === 'both'`.

### Phase 3: Display & Readouts (Task 13)
- **Task 13.1:** Fix inverted Aspect Angle calculation in `readouts.js:113`: change `180 - ataDeg(state, from, other)` to `180 - ataDeg(state, other, from)`.
- **Task 13.2:** Add Aspect Angle row to Energy Mode readouts table in `energy-readouts.js`.
- **Task 13.3:** Add API key adapter in `playback.js` / `state.js` mapping Simple Mode keys (`startAtaDeg`, `startAaDeg`, `turnsAt`) to Energy Mode keys (`ataDeg`, `aaDeg`, `turnsStart`).
- **Task 13.4:** Remove residual user-facing V6 text references: clean `layout.js:215` and `geometry.js:150`; tighten test regex in `turn-fight.spec.js:17`.

### Phase 4: UI Labels & Mode Descriptions (Task 14 / D408)
- **Task 14.1:** Rename modes with one-line descriptions in `layout.js`:
  - Simple Mode $\rightarrow$ **"Turn Circle Geometry"** ("Constant-speed turn circles — rate vs radius, no energy bleed").
  - Energy Mode $\rightarrow$ **"BFM Energy Fight"** ("Full T-6 physics — energy management, stalls, pursuit curves").
- **Task 14.2:** Add bank angle readout derived from G ($\phi = \arccos(1/G)$) to Geometry Mode readouts table.
- **Task 14.3:** Update 1-circle / 2-circle help text per BFM doctrine:
  - 2-circle (Rate Fight): "Both jets turn into each other. Two separate circles."
  - 1-circle (Radius Fight): "Jets turn opposite cockpit directions but same geographic direction. One shared circle."
- **Task 14.4:** Relabel `chaseAfterHeadOn` to "Chase from head-on" in More Settings with one-line tooltip.

### Phase 5: Documentation Sync & Verification (Task 15)
- **Task 15.1:** Record decisions D406–D410 in `docs/records/decisions-log.md` and `docs/records/plan-decisions.md`.
- **Task 15.2:** Update `docs/handover/turn-fight.md`, `HANDOVER.md`, and `.agent/memory/handoff.md`.
- **Task 15.3:** Run full verification: `npm test` (all 3,045+ pass), `npm run typecheck` (0 errors), `npm run build` (clean), `npx playwright test tests/e2e/turn-fight.spec.js`.


---

## 4. Phase 6: Tactical AI Maneuver Selection Engine (Tasks 16–20)

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md). Tasks: [`todo.md`](todo.md).
Design Ratification: `/grill-me` alignment with Patrick (2026-10-02).

### Task 16: Predictor Synchronization & Exit Traps Neutralization
**Description:** Synchronize the lookahead trajectory predictor with the Austin/Carbone tactical advantage matrix and eliminate post-maneuver rollout traps.
- In `src/modules/turn-fight/energy-sim.js:noseOnSec`: update `judge()` to check `onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you)`, ensuring the dry-run predictor registers tactical breakout wins.
- Optimize dry-run simulation step: run `noseOnSec` with $\Delta t = 0.08\text{ s}$ or $0.10\text{ s}$ (instead of $0.02\text{ s}$), achieving sub-2ms multi-move trajectory sweeps without UI stutter.
- In `controlImmelmann` and `controlSplitS`: change rollout handover from `c.next = 'pick'` to `c.next = 'mpt'`, stopping the sudden $110^\circ$ slice snap and 30-second Split S roller coaster.

**Acceptance criteria:**
- [ ] `noseOnSec` detects both boresight nose-on and `shouldPursueTactical` breakout.
- [ ] Lookahead dry runs complete in $\le 2\text{ ms}$ for 4 candidate evaluations.
- [ ] Immelmann apex rollout transitions cleanly into level MPT tracking rather than snapping into an inverted slice.
- [ ] Split S dive recovery transitions smoothly into level MPT tracking rather than re-triggering an immediate second Split S.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-fight/energy-sim.test.js`
- [ ] Build succeeds: `npm run build`

**Dependencies:** None (builds directly on Task 15 baseline).
**Files likely touched:** `src/modules/turn-fight/energy-sim.js`
**Estimated scope:** Small (1 file, ~30 lines).

---

### Task 17: Candidate Generation & Tactical Utility Scoring Engine
**Description:** Implement candidate maneuver generation across operational envelopes and a multi-dimensional utility scoring engine to select moves that win the engagement.
- Implement `getFeasibleMoves(ac, setup)`:
  - `immelmann`: $180 \le KIAS \le 316$ ($V_{MO}$), apex speed $\ge 120$ KIAS.
  - `pitchBack`: $150 \le KIAS \le 260$.
  - `slice`: $90 \le KIAS \le 175$, alt margin $> 1,000$ ft above Hard Deck.
  - `splitS`: $86 \le KIAS \le 140$ (D381), alt margin $> \text{lossFt} + 500$ ft above Hard Deck.
  - `mpt`: always feasible (baseline sustained rate turn).
- Implement `pickTacticalMove(state, who, lookaheadSec)`:
  - Sweeps feasible candidates using forward lookahead (default 20 s).
  - Primary rank: Earliest victory timestamp ($T_{\text{win}}$) via `shouldPursueTactical` or `onTheOther`.
  - Secondary rank: Highest cumulative tactical advantage differential ($\Delta Adv = Adv_{\text{me}} - Adv_{\text{target}}$).
  - Tertiary rank: Specific energy height retention ($H_e = h + V^2 / 2g$).
  - Returns `{ move, score, winSec, deltaAdv, why }`.

**Acceptance criteria:**
- [x] Envelope filtering respects Harvard II aerodynamic limits and safety margins.
- [x] Utility ranking prioritizes winning moves over static lookup tables.
- [x] Full explanation string (`why`) articulates the tactical justification for the chosen maneuver.

**Verification:**
- [x] Existing and new unit tests pass: `node --test tests/unit/turn-fight/energy-sim.test.js`
- [x] Full module unit tests pass: `node --test tests/unit/turn-fight/**/*.test.js`
- [x] Typecheck succeeds: `npm run typecheck`

**Dependencies:** Task 16.
**Files likely touched:** `src/modules/turn-fight/energy-sim.js`, `tests/unit/turn-fight/energy-tactical.test.js`
**Estimated scope:** Medium (2 files).

---

### Task 18: UI Integration & Settings Wiring
**Description:** Integrate the Tactical AI maneuver option into the UI controls, state management, and readouts while preserving 100% backward compatibility for legacy `'auto'`.
- In `src/modules/turn-fight/state.js`: add `'tactical'` to `ENERGY_MOVES` (`['tactical', 'auto', 'immelmann', 'pitchBack', 'slice', 'splitS', 'mpt']`).
- In `src/modules/turn-fight/energy-sim.js:pickMove`: dispatch to `pickTacticalMove` when move is `'tactical'`; keep existing textbook lookup when move is `'auto'`.
- In `src/modules/turn-fight/layout.js`: add `'Tactical AI (Dynamic Utility)'` to Blue/Red move dropdowns; add `tacticalLookaheadSec` slider (range 10–45 s, default 20 s, step 1 s) under "Model settings for checking".
- In `src/modules/turn-fight/energy-readouts.js`: render the tactical choice rationale and score summary in the Result card.

**Acceptance criteria:**
- [ ] `'tactical'` selectable from UI dropdowns for Blue and Red independently.
- [ ] `'auto'` remains default and produces identical textbook behavior for existing tests.
- [ ] Lookahead slider dynamically controls search horizon (10–45 s).
- [ ] Tactical decision rationale visible in post-merge readout.

**Verification:**
- [ ] Tests pass: `node --test tests/unit/turn-fight/**/*.test.js`
- [ ] E2E tests pass: `npx playwright test tests/e2e/turn-fight.spec.js`
- [ ] Typecheck succeeds: `npm run typecheck`

**Dependencies:** Tasks 16, 17.
**Files likely touched:** `src/modules/turn-fight/state.js`, `src/modules/turn-fight/energy-sim.js`, `src/modules/turn-fight/layout.js`, `src/modules/turn-fight/energy-readouts.js`
**Estimated scope:** Medium (4 files).

---

### Task 19: Mid-Fight Opportunity Re-evaluation in `controlMpt`
**Description:** Enable dynamic maneuver breakout from sustained rate turns (MPT) when opportunistic energy or positional advantages arise during the dogfight.
- In `controlMpt`: add a throttled re-evaluation cadence (every 3.0 to 4.0 s while in MPT).
- When operating in `'tactical'` mode, evaluate candidate maneuvers if the tactical advantage differential improves significantly or opponent overshoots/zooms.
- Apply a hysteresis lockout timer (minimum 4.0 s between maneuver transitions) to prevent rapid oscillatory state fluttering.

**Acceptance criteria:**
- [x] Aircraft in MPT can break out into a Pitch Back or Slice if an offensive advantage presents itself.
- [x] No state fluttering or erratic bank oscillations during rate turns.
- [x] Hard deck and energy floor guards strictly respected during breakout maneuvers.

**Verification:**
- [ ] Unit tests pass: `node --test tests/unit/turn-fight/energy-tactical.test.js`
- [ ] Playback visual inspection in 2D and 3D views.

**Dependencies:** Tasks 16, 17, 18.
**Files likely touched:** `src/modules/turn-fight/energy-sim.js`
**Estimated scope:** Small (1 file, ~40 lines).

---

### Task 20: Verification, Test Harmonization & Gate 2 Checkpoint
**Description:** Run full test suite, harmonize test fixtures under D371/D411 pilot domain tolerances, and prepare Gate 2 sign-off report.
- Run complete test suite: `npm test` across all 3,090+ tests.
- Run Playwright E2E suite: `npx playwright test tests/e2e/turn-fight.spec.js`.
- Typecheck: `npm run typecheck`.
- Production build: `npm run build`.
- Update documentation ledger: `docs/records/decisions-log.md`, `docs/records/plan-decisions.md` (recording tactical AI decisions), `HANDOVER.md`, `docs/handover/turn-fight.md`, and `docs/REMEDIATION_ROADMAP.md`.

**Acceptance criteria:**
- [x] 100% of unit and E2E tests pass cleanly.
- [x] Zero TypeScript / typecheck errors.
- [x] Clean build within performance budgets.
- [x] Documentation synchronized and ready for Patrick's review.

**Verification:**
- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npx playwright test tests/e2e/turn-fight.spec.js`

**Dependencies:** Tasks 16–19.
**Files likely touched:** `tests/unit/turn-fight/energy-tactical.test.js`, `docs/*`
**Estimated scope:** Medium (documentation + verification).

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Concurrent Traffic Sim session creates merge conflict | Staged changes touch ONLY `src/modules/turn-fight/` and `tests/*/turn-fight*`. Zero overlap with `traffic/`. |
| 5.0 G maneuver pull alters trajectory timings | Unit tests assert within pilot domain tolerances (D371: $\pm0.5$ G, $\pm0.5$ s). Shaker caps pull at low speed. |
| D386 wiring alters nose-on trigger times | Simple Mode tests use pilot domain angular tolerances ($\pm5^\circ$). |
| Mode renaming breaks Playwright E2E locators | Locators updated in `turn-fight.spec.js` in lockstep with UI label changes. |
| Lookahead dry runs cause frame drops or UI stutter | Stepping lookahead simulation with $\Delta t = 0.08\text{ s}$ or $0.10\text{ s}$ keeps total evaluation time under 2 ms. |
| Tactical AI breaks existing unit tests expecting textbook moves | Preserving `'auto'` as the legacy SMM textbook lookup ensures 100% backward compatibility for all existing tests. |
