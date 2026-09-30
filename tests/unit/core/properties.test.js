// Random-input (property) tests for the core math. They only check the math:
// nothing under src/ is changed to make them pass. Each property has a fixed
// seed so a CI run is repeatable; when one fails, fast-check prints the
// counterexample and the seed to replay it.
//
// Heading rule (src/core/README.md): radians, 0 = east, counter-clockwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { G_FTPS2, KT_TO_FTPS, ktToFtps, ftpsToKt } from '../../../src/core/units.js';
import {
  degToRad, radToDeg, wrapDeg180, wrapPi, angleDiffRad, absAngleDeg,
  compassDegToHeadingRad, headingRadToCompassDeg,
} from '../../../src/core/angles.js';
import { bankDegFromG, turnRadiusFt, turnRateRadPerSec } from '../../../src/core/flight-math.js';
import {
  T6A_LIMITS, stallLimitG, availableG, iasToTasKt, tasToIasKt, energyHeightFt,
  thrustPerWeight, dragPerWeight, excessThrustPerWeight, zoomT6A,
} from '../../../src/core/t6-performance.js';
import { stepPointMass, pointMassState, pointMassFlight } from '../../../src/core/point-mass.js';

const RUNS = 200;
const property = (seed, arb, predicate, numRuns = RUNS) =>
  fc.assert(fc.property(arb, predicate), { seed, numRuns });
const relNear = (a, b, relTol, msg = '') =>
  assert.ok(Math.abs(a - b) <= relTol * Math.max(Math.abs(a), Math.abs(b)), `${msg} ${a} is not within ${relTol} (relative) of ${b}`);
