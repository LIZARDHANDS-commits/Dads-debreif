# SWARM HANDOVER & RESUME SPECIFICATION
**Module:** Turn Fight (BFM 1v1) Rebuild & Remediation Plan v2  
**Halt Timestamp:** 2026-10-02T02:10:00Z  
**Branch:** `next-module`  
**Working Directory:** `C:\Users\patri\.gemini\antigravity\worktrees\wise-mendeleev\next_module_worktree`  
**Parent Session ID:** `38b8f170-9ed5-4022-a9fb-683e79d5cd7e`  
**Deconfliction Partner:** Traffic Sim Option C (Full Vector Guidance Migration) on `main` (`4ff89e6a-1f5c-41ed-a7b0-f636c0f17775`)  

---

## 1. Executive Summary & Reason for Halt
The swarm execution was ordered to halt cleanly by Patrick due to API quota/credit constraints (exhaustion of capacity / 429 errors).
All 13 background subagents (including Sentinel, Project Orchestrator, Explorers, Miners, and Workers) and recurring monitoring crons have been cleanly terminated.
Zero orphaned processes remain running.

The codebase is at a **clean, stable, and verified architectural checkpoint**:
- **Phase 1 Flight Math** (`energy-sim.js`) is cleanly implemented with authentic CT-156 Harvard II physics (`MANEUVER_PULL_G = 5`, rolling G limit clamp `T6A_LIMITS.rollingMaxG = 4.7`).
- Zero syntax or TypeScript errors (`npm run typecheck` passes with **0 errors**).
- No hacky 4.0 G clamps or artificial workarounds exist in production code.
- All test assertion updates and tolerance harmonizations are intentionally deferred to post-swarm per Patrick's explicit directive.

---

## 2. Phase-by-Phase Remediation Status

| Phase | Task | Status | What Has Been Done | What Remains to Complete |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **Task 11: Maneuver Pull Law (D407)** | **Code Complete** (Tests Deferred) | - `src/modules/turn-fight/energy-sim.js:66`: `MANEUVER_PULL_G = 5`<br>- `controlBankMove`: capped at `T6A_LIMITS.rollingMaxG` while rolling<br>- `controlMpt`: roll transitions capped at `rollingMaxG`<br>- `TUNING.maxBankMoveTurnDeg`: authentic 170° restored | Test updates in `energy-sim.test.js` deferred to post-swarm (Phase 5). |
| **Phase 2** | **Task 12: Engagement Logic & D386 Cone (D411)** | **Ready to Implement** | - Explorers audited the 5 engagement traps and documented exact patch lines. | 1. Wire `isNoseOn()` (10° elevation cone) into `sim.js:checkFirstNose()`.<br>2. Add elevation cone (azimuth $\le 5^\circ$, elevation $\le 10^\circ$) to `energy-sim.js:isAcNoseOn()`.<br>3. Fix ghost pursuit bug in `energy-sim.js:1303-1311` (set `state.firstNose` & `state.chase`).<br>4. Dynamic altitude gate: `Math.abs(zFt) >= 100` (was static setup check).<br>5. Schema normalization: `{ by: 'both' }` and update `readouts.js:45`. |
| **Phase 3** | **Task 13: Display Readouts & API Adapters** | **Ready to Implement** | - Spec miner mapped exact keys and formulas. | 1. Fix inverted Aspect Angle formula in `readouts.js:113` to `180 - ataDeg(state, other, from)`.<br>2. Add Aspect Angle row to `energy-readouts.js` under "More detail".<br>3. Add API key adapter in `playback.js` or `state.js` mapping Simple keys (`startAtaDeg`, `startAaDeg`, `turnsAt`) to Energy keys (`ataDeg`, `aaDeg`, `turnsStart`).<br>4. Clean residual "V6" phrasing in `layout.js:215` and `geometry.js:150`. |
| **Phase 4** | **Task 14: UI Mode Renaming & BFM Doctrine (D409/D410)** | **Ready to Implement** | - Mode names and help text ratified during Patrick's `/grill-me`. | 1. Rename modes in `layout.js`:<br>   - Simple Mode $\rightarrow$ **"Turn Circle Geometry"** (*"Constant-speed turn circles — rate vs radius, no energy bleed"*).<br>   - Energy Mode $\rightarrow$ **"BFM Energy Fight"** (*"Full T-6 physics — energy management, stalls, pursuit curves"*).<br>2. Add derived bank angle readout in Geometry Mode: $\phi = \arccos(1/G)$.<br>3. Update 1-circle (Radius Fight) and 2-circle (Rate Fight) doctrine descriptions.<br>4. Relabel `chaseAfterHeadOn` to *"Chase from head-on"*. |
| **Phase 5** | **Task 15: Test Harmonization & Verification** | **Pending** | - Explorer mapped all 7 affected test assertions in `energy-sim.test.js`. | 1. Update `energy-sim.test.js` line 44 (`pullG: 5`).<br>2. Align race timing assertions (lines 1364, 1405) to 5.0 G values within D371 tolerance ($\pm0.5$ s).<br>3. Update Playwright locators for new mode titles in `tests/e2e/turn-fight.spec.js`.<br>4. Tighten defaults regex to `/Reset to Standard Defaults/i` (C5 / D384).<br>5. Run full suites: `npm test`, `npm run typecheck`, `npm run build`, and E2E. |

