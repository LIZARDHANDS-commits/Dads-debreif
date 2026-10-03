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

// Comprehensive unit tests for the Unified 3D Vector Flight Engine (Milestone M1)
// Authoritative specifications: specs/SPEC-traffic.md §2, §3, §6, §9; docs/traffic-pattern-matrix.md
import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../../../src/modules/traffic/flight-engine.js';
import { KT_TO_FTPS, G_FTPS2, ktToFtps, FT_PER_NM } from '../../../src/core/units.js';
import { degToRad, radToDeg, wrapDeg180 } from '../../../src/core/angles.js';
import { windTriangle } from '../../../src/core/wind.js';
import {
  glideSinkFpm,
  excessThrustPerWeight,
  energyHeightFt,
  stallLimitG,
  iasToTasKt,
  flyZoomT6A,
} from '../../../src/core/t6-performance.js';

// Tolerance helper for float comparison within pilot domain tolerances (D369, D371)
function near(actual, expected, tol = 1e-4, msg = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${msg} | Expected ${actual} to be within ${tol} of ${expected} (diff: ${diff})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Guidance & Track Intercept (12 tests)
// ─────────────────────────────────────────────────────────────────────────────

test('1.1 calcCrossTrackError: returns 0 when aircraft is exactly on the track line', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 0, y: 10000 }; // Due North track (tau = 0)
  const aOnTrack = { x: 0, y: 5000 };
  const xtrack = calcCrossTrackError(p1, p2, aOnTrack);
  near(xtrack, 0, 1e-5, 'On track error must be 0');
});

test('1.2 calcCrossTrackError: signed convention (+ = right of track, - = left of track)', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 0, y: 10000 }; // Northbound track (000°)
  // Right of track (East: +x)
  const aRight = { x: 300, y: 5000 };
  near(calcCrossTrackError(p1, p2, aRight), 300, 1e-4, 'Right of northbound track is positive');

  // Left of track (West: -x)
  const aLeft = { x: -250, y: 5000 };
  near(calcCrossTrackError(p1, p2, aLeft), -250, 1e-4, 'Left of northbound track is negative');
});

test('1.3 calcAlongTrackDist: returns distance along segment from P1', () => {
  const p1 = { x: 1000, y: 2000 };
  const p2 = { x: 4000, y: 6000 }; // 3-4-5 triangle: segLength = 5000 ft
  const aMid = { x: 2500, y: 4000 }; // Exactly halfway
  near(calcAlongTrackDist(p1, p2, aMid), 2500, 1e-3, 'Along track should be 2500 ft');

  const aBefore = { x: 1000, y: 2000 };
  near(calcAlongTrackDist(p1, p2, aBefore), 0, 1e-3, 'Along track at P1 should be 0');
});

test('1.4 calcInterceptHeading: right of track turns left (counter-clockwise) to intercept', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 0, y: 10000 }; // Northbound (000°)
  const aRight = { x: 500, y: 2000 }; // 500 ft right of track
  const env = { windFromDeg: 360, windKt: 0 }; // calm
  const tasKt = 150;

  const interceptHdg = calcInterceptHeading(p1, p2, aRight, tasKt, env);
  // Track is 000°. Aircraft is right (+), so intercept angle is positive.
  // Desired heading should be < 360° (e.g. ~315° to ~345°), turning left
  assert.ok(interceptHdg > 300 && interceptHdg < 360, `Desired heading ${interceptHdg}° should turn left toward track`);
});

test('1.5 calcInterceptHeading: left of track turns right (clockwise) to intercept', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 0, y: 10000 }; // Northbound (000°)
  const aLeft = { x: -500, y: 2000 }; // 500 ft left of track
  const env = { windFromDeg: 360, windKt: 0 };
  const tasKt = 150;

  const interceptHdg = calcInterceptHeading(p1, p2, aLeft, tasKt, env);
  // Track is 000°. Desired heading should be > 0° and < 60° (turning right)
  assert.ok(interceptHdg > 0 && interceptHdg < 60, `Desired heading ${interceptHdg}° should turn right toward track`);
});

test('1.6 calcInterceptHeading: intercept angle capped at 45° for large cross-track errors', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 10000, y: 0 }; // Eastbound (090°)
  const aFarRight = { x: 5000, y: -10000 }; // 10,000 ft right (south) of track
  const env = { windFromDeg: 360, windKt: 0 };
  const tasKt = 140;

  const interceptHdg = calcInterceptHeading(p1, p2, aFarRight, tasKt, env, { maxInterceptDeg: 45 });
  // Track is 090°. Right of track -> turn left by at most 45° -> 045°
  near(interceptHdg, 45, 0.5, 'Large cross-track error should clamp to 45° intercept');
});

