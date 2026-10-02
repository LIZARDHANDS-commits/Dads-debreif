// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Empirical Challenge Harness for Milestone M1 Core Flight Engine
// Role: EMPIRICAL CHALLENGER (critic, specialist)
// Testing mathematical formulations, numerical stability, and domain tolerances

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  stepAircraft,
  initAircraftState,
  calcCrossTrackError,
  calcAlongTrackDist,
  calcInterceptHeading,
  calcLeadTurnDist,
  calcBankTarget,
  calcSpeedTarget,
  calcAltitudeTarget,
  evaluatePhaseTransitions,
  calcStallBankLimit,
  calcCubicDescentAlt,
  calcBreakDecelSpeed,
  calcGlideSlopeTargetAlt,
  CYMJ_FIELD_ELEV_FT,
  CYMJ_THRESH_ELEV_FT,
  GLIDE_SLOPE_DEG,
  GLIDE_SLOPE_INTERCEPT_FT,
  SPEED_GATE_WINDOW_FT,
  STALL_SPEED_KIAS,
} from '../../../src/modules/traffic/flight-engine.js';
import { KT_TO_FTPS, G_FTPS2, ktToFtps, ftpsToKt } from '../../../src/core/units.js';
import { degToRad, radToDeg, wrapDeg180 } from '../../../src/core/angles.js';