---

## 3. Decision Register Alignment (D-Number Deconfliction)
- **Traffic Sim Option C (on `main`):** Landed `D406: Vector Guidance Migration Ratification` (`40b8e0d`).
- **Turn Fight (on `next-module`):**
  - **D407:** Standardized 5.0 G Maneuver Pull Law (renumbered from D406 to deconflict with Traffic Sim). Logged in `docs/records/decisions-log.md`.
  - **D408:** Chase After Head-on Confirmed.
  - **D409:** Mode Renaming ("Turn Circle Geometry" vs "BFM Energy Fight") & Derived Bank Angle.
  - **D410:** BFM Toggle & 1-Circle vs 2-Circle Doctrine Help Text.
  - **D411:** Engagement Logic Bug Fixes (D386 Elevation Cone, Ghost Pursuit, Dynamic Altitude Gate, Schema Normalization).

---

## 4. Current Git & Working Tree Status
- **Branch:** `next-module` (up to date with `origin/next-module` at `commit 40de4d3`).
- **Modified files:**
  - `src/modules/turn-fight/energy-sim.js`: `MANEUVER_PULL_G = 5` and rolling limit clamps cleanly in place.
  - `docs/records/decisions-log.md`: D407 logged.
- **Verification status:**
  - `npm run typecheck`: **PASSED (0 errors)**.
  - Unit tests: 480+ passing. The only failures in `energy-sim.test.js` are expected legacy 4.0 G test expectations (e.g. `d.pullG: 4 vs 5`, race time 32.72s vs 34.70s), which are intentionally deferred to Phase 5.

---

## 5. How to Resume the Swarm (or Single Agent Execution)

### Option A: Resuming with `/teamwork-preview` (When Credits Reset)
Run `/teamwork-preview` with the following prompt:

```text
Resume the Turn Fight (BFM 1v1) Remediation Plan v2 starting from Phase 2.
Authoritative handover: `docs/handover/SWARM_RESUME.md`.

Context & Directives:
1. Phase 1 flight math is ALREADY complete in `src/modules/turn-fight/energy-sim.js` (MANEUVER_PULL_G = 5). Keep it clean. Do not add legacy 4 G clamps.
2. Implement Phase 2: Engagement Logic & D386 Elevation Cone (sim.js, energy-sim.js, ghost pursuit fix, dynamic altitude gate, { by: 'both' } schema).
3. Implement Phase 3: Display Readouts & API Key Adapter (Aspect Angle fix, energy AA row, API adapter, V6 text cleanup).
4. Implement Phase 4: UI Mode Renaming & BFM Help Text (Turn Circle Geometry vs BFM Energy Fight, derived bank angle, chase label).
5. Implement Phase 5: Test Harmonization & Verification (update energy-sim.test.js to 5.0 G expectations, update Playwright E2E locators, verify npm test and typecheck).
```

### Option B: Resuming with Single Agent (Direct Serial Implementation)
A single agent session can execute the remaining phases directly without spawning subagents:
1. Read `docs/handover/SWARM_RESUME.md`.
2. Apply Phase 2 edits (`sim.js`, `energy-sim.js`).
3. Apply Phase 3 edits (`readouts.js`, `energy-readouts.js`, `playback.js`).
4. Apply Phase 4 edits (`layout.js`, `geometry.js`).
5. Apply Phase 5 test assertion updates (`energy-sim.test.js`, `tests/e2e/turn-fight.spec.js`).
6. Run `npm test`, `npm run typecheck`, and `npm run build`.
7. Run `/save` protocol.
