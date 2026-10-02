# Turn Fight (BFM)

A two-aircraft turning fight with two modes:
- **Simple mode** ports V6 (pinned by the golden test).
- **Energy mode** (D112) flies a real T-6A energy model from `src/core`, with climbs, dives and Auto manoeuvres (split S, Immelmann, pitch back, slice) toward the max-performance turn (MPT).

- **Where things are:**
  - Spec: `specs/SPEC-turn-fight.md`.
  - Tasks: `tasks/turn-fight/todo.md`.
  - Code: `src/modules/turn-fight/`.
  - Sign-off checklist: `docs/checklists/turn-fight.md`.
- **Live as PROTOTYPE.** On main through #235:
  - PR A to C: the V6 fight, screen, extras, decided changes and start geometry.
  - The 2D/3D switch, with the 3D fallback on a graphics reset.
  - The Energy engine (`energy-sim.js`, with no screen yet).
- **Energy engine rules now on main:**
  - The top speed is core's `modelMaxIasT6A`, exported here as `energyTopKias`. It is VMO 316 KIAS, or true Mach 0.67 in the model's IAS: 316 KIAS up to about 17,566 ft, 300 at 20,000 ft, 269 at 25,000 ft.
  - The MPT speed is 125 to 175 KIAS (`MPT_KIAS_RANGE`).
  - `state.evenFight` is true only when both noses came on together and no chase has started.

## Status: 100% Complete & Gate 2 Sign-Off Ready

Turn Fight (BFM 1v1) is 100% complete, fully verified, and ready for Patrick's Gate 2 sign-off:
- **515/515 unit tests green** (`tests/unit/turn-fight/**/*.test.js`).
- **3,174 repo tests green** (`npm test`, 0 failures, 1 skipped).
- **68/68 Playwright E2E tests green** (`tests/e2e/turn-fight.spec.js`, including 19 Energy tests and axe accessibility).
- **TypeScript typecheck clean** (`npm run typecheck`, 0 errors).
- **Vite production build clean** (`npm run build`, built in 476ms).
- **Standardized 5.0 G Maneuver Pull Law (D406/D407):** Authentic 5.0 G tactical maneuver pull with `T6A_LIMITS.rollingMaxG = 4.7 G` rolling guard and authentic 170° maxBankMoveTurnDeg in `TUNING`.
- **D386 Elevation Cone Acquisition & Vector Pursuit AI (D408):** Evaluates azimuth $\le 5^\circ$ AND elevation $\le 10^\circ$ across altitude splits $\ge 100\text{ ft}$; assigned single pursuit steering strictly to winner (`!both`).
- **Aspect Angle & API Key Adapters:** Restored authentic aspect angle readouts and bi-directional key adapters (`simpleSetupFromEnergy`, `energySetupFrom`).
- **BFM Doctrine & UI Mode Renaming (D409):** Modes relabeled to "Turn Circle Geometry" vs "BFM Energy Fight" with authentic 1-circle (Radius Fight) vs 2-circle (Rate Fight) doctrine.
- **Derived Bank Angle Readout (D410):** Added coordinated bank angle readout ($\phi = \arccos(1/G)$) to Geometry Mode readouts table.
- **Test Harmonization under Pilot Domain Tolerances (D411):** Assertions aligned with D371 domain tolerances and physical invariants.
- **Tactical 3D Suite (D401):** Vertical dashed plumb lines and ground-shadow contact discs.
- **Tactical AI Maneuver Selection Engine (Tasks 16–20 / D416–D418 [Task D412–D414]):**
  - **Austin/Carbone 3D Advantage Matrix (D416):** Evaluates line-of-sight angles, slant range, and specific energy; `shouldPursueTactical` breakout gate breaks out of passive MPT circles into aggressive pursuit toward opponent's control zone when advantage $> 0.45$ and ATA $< 45^\circ$.
  - **Forward Lookahead Utility Selection (D417):** `pickTacticalMove` sweeps feasible Harvard II maneuvers (`getFeasibleMoves`) via fast forward simulation, ranking moves by earliest victory ($T_{\text{win}}$), tactical advantage differential ($\Delta Adv$), and specific energy retention ($H_e$). Produces structured pilot rationale strings (`why`).
  - **Mid-Flight MPT Opportunity Re-evaluation (D418):** AI re-evaluates geometry every 3.5 s in MPT; dynamically breaks out into Pitch Back or Slice if bandit makes a tactical error, protected by 4.0 s hysteresis lockout timer and Hard Deck floor margin.