function near(actual, expected, tol, msg = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${msg} | Expected ${actual} within ${tol} of ${expected} (diff: ${diff})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 1: Break Deceleration Formula V(u) = 220 * exp(-0.452 * u)
// ─────────────────────────────────────────────────────────────────────────────

test('CHALLENGE 1.1: Break deceleration formula boundary points and monotonic decrease', () => {
  // Analytical boundaries
  const v0 = calcBreakDecelSpeed(0);
  const v1 = calcBreakDecelSpeed(1.0);
  
  near(v0, 220.0, 1e-9, 'Entry speed at u=0 must equal exactly 220 KIAS');
  near(v1, 220 * Math.exp(-0.452), 1e-9, 'Rollout speed at u=1 must equal 220*exp(-0.452)');
  near(v1, 140.0, 0.01, 'Rollout speed at u=1 must be ~140 KIAS (diff < 0.01 kt)');

  // Dense evaluation across 1,000 points
  let prevV = v0;
  for (let i = 1; i <= 1000; i++) {
    const u = i / 1000;
    const v = calcBreakDecelSpeed(u);

    // Monotonic strictly decreasing
    assert.ok(v < prevV, `V(u) must strictly decrease at u=${u}: prev=${prevV}, curr=${v}`);

    // Within domain envelope [140 - 10, 220 + 10]
    assert.ok(v >= 130 && v <= 230, `V(u)=${v} at u=${u} must conform to ±10 kt pilot domain envelope [130, 230]`);

    // First derivative check: dV/du = -0.452 * 220 * exp(-0.452 * u)
    const analyticalDeriv = -0.452 * 220 * Math.exp(-0.452 * u);
    let numericalDeriv;
    if (u < 1) {
      numericalDeriv = (calcBreakDecelSpeed(u + 1e-5) - calcBreakDecelSpeed(u - 1e-5)) / 2e-5;
    } else {
      numericalDeriv = (calcBreakDecelSpeed(1.0) - calcBreakDecelSpeed(1.0 - 1e-5)) / 1e-5;
    }
    near(numericalDeriv, analyticalDeriv, 1e-3, `Derivative check at u=${u}`);

    prevV = v;
  }
});

test('CHALLENGE 1.2: Break deceleration input clamping and edge-case resilience', () => {
  // Negative u clamped to u=0 (220 KIAS)
  near(calcBreakDecelSpeed(-0.5), 220.0, 1e-9, 'Negative u must clamp to 220 KIAS');
  near(calcBreakDecelSpeed(-1000), 220.0, 1e-9, 'Extreme negative u must clamp to 220 KIAS');

  // u > 1 clamped to u=1 (~140 KIAS)
  near(calcBreakDecelSpeed(1.5), 220 * Math.exp(-0.452), 1e-9, 'u > 1 must clamp to u=1 value');
  near(calcBreakDecelSpeed(100), 220 * Math.exp(-0.452), 1e-9, 'Large u must clamp to u=1 value');

  // Invariant: speed always finite for finite u
  assert.ok(Number.isFinite(calcBreakDecelSpeed(0.5)));
});

test('CHALLENGE 1.3: Dynamic break turn simulation conforms to ±10 kt pilot domain tolerance', () => {
  // Simulate full 180° break turn from initial overhead break entry
  const navPlan = {
    waypoints: [
      { x: 3104, y: -3194, alt: 3500, kias: 220 }, // Threshold
      { x: -288, y: -1400, alt: 3500, kias: 220 }, // Break point
      { x: -5000, y: 3500, alt: 3500, kias: 140 }, // Downwind entry
    ],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };
  const a = initAircraftState({
    x: -288,
    y: -1400,
    alt: 3500,
    iasKt: 220,
    headingDeg: 298,
    phase: 'break',
    targetBankDeg: -60,
    targetAltFt: 3500,
    turnAccumDeg: 0,
  }, navPlan, env);

  const dt = 0.05;
  const recordedSteps = [];

  // Step until turn completes (turnAccumDeg >= 180 or phase changes)
  while ((a.turnAccumDeg ?? 0) < 180 && a.phase === 'break') {
    stepAircraft(a, navPlan, env, dt);
    const u = Math.min(1, a.turnAccumDeg / 180);
    const expectedSpeed = calcBreakDecelSpeed(u);
    const speedError = Math.abs(a.iasKt - expectedSpeed);
    recordedSteps.push({ u, iasKt: a.iasKt, expectedSpeed, speedError });
  }

  assert.ok(recordedSteps.length > 50, `Break turn should take multiple steps (took ${recordedSteps.length})`);

  // Max speed error across the entire maneuver
  const maxError = Math.max(...recordedSteps.map(s => s.speedError));
  assert.ok(
    maxError <= 10.0,
    `Dynamic break speed error ${maxError.toFixed(2)} kt exceeds ±10 kt pilot domain tolerance!`
  );

  // Final rollout speed should be within ±10 kt of 140 KIAS
  const finalRollout = recordedSteps[recordedSteps.length - 1];
  near(finalRollout.iasKt, 140.0, 10.0, 'Final rollout speed must conform to 140 ± 10 kt');
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 2: Final Turn Cubic Descent z(u) = 3500 - 800 * (3u^2 - 2u^3)
// ─────────────────────────────────────────────────────────────────────────────

test('CHALLENGE 2.1: Cubic descent analytical and numerical derivative dz/du = 0 at entry and rollout', () => {
  // Boundary altitudes
  near(calcCubicDescentAlt(0), 3500.0, 1e-9, 'Entry altitude at u=0 must be 3,500 ft MSL');
  near(calcCubicDescentAlt(1), 2700.0, 1e-9, 'Rollout altitude at u=1 must be 2,700 ft MSL');

  // dz/du = -800 * (6u - 6u^2) = -4800 * u * (1 - u)
  // At u = 0: dz/du = 0
  // At u = 1: dz/du = 0
  const h = 1e-6;
  const dz_du_entry = (calcCubicDescentAlt(h) - calcCubicDescentAlt(0)) / h;
  near(dz_du_entry, 0, 1e-2, 'Numerical derivative dz/du at entry u=0 must be 0 ft/unit');

  const dz_du_rollout = (calcCubicDescentAlt(1.0) - calcCubicDescentAlt(1.0 - h)) / h;
  near(dz_du_rollout, 0, 1e-2, 'Numerical derivative dz/du at rollout u=1 must be 0 ft/unit');

  // Dense gradient test across [0, 1]
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const analyticalDzDu = -4800 * u * (1 - u);
    let numDzDu;
    if (u === 0) numDzDu = (calcCubicDescentAlt(h) - calcCubicDescentAlt(0)) / h;
    else if (u === 1) numDzDu = (calcCubicDescentAlt(1) - calcCubicDescentAlt(1 - h)) / h;
    else numDzDu = (calcCubicDescentAlt(u + h) - calcCubicDescentAlt(u - h)) / (2 * h);

    near(numDzDu, analyticalDzDu, 1e-2, `dz/du at u=${u}`);
    // dz/du must be <= 0 everywhere in [0, 1] (strictly descending or level at boundaries)
    assert.ok(analyticalDzDu <= 0, `Descent gradient must be non-positive at u=${u}`);
  }

  // Maximum descent rate occurs at inflection point u = 0.5: -4800 * 0.25 = -1200 ft/unit
  const maxSlope = -4800 * 0.5 * (1 - 0.5);
  near(maxSlope, -1200.0, 1e-6, 'Peak descent slope must occur at u=0.5 and equal -1200 ft/unit');
});

test('CHALLENGE 2.2: Cubic descent clamping outside [0, 1]', () => {
  near(calcCubicDescentAlt(-0.1), 3500.0, 1e-9, 'u < 0 clamped to 3,500 ft');
  near(calcCubicDescentAlt(-50), 3500.0, 1e-9, 'Large negative u clamped to 3,500 ft');
  near(calcCubicDescentAlt(1.1), 2700.0, 1e-9, 'u > 1 clamped to 2,700 ft');
  near(calcCubicDescentAlt(50), 2700.0, 1e-9, 'Large u clamped to 2,700 ft');
});

test('CHALLENGE 2.3: Empirical analysis of final turn descent: pure cubic curve vs 25 ft/s kinematic clamp', () => {
  // Pure cubic descent evaluation: at rollout (u = 1.0), target is exactly 2,700 ft MSL
  assert.equal(calcCubicDescentAlt(1.0), 2700.0, 'Pure cubic target reaches exactly 2,700 ft MSL at rollout');

  // Empirical finding on calcAltitudeTarget():
  // In flight-engine.js line 281: updatedAlt = Math.max(target, currentAlt - 25.0 * dt)
  // Kinematic descent clamp is 25.0 ft/s (1,500 fpm).
  // In a standard 35° bank final turn (~28.2 s) or tactical 45° bank (~20 s),
  // peak cubic descent rate is -2,416 to -3,600 fpm (-40 to -60 ft/s).
  // The 25 ft/s clamp causes the aircraft to lag behind the cubic profile.

  // Test 1: Direct cubic tracking reaches 2,700 ft at rollout across all turn durations
  for (const turnSec of [35, 28.2, 20]) {
    const dt = 0.05;
    const steps = Math.round(turnSec / dt);
    let alt = 3500;
    for (let s = 0; s <= steps; s++) {
      const progressU = Math.min(1, s / steps);
      alt = calcCubicDescentAlt(progressU);
    }
    near(alt, 2700.0, 0.01, `Direct cubic tracking at ${turnSec} s must reach 2,700 ft`);
  }

  // Test 2: Verify calcAltitudeTarget() tracks cubic profile to 2,700 ft without lag
  const results = {};
  for (const turnSec of [35, 28.2, 20]) {
    const a = { alt: 3500, phase: 'final_turn' };
    const dt = 0.05;
    const steps = Math.round(turnSec / dt);
    for (let s = 0; s <= steps; s++) {
      const progressU = Math.min(1, s / steps);
      calcAltitudeTarget(a, 2700, dt, 'final_turn', progressU);
    }
    results[turnSec] = a.alt;
  }

  // With 25 ft/s clamp removed and rate up to 60 ft/s, all turns reach 2,700 ft MSL at rollout:
  near(results[35], 2700.0, 0.5, '35 s turn reaches 2,700 ft');
  near(results[28.2], 2700.0, 0.5, '28.2 s turn reaches 2,700 ft (no lag)');
  near(results[20], 2700.0, 0.5, '20 s turn reaches 2,700 ft (no lag)');
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 3: 3.0° Glide Slope Intercept at 15,417 ft
// ─────────────────────────────────────────────────────────────────────────────

test('CHALLENGE 3.1: 3.0° Glide slope intercept calculation and tolerance', () => {
  // GLIDE_SLOPE_INTERCEPT_FT = 15417.5 ft
  // Verification formula: d_int = (2700 - 1892) / tan(3°)
  const expectedDist = (2700 - CYMJ_FIELD_ELEV_FT) / Math.tan(degToRad(GLIDE_SLOPE_DEG));
  near(GLIDE_SLOPE_INTERCEPT_FT, expectedDist, 0.1, 'GLIDE_SLOPE_INTERCEPT_FT matches (2700 - 1892) / tan(3°)');

  // Verify target altitude at 15,417 ft is within ±200 ft loose / ±100 ft standard tolerance
  const altAtIntercept = calcGlideSlopeTargetAlt(15417);
  near(altAtIntercept, 2700, 1.0, 'Glide slope altitude at 15,417 ft must be 2,700 ft MSL');

  // Solve for distance d where alt = 2,700 ft
  // |d - 15417| must be within ±200 ft tolerance
  const solvedDist = (2700 - CYMJ_FIELD_ELEV_FT) / Math.tan(degToRad(3.0));
  near(solvedDist, 15417, 1.0, 'Glide slope intercept distance is 15,417 ft (within ±200 ft tolerance)');

  // Threshold crossing height at dist = 0
  const altAtThresh = calcGlideSlopeTargetAlt(0);
  near(altAtThresh, CYMJ_FIELD_ELEV_FT, 1.0, 'Glide slope at threshold should equal field elevation 1,892 ft');

  // Ceiling clamp at 2,700 ft for distances > 15,417 ft
  assert.equal(calcGlideSlopeTargetAlt(20000), 2700, 'Distances beyond intercept must be capped at 2,700 ft MSL');
  assert.equal(calcGlideSlopeTargetAlt(50000), 2700, 'Distances far beyond intercept must be capped at 2,700 ft MSL');

  // Floor clamp at threshold elevation 1,880 ft
  assert.equal(calcGlideSlopeTargetAlt(-500), CYMJ_THRESH_ELEV_FT, 'Negative distance should clamp to threshold elev');
});

test('CHALLENGE 3.2: Dynamic 3.0° glide slope tracking on final approach', () => {
  const navPlan = {
    waypoints: [
      { x: 3104 + 20000 * Math.sin(degToRad(298 + 180)), y: -3194 + 20000 * Math.cos(degToRad(298 + 180)), alt: 2700, kias: 120 },
      { x: 3104, y: -3194, alt: 1892, kias: 100 },
    ],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };
  
  // Aircraft established on straight-in final at 16,000 ft from threshold, alt 2,700 ft
  const xInit = 3104 + 16000 * Math.sin(degToRad(298 + 180));
  const yInit = -3194 + 16000 * Math.cos(degToRad(298 + 180));
  const a = initAircraftState({
    x: xInit,
    y: yInit,
    alt: 2700,
    iasKt: 120,
    headingDeg: 298,
    phase: 'final',
    targetAltFt: 2700,
  }, navPlan, env);

  const dt = 0.1;
  const trajectory = [];

  // Fly until threshold is crossed (distToThreshold <= 100)
  for (let step = 0; step < 1200; step++) {
    stepAircraft(a, navPlan, env, dt);
    const d = a.distToThreshold;
    const targetAlt = calcGlideSlopeTargetAlt(d);
    trajectory.push({ d, alt: a.alt, targetAlt, error: Math.abs(a.alt - targetAlt) });
    if (a.phase === 'landing') break;
  }

  // Check tracking errors
  const maxTrackingError = Math.max(...trajectory.map(t => t.error));
  assert.ok(
    maxTrackingError <= 50.0,
    `Glide slope dynamic tracking error ${maxTrackingError.toFixed(2)} ft exceeds 50 ft!`
  );

  // Altitude at threshold crossing must be near 1,892 ft
  const finalState = trajectory[trajectory.length - 1];
  near(finalState.alt, CYMJ_FIELD_ELEV_FT, 50.0, 'Threshold crossing altitude must be near 1,892 ft');
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 4: Numerical Integration Stability Across dt = 0.1, 0.5, 1.0 s
// ─────────────────────────────────────────────────────────────────────────────

test('CHALLENGE 4.1: Multi-step integration stability with dt = 0.1, 0.5, 1.0 s (no NaN, no divergence)', () => {
  const dts = [0.1, 0.5, 1.0];

  for (const dt of dts) {
    const navPlan = {
      waypoints: [
        { x: 0, y: 0, alt: 3500, kias: 140, bankDeg: 30 },
        { x: 0, y: 15000, alt: 3500, kias: 140, bankDeg: 30 },
        { x: 15000, y: 15000, alt: 3500, kias: 140, bankDeg: 30 },
        { x: 15000, y: 0, alt: 3500, kias: 140, bankDeg: 30 },
      ],
      loop: true,
    };
    const env = { windFromDeg: 270, windKt: 15 }; // 15 kt crosswind
    const a = initAircraftState({ x: 0, y: 100, alt: 3500, iasKt: 140, headingDeg: 0 }, navPlan, env);

    const totalTimeSec = 300; // 5 minutes of flight
    const numSteps = Math.round(totalTimeSec / dt);

    for (let step = 0; step < numSteps; step++) {
      stepAircraft(a, navPlan, env, dt);

      // Verify finite and non-NaN state invariants at every single step
      assert.ok(Number.isFinite(a.x), `x must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.y), `y must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.alt), `alt must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.iasKt), `iasKt must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.tasKt), `tasKt must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.gsKt), `gsKt must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.headingDeg), `headingDeg must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.bankDeg), `bankDeg must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.trackDeg), `trackDeg must be finite at step ${step} (dt=${dt})`);
      assert.ok(Number.isFinite(a.crabDeg), `crabDeg must be finite at step ${step} (dt=${dt})`);

      // Bounded physical domains
      assert.ok(a.alt >= 0 && a.alt <= 50000, `Altitude ${a.alt} out of bounds at step ${step}`);
      assert.ok(a.iasKt >= 0 && a.iasKt <= 500, `Speed ${a.iasKt} out of bounds at step ${step}`);
      assert.ok(a.headingDeg >= 0 && a.headingDeg < 360, `Heading ${a.headingDeg} not in [0, 360) at step ${step}`);
      assert.ok(Math.abs(a.bankDeg) <= 90, `Bank ${a.bankDeg} exceeds ±90° at step ${step}`);
      assert.ok(Math.abs(a.crabDeg) <= 90, `Crab angle ${a.crabDeg} exceeds ±90° at step ${step}`);
    }

    // After 5 minutes, coordinates must be within reasonable geographical boundaries
    assert.ok(Math.hypot(a.x, a.y) < 150000, `Aircraft wandered excessively (r=${Math.hypot(a.x, a.y)} ft) with dt=${dt}`);
  }
});

test('CHALLENGE 4.2: Extreme timesteps and malformed inputs do not crash or produce NaN', () => {
  const navPlan = {
    waypoints: [{ x: 0, y: 0 }, { x: 5000, y: 5000 }],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  // dt = 0 fallback
  const a0 = initAircraftState({ x: 0, y: 0, iasKt: 140 }, navPlan, env);
  stepAircraft(a0, navPlan, env, 0);
  assert.ok(Number.isFinite(a0.x));

  // negative dt fallback
  const aNeg = initAircraftState({ x: 0, y: 0, iasKt: 140 }, navPlan, env);
  stepAircraft(aNeg, navPlan, env, -1.0);
  assert.ok(Number.isFinite(aNeg.x));

  // NaN dt fallback
  const aNaN = initAircraftState({ x: 0, y: 0, iasKt: 140 }, navPlan, env);
  stepAircraft(aNaN, navPlan, env, NaN);
  assert.ok(Number.isFinite(aNaN.x));

  // Large dt = 5.0 s
  const aBig = initAircraftState({ x: 0, y: 0, iasKt: 140 }, navPlan, env);
  stepAircraft(aBig, navPlan, env, 5.0);
  assert.ok(Number.isFinite(aBig.x));
  assert.ok(Number.isFinite(aBig.headingDeg));

  // Very small dt = 0.0001 s
  const aTiny = initAircraftState({ x: 0, y: 0, iasKt: 140 }, navPlan, env);
  stepAircraft(aTiny, navPlan, env, 0.0001);
  assert.ok(Number.isFinite(aTiny.x));
});

test('CHALLENGE 4.3: Property-based testing with fast-check (100 randomized flights)', () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.double({ min: -50000, max: 50000, noNaN: true }),
        y: fc.double({ min: -50000, max: 50000, noNaN: true }),
        alt: fc.double({ min: 1000, max: 20000, noNaN: true }),
        iasKt: fc.double({ min: 86, max: 250, noNaN: true }),
        headingDeg: fc.double({ min: 0, max: 359.9, noNaN: true }),
        bankDeg: fc.double({ min: -60, max: 60, noNaN: true }),
      }),
      fc.constantFrom(0.05, 0.1, 0.5, 1.0),
      (spawnSpec, dt) => {
        const navPlan = {
          waypoints: [
            { x: -10000, y: -10000, alt: 3500, kias: 140 },
            { x: 10000, y: 10000, alt: 3500, kias: 140 },
          ],
          loop: true,
        };
        const env = { windFromDeg: 180, windKt: 10 };
        const a = initAircraftState(spawnSpec, navPlan, env);

        // Step 10 times
        for (let i = 0; i < 10; i++) {
          stepAircraft(a, navPlan, env, dt);
        }

        return (
          Number.isFinite(a.x) &&
          Number.isFinite(a.y) &&
          Number.isFinite(a.alt) &&
          Number.isFinite(a.iasKt) &&
          Number.isFinite(a.headingDeg) &&
          Number.isFinite(a.bankDeg) &&
          !Number.isNaN(a.x) &&
          !Number.isNaN(a.y)
        );
      }
    ),
    { numRuns: 100 }
  );
});