test('1.7 calcInterceptHeading: intercept angle scales smoothly to 0 as cross-track error approaches 0', () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 10000, y: 0 }; // 090°
  const env = { windFromDeg: 360, windKt: 0 };
  const tasKt = 140;

  const hdg1 = calcInterceptHeading(p1, p2, { x: 5000, y: -100 }, tasKt, env);
  const hdg2 = calcInterceptHeading(p1, p2, { x: 5000, y: -10 }, tasKt, env);
  const hdgZero = calcInterceptHeading(p1, p2, { x: 5000, y: 0 }, tasKt, env);

  // 100 ft off produces smaller correction than 500 ft, and 0 ft off produces exact track
  assert.ok(Math.abs(hdg1 - 90) > Math.abs(hdg2 - 90), 'Correction should decrease as xtrack decreases');
  near(hdgZero, 90, 1e-4, 'Zero xtrack gives exact track heading');
});

test('1.8 stepAircraft: steady-state track keeping converges cross-track error < 50 ft', () => {
  const navPlan = {
    waypoints: [
      { x: 0, y: 0, alt: 3500, kias: 140 },
      { x: 0, y: 30000, alt: 3500, kias: 140 },
    ],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };
  // Start with 150 ft initial cross-track displacement
  const aircraft = initAircraftState({ x: 150, y: 5000, alt: 3500, iasKt: 140, headingDeg: 0 }, navPlan, env);

  const dt = 0.1;
  // Fly for 60 seconds (600 steps)
  for (let s = 0; s < 600; s++) {
    stepAircraft(aircraft, navPlan, env, dt);
  }

  // Cross-track error should converge to < 50 ft (pilot domain tolerance)
  const xtrack = calcCrossTrackError(navPlan.waypoints[0], navPlan.waypoints[1], aircraft);
  assert.ok(Math.abs(xtrack) < 50, `Steady-state xtrack ${xtrack} ft must be < 50 ft`);
});

test('1.9 Waypoint capture: triggers on proximity (<= 150 ft)', () => {
  const navPlan = {
    waypoints: [
      { x: 0, y: 0, alt: 3500, kias: 140 },
      { x: 0, y: 5000, alt: 3500, kias: 140 },
      { x: 5000, y: 5000, alt: 3500, kias: 140 },
    ],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };
  const aircraft = initAircraftState({ x: 0, y: 4900, alt: 3500, iasKt: 140, headingDeg: 0, waypointIndex: 1 }, navPlan, env);

  stepAircraft(aircraft, navPlan, env, 0.1);
  // Distance to waypoint 1 was 100 ft (<= 150 ft), so it advances to waypoint index 2
  assert.equal(aircraft.waypointIndex, 2, 'Proximity capture should advance waypoint index');
});

test('1.10 Waypoint capture: triggers on along-track overshoot (s >= segLength)', () => {
  const navPlan = {
    waypoints: [
      { x: 0, y: 0, alt: 3500, kias: 140 },
      { x: 0, y: 5000, alt: 3500, kias: 140 },
      { x: 5000, y: 5000, alt: 3500, kias: 140 },
    ],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };
  // Aircraft at y = 5100 (overshot past 5000 ft by 100 ft)
  const aircraft = initAircraftState({ x: 200, y: 5100, alt: 3500, iasKt: 140, headingDeg: 0, waypointIndex: 1 }, navPlan, env);

  stepAircraft(aircraft, navPlan, env, 0.1);
  assert.equal(aircraft.waypointIndex, 2, 'Along-track overshoot should advance waypoint index');
});

test('1.11 calcLeadTurnDist: matches analytical lead turn formula R * tan(Δθ / 2)', () => {
  const tasKt = 140;
  const vAirFtps = ktToFtps(tasKt); // 236.29 ft/s
  const bankDeg = 30;
  const turnAngleDeg = 90; // 90° right turn

  // R = v^2 / (g * tan(phi))
  const expectedR = (vAirFtps * vAirFtps) / (G_FTPS2 * Math.tan(degToRad(bankDeg)));
  // leadDist = R * tan(Δθ / 2) = R * tan(45°) = R * 1.0
  const expectedLeadDist = expectedR * Math.tan(degToRad(turnAngleDeg / 2));

  const leadDist = calcLeadTurnDist(vAirFtps, bankDeg, turnAngleDeg);
  near(leadDist, expectedLeadDist, 1e-3, 'Lead turn distance must match formula');
});

test('1.12 calcLeadTurnDist: evaluates cleanly across turn angles (30°, 60°, 90°, 180°)', () => {
  const vAirFtps = ktToFtps(120);
  const bankDeg = 30;

  const lead30 = calcLeadTurnDist(vAirFtps, bankDeg, 30);
  const lead60 = calcLeadTurnDist(vAirFtps, bankDeg, 60);
  const lead90 = calcLeadTurnDist(vAirFtps, bankDeg, 90);
  const lead180 = calcLeadTurnDist(vAirFtps, bankDeg, 180);

  assert.ok(lead30 > 0 && lead60 > lead30 && lead90 > lead60 && lead180 > lead90, 'Lead dist must grow monotonically with turn angle');
  // Zero turn angle gives 0 lead distance
  assert.equal(calcLeadTurnDist(vAirFtps, bankDeg, 0), 0);
  // Negative turn angle uses absolute value
  near(calcLeadTurnDist(vAirFtps, bankDeg, -60), lead60, 1e-4);
});

