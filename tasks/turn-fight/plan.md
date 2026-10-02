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

## 3. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Concurrent Traffic Sim session creates merge conflict | Staged changes touch ONLY `src/modules/turn-fight/` and `tests/*/turn-fight*`. Zero overlap with `traffic/`. |
| 5.0 G maneuver pull alters trajectory timings | Unit tests assert within pilot domain tolerances (D371: $\pm0.5$ G, $\pm0.5$ s). Shaker caps pull at low speed. |
| D386 wiring alters nose-on trigger times | Simple Mode tests use pilot domain angular tolerances ($\pm5^\circ$). |
| Mode renaming breaks Playwright E2E locators | Locators updated in `turn-fight.spec.js` in lockstep with UI label changes. |
