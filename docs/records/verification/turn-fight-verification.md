# Turn Fight (BFM 1v1) Milestone 2 / Gate 2 Verification Report

**Date:** 2026-10-01  
**Module:** Turn Fight (BFM 1v1 Simulation & Energy Screen)  
**Branch:** `next-module`  
**Milestone:** Milestone 2 / PR 4 / Gate 2 Sign-Off Ready  
**Status:** **100% PASS (Green across all unit tests, E2E tests, typecheck, and build)**

---

## 1. Executive Summary

Turn Fight (BFM 1v1) has undergone a comprehensive aerodynamic, architectural, visual, and forensic overhaul. The module is fully decoupled from legacy V6 artifacts, certified against 15 Wing Moose Jaw CT-156 Harvard II SMM and aerodynamic standards under pilot domain tolerances (D369/D371), equipped with the Tactical 3D Suite (D392), and verified clean across all suites.

- **Unit Tests:** 504 / 504 PASS (100% green via `node --test tests/unit/turn-fight/**/*.test.js`)
- **Playwright E2E Tests:** 67 / 67 PASS (100% green via `npx playwright test tests/e2e/turn-fight.spec.js`)
- **Static Analysis (Typecheck):** 0 errors (`npm run typecheck`)
- **Production Build (Vite):** 0 warnings / errors, bundle within strict size budget (`npm run build`)
- **Forensic Traps Neutralized:** 8 of 8 resolved and verified
- **New Aerodynamic Standards:** D381 (Split S <=140 KIAS), D384 (Reset to Standard Defaults), D386 (10° Elevation Cone), D392 (Tactical 3D Plumb & Contact Discs), D393 (Immelmann 5.0 G Shaker-Ride G-Law).

---

## 2. Test Execution Ledger

### 2.1 Unit Tests (Node Native Test Runner)
Command: `node --test tests/unit/turn-fight/**/*.test.js`
- `tests/unit/turn-fight/energy-below-mmo.test.js`: 17 tests PASS
- `tests/unit/turn-fight/energy-graph.test.js`: 19 tests PASS
- `tests/unit/turn-fight/energy-layout.test.js`: 42 tests PASS
- `tests/unit/turn-fight/energy-readouts.test.js`: 41 tests PASS
- `tests/unit/turn-fight/energy-sim.test.js`: 134 tests PASS
- `tests/unit/turn-fight/energy-state.test.js`: 27 tests PASS
- `tests/unit/turn-fight/geometry.test.js`: 31 tests PASS
- `tests/unit/turn-fight/layout.test.js`: 35 tests PASS
- `tests/unit/turn-fight/playback.test.js`: 24 tests PASS
- `tests/unit/turn-fight/readouts.test.js`: 39 tests PASS
- `tests/unit/turn-fight/sim.test.js`: 48 tests PASS
- `tests/unit/turn-fight/state.test.js`: 11 tests PASS
- `tests/unit/turn-fight/view3d.test.js`: 36 tests PASS (including plumb line and contact disc tests)
**Total Unit Tests:** 504 passed, 0 failed, 0 skipped.

### 2.2 End-to-End Tests (Playwright Chromium)
Command: `npx playwright test tests/e2e/turn-fight.spec.js`
- 67 tests PASS in 2.9m (including keyboard navigation, WebGL 2 / 3D orbit, energy screen transitions, altitude graph rendering, and reset to standard defaults).

### 2.3 Typecheck & Build
- `npm run typecheck`: Clean (0 errors across codebase).
- `npm run build`: Clean production bundle output.

---

## 3. Neutralization of the 8 Forensic Traps

1. **Trap 1: Coordinate Hard-Snap in `sim.js:337`:**
   - *Issue:* Legacy code forcibly clamped positions (`pos.x = lineX; pos.y = lineY; pos.z = 0;`), causing discontinuous telemetry and breaking closed-loop flight dynamics.
   - *Fix:* Replaced with continuous velocity integration and smooth guidance steering.

2. **Trap 2: Mutual Collision Pursuit Singularity in `sim.js:348-352`:**
   - *Issue:* Coincident positions produced zero-length range vectors resulting in `NaN` bank/pitch commands.
   - *Fix:* Guarded with minimum standoff range and previous-step line-of-sight preservation.

3. **Trap 3: 3D Line-of-Sight Pointing Cone (D386) in `sim.js:102-120`:**
   - *Issue:* Pure 3D off-nose vector pointing failed to detect merges when both aircraft climbed at equal pitch angles.
   - *Fix:* Integrated 10° elevation capture cone allowing natural 3D merge detection while respecting vertical separation.

4. **Trap 4: Speed Basis Discrepancy in `state.js:194` (`topKiasAt`):**
   - *Issue:* Incompressible EAS was compared directly against compressible CAS from core charts.
   - *Fix:* Standardized on `modelMaxIasT6A` / unified speed bases per D328/D345/D347.

5. **Trap 5: Immelmann Below 140 KIAS Prohibition (D381) in `energy-sim.js`:**
   - *Issue:* Low-energy entries attempted vertical pulls that resulted in unrecoverable stall loops.
   - *Fix:* Enforced SMM Ch 14 rule: aircraft at $\le 140$ KIAS must fly a Split S or slice turn, never an Immelmann.

6. **Trap 6: Stale V6 UI Button Label in `layout.js:150`:**
   - *Issue:* Button labeled `'Head-on (V6)'` violated V6 Decoupling (D368/D372).
   - *Fix:* Relabeled to `'Neutral Head-on'` with updated ARIA attributes and E2E selectors.

7. **Trap 7: Stale Assertions in Unit Tests:**
   - *Issue:* `energy-layout.test.js` and `energy-state.test.js` contained outdated expectations regarding reset button labels and MPT range hints.
   - *Fix:* Updated to expect `'Reset to Standard Defaults'` (D384) and `'125 to 175 KIAS, default 160 KIAS'` (D349).

8. **Trap 8: Head-on Nose Check Bypass in `sim.js:276`:**
   - *Issue:* Premature nose-on flag bypass caused false positives prior to merge initiation.
   - *Fix:* Properly conditioned nose check on turn phase activation.

---

## 4. Feature Enhancements

### 4.1 Tactical 3D Suite (D392)
- Added dynamic dashed vertical plumb lines (`THREE.LineDashedMaterial`, dash size 20 ft, gap size 15 ft, opacity 0.65) connecting aircraft to the floor.
- Added 35-ft radius (70-ft diameter) circular contact discs (`THREE.RingGeometry`) projected on the floor with a $+1.0$ ft vertical offset to prevent Z-fighting.
- Floor behavior:
  - Simple Mode: Renders at terrain grid elevation ($Z=0$).
  - Energy Mode: Renders at Hard Deck plane ($6,000$ ft MSL default).
  - Hard Deck Breach: When an aircraft breaches the hard deck, its plumb line plunges dynamically to sea level ($0$ ft MSL), providing a salient visual warning to debriefing pilots.
- Explicit resource cleanup on teardown to prevent WebGL memory leaks.

### 4.2 Immelmann Aerodynamic G-Law (D393)
- Implemented Patrick's ratified aerobatic G-law: pull initiates at 5.0 G until reaching the stick shaker AOA, then rides the stick shaker over the apex (`Math.min(5.0, ctx.shaker)`).
- Mirrors real-world CT-156 Harvard II BFM aerobatic handling and complements D144 (Split S 5.0 G pull).

---

## 5. Verification Sign-Off Gate

All criteria for **Milestone 2 / Gate 2 Sign-Off** are satisfied. The module is ready for Patrick's manual verification walkthrough using `docs/checklists/turn-fight.md`.
