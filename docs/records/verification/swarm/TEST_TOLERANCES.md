# Test Tolerances & Assertion Brittleness Audit Report
**Project:** Dad's Debrief (OODA Loop Debrief Webtool Rebuild — Moose Jaw V6)  
**Deliverable:** Authoritative Test Tolerances & Assertion Brittleness Audit  
**Date:** 2026-09-30T20:30:00Z  
**Standard:** Verification Swarm Standards (§1.5 Citation Contract) & Streamlined Build Rules (Decisions D361, D362)  
**Output Path:** `docs/records/verification/swarm/TEST_TOLERANCES.md`  

---

## 1. Executive Summary

A forensic audit of the entire Dad's Debrief test suite was conducted across **207 test files** (1 crosscheck, 20 e2e, 26 golden, and 160 unit test files) comprising **3,178 test cases**.

The audit exposed an acute architectural tension between:
1. **The Legacy Bit-Exact Porting Philosophy:** An initial porting constraint requiring JavaScript reimplementations to match 15-year-old V6 compiled outputs bit-for-bit, including IEEE 754 float equality (`assert.equal`), SHA-256 cryptographic hashes of serialized fixes, sub-nanometer spatial tolerances (`1e-9` ft), and hardcoded 16-decimal-place numbers (`7727.285868494706`).
2. **The Streamlined Build Mandate:** Patrick's domain-driven tolerance policy (Decisions D361, D362):
   > *"Numbers can be within a tolerance (about ±1 kt, ±50 ft, ±1° or ±1%) instead of matching exactly. Dad's already-ported math can be changed when needed, and each change is logged as a judgement call."*  
   > *"No heavy stress runs (mutation runs, fuzzing or exact memory counts). Normal tests only."*

### Key Audit Metrics

| Audit Metric | Finding Count | Operational Impact |
| :--- | :---: | :--- |
| **Total Test Files Examined** | **207** | 100% of repository test assets audited |
| **Ultra-Tight Epsilon Lines** | **422** | Epsilon thresholds $< 10^{-6}$ down to $10^{-15}$ create false failures |
| **Exact Float Equality Checks** | **3,224** | `assert.equal`/`strictEqual` on calculated float mechanics |
| **Deep-Equal Spatial Collections** | **118** | `assert.deepEqual` on trajectory tuples `[xFt, yFt, headingRad]` |
| **Formatted String Digit Locks** | **279** | Exact regex/text assertions on formatted UI readouts |
| **Whole-Dataset Snapshot Locks** | **2** | SHA-256 hash in KML fixes; full JSON table deepEqual in crosscheck |
| **Ad-Hoc Tolerance Implementations** | **30** | Incompatible custom `near()`/`close()` helpers across 30 test files |
| **Shared Tolerance Infrastructure** | **0** | `tests/helpers/` does not exist in repository |

---

## 2. The 6 Brittleness Archetypes

### Archetype 1: Bitwise Float Exact Equality on Computed Flight Mechanics
**Description:** Using `assert.equal(actual, expected)` or `assert.strictEqual` on the outputs of trigonometric, polynomial, or differential equations. In JavaScript, floating-point operations vary based on V8 JIT optimizations, register allocation, and order of operations. Demanding exact 64-bit float equality means innocent refactorings (such as replacing `x / 6076.115` with `x * (1 / 6076.115)`) break tests.

**Total Count:** 3,224 instances.