test('1.13 stepAircraft lead-turn: allows lead turns up to 65% of segment length', () => {
  const navPlan = {
    waypoints: [
      { x: 0, y: 0, alt: 3500, kias: 140 },
      { x: 0, y: 3000, alt: 3500, kias: 140, bankDeg: 30 },
      { x: 3000, y: 3000, alt: 3500, kias: 140 },
    ],
    loop: false,
  };
  const env = { windFromDeg: 360, windKt: 0 };
  // Lead turn distance needed for 90° turn at 140 KIAS is ~1,733 ft.
  // With segLength = 3000 ft, old 0.45 cap limited lead to 1,350 ft (requiring y >= 1650 ft).
  // New 0.65 cap allows up to 1,950 ft, so leadDist is ~1,733 ft (requiring y >= 1267 ft).
  const a = initAircraftState({ x: 0, y: 1500, alt: 3500, iasKt: 140, headingDeg: 0, waypointIndex: 1 }, navPlan, env);
  stepAircraft(a, navPlan, env, 0.1);
  assert.equal(a.waypointIndex, 2, 'Lead turn cap at 0.65 allows earlier turn advance on short leg');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Wind Correction & Drift (8 tests)
// ─────────────────────────────────────────────────────────────────────────────

test('2.1 Wind Triangle: applies windTriangle() calculation dynamically on each step', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], loop: false }; // East (090°)
  const env = { windFromDeg: 360, windKt: 20 }; // Direct 20 kt crosswind from left (North)
  const a = initAircraftState({ x: 0, y: 0, alt: 3500, iasKt: 120, headingDeg: 90 }, navPlan, env);

  stepAircraft(a, navPlan, env, 0.1);
  // Under 20 kt crosswind from 360° on 090° track:
  // Crosswind is from left (-20 kt in compass terms), so nose must crab left (negative crabDeg)
  assert.ok(a.crabDeg !== 0, 'Crab angle must be non-zero under crosswind');
  assert.ok(a.gsKt > 0, 'Groundspeed must be computed');
});

test('2.2 Groundspeed and crab angle update dynamically when heading changes', () => {
  const env = { windFromDeg: 270, windKt: 20 }; // Wind from West
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 10000 }], loop: false };

  const a1 = initAircraftState({ x: 0, y: 0, alt: 3500, iasKt: 120, headingDeg: 90 }, navPlan, env); // Tailwind
  stepAircraft(a1, navPlan, env, 0.1);

  const a2 = initAircraftState({ x: 0, y: 0, alt: 3500, iasKt: 120, headingDeg: 270 }, navPlan, env); // Headwind
  stepAircraft(a2, navPlan, env, 0.1);

  assert.ok(a1.gsKt > a2.gsKt, `Tailwind GS (${a1.gsKt}) must exceed headwind GS (${a2.gsKt})`);
});

test('2.3 Pure headwind reduces groundspeed by exact wind speed; crab angle is 0°', () => {
  const env = { windFromDeg: 298, windKt: 25 };
  const navPlan = { waypoints: [{ x: 10000, y: 0 }, { x: 0, y: 0 }], loop: false };
  // Track 298°, flying directly into 298° wind
  const a = initAircraftState({ x: 5000, y: 0, alt: 0, iasKt: 120, headingDeg: 298, trackDeg: 298 }, navPlan, env);

  stepAircraft(a, navPlan, env, 0.1);
  // At sea level alt=0, TAS == IAS == 120 kt. GS should be 120 - 25 = 95 kt
  near(a.gsKt, 95, 0.5, 'Groundspeed should be TAS - headwind');
  near(a.crabDeg, 0, 0.1, 'Crab angle should be 0 under pure headwind');
});

test('2.4 Pure tailwind increases groundspeed by exact wind speed; crab angle is 0°', () => {
  const env = { windFromDeg: 118, windKt: 25 };
  const navPlan = { waypoints: [{ x: 10000, y: 0 }, { x: 0, y: 0 }], loop: false };
  // Track 298°, wind from 118° (reciprocal, pure tailwind)
  const a = initAircraftState({ x: 5000, y: 0, alt: 0, iasKt: 120, headingDeg: 298, trackDeg: 298 }, navPlan, env);

  stepAircraft(a, navPlan, env, 0.1);
  near(a.gsKt, 145, 0.5, 'Groundspeed should be TAS + tailwind');
  near(a.crabDeg, 0, 0.1, 'Crab angle should be 0 under pure tailwind');
});

test('2.5 Crosswind produces correct crab angle arcsin(W_perp / V_tas)', () => {
  const tasKt = 120;
  const windKt = 20;
  const wt = windTriangle(0, tasKt, 90, windKt); // North track, wind from East (direct crosswind)
  const expectedCrab = radToDeg(Math.asin(windKt / tasKt)); // asin(20/120) = 9.594°

  near(wt.crabDeg, expectedCrab, 0.05, 'Crab angle matches arcsin formula');
  near(wt.groundSpeedKt, tasKt * Math.cos(degToRad(expectedCrab)), 0.1);
});