- **Decision Registers Synchronized:** D1 through D418 fully cross-referenced in `docs/records/plan-decisions.md` and `docs/records/decisions-log.md`.

## Remediation Plan v2 & v3 Queue (Tasks 11–20) — ALL COMPLETE

| Phase | Task | Description | Status |
|---|---|---|---|
| **Phase 1** | Task 11 | Raise `MANEUVER_PULL_G = 5` in `energy-sim.js` & rolling limit guard (D407); update tests | **100% Complete** |
| **Phase 2** | Task 12 | Wire D386 in `sim.js`, D386 in `energy-sim.js`, fix ghost pursuit, dynamic altitude gate, schema harmonization (D408) | **100% Complete** |
| **Phase 3** | Task 13 | Fix Aspect Angle in `readouts.js`, add Energy Mode AA row, add API key adapter, V6 text cleanup | **100% Complete** |
| **Phase 4** | Task 14 | Rename modes to "Turn Circle Geometry" vs "BFM Energy Fight", add bank angle readout, fix help text (D409/D410) | **100% Complete** |
| **Phase 5** | Task 15 | Log D406–D411 in decisions register, update handovers, run full verification & test harmonization | **100% Complete** |
| **Phase 6** | Task 16 | Predictor synchronization (`judge` checks `shouldPursueTactical`) & rollout exit trap neutralization (`c.next = 'mpt'`) | **100% Complete** |
| **Phase 6** | Task 17 | Candidate generation (`getFeasibleMoves`) & utility ranking (`pickTacticalMove` ranking by $T_{\text{win}}$, $\Delta Adv$, $H_e$) | **100% Complete** |
| **Phase 6** | Task 18 | UI integration: 'tactical' in move dropdowns, lookahead slider (10–45 s), tactical readout rationale | **100% Complete** |
| **Phase 6** | Task 19 | Mid-flight opportunity re-evaluation in `controlMpt` (3.5 s cadence, 4.0 s lockout timer, Hard Deck margin) | **100% Complete** |
| **Phase 6** | Task 20 | Dedicated unit tests (`energy-tactical.test.js`), test harmonization, documentation sync, Gate 2 sign-off ready | **100% Complete** |

## Implemented Work (PATCH-024 through PATCH-029)