**Representative Citations:**
- `tests/golden/core-flight-math.test.js:29`: `assert.equal(bankDegFromG(g), v6.bankFromG(g))`
- `tests/golden/core-flight-math.test.js:32`: `assert.equal(turnRadiusFt(v, g), v6.turnRadius(v, g))`
- `tests/golden/core-flight-math.test.js:33`: `assert.equal(turnRateRadPerSec(v, g), v6.turnRate(v, g))`
- `tests/golden/core-flight-math.test.js:45`: `assert.equal(turnRadiusFt(v, lg), m.R)`
- `tests/golden/core-flight-math.test.js:63`: `assert.equal(bankDegFromG(trafficG(g)), v6.bankFromG(g))`
- `tests/golden/core-flight-math.test.js:66`: `assert.equal(turnRadiusFt(ktToFtps(+kt || 120), trafficG(g)), v6.turnRadiusFromG(kt, g))`
- `tests/golden/core-flight-math.test.js:147`: `assert.equal(v6.baseG, limitG(c.gSetting))`
- `tests/golden/core-flight-math.test.js:150`: `assert.equal(g, v6.g)`
- `tests/golden/core-flight-math.test.js:192`: `assert.equal(isaDensityRatio(ft), isaRhoRatio(ft))`
- `tests/golden/core-flight-math.test.js:258`: `assert.equal(ours, v6.closureRateKt(1, 2, lookback))`
- `tests/golden/core-angles.test.js:26`: `assert.equal(angles.degToRad(d), turnSim.deg2rad(d))`
- `tests/golden/core-angles.test.js:31`: `assert.equal(angles.wrapDeg180(d), turnSim.normDeg(d))`
- `tests/golden/core-angles.test.js:36`: `assert.equal(angles.wrapPi(r), debrief.normAngleRad(r))`
- `tests/golden/core-angles.test.js:75`: `assert.equal(angles.aspectAngleDeg(a, b, h), debrief.aspectAngleDeg(a, b, h))`
- `tests/golden/core-geo.test.js:40-41`: `assert.equal(xy.x, pts[i].x); assert.equal(xy.y, pts[i].y)`
- `tests/golden/turn-sim-run.test.js:50`: `assert.equal(row.pairs['1-2'], h.d12)`
- `tests/golden/turn-sim-run.test.js:51`: `assert.equal(row.minSepFt, h.min)`
- `tests/golden/turn-sim-run.test.js:52`: `assert.equal(row.closure13Ftps, h.closure)`
- `tests/golden/turn-sim-solver.test.js:46-48`: `assert.equal(r.trials[0].finalFt, 7727.285868494706)` *(16 decimal places!)*
- `tests/golden/debrief-readouts.test.js:56-57`: `assert.equal(row.rangeFt, Math.hypot(p.x - lead.x, p.y - lead.y)); assert.equal(row.closureKt, v6.closureRateKt(1, row.slot, 1.0))`
- `tests/unit/core/flight-math.test.js:48, 52, 70, 78`: `assert.equal(turnSimG(...), 4)`
- `tests/unit/turn-sim/heading.test.js:31`: `assert.equal(lead(run).headingRad, Math.PI / 2)`

---

### Archetype 2: Deep Equality on Spatial Trajectories & Multi-Variable Tuples
**Description:** Using `assert.deepEqual` to compare multi-element arrays or objects representing physical states (such as `[got.xFt, got.yFt, got.headingRad]`). In JavaScript, `assert.deepEqual([100.000000000001, 200, 0.5], [100.0, 200, 0.5])` fails immediately with an `AssertionError`. A deviation of $10^{-14}\text{ ft}$ triggers a full test failure.

**Total Count:** 118 instances.

**Representative Citations:**
- `tests/golden/turn-sim-formation.test.js:59`:
  ```javascript
  assert.deepEqual([got.xFt, got.yFt, got.headingRad], [want.x, want.y, want.hdg]);
  ```
- `tests/golden/turn-sim-formation.test.js:72`:
  ```javascript
  assert.deepEqual([mine.lateralFt, mine.foreAftFt], [a.tight, a.acute]);
  ```
- `tests/golden/turn-sim-formation.test.js:84`:
  ```javascript
  assert.deepEqual([got.xFt, got.yFt, got.headingRad], [a.x, a.y, a.hdg]);
  ```
- `tests/golden/turn-sim-formation.test.js:99`:
  ```javascript
  assert.deepEqual([g.xFt, g.yFt, g.headingRad], [a.x, a.y, a.hdg]);
  ```
- `tests/golden/turn-sim-run.test.js:45`:
  ```javascript
  assert.deepEqual([a.xFt, a.yFt, a.headingRad, a.turning, a.done], [b.x, b.y, b.hdg, b.active, b.done]);
  ```
- `tests/golden/turn-sim-run.test.js:54`:
  ```javascript
  assert.deepEqual([row.pairs['1-3'], row.pairs['1-4'], row.pairs['3-4']], [h.d13, h.d14, h.d34]);
  ```
- `tests/golden/turn-sim-solver.test.js:86`:
  ```javascript
  assert.deepEqual(port.trials.map((t) => [t.value, t.endingFt]), v6.trials.map((t) => [t.value, t.finalFt]));
  ```
- `tests/golden/turn-sim-plan.test.js:142`:
  ```javascript
  assert.deepEqual([mineFinal.xFt, mineFinal.yFt], [v6Final.x, v6Final.y]);
  ```
- `tests/golden/turn-sim-series.test.js:28`:
  ```javascript
  assert.deepEqual(s.points, v6.map((r) => ({ tSec: r.t, value: r[column[s.id]] })));
  ```