test('2.6 Zero wind (0 kt) executes identical physics code path without branching (Invariant R5)', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 10000 }], loop: false };
  const calmEnv = { windFromDeg: 360, windKt: 0 };
  const aCalm = initAircraftState({ x: 0, y: 0, alt: 3500, iasKt: 140, headingDeg: 0 }, navPlan, calmEnv);

  stepAircraft(aCalm, navPlan, calmEnv, 0.05);

  near(aCalm.crabDeg, 0, 1e-6, 'Calm wind crab is 0');
  near(aCalm.gsKt, aCalm.tasKt, 1e-4, 'Calm wind GS equals TAS');
  assert.equal(aCalm.active, true);
});

test('2.7 Natural wind drift displaces aircraft coordinates during integration', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 10000 }], loop: false };
  const windEnv = { windFromDeg: 270, windKt: 30 }; // Strong west wind blowing East (+x)
  const a = initAircraftState({ x: 0, y: 0, alt: 3500, iasKt: 120, headingDeg: 0 }, navPlan, windEnv);

  const dt = 1.0;
  stepAircraft(a, navPlan, windEnv, dt);
  // Even with heading 0 (north), wind from west should push aircraft east (positive x)
  assert.ok(a.x > 0, `Aircraft x ${a.x} must be displaced eastward by west wind`);
});

test('2.8 Ground track aligns with desired track under crosswind when crab angle is established', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 20000 }], loop: false }; // North track 000°
  const env = { windFromDeg: 90, windKt: 20 }; // Wind from East
  // Aircraft established on crab heading
  const wt = windTriangle(0, 140, 90, 20);
  const a = initAircraftState({ x: 0, y: 5000, alt: 3500, iasKt: 140, headingDeg: wt.headingDeg }, navPlan, env);

  // Take several steps
  for (let i = 0; i < 20; i++) stepAircraft(a, navPlan, env, 0.05);

  // Ground track should stay close to desired track (000°)
  near(a.trackDeg, 0, 1.0, 'Ground track should align with 000° under established crab');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Bank Dynamics & Stall Protection (10 tests)
// ─────────────────────────────────────────────────────────────────────────────

test('3.1 Bank angle advances toward target bank using rollToward() at max 45°/s (normal)', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 10000 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, bankDeg: 0, iasKt: 140 }, navPlan);

  // Demand 60° bank turn
  a.targetBankDeg = 60;
  const dt = 0.5; // In 0.5 s at 45°/s, bank should advance by 22.5°
  calcBankTarget(a, a.headingDeg + 45, dt, 45);

  near(a.bankDeg, 22.5, 0.1, 'Bank angle should advance by exactly 22.5° in 0.5 s');
});

test('3.2 Tactical maneuver bank advances at max 90°/s', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 10000 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, bankDeg: 0, iasKt: 140 }, navPlan);

  a.targetBankDeg = 60;
  const dt = 0.5; // In 0.5 s at 90°/s, bank should advance by 45°
  calcBankTarget(a, a.headingDeg + 45, dt, 90);

  near(a.bankDeg, 45.0, 0.1, 'Tactical roll rate should advance by 45° in 0.5 s');
});

test('3.3 Turn rate follows coordinated turn physics omega = (g * tan(phi)) / v_tas', () => {
  const tasKt = 140;
  const vAirFtps = ktToFtps(tasKt);
  const bankDeg = 45;
  const expectedOmega = (G_FTPS2 * Math.tan(degToRad(bankDeg))) / vAirFtps; // rad/s
  const expectedTurnRateDps = radToDeg(expectedOmega); // ~7.80 °/s

  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, alt: 0, iasKt: tasKt, bankDeg: bankDeg, headingDeg: 0 }, navPlan);

  const dt = 1.0;
  stepAircraft(a, navPlan, { windFromDeg: 360, windKt: 0 }, dt);

  // After 1.0 second, heading should have increased by expectedTurnRateDps
  near(a.headingDeg, expectedTurnRateDps, 0.1, 'Heading change should match coordinated turn rate');
});

test('3.4 Left bank (phi < 0) produces counter-clockwise heading rate (decreasing heading)', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, alt: 0, iasKt: 140, bankDeg: -30, headingDeg: 100 }, navPlan);

  stepAircraft(a, navPlan, { windFromDeg: 360, windKt: 0 }, 1.0);
  assert.ok(a.headingDeg < 100, `Heading (${a.headingDeg}) should decrease in left turn`);
});

test('3.5 Right bank (phi > 0) produces clockwise heading rate (increasing heading)', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, alt: 0, iasKt: 140, bankDeg: 30, headingDeg: 80 }, navPlan);

  stepAircraft(a, navPlan, { windFromDeg: 360, windKt: 0 }, 1.0);
  assert.ok(a.headingDeg > 80, `Heading (${a.headingDeg}) should increase in right turn`);
});

