# Turn Fight: Implementation Plan

Spec: [`specs/SPEC-turn-fight.md`](../../specs/SPEC-turn-fight.md), approved by Patrick. Tasks: [`todo.md`](todo.md).
Master Plan: [`turn_fight_completion_plan.md`](file:///C:/Users/patri/.gemini/antigravity/brain/38b8f170-9ed5-4022-a9fb-683e79d5cd7e/turn_fight_completion_plan.md).

## Current Status & Context

- **Simple Mode & 3D Baseline (Tasks 1–7):** Merged to `main` through PRs #141, #145, #219. Simple 2D flat 1v1 fight, top-down view, 3D Harvard II view, start geometry, and readouts are live.
- **Energy Simulation Engine (Tasks 8–9):** Merged to `main` through PRs #209, #227, #235 (`energy-sim.js`, 1,360 lines of point-mass 3D aero, full torque, MPT capture at 160 KIAS, `evenFight`).
- **Energy UI & Tactical 3D Suite (Task 10 / PR 4):** Staged from `handover/turn-fight-energy-screen` (`226729d`). Completes the Energy Screen, eliminates 8 forensic V6 traps, adds the Tactical 3D Suite (dotted vertical plumb lines & ground-shadow contact discs), stabilizes e2e tests, and synchronizes all master documentation for Milestone 2 / Gate 2 sign-off.

## Waits on

| Needed for | What | Owner | Status |
|---|---|---|---|
| Execution | Traffic Sim PR 3 (D390) merge to `main` | Traffic thread | Merged to main (`f86ef86`) |
| Task 10.1 | Branch integration `handover/turn-fight-energy-screen` | Turn Fight thread | Merged and resolved |
| Verification | Gate 2 sign-off run by Patrick | Patrick | READY FOR PATRICK (`docs/checklists/turn-fight.md`) |

## Execution Phases & Architecture

### Phase 1: Clean Upstream & Branch Merge
- When Traffic Sim merges D390 to `main`, pull `main` and ensure clean working tree.
- Staged branch `origin/handover/turn-fight-energy-screen` (`226729d`) normalized to LF line endings.

### Phase 2: Aero Limits & MPT Range Calibration (Resolving Traps 4, 5, 7, D392)
- `src/modules/turn-fight/state.js`:
  - Hook up `topKiasAt(altFt)` directly to `energyTopKias(altFt)` imported from `energy-sim.js:55`.
  - Refusal note: `"(269 KIAS in the model, Mach 0.67; the NFM's 279 is the same Mach on the gauge)"`.
  - Enforce MPT speed box range 125–175 KIAS (D349).
  - Enforce D381: prohibit Immelmann selection when merge speed $\le 140$ KIAS.
  - Rename `v6Defaults()` to `standardDefaults()` (D384) with `export const v6Defaults = standardDefaults;` for compatibility.
- `src/modules/turn-fight/energy-sim.js`:
  - Enforce D381: update `immelmannMinTopKias` and `splitSBelowKias` to 140 kt.
  - Enforce D392 in `controlImmelmann` (`energy-sim.js:832`): pull 5.0 G until at stick shaker, then ride the shaker (`Math.min(5.0, ctx.shaker)`).
- `tests/unit/turn-fight/energy-layout.test.js` & `energy-state.test.js`:
  - Update expectations to 125–175 KIAS and 269 kt corner speed; verify all 500 unit tests pass.

### Phase 3: Setup Error Containment & Playback Robustness
- `src/modules/turn-fight/state.js` & `playback.js`:
  - Verify `startEnergyRun` in `src/modules/turn-fight/state.js:292` handles setup `RangeError` (message starting `"Turn Fight energy setup: "`) via `isSetupError` and logs `energyProblem`.
  - Ensure any non-setup `RangeError` is rethrown cleanly without suppression.
- `tests/unit/turn-fight/energy-state.test.js`:
  - Add unit tests verifying both setup `RangeError` capture and unexpected `RangeError` rethrow in `startEnergyRun`.

### Phase 4: Simple Mode Aerodynamic & Kinematic Traps Remediation (Traps 1, 2, 3, 6, 8)
- **Trap 1 (`sim.js:337`):** Remove coordinate snap `if (state.headOn) { blue.xFt = 0; ... }`; allow continuous mathematical flight.
- **Trap 2 (`sim.js:348-352`):** Direct chase steering only to the first-nose winner; loser maintains defensive turn geometry instead of mutual head-on collision.
- **Trap 3 (`sim.js:102-120`):** Implement D386: in Climb/Dive vertical mode, evaluate line-of-sight with an explicit **10° elevation capture cone**:
  - Azimuth off-nose: $\Delta \text{Az} = \text{absAngleDeg}(\text{lineOfSightRad}(\text{from}, \text{to}) - \text{from.headingRad}) \le 5.0^\circ$.
  - Target elevation angle: $\theta_{\text{los}} = \text{radToDeg}(\text{atan2}(\Delta z, \text{hypot}(\Delta x, \Delta y)))$.
  - Elevation off-nose: $\Delta \text{El} = |\text{radToDeg}(\text{from.pitchRad}) - \theta_{\text{los}}| \le 10.0^\circ$.
  - Nose-on in Climb/Dive triggers if $\Delta \text{Az} \le 5.0^\circ$ AND $\Delta \text{El} \le 10.0^\circ$.
- **Trap 8 (`sim.js:276`):** Guard nose check at start: `if (state.firstNose) return; if (state.headOn && !state.setup.vertical) return;`.
- **Trap 6 & UI Polish:**
  - `layout.js:150`: Relabel `'Head-on (V6)'` to `'Neutral Head-on'` (D368/D372).
  - Relabel Reset buttons to **"Reset to Standard Defaults"** (D384).
  - Grey out Red's height input when Climb & Dive is disabled.
  - `readouts.js`: Label More detail time row `"Time since the turns started"` when turns start at once or without a pass mark.

### Phase 5: Tactical 3D Suite Implementation (D392)
- `src/modules/turn-fight/view3d.js`:
  - Pure helpers `computePlumbGeometry(pose, floorZ)` and `computeFloorZ(fight, bounds)`.
  - Construct `gl.plumbLines` (Blue `#58a6ff` and Red `#ff6b6b`) using `THREE.LineDashedMaterial` (`dashSize: 20, gapSize: 15, opacity: 0.65`). Call `computeLineDistances()` on each frame.
  - Construct `gl.shadowDiscs` using `THREE.Mesh` and `THREE.RingGeometry(0, 35, 32)` with `THREE.MeshBasicMaterial` (`opacity: 0.35, depthWrite: false`) positioned at $(x, y, floorZ + 1.0\text{ ft})$.
  - Floor behavior: terrain grid floor in Simple Mode; **Hard Deck** (`hardDeckFt`) in Energy Mode (plunges to 0 ft MSL if hard deck breached).
  - Clean disposal on unmount/teardown.
- `tests/unit/turn-fight/view3d.test.js`:
  - Unit tests verifying plumb line geometry, uniform dash cadence, and hard deck tracking.

### Phase 6: Playwright E2E Stabilization
- `tests/e2e/turn-fight.spec.js`:
  - Wrap all Energy tests in `test.describe('Energy (T-6)', ...)`.
  - Line 1360: Update MPT hint assertion from `'120 to 175 KIAS'` to `'125 to 175 KIAS, default 160 KIAS.'` (D349).
  - Line 1377: Update Auto Split S below expectation from `['120', '40 to 220 KIAS, default 120 KIAS.']` to `['140', '40 to 220 KIAS, default 140 KIAS.']` (D381).
  - Add `{ intervals: [50] }` to the forced Split S polling assertion.
  - Assertions evaluate within pilot domain tolerances (D369/D371).

### Phase 7: Verification & Master Documentation Synchronization
- Run full test suite: `node --test`, `npm run typecheck`, `npm run build`, `npx playwright test`.
- Write formal report: [`docs/records/verification/turn-fight-verification.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/verification/turn-fight-verification.md).
- Synchronize all 9 authoritative documents across the repository.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Concurrent Traffic Sim session creates merge conflict | Staged changes touch ONLY `src/modules/turn-fight/` and `tests/*/turn-fight*`. Zero overlap with `traffic/`. We pull `main` after Traffic merges. |
| Incompressible vs compressible IAS drift at high altitude | Model calculates aerodynamic IAS via $TAS \times \sqrt{\sigma}$ (D273/D350). VMO corner strictly enforced at Mach 0.67 / 269 KIAS (D345/D347). Pilot domain tolerance ($\pm10$ kt) absorbs minor gauge compressibilities. |
| Plumb line dashed material loses cadence during 3D zoom | Frame loop explicitly executes `computeLineDistances()` on updated line geometries. |
| WebGL resource leak on frequent 2D/3D toggling | Geometries (`BufferGeometry`, `RingGeometry`) and materials are tracked in `gl` context and explicitly disposed in `teardown()`. |