- `tests/golden/debrief-3d.test.js:71`:
  ```javascript
  assert.deepEqual({ x: got.x, y: got.y, depth: got.depth }, { x: want.x, y: want.y, depth: want.depth });
  ```
- `tests/golden/core-flight-math.test.js:220`:
  ```javascript
  assert.deepEqual(emPoint(a, p, b), { iasKt: m.ias, turnRateDeg: m.tr * 2, altFt: m.alt, gsKt: m.gs });
  ```

---

### Archetype 3: Ultra-Tight Epsilon Bounds ($< 10^{-6}$ down to $10^{-15}$)
**Description:** Using custom `near()` helpers with absurdly tight epsilon values. Checking aircraft position to $10^{-9}\text{ ft}$ (approximately $0.3\text{ nanometers}$, less than the width of an atom) violates physical reality. In chaotic dynamic flight (e.g. mutual turn fights), tiny numerical differences grow over time, causing valid simulations to falsely fail.

**Total Count:** 422 lines.

**Representative Citations:**
- `tests/golden/traffic-pair.js:20, 63`:
  ```javascript
  const TOLERANCE_FT = 1e-9;
  const near = (a, b) => a === b || Math.abs(a - b) <= TOLERANCE_FT;
  // Applied to: progress, x, y, altitude in ft, speed in kt, separation!
  ```
- `tests/golden/turn-fight-sim.test.js:39-40, 110-116`:
  ```javascript
  const FT_TOL = 1e-9;
  const RAD_TOL = 1e-12;
  near(mine.xFt, v6p.x + shiftFt, FT_TOL);
  near(mine.headingRad, v6p.h, RAD_TOL);
  near(mine.mergeSec, v6.S.merge, 1e-12);
  ```
- `tests/golden/turn-fight-sim.test.js:284-291` *(Explicit test comment acknowledging brittleness)*:
  ```javascript
  // Known limit. The chase is chaotic: two aircraft turning at each other pass
  // close again and again, so a difference of one bit in a turn rate grows until,
  // after minutes, the paths differ by feet... So with the chase on and such a rate,
  // the port follows V6 to 1e-9 ft only for the first half-minute or so.
  ```
- `tests/golden/core-flight-math.test.js:53-54`:
  ```javascript
  assert.ok(near(w, m.w, 1e-15));
  assert.ok(near(w * 180 / Math.PI, m.rate, 1e-15));
  ```
- `tests/golden/core-angles.test.js:52-53, 58`:
  ```javascript
  assert.ok(Math.abs(core - v6) < 1e-12);
  assert.ok(Math.abs(angles.absAngleDeg(a - 0.7) - bfm.ad(a, 0.7)) < 1e-10);
  ```
- `tests/golden/turn-sim-formation.test.js:150-151`:
  ```javascript
  assert.ok(Math.abs(two.xFt - slot.xFt) < 1e-9);
  assert.ok(Math.abs(two.yFt - slot.yFt - 1000) < 1e-9);
  ```
- `tests/unit/core/flight-math.test.js:11, 47, 54, 59, 107`:
  ```javascript
  near(bankDegFromG(2), 60, 1e-12); // Bank angle checked to 1e-12 deg! (rule: +-1 deg)
  near(m.iasKt, 200, 1e-12);        // Airspeed checked to 1e-12 kt! (rule: +-1 kt)
  ```
- `tests/unit/core/t6-performance.test.js:35, 56`:
  ```javascript
  near(stallLimitG(86), 1, 1e-12);
  near(iasToTasKt(200, 10000), 200 / Math.sqrt(isaDensityRatio(10000)), 1e-12);
  ```
- `tests/unit/turn-sim/heading.test.js:16`:
  ```javascript
  near(headingRadToCompassDeg(start.headingRad), compass, 1e-9); // Heading to 1e-9 deg!
  ```
- `tests/unit/flight-data/flight.test.js:23-25`:
  ```javascript
  assert.ok(Math.abs(sampleAt(track, 0.25).bankRecordedDeg - 175) < 1e-9);
  ```
- `tests/e2e/ui-kit.spec.js:235, 237`: `expect(...).toBeCloseTo(v0.scale, 9);` *(9 decimal places in Playwright e2e!)*

---