test('3.6 Accelerated stall limit n_stall = (V / 86)^2 with V_stall = 86 KIAS (D387)', () => {
  near(stallLimitG(86), 1.0, 1e-4, '1 G stall is at 86 KIAS');
  near(stallLimitG(120), (120 / 86) ** 2, 1e-4);
  near(stallLimitG(140), (140 / 86) ** 2, 1e-4);
});

test('3.7 Bank angle capped at arccos(1 / n_stall): at 120 KIAS capped at ~59°', () => {
  const maxBank120 = calcStallBankLimit(120, 86);
  // n = (120/86)^2 = 1.94699, acos(1/n) = 59.09°
  near(maxBank120, 59.1, 0.5, 'Max bank at 120 KIAS should be ~59°');
});

test('3.8 Bank angle at 140 KIAS capped at ~68°', () => {
  const maxBank140 = calcStallBankLimit(140, 86);
  // n = (140/86)^2 = 2.6501, acos(1/n) = 67.8°
  near(maxBank140, 67.8, 0.5, 'Max bank at 140 KIAS should be ~68°');
});

test('3.9 Stall guard prevents overbanking at low speed (<= 86 KIAS caps bank to 0°)', () => {
  assert.equal(calcStallBankLimit(86, 86), 0, 'At stall speed, max bank is 0°');
  assert.equal(calcStallBankLimit(80, 86), 0, 'Below stall speed, max bank is 0°');

  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, iasKt: 80, bankDeg: 20 }, navPlan);
  a.targetBankDeg = 45;

  calcBankTarget(a, a.headingDeg + 45, 0.1, 45);
  // With iasKt = 80 <= 86, bank target is clamped to 0, so bank rolls toward 0
  assert.ok(a.bankDeg < 20, 'Bank should roll toward 0 when below stall speed');
});

test('3.10 Wings roll level (phi -> 0) upon rollout onto straight leg', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 10000 }], loop: false };
  const a = initAircraftState({ x: 0, y: 2000, bankDeg: 30, iasKt: 140, headingDeg: 0 }, navPlan);

  // Steer on track: target bank should be 0
  for (let i = 0; i < 20; i++) {
    calcBankTarget(a, 0, 0.1, 45);
  }
  near(a.bankDeg, 0, 0.5, 'Bank should roll level on straight track');
});