const absNear = (a, b, tol, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} is not within ${tol} of ${b}`);
// Same value up to the last few bits of rounding.
const EPS = 1e-12;

const num = (min, max) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const tasKt = num(50, 400);
const loadG = num(1.1, 9);
const altFt = num(0, 25000);
const kiasKt = num(40, 316);
// The angle wrappers loop, so keep to sizes real screens give them (README).
const angleRad = num(-1000, 1000);
const angleDeg = num(-50000, 50000);

// ---------- turn radius and rate ----------

test('turn radius rises with speed at fixed G', () => {
  property(1001, fc.tuple(tasKt, num(1, 100), loadG), ([v, dv, g]) => {
    const slow = ktToFtps(v), fast = ktToFtps(v + dv);
    assert.ok(turnRadiusFt(fast, g) > turnRadiusFt(slow, g));
  });
});

test('turn radius falls as G rises at fixed speed', () => {
  property(1002, fc.tuple(tasKt, loadG, num(0.05, 3)), ([v, g, dg]) => {
    const s = ktToFtps(v);
    assert.ok(turnRadiusFt(s, g + dg) < turnRadiusFt(s, g));
  });
});

test('turn rate is G·√(g²−1) ÷ v (the Turn Fight form)', () => {
  property(1003, fc.tuple(tasKt, loadG), ([v, g]) => {
    const s = ktToFtps(v);
    relNear(turnRateRadPerSec(s, g), G_FTPS2 * Math.sqrt(g * g - 1) / s, 1e-14);
  });
});

test('turn radius is v² ÷ (G·tan bank), with the bank from bankDegFromG', () => {
  // Two different routes to the same radius: √(g²−1) against tan(acos(1/g)).
  // acos and tan each lose a few bits (tan near 84 degrees at 9 G amplifies the
  // bank's rounding by 1/(sin·cos) of about 9), so 1e-12 is a safe bound.
  property(1004, fc.tuple(tasKt, loadG), ([v, g]) => {
    const s = ktToFtps(v);
    const bank = degToRad(bankDegFromG(g));
    relNear(turnRadiusFt(s, g), s * s / (G_FTPS2 * Math.tan(bank)), 1e-12);
  });
});

// ---------- angles ----------

// Two angles are the same direction when their sine and cosine agree.
const sameDirection = (a, b) => {
  absNear(Math.sin(a), Math.sin(b), 1e-9, 'sin');
  absNear(Math.cos(a), Math.cos(b), 1e-9, 'cos');
};

test('wrapPi stays in [-π, π], is idempotent and keeps the direction', () => {
  property(2001, angleRad, (a) => {
    const w = wrapPi(a);
    assert.ok(w >= -Math.PI && w <= Math.PI, `${w} out of range`);
    assert.equal(wrapPi(w), w);
    sameDirection(a, w);
  });
});

test('wrapDeg180 stays in [-180, 180], is idempotent and keeps the direction', () => {
  property(2002, angleDeg, (d) => {
    const w = wrapDeg180(d);
    assert.ok(w >= -180 && w <= 180, `${w} out of range`);
    assert.equal(wrapDeg180(w), w);
    sameDirection(degToRad(d), degToRad(w));
  });
});

test('angleDiffRad stays in [-π, π] and keeps the direction of a − b', () => {
  property(2003, fc.tuple(angleRad, angleRad), ([a, b]) => {
    const d = angleDiffRad(a, b);
    assert.ok(d >= -Math.PI && d <= Math.PI, `${d} out of range`);
    sameDirection(d, a - b);
  });
});

test('absAngleDeg is between 0 and 180', () => {
  property(2004, angleRad, (a) => {
    const d = absAngleDeg(a);
    assert.ok(d >= 0 && d <= 180 + 1e-9, `${d} out of range`);
  });
});

test('compass headings are in [0, 360), and compass → heading → compass round-trips', () => {
  property(2005, angleDeg, (deg) => {
    const c = headingRadToCompassDeg(degToRad(deg));
    assert.ok(c >= 0 && c < 360, `${c} out of range`);
    const back = headingRadToCompassDeg(compassDegToHeadingRad(c));
    // 359.99999… and 0 are the same compass heading.
    absNear(wrapDeg180(back - c), 0, 1e-9, 'round trip');
  });
});

test('degrees → radians → degrees round-trips', () => {
  property(2006, angleDeg, (d) => {
    absNear(radToDeg(degToRad(d)), d, 1e-9 * Math.max(1, Math.abs(d)));
  });
});

// ---------- units ----------

test('knots → ft/s → knots round-trips to V6\'s constants', () => {
  // V6 rounds the two factors separately: KT_TO_FTPS = 1.68781 but FTPS_TO_KT
  // = 0.592484, not 1/1.68781 = 0.5924838…. Their product is 1 + 4.2e-7, so the
  // round trip is exact only to that relative error (5e-7 leaves a little room).
  // Values stay away from zero: a relative test means nothing on subnormals,
  // where the product underflows to 0 (fast-check found -2e-323 at once).
  const speed = (max) => fc.oneof(num(-max, -1e-3), num(1e-3, max));
  property(3001, speed(2000), (kt) => {
    relNear(ftpsToKt(ktToFtps(kt)), kt, 5e-7);
  });
  property(3002, speed(3000), (fps) => {
    relNear(ktToFtps(ftpsToKt(fps)), fps, 5e-7);
  });
});

// ---------- V-n limit and stall line ----------

// This pins the min() in availableG (the V-n cap and the stall line), not the
// physics: it would pass for any model that caps at the same numbers.
test('availableG never passes the V-n limit and never passes the stall line', () => {
  property(4001, fc.tuple(num(0, 400), fc.boolean()), ([kias, rolling]) => {
    const g = availableG(kias, rolling);
    assert.ok(g <= (rolling ? T6A_LIMITS.rollingMaxG : T6A_LIMITS.maxG));
    assert.ok(g <= stallLimitG(kias));
    assert.ok(g >= 0);
  });
});

test('availableG does not fall as KIAS rises', () => {
  property(4002, fc.tuple(num(0, 400), num(0, 200), fc.boolean()), ([kias, dk, rolling]) => {
    assert.ok(availableG(kias + dk, rolling) >= availableG(kias, rolling));
  });
});

// ---------- airspeed, energy height, thrust and drag ----------

test('iasToTasKt and tasToIasKt undo each other', () => {
  property(5001, fc.tuple(kiasKt, altFt), ([kias, alt]) => {
    relNear(tasToIasKt(iasToTasKt(kias, alt), alt), kias, EPS);
  });
  property(5002, fc.tuple(tasKt, altFt), ([ktas, alt]) => {
    relNear(iasToTasKt(tasToIasKt(ktas, alt), alt), ktas, EPS);
  });
});

test('true airspeed is at least indicated at any height from 0 to 25,000 ft', () => {
  property(5003, fc.tuple(kiasKt, altFt), ([kias, alt]) => {
    assert.ok(iasToTasKt(kias, alt) >= kias);
  });
});

test('energy height rises with altitude and with speed', () => {
  property(5004, fc.tuple(tasKt, altFt, num(1, 5000)), ([ktas, alt, dAlt]) => {
    assert.ok(energyHeightFt(alt + dAlt, ktas) > energyHeightFt(alt, ktas));
  });
  property(5005, fc.tuple(tasKt, altFt, num(1, 100)), ([ktas, alt, dv]) => {
    assert.ok(energyHeightFt(alt, ktas + dv) > energyHeightFt(alt, ktas));
  });
});

test('drag per weight rises with G at fixed speed', () => {
  property(5006, fc.tuple(kiasKt, altFt, loadG, num(0.05, 3)), ([kias, alt, g, dg]) => {
    assert.ok(dragPerWeight(kias, alt, g + dg) > dragPerWeight(kias, alt, g));
  });
});

test('thrust per weight falls with speed at fixed altitude', () => {
  property(5007, fc.tuple(kiasKt, altFt, num(1, 100)), ([kias, alt, dk]) => {
    assert.ok(thrustPerWeight(kias + dk, alt) < thrustPerWeight(kias, alt));
  });
});

test('excess thrust per weight falls as G rises at fixed speed and altitude', () => {
  property(5008, fc.tuple(kiasKt, altFt, loadG, num(0.05, 3)), ([kias, alt, g, dg]) => {
    assert.ok(excessThrustPerWeight(kias, alt, g + dg) < excessThrustPerWeight(kias, alt, g));
  });
});

// ---------- point mass ----------

const climbRad = num(-80, 80).map(degToRad);
const headingAny = num(-Math.PI, Math.PI);
const stepSec = num(0.005, 0.05);
// Lift is square to the flight path, so it does no work and energy height is
// constant; only RK4's truncation error moves it. Over 100,000 random steps
// (50 to 400 KTAS, G up to 9, dt 0.005 to 0.05 s, climb under 80 degrees) the
// worst change measured was 1.7e-4 ft, so 1e-3 ft leaves a margin of about 6.
const ENERGY_TOL_FT = 1e-3;

const energyOf = (s) => { const f = pointMassFlight(s); return energyHeightFt(f.altFt, f.ktas); };

test('steady flight (bank 0, G = cos climb, no excess) keeps energy height', () => {
  property(6001, fc.tuple(tasKt, headingAny, climbRad, altFt, stepSec), ([ktas, hdg, climb, alt, dt]) => {
    const s0 = pointMassState({ altFt: alt, ktas, headingRad: hdg, climbRad: climb });
    const s1 = stepPointMass(s0, { g: Math.cos(climb), bankRad: 0 }, dt);
    absNear(energyOf(s1), energyOf(s0), ENERGY_TOL_FT);
  });
});

test('with no excess thrust, any bank and G keep energy height (lift does no work)', () => {
  property(6002, fc.tuple(tasKt, headingAny, climbRad, altFt, num(-Math.PI, Math.PI), num(0, 9), stepSec),
    ([ktas, hdg, climb, alt, bank, g, dt]) => {
      const s0 = pointMassState({ altFt: alt, ktas, headingRad: hdg, climbRad: climb });
      const s1 = stepPointMass(s0, { g, bankRad: bank }, dt);
      absNear(energyOf(s1), energyOf(s0), ENERGY_TOL_FT);
    });
});

test('a constant excess e (bank 0, G = cos climb) changes energy height by e·V·dt', () => {
  // Energy height changes at V·e ft/s. V itself changes over the step by up to
  // (|e| + 1)·g·dt (thrust and the path's share of gravity), so the plain form
  // e·V0·dt is off by at most |e|·(|e| + 1)·g·dt²/2 (0.016 ft at the widest
  // case here; measured worst 0.0155 ft). With V the mean of the start and end
  // speeds the form is exact up to float rounding of the energy sum (measured
  // 5e-12 ft over 100,000 random steps), so 1e-9 ft is safe.
  property(6003, fc.tuple(tasKt, headingAny, climbRad, altFt, num(-0.3, 0.3), stepSec), ([ktas, hdg, climb, alt, e, dt]) => {
    const s0 = pointMassState({ altFt: alt, ktas, headingRad: hdg, climbRad: climb });
    const s1 = stepPointMass(s0, { g: Math.cos(climb), bankRad: 0 }, dt, () => e);
    const dE = energyOf(s1) - energyOf(s0);
    const v0 = ktas * KT_TO_FTPS;
    const v1 = pointMassFlight(s1).ktas * KT_TO_FTPS;
    absNear(dE, e * v0 * dt, Math.abs(e) * (Math.abs(e) + 1) * G_FTPS2 * dt * dt / 2 + 1e-9, 'first order');
    absNear(dE, e * (v0 + v1) / 2 * dt, 1e-9, 'mean speed');
  });
});

test('a right bank turns clockwise (heading falls) and a left bank counter-clockwise', () => {
  // Level, G = 1 / cos(bank) holds the height and turns at g·tan(bank) ÷ V.
  property(6004, fc.tuple(tasKt, headingAny, altFt, num(0.05, 1.4), stepSec), ([ktas, hdg, alt, bank, dt]) => {
    const s0 = pointMassState({ altFt: alt, ktas, headingRad: hdg });
    const turned = (b) => wrapPi(pointMassFlight(stepPointMass(s0, { g: 1 / Math.cos(b), bankRad: b }, dt)).headingRad - hdg);
    assert.ok(turned(bank) < 0, `right bank ${turned(bank)}`);
    assert.ok(turned(-bank) > 0, `left bank ${turned(-bank)}`);
  });
});

// ---------- zoom ----------

// Each zoomT6A call flies about 1,000 steps, so these run few times.
const ZOOM_RUNS = 30;
const weightLb = num(4500, 7500);

test('zoom gain is never negative', () => {
  property(7001, fc.tuple(num(0, 316), altFt, weightLb), ([kias, alt, w]) => {
    assert.ok(zoomT6A(kias, alt, w).gainFt >= 0);
  }, ZOOM_RUNS);
});

test('zoom gain is 0 at or below 150 KIAS', () => {
  property(7002, fc.tuple(num(0, 150), altFt, weightLb), ([kias, alt, w]) => {
    assert.equal(zoomT6A(kias, alt, w).gainFt, 0);
  }, ZOOM_RUNS);
});

test('zoom gain does not fall as speed rises above 150 KIAS', () => {
  property(7003, fc.tuple(num(150.5, 300), num(0.5, 16), altFt, weightLb), ([kias, dk, alt, w]) => {
    assert.ok(zoomT6A(kias + dk, alt, w).gainFt >= zoomT6A(kias, alt, w).gainFt);
  }, ZOOM_RUNS);
});