### Archetype 4: Hardcoded Formatted String & Digit Assertions
**Description:** E2E and unit tests asserting on exact string representations of numbers in DOM elements. If a calculated turn radius shifts by 1 foot from 1,106 ft to 1,105 ft (a 0.09% variation, well within Patrick's $\pm 50\text{ ft}$ tolerance), string matching fails immediately.

**Total Count:** 279 instances.

**Representative Citations:**
- `tests/e2e/turn-fight.spec.js:120`:
  ```javascript
  await expect(result(page).getByRole('row', { name: /Turn radius/ })).toHaveText(/1,106 ft.*1,106 ft/);
  ```
- `tests/e2e/turn-sim.spec.js:227`:
  ```javascript
  await expect(page.locator('.ts-line').first()).toHaveText('Min sep 7,000 ft');
  ```
- `tests/e2e/turn-sim.spec.js:708`:
  ```javascript
  await expect(flags).toHaveText(["Close pass: 894 ft, #1 and #3: altitude separation needed", ...]);
  ```
- `tests/golden/turn-sim-solver.test.js:36, 41-43`:
  ```javascript
  assert.equal(r.html, `Best ${mode}: <b>${best.val.toFixed(mode === 'spacing' ? 0 : 2)}</b>${unit}<br>Error: ${Math.round(best.err)} ft`);
  assert.equal(v6Solver(solverScenario({ solveFor: 'delay' })).html, 'Best delay: <b>-5.00</b> sec<br>Error: 0 ft');
  assert.equal(v6Solver(solverScenario({ solveFor: 'spacing', formation: 'twoShip' })).html, 'Best spacing: <b>5034</b> ft<br>Error: 10 ft');
  ```
- `tests/unit/turn-fight/sim.test.js:26-28`:
  ```javascript
  assert.equal(t.rateDegPerSec.toFixed(1), '19.2');
  assert.equal(t.radiusFt.toFixed(0), '1106');
  assert.equal((360 / t.rateDegPerSec).toFixed(1), '18.7');
  ```

---

### Archetype 5: Whole-Dataset Hash & Snapshot Freezes
**Description:** Freezing entire outputs using cryptographic hashes or full JSON table deep-equality assertions. A variation in a single floating-point coordinate invalidates the entire test suite.

**Total Count:** 2 instances.

**Representative Citations:**
1. `tests/golden/flight-data-kml.test.js:75`:
   ```javascript
   assert.equal(sha(rows), want.sha256);
   ```
   *Impact:* Serializes hundreds of KML position fixes `[lon, lat, altM, t, gRecorded, pitchRecordedDeg]` to JSON and computes SHA-256. If coordinate rounding shifts by $10^{-8}$ degrees, CI breaks completely.
2. `tests/crosscheck/traffic-scenarios.test.js:99`:
   ```javascript
   assert.deepEqual(TABLE, expected);
   ```
   *Impact:* The test computes proper scenario tolerances (`tolerance: 50 ft`, `tolerance: 5 kt`), but line 99 asserts `assert.deepEqual(TABLE, expected)`. If a simulation enhancement shifts Harvard pattern height from 3,500.0 ft to 3,500.4 ft, `within` remains `"yes"`, but `diff` and `sim` in the table shift, causing a false failure.

---

### Archetype 6: Fragmented, Incompatible Ad-Hoc Tolerance Helpers
**Description:** Because the repository lacks a centralized tolerance helper library (`tests/helpers/`), developers independently created 30 conflicting custom helper functions across test files.

**Total Count:** 30 implementations across 30 files; 0 shared modules.

**Inventory of Conflicting Helpers:**
| Helper Signature | Threshold | Sample Files Using Pattern |
| :--- | :--- | :--- |
| `near(a, b, rel)` | Relative multiplier | `tests/golden/core-flight-math.test.js:19` |
| `near(a, b) => Math.abs(a - b) <= 1e-9` | $10^{-9}$ fixed | `tests/golden/traffic-pair.js:63`, `tests/unit/debrief/readouts.test.js:426` |
| `close(p, q) => ... <= FT_TOL` | $10^{-9}$ fixed | `tests/golden/turn-fight-sim.test.js:244` |
| `close(a, b, msg) => ... < 1e-9` | $10^{-9}$ fixed | `tests/unit/core/angles.test.js:7`, `tests/unit/ui-kit/canvas-view.test.js:7` |
| `near(a, b, tol = 1e-6)` | $10^{-6}$ fixed | `tests/unit/debrief/geometry.test.js:8`, `tests/unit/traffic/route.test.js:17`, `tests/unit/turn-sim/heading.test.js:9` |
| `near(a, b, tol = 1e-9)` | $10^{-9}$ fixed | `tests/unit/traffic/map2d.test.js:15`, `tests/unit/turn-fight/profile.test.js:15`, `tests/unit/turn-fight/view.test.js:14` |
| `absNear(a, b, tol, msg)` | Explicit tol | `tests/unit/core/properties.test.js:27` |
| `near(actual, expected, tol, msg)` | Explicit tol | `tests/unit/turn-fight/sim.test.js:13`, `tests/unit/sof/map-view.test.js:12` |
| `judge(scenario, sim, manual)` | Per-scenario unit | `tests/crosscheck/traffic-measure.js:332` |
| `expect(...).toBeCloseTo(val, digits)` | Digits (6 to 9) | `tests/e2e/ui-kit.spec.js`, `tests/e2e/turn-sim.spec.js` |

---

## 3. High-Friction Assertion Catalog by Module

The following catalog identifies brittle assertions across the codebase, detailing the tested metric, current code, and standard replacement helper:

| File & Line Citation | Tested Flight Metric | Current Brittle Assertion | Recommended Standard Replacement |
| :--- | :--- | :--- | :--- |
| `tests/golden/traffic-pair.js:20` | Spatial position & airspeed | `const TOLERANCE_FT = 1e-9;` | `assertNear(s.distFt, a.prog, TOLERANCES.DISTANCE_FT)` |
| `tests/golden/traffic-pair.js:80-82` | Trajectory coordinates (`x, y, alt, kt`) | `!near(s.x, p.x) \|\| !near(s.y, -p.y)` ($10^{-9}\text{ ft}$) | `assertCoordinatesNear({ x: s.x, y: s.y }, { x: p.x, y: -p.y }, { ft: 50 })` |
| `tests/golden/traffic-pair.js:90` | Lateral & vertical separation | `!near(m.latFt, c.ld) \|\| !near(m.vertFt, c.vd)` | `assertNear(m.latFt, c.ld, TOLERANCES.DISTANCE_FT)` |
| `tests/golden/turn-fight-sim.test.js:39-40` | Combat flight mechanics | `const FT_TOL = 1e-9; const RAD_TOL = 1e-12;` | `TOLERANCES.DISTANCE_FT` ($\pm 50\text{ ft}$), `TOLERANCES.ANGLE_RAD` ($\pm 1^\circ$) |
| `tests/golden/turn-fight-sim.test.js:111-116` | 3D Aircraft State (`xFt, yFt, zFt, h`) | `near(mine.xFt, v6p.x + shiftFt, 1e-9)` | `assertNear(mine.xFt, v6p.x + shiftFt, TOLERANCES.DISTANCE_FT)` |
| `tests/golden/turn-fight-sim.test.js:209` | Merge timestamp | `near(mine.mergeSec, v6.S.merge, 1e-12)` | `assertNear(mine.mergeSec, v6.S.merge, TOLERANCES.TIME_SEC)` ($\pm 0.1\text{ s}$) |
| `tests/golden/flight-data-kml.test.js:75` | KML parser fix list | `assert.equal(sha(rows), want.sha256)` | `assertKmlFixesNear(rows, want.points, { deg: 0.0001, ft: 50 })` |
| `tests/crosscheck/traffic-scenarios.test.js:99` | Traffic manual validation table | `assert.deepEqual(TABLE, expected)` | `assertTableWithinTolerance(TABLE, expected)` |
| `tests/golden/core-flight-math.test.js:29` | Turn bank angle from G | `assert.equal(bankDegFromG(g), v6.bankFromG(g))` | `assertNear(bankDegFromG(g), v6.bankFromG(g), TOLERANCES.ANGLE_DEG)` |
| `tests/golden/core-flight-math.test.js:32` | Turn radius in feet | `assert.equal(turnRadiusFt(v, g), v6.turnRadius(v, g))` | `assertNear(turnRadiusFt(v, g), v6.turnRadius(v, g), TOLERANCES.DISTANCE_FT)` |
| `tests/golden/core-flight-math.test.js:33` | Turn rate in rad/s | `assert.equal(turnRateRadPerSec(v, g), v6.turnRate(v, g))` | `assertNear(turnRateRadPerSec(v, g), v6.turnRate(v, g), TOLERANCES.RATE_RAD_PER_SEC)` |
| `tests/golden/core-flight-math.test.js:147, 150` | Turn Sim limited G | `assert.equal(g, v6.g)` | `assertNear(g, v6.g, TOLERANCES.G_FORCE)` ($\pm 0.05\text{ G}$) |
| `tests/golden/core-flight-math.test.js:192` | ISA air density ratio | `assert.equal(isaDensityRatio(ft), isaRhoRatio(ft))` | `assertNearRelative(isaDensityRatio(ft), isaRhoRatio(ft), TOLERANCES.PERCENT)` |
| `tests/golden/core-flight-math.test.js:258` | Debrief closure rate in knots | `assert.equal(ours, v6.closureRateKt(1, 2, lookback))` | `assertNear(ours, v6.closureRateKt(...), TOLERANCES.AIRSPEED_KT)` ($\pm 1\text{ kt}$) |
| `tests/golden/core-angles.test.js:31` | Angle wrap 180 | `assert.equal(angles.wrapDeg180(d), turnSim.normDeg(d))` | `assertNearAngleDeg(angles.wrapDeg180(d), turnSim.normDeg(d), TOLERANCES.ANGLE_DEG)` |
| `tests/golden/core-angles.test.js:75` | Aspect angle in deg | `assert.equal(angles.aspectAngleDeg(...), ...)` | `assertNear(angles.aspectAngleDeg(...), ..., TOLERANCES.ANGLE_DEG)` |
| `tests/golden/core-geo.test.js:40-41` | Local feet projection | `assert.equal(xy.x, pts[i].x); assert.equal(xy.y, pts[i].y)` | `assertCoordinatesNear(xy, pts[i], { ft: 1.0 })` |
| `tests/golden/turn-sim-formation.test.js:59` | Desired formation slots | `assert.deepEqual([got.xFt, got.yFt, got.headingRad], ...)` | `assertCoordinatesNear(got, want, { ft: 1.0, deg: 0.1 })` |
| `tests/golden/turn-sim-run.test.js:50-51` | Pair separation and min sep | `assert.equal(row.pairs['1-2'], h.d12); assert.equal(row.minSepFt, h.min)` | `assertNear(row.pairs['1-2'], h.d12, TOLERANCES.DISTANCE_FT)` |
| `tests/golden/turn-sim-solver.test.js:46-48` | Solver trial ending distance | `assert.equal(r.trials[0].finalFt, 7727.285868494706)` | `assertNear(r.trials[0].finalFt, 7727.3, TOLERANCES.DISTANCE_FT)` |
| `tests/golden/turn-sim-series.test.js:28` | Spacing history graph points | `assert.deepEqual(s.points, v6.map(...))` | `assertSeriesPointsNear(s.points, v6, { ft: 1.0 })` |
| `tests/golden/debrief-readouts.test.js:56-57` | Range (ft) & closure (kt) | `assert.equal(row.rangeFt, ...); assert.equal(row.closureKt, ...)` | `assertNear(row.rangeFt, ..., TOLERANCES.DISTANCE_FT); assertNear(row.closureKt, ..., TOLERANCES.AIRSPEED_KT)` |
| `tests/unit/core/flight-math.test.js:11` | Bank angle (deg) | `near(bankDegFromG(2), 60, 1e-12)` | `assertNear(bankDegFromG(2), 60, TOLERANCES.ANGLE_DEG)` |
| `tests/unit/core/flight-math.test.js:107` | Indicated airspeed (kt) | `near(m.iasKt, 200, 1e-12)` | `assertNear(m.iasKt, 200, TOLERANCES.AIRSPEED_KT)` |
| `tests/unit/core/t6-performance.test.js:35` | Stall limit G | `near(stallLimitG(86), 1, 1e-12)` | `assertNear(stallLimitG(86), 1, TOLERANCES.G_FORCE)` |
| `tests/unit/turn-sim/heading.test.js:16` | Compass heading in deg | `near(headingRadToCompassDeg(...), compass, 1e-9)` | `assertNearAngleDeg(startCompass, compass, TOLERANCES.ANGLE_DEG)` |
| `tests/unit/traffic/route.test.js:56-59` | Waypoint coordinates | `near(start.x, 10000 - radius)` ($10^{-6}\text{ ft}$) | `assertNear(start.x, 10000 - radius, TOLERANCES.DISTANCE_FT)` |
| `tests/e2e/turn-fight.spec.js:120` | UI Turn radius table cell | `await expect(result(page)...).toHaveText(/1,106 ft.*1,106 ft/)` | `await expectTextNearNumber(cell, 1106, { tolerance: 50 })` |

---

## 4. Architectural Blueprint: `tests/helpers/tolerances.js`

To unify test tolerances across all modules and eliminate custom ad-hoc helpers, the following authoritative module blueprint is specified for future installation in `tests/helpers/tolerances.js`:

```javascript
/**
 * tests/helpers/tolerances.js
 * Standardized Tolerance Helpers for Dad's Debrief Test Suite.
 *
 * Implements Streamlined Build Rules (Decisions D361, D362):
 *   - Airspeed:  about ±1 kt
 *   - Altitude:  about ±50 ft
 *   - Distance:  about ±50 ft (or ±1 ft for close formation / waypoint alignment)
 *   - Angle:     about ±1° (±0.01745 rad)
 *   - G-force:   about ±0.05 G
 *   - Relative:  about ±1% (0.01)
 *   - Time:      about ±0.1 s
 */
import assert from 'node:assert/strict';

export const TOLERANCES = Object.freeze({
  AIRSPEED_KT: 1.0,
  ALTITUDE_FT: 50.0,
  DISTANCE_FT: 50.0,
  CLOSE_FORMATION_FT: 10.0,
  WAYPOINT_ALIGNMENT_FT: 1.0,
  ANGLE_DEG: 1.0,
  ANGLE_RAD: Math.PI / 180, // ~0.01745 rad
  RATE_DEG_PER_SEC: 0.1,
  RATE_RAD_PER_SEC: (0.1 * Math.PI) / 180,
  G_FORCE: 0.05,
  PERCENT: 0.01,
  TIME_SEC: 0.1,
  SCREEN_PIXEL: 1.0,
  GEO_COORD_DEG: 0.0001, // ~36 ft at mid-latitudes
});

/**
 * Asserts that actual is within absolute tolerance of expected.
 * @param {number} actual
 * @param {number} expected
 * @param {number|keyof typeof TOLERANCES} [tolerance]
 * @param {string} [message]
 */
export function assertNear(actual, expected, tolerance = TOLERANCES.DISTANCE_FT, message = '') {
  const tol = typeof tolerance === 'string' ? TOLERANCES[tolerance] : tolerance;
  const diff = Math.abs(actual - expected);
  if (!(diff <= tol)) {
    const detail = message ? `${message}: ` : '';
    assert.fail(
      `${detail}Expected ${actual} to be within ±${tol} of ${expected} (difference: ${diff})`
    );
  }
}

/**
 * Asserts that relative error does not exceed percentage tolerance.
 */
export function assertNearRelative(actual, expected, relTolerance = TOLERANCES.PERCENT, message = '') {
  if (expected === 0) {
    return assertNear(actual, 0, 1e-6, message);
  }
  const relDiff = Math.abs((actual - expected) / expected);
  if (!(relDiff <= relTolerance)) {
    const detail = message ? `${message}: ` : '';
    assert.fail(
      `${detail}Expected ${actual} to be within ${(relTolerance * 100).toFixed(1)}% of ${expected} (relative error: ${(relDiff * 100).toFixed(3)}%)`
    );
  }
}

/**
 * Asserts angular equivalence in degrees taking circular wrap into account.
 */
export function assertNearAngleDeg(actualDeg, expectedDeg, toleranceDeg = TOLERANCES.ANGLE_DEG, message = '') {
  const diff = Math.abs((((actualDeg - expectedDeg) % 360) + 540) % 360 - 180);
  if (!(diff <= toleranceDeg)) {
    const detail = message ? `${message}: ` : '';
    assert.fail(
      `${detail}Expected angle ${actualDeg}° to be within ±${toleranceDeg}° of ${expectedDeg}° (angular delta: ${diff}°)`
    );
  }
}

/**
 * Asserts angular equivalence in radians taking circular wrap into account.
 */
export function assertNearAngleRad(actualRad, expectedRad, toleranceRad = TOLERANCES.ANGLE_RAD, message = '') {
  const twoPi = 2 * Math.PI;
  const diff = Math.abs((((actualRad - expectedRad) % twoPi) + 3 * Math.PI) % twoPi - Math.PI);
  if (!(diff <= toleranceRad)) {
    const detail = message ? `${message}: ` : '';
    assert.fail(
      `${detail}Expected angle ${actualRad} rad to be within ±${toleranceRad} rad of ${expectedRad} rad (angular delta: ${diff} rad)`
    );
  }
}

/**
 * Asserts that 2D or 3D coordinate pairs/tuples match within spatial tolerance.
 * Supports [x, y], { x, y }, { xFt, yFt }, and optional heading.
 */
export function assertCoordinatesNear(actual, expected, options = {}, message = '') {
  const ftTol = options.ft ?? TOLERANCES.DISTANCE_FT;
  const degTol = options.deg ?? TOLERANCES.ANGLE_DEG;

  const ax = Array.isArray(actual) ? actual[0] : (actual.xFt ?? actual.x);
  const ay = Array.isArray(actual) ? actual[1] : (actual.yFt ?? actual.y);
  const ex = Array.isArray(expected) ? expected[0] : (expected.xFt ?? expected.x);
  const ey = Array.isArray(expected) ? expected[1] : (expected.yFt ?? expected.y);

  assertNear(ax, ex, ftTol, `${message} [X coordinate]`);
  assertNear(ay, ey, ftTol, `${message} [Y coordinate]`);

  const ah = Array.isArray(actual) ? actual[2] : (actual.headingRad ?? actual.hdg);
  const eh = Array.isArray(expected) ? expected[2] : (expected.headingRad ?? expected.hdg);
  if (ah !== undefined && eh !== undefined) {
    assertNearAngleRad(ah, eh, (degTol * Math.PI) / 180, `${message} [Heading]`);
  }
}

/**
 * Asserts that a table of numbers matches expected within per-column tolerances.
 * Replaces brittle assert.deepEqual(TABLE, expected).
 */
export function assertTableWithinTolerance(actualRows, expectedRows, columnTolerances = {}) {
  assert.equal(actualRows.length, expectedRows.length, `Table row count mismatch: ${actualRows.length} vs ${expectedRows.length}`);
  for (let i = 0; i < actualRows.length; i++) {
    const act = actualRows[i];
    const exp = expectedRows[i];
    for (const key of Object.keys(exp)) {
      if (typeof exp[key] === 'number') {
        const tol = columnTolerances[key] ?? 1e-4;
        assertNear(act[key], exp[key], tol, `Row ${i} (${act.id ?? i}) column ${key}`);
      } else {
        assert.equal(act[key], exp[key], `Row ${i} (${act.id ?? i}) column ${key}`);
      }
    }
  }
}

/**
 * Playwright E2E Helper: Extracts numeric value from formatted UI element and asserts tolerance.
 * Handles strings like "1,106 ft", "Min sep 7,000 ft", and "19.2 deg/s".
 */
export async function expectTextNearNumber(locator, expectedNumber, { tolerance = 50, regex = /([\d,]+(?:\.\d+)?)/ } = {}) {
  const text = (await locator.textContent()) || '';
  const match = text.match(regex);
  if (!match) {
    assert.fail(`Could not find number in UI text: "${text}"`);
  }
  const actualVal = parseFloat(match[1].replace(/,/g, ''));
  assertNear(actualVal, expectedNumber, tolerance, `UI Locator "${text}"`);
}
```

---

## 5. Phased Implementation Roadmap for Tolerances

When modifying tests in upcoming implementation PRs, apply tolerance updates following this priority:

1. **Step 1: Install Helper Module:** Create `tests/helpers/tolerances.js` (zero new dependencies, uses `node:assert/strict`).
2. **Step 2: Unblock Simulation Test Cutoffs:** Update `tests/golden/turn-fight-sim.test.js` to replace `FT_TOL = 1e-9` with `TOLERANCES.DISTANCE_FT` (50 ft). This removes the artificial 40s test cutoff and allows full 10-minute simulation runs.
3. **Step 3: Fix Traffic Golden Comparison:** In `tests/golden/traffic-pair.js`, replace `TOLERANCE_FT = 1e-9` with domain constants (`TOLERANCES.DISTANCE_FT`, `TOLERANCES.AIRSPEED_KT`).
4. **Step 4: Unfreeze Dataset Snapshots:**
   - In `tests/golden/flight-data-kml.test.js`, replace SHA-256 hash checks with bounding-box and sample fix tolerance checks.
   - In `tests/crosscheck/traffic-scenarios.test.js`, replace `assert.deepEqual(TABLE, expected)` with `assertTableWithinTolerance`.
5. **Step 5: Replace Tuples in Formation Tests:** Update `tests/golden/turn-sim-formation.test.js` and `turn-sim-run.test.js` to use `assertCoordinatesNear` instead of `assert.deepEqual([x, y, hdg], ...)`.
6. **Step 6: Update E2E Playwright Readout Assertions:** Adopt `expectTextNearNumber` in `tests/e2e/turn-fight.spec.js` and `turn-sim.spec.js`.