test('3.11 Fine-tracking bank cap is phase-dependent (±45° dynamic vs ±30° stable)', () => {
  // Stable phase (e.g. initial, downwind): deltaHdg = 40° -> proportional 40 * 1.5 = 60°, capped at 30°
  const aStable = { iasKt: 140, headingDeg: 0, phase: 'initial' };
  const bankStable = calcBankTarget(aStable, 40, 0);
  near(bankStable, 30.0, 0.1, 'Stable phase fine-tracking bank capped at 30°');

  // Dynamic phase (e.g. final_turn, break, breakout): deltaHdg = 40° -> capped at 45°
  const aDynamic = { iasKt: 140, headingDeg: 0, phase: 'final_turn' };
  const bankDynamic = calcBankTarget(aDynamic, 40, 0);
  near(bankDynamic, 45.0, 0.1, 'Dynamic phase fine-tracking bank capped at 45°');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: KIN Performance Model (10 tests)
// ─────────────────────────────────────────────────────────────────────────────

test('4.1 KIN Linear Acceleration: accelerates at +4 kt/s toward target', () => {
  const a = { iasKt: 120, model: 'KIN' };
  const newSpeed = calcSpeedTarget(a, 140, 1.0); // 1 second
  near(newSpeed, 124, 0.01, 'Should accelerate by exactly 4 kt in 1.0 s');
});

test('4.2 KIN Linear Deceleration: decelerates at -2.7 kt/s toward target', () => {
  const a = { iasKt: 220, model: 'KIN' };
  const newSpeed = calcSpeedTarget(a, 140, 1.0); // 1 second
  near(newSpeed, 217.3, 0.01, 'Should decelerate by exactly 2.7 kt in 1.0 s');
});

test('4.3 KIN Physics Climb: climbs using T-6 excess thrust (~3,142 fpm / +52.37 ft/s at 2,500 ft)', () => {
  const a = { alt: 2500, model: 'KIN' };
  const newAlt = calcAltitudeTarget(a, 3500, 1.0);
  near(newAlt, 2552.37, 0.01, 'Should climb by excess thrust rate in 1.0 s');
});

test('4.4 KIN Standard Descent: descends at up to -3,600 fpm (-60 ft/s)', () => {
  const a = { alt: 3500, model: 'KIN' };
  const newAlt = calcAltitudeTarget(a, 2700, 1.0);
  near(newAlt, 3440, 0.01, 'Should descend by 60 ft in 1.0 s');
});

test('4.5 Overhead break deceleration follows V(u) = 220 * exp(-0.452 * u)', () => {
  near(calcBreakDecelSpeed(0), 220.0, 0.1, 'Break start u=0 should be 220 KIAS');
  near(calcBreakDecelSpeed(0.5), 220 * Math.exp(-0.226), 0.5, 'Mid-turn u=0.5 should match formula (~175.5 kt)');
  near(calcBreakDecelSpeed(1.0), 140.0, 0.5, 'Break rollout u=1.0 should be 140 KIAS');
});

test('4.6 Break turn deceleration completes within ±10 kt pilot domain tolerance (D371)', () => {
  const vEntry = calcBreakDecelSpeed(0);
  const vExit = calcBreakDecelSpeed(1.0);
  near(vEntry, 220, 10, 'Entry speed tolerance ±10 kt');
  near(vExit, 140, 10, 'Exit speed tolerance ±10 kt');
});

test('4.7 Final turn cubic descent follows z(u) = 3500 - 800 * (3u^2 - 2u^3)', () => {
  near(calcCubicDescentAlt(0), 3500, 0.01, 'Entry alt should be 3,500 ft');
  near(calcCubicDescentAlt(0.5), 3100, 0.01, 'Mid-turn alt should be 3,100 ft');
  near(calcCubicDescentAlt(1.0), 2700, 0.01, 'Rollout alt should be 2,700 ft');
});

test('4.8 Cubic descent boundary condition: dz/du = 0 at entry (u = 0)', () => {
  // Numerical derivative at u = 0
  const du = 1e-5;
  const dz = calcCubicDescentAlt(du) - calcCubicDescentAlt(0);
  const rate = dz / du;
  near(rate, 0, 0.1, 'dz/du at u=0 must be 0');
});

test('4.9 Cubic descent boundary condition: dz/du = 0 at rollout (u = 1)', () => {
  const du = 1e-5;
  const dz = calcCubicDescentAlt(1.0) - calcCubicDescentAlt(1.0 - du);
  const rate = dz / du;
  near(rate, 0, 0.1, 'dz/du at u=1 must be 0');
});

test('4.10 3.0° glide slope descent intercepts at 15,417 ft (2.54 NM) from threshold', () => {
  // Field elevation 1,892 ft, intercept altitude 2,700 ft
  const targetAlt = calcGlideSlopeTargetAlt(15417.5);
  near(targetAlt, 2700, 1.0, 'Glide slope at 15,417 ft should be 2,700 ft MSL');

  // At threshold (dist = 0), target altitude should be 1,892 ft MSL
  const threshAlt = calcGlideSlopeTargetAlt(0);
  near(threshAlt, 1892, 0.5, 'At threshold, alt should be 1,892 ft MSL');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: NRG Performance Model (10 tests)
// ─────────────────────────────────────────────────────────────────────────────

test('5.1 Engine-out clean glide sink rate matches glideSinkFpm("clean", 125, alt)', () => {
  const sinkFpm3k = glideSinkFpm('clean', 125, 3000);
  assert.ok(sinkFpm3k >= 1000 && sinkFpm3k <= 1200, `Clean glide sink rate at 3,000 ft ${sinkFpm3k} fpm should be ~1089 fpm`);
  const sinkFpm16k = glideSinkFpm('clean', 125, 16000);
  assert.ok(sinkFpm16k >= 1300 && sinkFpm16k <= 1400, `Clean glide sink rate at 16,000 ft ${sinkFpm16k} fpm should match chart ~1350 fpm`);
});

test('5.2 Gear-down glide sink rate matches glideSinkFpm("gearDown", 120, alt)', () => {
  const sinkClean = glideSinkFpm('clean', 120, 3000);
  const sinkGear = glideSinkFpm('gearDown', 120, 3000);
  assert.ok(sinkGear > sinkClean, 'Gear down sink rate must exceed clean sink rate');
});

test('5.3 Flaps-landing glide sink rate matches glideSinkFpm("landing", 100, alt)', () => {
  const sinkGear = glideSinkFpm('gearDown', 100, 3000);
  const sinkLanding = glideSinkFpm('landing', 100, 3000);
  assert.ok(sinkLanding > sinkGear, 'Landing flaps sink rate must exceed gear-only sink rate');
});

test('5.4 Vfe guard: refuses gear/flaps configuration above 147 KIAS (Invariant R5)', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], loop: false };
  const a = initAircraftState({ x: 0, y: 0, alt: 3500, iasKt: 160, model: 'NRG', config: 'clean' }, navPlan);

  // Attempt to select gearDown or landing at 160 KIAS
  a.config = 'gearDown';
  stepAircraft(a, navPlan, { windFromDeg: 360, windKt: 0 }, 0.1);

  assert.equal(a.config, 'clean', 'Vfe guard must force clean config above 147 KIAS');
});

test('5.5 Powered flight excess thrust matches excessThrustPerWeight()', () => {
  const excess = excessThrustPerWeight(140, 3500, 1.0);
  assert.ok(excess > 0, `Excess thrust (${excess}) should be positive at 140 KIAS at 3,500 ft`);
});

test('5.6 Energy height calculation matches energyHeightFt(alt, tas)', () => {
  const tasKt = 150;
  const altFt = 5000;
  const he = energyHeightFt(altFt, tasKt);
  const expectedHe = altFt + ((tasKt * KT_TO_FTPS) ** 2) / (2 * G_FTPS2);
  near(he, expectedHe, 1e-2, 'Energy height must match kinetic + potential formula');
});

test('5.7 Energy gate routes high-energy PFL arrivals to tangent orbit', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 5000 }], loop: false };
  // 6,000 ft altitude close in (dist 6,000 ft) is very high energy
  const a = initAircraftState({ x: 0, y: 0, alt: 6000, iasKt: 140, model: 'NRG', phase: 'pfl_inbound' }, navPlan);

  evaluatePhaseTransitions(a, navPlan, { windFromDeg: 360, windKt: 0 }, 0.1);
  assert.equal(a.phase, 'pfl_orbit', 'High-energy arrival should route to PFL orbit');
});