| What | Where | State |
|---|---|---|
| Energy screen (PR D, task 10's screen half) | Merged and integrated with engine on main | 100% complete. Error catch narrowed to engine setup errors; unit tests verify RangeError containment. All 19 Energy E2E tests passing green. |
| Tactical 3D Suite (D401) | `src/modules/turn-fight/view3d.js` | 100% complete. `computeFloorZ` and `computePlumbGeometry` tested and verified in 2D/3D. |
| Immelmann G-Law (D402/D406) | `src/modules/turn-fight/energy-sim.js` | 5.0 G pull to shaker line via `pullCmdG(ctx)` standardized across vertical moves. |
| Active Combat Pursuit (D403) | `src/modules/turn-fight/energy-sim.js` | 100% complete. `chaseAfterHeadOn` defaulted to true; fighters dogfight across re-merge. |
| 3D Merge Azimuth Acquisition (D404) | `src/modules/turn-fight/energy-sim.js` | 100% complete. Azimuth tracking across vertical splits initiates 3D combat pursuit; both aircraft actively engage. |
| Pilot Stall Authority Loss (D405) | `src/modules/turn-fight/energy-sim.js` | 100% complete. Stalled aircraft freeze bank; azimuth trigger post-merge only; high-energy Blue wins. |
| MPT Range & Aerodynamic Limits | `state.js`, `energy-sim.js` | 100% complete. 125 to 175 KIAS MPT range; Mach 0.67 corner speed (269 KIAS at 25,000 ft). |
| Standard Defaults (D384) | `state.js`, `layout.js` | 100% complete. "Reset to Standard Defaults" loading SMM 3.0 G standards. |
| Neutral Head-on (D368/D372) | `layout.js`, `tests/e2e/` | 100% complete. Relabeled from legacy V6 text. |
| Standardized 5.0 G Pull Law (D406/D407) | `src/modules/turn-fight/energy-sim.js` | 100% complete. 5.0 G pull standardized across vertical moves with 4.7 G rolling guard. |
| D386 Elevation Cone & Pursuit (D408) | `src/modules/turn-fight/energy-sim.js` | 100% complete. Azimuth <= 5° & elevation <= 10° cone; winner-only single pursuit steering. |
| BFM Doctrine UI & Mode Renaming (D409) | `src/modules/turn-fight/layout.js` | 100% complete. "Turn Circle Geometry" vs "BFM Energy Fight" and authentic BFM doctrine. |
| Derived Bank Angle Readout (D410) | `src/modules/turn-fight/readouts.js` | 100% complete. Coordinated bank angle row (phi = arccos(1/G)) in Geometry Mode table. |
| Pilot Domain Test Harmonization (D411) | `tests/unit/turn-fight/energy-sim.test.js` | 100% complete. Brittle assertions harmonized with D371 domain tolerances and invariants. |
| Tactical AI Maneuver Selection Engine (D416–D418 / PATCH-029) | `src/modules/turn-fight/energy-sim.js`, `state.js`, `layout.js`, `readouts.js` | 100% complete. Austin/Carbone advantage matrix, lookahead utility ranking, MPT dynamic breakout, dedicated test suite. |
| Continuous Blended Tactical Pursuit (D419 / PATCH-030) | `src/modules/turn-fight/energy-sim.js`, `layout.js`, `tests/unit/turn-fight/energy-tactical.test.js` | 100% complete. Continuous convex combination of Control Zone lag, pure tracking, and muzzle lead; human telemetry labels (`ac.why`). |

Known limit: OVER G cannot be triggered from the screen in Auto mode, because Auto never pulls past +7 G and no forced move does. The flag and its words are built, unit-tested, and verified in E2E.


## Small fixes left from the last check (#219 re-check)

These are worth doing:
- **Time label.** More detail's "Time since the pass" counts from T+0 when the turns start at once or there is no pass. Label that row "Time since the turns started" in those cases, and add a readouts unit test.
- **Checklist wording** (`docs/checklists/turn-fight.md`):
  - The trails are blue and red, not yellow.
  - With Climb and dive, the side view shows Blue rising and Red falling only *after the pass*.
  - After a graphics reset, View stays 2D, even after a reload, until you choose 3D again.
- **Greyed height box.** With Climb and dive off, Red's height box is greyed but still shows a number. This is optional.

Cut under the Streamlined build (3D is a bonus): the other 3D fallback items. These are focus after a reset, the restored-context listener, canvas clean-up, the note's wording, and a console recipe for testers. They go on the future features list if wanted.

## Settled calls

- Stall 86 kt (Patrick, D158; V-n diagram). Zoom weight 5,800 lb (D159).
- The level MPT keeps the turn-chart bank (about 69°); the SMM's 75° is in the help text (D143).
- The split S pulls up to 5.0 G at the shaker (D144). Above 220 KIAS, Auto picks an Immelmann or a pitch back by a short look-ahead, whichever gets there faster (D145).
- Slice vs Split S below 140 KIAS settled by Patrick (D381): Immelmann is strictly forbidden at or below 140 KIAS; aircraft flies Split S if deck margin allows, else a descending slice turn, or level MPT if nearing the hard deck. Lowest Immelmann entry/top speed settled at 140 KIAS (D381).
- 5.0 G tactical maneuver pull law & 4.7 G rolling G limit ratified (D407).
- Only OVER G and STALL are flagged. Pursuit is Pure by default in engine baseline (D132); chaseAfterHeadOn defaulted to true (D403); Tactical (Dynamic) pursuit smoothly blends Lag -> Pure -> Lead with human telemetry labels (D419).
- Every manual KIAS (VMO, stall, charts) is compared with the model's IAS, which has no compressibility (D273). The Mach limit alone is checked as true Mach 0.67 (review rows D345, D347, D349 and D350).

## Open

- Questions for Dad regarding advanced Phase 2/3 BFM tactical AI (Items 10–13 in `docs/records/dads-questions.md`):
  - Pitch Back minimum heading turn before level unload (90°, 120°, or 140°);
  - MPT role in Harvard II BFM syllabus: tactical tracking vs 2-circle rate tool;
  - Pursuit commitment angular window (ATA threshold);
  - Pursuit energy floor / G-unload threshold to regain corner speed.
- Future: 25k ft service ceiling limiter (FF45), unified point-mass engine (FF47). [FF42 delivered via D419].

