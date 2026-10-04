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

// The point-mass step (SPEC-core, "API, fifth PR"; the motion is SPEC-turn-fight's
// "The model (T-6A, point mass)"). Known answers: a level turn is core's turn
// radius and rate; a steady climbing turn is g√(n² − cos²γ) / (V cos γ); with
// thrust equal to drag, energy height stays constant, straight up and over the top.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepPointMass, pointMassState, pointMassFlight } from '../../../src/core/point-mass.js';
import { turnRadiusFt, turnRateRadPerSec } from '../../../src/core/flight-math.js';
import { energyHeightFt } from '../../../src/core/t6-performance.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../../src/core/units.js';

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} ± ${tol}`);
const fly = (s, control, seconds, excessFn, dt = 0.02) => {
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) s = stepPointMass(s, typeof control === 'function' ? control(s) : control, dt, excessFn);
  return s;
};

test('the state round-trips: speed, altitude, heading and climb angle', () => {
  const s = pointMassState({ x: 10, y: -20, altFt: 3500, ktas: 220, headingRad: 1, climbRad: 0.3 });
  const f = pointMassFlight(s);
  near(f.ktas, 220, 1e-9, 'ktas'); near(f.altFt, 3500, 0, 'alt'); near(f.headingRad, 1, 1e-12, 'heading'); near(f.climbRad, 0.3, 1e-12, 'climb');
  assert.equal(s.x, 10); assert.equal(s.y, -20);
});

test('a level turn: core\'s radius and rate, speed and height held, right bank turns right', () => {
  const n = 3, bank = Math.acos(1 / n), ktas = 220, v = ktas * KT_TO_FTPS;
  let s = pointMassState({ x: 0, y: 0, altFt: 5000, ktas, headingRad: 0, climbRad: 0 });
  s = fly(s, { g: n, bankRad: bank }, 5);
  const f = pointMassFlight(s);
  near(f.altFt, 5000, 0.01, 'height held');
  near(f.ktas, ktas, 1e-6, 'speed held');
  near(f.headingRad, -turnRateRadPerSec(v, n) * 5, 1e-6, 'heading: clockwise, at core\'s rate');
  // The centre of a right turn heading east is to the south, one radius away.
  const r = turnRadiusFt(v, n);
  near(Math.hypot(s.x, s.y + r), r, 0.01, 'on the circle of core\'s radius');
  const left = fly(pointMassState({ x: 0, y: 0, altFt: 5000, ktas, headingRad: 0, climbRad: 0 }), { g: n, bankRad: -bank }, 1);
  assert.ok(pointMassFlight(left).headingRad > 0, 'left bank turns left');
});

test('a steady climbing turn: g√(n² − cos²γ) / (V cos γ), 22.4°/s at 30°, 220 KTAS, 4 G', () => {
  const n = 4, gamma = Math.PI / 6, ktas = 220, v = ktas * KT_TO_FTPS;
  const bank = Math.acos(Math.cos(gamma) / n); // n cos μ = cos γ keeps γ steady
  const expected = G_FTPS2 * Math.sqrt(n * n - Math.cos(gamma) ** 2) / (v * Math.cos(gamma));
  near(expected * 180 / Math.PI, 22.4, 0.05, 'the spec\'s number');
  // Thrust minus drag equal to sin γ holds the speed on the climb.
  const s = fly(pointMassState({ x: 0, y: 0, altFt: 5000, ktas, headingRad: 0, climbRad: gamma }), { g: n, bankRad: bank }, 2, () => Math.sin(gamma));
  const f = pointMassFlight(s);
  near(f.climbRad, gamma, 1e-6, 'climb angle held');
  near(f.ktas, ktas, 1e-6, 'speed held');
  near(-f.headingRad / 2, expected, 1e-6, 'turn rate');
});

test('excess thrust changes the speed at g × (T − D)/W', () => {
  const s = fly(pointMassState({ x: 0, y: 0, altFt: 5000, ktas: 150, headingRad: 0, climbRad: 0 }), { g: 1, bankRad: 0 }, 3, () => 0.1);
  near(pointMassFlight(s).ktas, 150 + G_FTPS2 * 0.1 * 3 / KT_TO_FTPS, 1e-6, 'speed');
  near(pointMassFlight(s).altFt, 5000, 1e-6, 'height');
  // The callback gets true airspeed, altitude and G.
  const seen = [];
  stepPointMass(pointMassState({ x: 0, y: 0, altFt: 7000, ktas: 180, headingRad: 0, climbRad: 0 }), { g: 2, bankRad: 1 }, 0.02, (ktas, altFt, g) => { seen.push([ktas, altFt, g]); return 0; });
  near(seen[0][0], 180, 1e-9, 'ktas'); assert.equal(seen[0][1], 7000); assert.equal(seen[0][2], 2);
});

test('a loop with thrust equal to drag: straight up, over the top and round, energy height held', () => {
  const start = pointMassState({ x: 0, y: 0, altFt: 10000, ktas: 300, headingRad: 0, climbRad: 0 });
  const e0 = energyHeightFt(10000, 300);
  let s = start, maxUp = 0, sawInverted = false, worst = 0;
  for (let i = 0; i < 1500; i++) {
    s = stepPointMass(s, { g: 4, bankRad: 0 }, 0.02);
    const f = pointMassFlight(s);
    assert.ok(Number.isFinite(f.ktas) && Number.isFinite(f.altFt), 'no NaN');
    maxUp = Math.max(maxUp, s.vz / Math.hypot(s.vx, s.vy, s.vz));
    if (s.vx < 0 && s.up.z < 0) sawInverted = true;
    worst = Math.max(worst, Math.abs(energyHeightFt(f.altFt, f.ktas) - e0));
  }
  assert.ok(maxUp > 0.9999, 'went straight up');
  assert.ok(sawInverted, 'came over the top upside down, heading back');
  assert.ok(worst < 0.5, `energy height held within 0.5 ft (worst ${worst})`);
  assert.equal(s.vy, 0, 'stayed in the vertical plane');
});

test('a split S: roll inverted and pull straight down and through, energy height held', () => {
  let s = pointMassState({ x: 0, y: 0, altFt: 15000, ktas: 160, headingRad: 0, climbRad: 0 });
  const e0 = energyHeightFt(15000, 160);
  let minDown = 0;
  s = fly(s, (st) => { minDown = Math.min(minDown, st.vz / Math.hypot(st.vx, st.vy, st.vz)); return { g: 3, bankRad: Math.PI }; }, 12);
  const f = pointMassFlight(s);
  assert.ok(minDown < -0.9999, 'went straight down');
  near(Math.abs(Math.abs(f.headingRad) - Math.PI), 0, 0.05, 'heading reversed');
  near(energyHeightFt(f.altFt, f.ktas), e0, 0.5, 'energy height');
});

test('starting straight up: the heading it started with says which way is back over the top', () => {
  const s = pointMassState({ x: 0, y: 0, altFt: 10000, ktas: 200, headingRad: 0, climbRad: Math.PI / 2 });
  assert.deepEqual([s.up.x, s.up.z], [-1, Math.cos(Math.PI / 2)], 'up points back, to the west');
  const after = fly(s, { g: 3, bankRad: 0 }, 1);
  const f = pointMassFlight(after);
  assert.ok(Number.isFinite(f.ktas), 'no NaN');
  near(Math.abs(f.headingRad), Math.PI, 1e-9, 'pulled over towards the west');
  assert.ok(f.climbRad < Math.PI / 2 && f.climbRad > 0, 'nose coming down from vertical');
  near(after.vy, 0, 1e-9, 'in the vertical plane');
});

test('exactly straight up, with no horizontal speed at all: the last up is carried across', () => {
  const v = 200 * KT_TO_FTPS;
  const s = { x: 0, y: 0, z: 10000, vx: 0, vy: 0, vz: v, up: { x: -1, y: 0, z: 0 } };
  const f = pointMassFlight(stepPointMass(s, { g: 3, bankRad: 0 }, 0.02));
  assert.ok(Number.isFinite(f.ktas), 'no NaN');
  near(Math.abs(f.headingRad), Math.PI, 1e-9, 'pulling towards its up, the west');
});