test('5.8 Energy gate routes low-energy PFL arrivals directly toward threshold', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 5000 }], loop: false };
  // 2,200 ft altitude (only ~300 ft AGL) is very low energy
  const a = initAircraftState({ x: 0, y: 0, alt: 2200, iasKt: 100, model: 'NRG', phase: 'pfl_inbound' }, navPlan);

  evaluatePhaseTransitions(a, navPlan, { windFromDeg: 360, windKt: 0 }, 0.1);
  assert.equal(a.phase, 'pfl_final', 'Low-energy arrival should route directly to forced landing final');
});

test('5.9 Zoom climb profile converts excess airspeed to altitude via flyZoomT6A()', () => {
  const zoom = flyZoomT6A(200, 3000);
  assert.ok(zoom.gainFt > 400, `Zoom climb from 200 KIAS should gain > 400 ft (gained ${zoom.gainFt} ft)`);
  assert.ok(zoom.timeSec > 5, 'Zoom climb takes several seconds');
});

test('5.10 Engine-out glide speed converges toward per-config target without fake 110 KIAS floor', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 0, y: 10000 }], loop: false };
  const aClean = initAircraftState({ x: 0, y: 0, alt: 4000, iasKt: 95, model: 'NRG', engineFailed: true, config: 'clean' }, navPlan);

  stepAircraft(aClean, navPlan, { windFromDeg: 360, windKt: 0 }, 1.0);
  // Clean glide speed should accelerate toward 125 KIAS
  assert.ok(aClean.iasKt > 95, 'Clean glide speed should accelerate toward 125 KIAS');

  // Landing config: 108 KIAS should decelerate toward 100 KIAS, not floor at fake 110 KIAS
  const aLanding = initAircraftState({ x: 0, y: 0, alt: 2000, iasKt: 108, model: 'NRG', engineFailed: true, config: 'landing' }, navPlan);
  stepAircraft(aLanding, navPlan, { windFromDeg: 360, windKt: 0 }, 1.0);
  assert.ok(aLanding.iasKt < 108, 'Landing config should decelerate toward 100 KIAS (not trapped at 110 KIAS)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: Phase State Machine (10 tests)
// ─────────────────────────────────────────────────────────────────────────────

test('6.1 Full OHB sequence: initial -> break -> inner_downwind -> final_turn -> final -> landing', () => {
  const a = {
    phase: 'initial',
    x: -300, y: -1400, // passed break point
    iasKt: 220, alt: 3500, headingDeg: 298, turnAccumDeg: 0,
  };
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'break', 'Initial should transition to break at break point');

  a.turnAccumDeg = 180;
  a.headingDeg = 118;
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'inner_downwind', 'Break should transition to inner_downwind after 180° turn');

  a.distToPerch = 150; // within 200 ft of Perch
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'final_turn', 'Inner downwind should transition to final_turn at Perch');

  a.turnAccumDeg = 180;
  a.headingDeg = 298;
  a.crossTrackFt = 30; // on centerline
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'final', 'Final turn should rollout to final on centerline');

  a.distToThreshold = 50; // crossing threshold
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'landing', 'Final should transition to landing at threshold');
});

test('6.2 Threshold landing roll: deterministic intent evaluation (full_stop, touch_and_go, go_around)', () => {
  // Explicit full_stop intent
  const aStop = { phase: 'landing', distToThreshold: 0, intent: 'full_stop' };
  evaluatePhaseTransitions(aStop, null, null, 0.1);
  assert.equal(aStop.phase, 'full_stop');
  assert.equal(aStop.status, 'landed');
  assert.equal(aStop.landed, true);
  assert.equal(aStop.active, false);

  // Explicit touch_and_go intent
  const aTng = { phase: 'landing', distToThreshold: 0, intent: 'touch_and_go' };
  evaluatePhaseTransitions(aTng, null, null, 0.1);
  assert.equal(aTng.phase, 'touch_and_go');
  assert.equal(aTng.landed, false);
  assert.equal(aTng.active, true);
  assert.equal(aTng.iasKt, 140);

  // Default intent (unassigned) defaults to touch_and_go
  const aDefault = { phase: 'landing', distToThreshold: 0 };
  evaluatePhaseTransitions(aDefault, null, null, 0.1);
  assert.equal(aDefault.phase, 'touch_and_go');
  assert.equal(aDefault.landed, false);
  assert.equal(aDefault.active, true);
  assert.equal(aDefault.iasKt, 140);

  // Explicit go_around intent
  const aGoAround = { phase: 'landing', distToThreshold: 0, intent: 'go_around' };
  evaluatePhaseTransitions(aGoAround, null, null, 0.1);
  assert.equal(aGoAround.phase, 'go_around');
  assert.equal(aGoAround.landed, false);
  assert.equal(aGoAround.active, true);
  assert.equal(aGoAround.targetAltFt, 2500);
});

test('6.3 Touch-and-go rolls on runway, accelerates to 140 KIAS, climbs past departure end', () => {
  // Without contingency command: follows Fallback Doctrine (climbs along runway heading 298° toward 2,500 / 3,500 ft)
  const a = { phase: 'takeoff_climb', x: -4100, y: 700, iasKt: 140, alt: 2500 };
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'climb', 'Past departure end with no command continues outer pattern climb');

  // With contingency command: closed_pattern
  const aCmd = { phase: 'takeoff_climb', x: -4100, y: 700, iasKt: 140, alt: 2500, command: 'closed_pattern' };
  evaluatePhaseTransitions(aCmd, null, null, 0.1);
  assert.equal(aCmd.phase, 'closed_pattern', 'Past departure end with closed_pattern command triggers closed_pattern');
});

test('6.4 Closed pattern climb: 50° bank climbing turn to 3,500 ft rolls out to inner_downwind', () => {
  const a = { phase: 'closed_pattern', turnAccumDeg: 180, headingDeg: 118, alt: 3500 };
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'inner_downwind', 'Closed pattern rollout should join inner_downwind');
});

test('6.5 Straight-in recovery sequence: si_descent -> si_downwind -> si_base -> si_final', () => {
  const a = { phase: 'si_descent', alt: 2700 };
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'si_downwind', 'Reaching 2,700 ft MSL transitions to si_downwind');

  a.reachedBaseTurn = true;
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'si_base', 'Base turn point transitions to si_base');

  a.rolledOutFinal = true;
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'si_final', 'Rollout onto centerline transitions to si_final');
});

test('6.6 Straight-in maintains 120 KIAS until 0.75 NM Window (4,558 ft), then decelerates', () => {
  const aOutside = { phase: 'si_final', distToThreshold: 5000, iasKt: 120 };
  calcSpeedTarget(aOutside, 100, 0.1, 'si_final');
  // Outside 4,558 ft Window, target is 120 KIAS
  assert.equal(aOutside.iasKt, 120, 'Outside Window must maintain 120 KIAS');

  const aInside = { phase: 'si_final', distToThreshold: 4000, iasKt: 120 };
  const targetSpeed = calcSpeedTarget(aInside, 100, 0.1, 'si_final');
  assert.ok(targetSpeed < 120, 'Inside Window speed must decelerate toward 100 KIAS');
});

test('6.7 In-flight pilot command: breakout initiates climbing turn to 3,500 ft', () => {
  const a = { phase: 'inner_downwind', command: 'breakout', alt: 3500, bankDeg: 0 };
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'breakout', 'Breakout command should switch phase to breakout');
});

test('6.8 In-flight pilot command: go_around initiates runway climbout', () => {
  const a = { phase: 'final', command: 'go_around', alt: 2000 };
  evaluatePhaseTransitions(a, null, null, 0.1);
  assert.equal(a.phase, 'go_around', 'Go-around command should switch phase to go_around');
});

test('6.9 Invariant R5: Aircraft NEVER transitions to inactive/disappears outside explicit full stop', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], loop: false };
  const a = initAircraftState({ x: 500, y: 500, phase: 'inner_downwind' }, navPlan);

  for (let s = 0; s < 100; s++) {
    stepAircraft(a, navPlan, { windFromDeg: 360, windKt: 0 }, 0.1);
    assert.equal(a.active, true, `Aircraft active must remain true during flight (step ${s})`);
  }
});

test('6.10 Fallback Invariant R5: Nav plan completion defaults to continuous flight (PAT_INNER)', () => {
  const navPlan = { waypoints: [{ x: 0, y: 0 }, { x: 500, y: 500 }], loop: false };
  const a = initAircraftState({ x: 490, y: 490, waypointIndex: 1, phase: 'initial' }, navPlan);

  // Advance past end of waypoints
  stepAircraft(a, navPlan, { windFromDeg: 360, windKt: 0 }, 1.0);
  assert.equal(a.active, true, 'Aircraft must continue flying even after reaching end of nav plan');
  assert.ok(a.waypointIndex >= 0);
});
