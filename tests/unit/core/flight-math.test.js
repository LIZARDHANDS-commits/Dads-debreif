// Checks: turn numbers: 2 G is 60 degrees of bank, 4 G about 75.5, radius and rate at 220 kt, radius grows with speed squared.
// Serves: ALL-R20, ALL-R23.
// Expected values: standard aerodynamics worked out in the test (bank = acos(1/n), radius = v squared over g tan bank); the 1.01 G floor is a design choice (D74).

// What the turn numbers mean, checked against known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../../src/core/units.js';
import { radToDeg } from '../../../src/core/angles.js';
import { MIN_TURN_G, limitG, bankDegFromG, turnRadiusFt, turnRateRadPerSec, isaDensityRatio, emPoint, closureKt, formatClosureKt, gFromTrack, rollToward, dampedClimbG, gFromBankDeg, turnRateFromBankRadPerSec, turnRadiusFromBankFt, bankDegFromTurnRate, easeRoll } from '../../../src/core/flight-math.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('a 2 G level turn is a 60° bank, a 4 G turn about 75.5°', () => {
  near(bankDegFromG(2), 60, 1e-12);
  near(bankDegFromG(4), 75.52, 0.01);
});

test('4 G at 220 knots: about 1,106 ft radius and 19.2° per second', () => {
  const v = ktToFtps(220);
  near(turnRadiusFt(v, 4), 1106, 1);
  near(radToDeg(turnRateRadPerSec(v, 4)), 19.23, 0.01);
});

test('radius grows with the square of speed; rate falls as speed rises', () => {
  const g = 3;
  near(turnRadiusFt(ktToFtps(240), g) / turnRadiusFt(ktToFtps(120), g), 4, 1e-12);
  assert.ok(turnRateRadPerSec(ktToFtps(240), g) < turnRateRadPerSec(ktToFtps(120), g));
});

test('rate times radius is the speed', () => {
  for (const [kt, g] of [[120, 1.5], [200, 4], [300, 6.5]]) {
    const v = ktToFtps(kt);
    near(turnRateRadPerSec(v, g) * turnRadiusFt(v, g), v, 1e-9);
  }
});

test('limitG keeps G at least 1.01 and at most the cap', () => {
  assert.equal(MIN_TURN_G, 1.01);
  assert.equal(limitG(0.5), 1.01);
  assert.equal(limitG(4), 4);
  assert.equal(limitG(12), 12);
  assert.equal(limitG(12, 9), 9);
  assert.ok(Number.isNaN(limitG(NaN)));
});

/** Three moments one second apart on a steady turn of rateDeg per second at kt knots. */
function steadyTurn(kt, rateDeg) {
  const v = ktToFtps(kt), w = rateDeg * Math.PI / 180, R = v / w;
  return [-1, 0, 1].map(k => ({ x: R * Math.sin(w * k), y: R - R * Math.cos(w * k) }));
}

test('emPoint shows the real turn rate (D39): the heading change per second on a steady circle, rate = speed / radius', () => {
  for (const rate of [3, 10, 19.2, -15]) {
    const [a, p, b] = steadyTurn(200, rate);
    near(emPoint(a, p, b).turnRateDeg, Math.abs(rate), 1e-9);
  }
});

test('emPoint: sea-level density ratio is 1, so IAS equals ground speed there', () => {
  near(isaDensityRatio(0), 1, 1e-15);
  const [a, p, b] = steadyTurn(200, 10);
  const m = emPoint(a, { ...p, spdKt: 200, altFt: 0 }, b);
  near(m.iasKt, 200, 1e-12);
  assert.ok(emPoint(a, { ...p, spdKt: 200, altFt: 8000 }, b).iasKt < 200);
});

test('emPoint without a recorded speed uses the distance flown over two seconds', () => {
  const m = emPoint({ x: 0, y: 0 }, { x: 337.562, y: 0 }, { x: 675.124, y: 0 });
  near(m.gsKt, 200, 1e-9);
  assert.equal(m.turnRateDeg, 0);
  assert.equal(m.altFt, 6500);
});

test('two aircraft meeting head-on at 200 knots each close at about 400 knots', () => {
  const v = ktToFtps(200);
  const kt = closureKt({ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: v, y: 0 }, { x: 10000 - v, y: 0 }, 1);
  near(kt, 400, 0.01);
  assert.ok(closureKt({ x: v, y: 0 }, { x: 10000 - v, y: 0 }, { x: 0, y: 0 }, { x: 10000, y: 0 }, 1) < 0, 'opening is negative');
  assert.equal(formatClosureKt(kt), '+400 kt');
  assert.equal(formatClosureKt(-0.4), '0 kt');
  assert.equal(closureKt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 0), null);
});

test('gFromTrack reads back the G of a steady level turn', () => {
  // Along a 4 G turn at 220 knots, heading grows at the turn rate.
  const v = ktToFtps(220), w = turnRateRadPerSec(v, 4), R = v / w, dt = 1;
  const p0 = { x: R, y: 0 }, p1 = { x: R * Math.cos(w * dt), y: R * Math.sin(w * dt) };
  const g = gFromTrack(p0, Math.PI / 2, p1, Math.PI / 2 + w * dt, dt);
  near(g, 4, 0.03); // a little under 4: the straight line between the points is shorter than the arc
  assert.equal(gFromTrack(p0, 0, { x: R + 10, y: 0 }, 0, 1), null, 'too slow to tell');
  assert.equal(gFromTrack(p0, 0, p1, 3, 1), null, 'over 9 G is noise');
  assert.equal(gFromTrack(null, 0, p1, 0, 1), null, 'a missing moment');
  assert.equal(gFromTrack(p0, 0, undefined, 0, 1), null);
});

test('rollToward smoothly rolls toward target bank angle within maxDelta', () => {
  const maxDelta = 0.1; // rad
  const step1 = rollToward(0, 0.5, maxDelta);
  near(step1.bank, 0.1, 1e-12);
  assert.equal(step1.movedRad, 0.1);

  const step2 = rollToward(0.45, 0.5, maxDelta);
  near(step2.bank, 0.5, 1e-12);
  near(step2.movedRad, 0.05, 1e-12);

  // wrapPi shortest arc
  const wrapStep = rollToward(-3.1, 3.1, maxDelta);
  assert.ok(Math.abs(wrapStep.movedRad) <= maxDelta);
});

test('dampedClimbG computes 1 G in level flight and increases with climb error', () => {
  const v = ktToFtps(140);
  const gLevel = dampedClimbG(0, 0, v, 1.0);
  near(gLevel, 1.0, 1e-12);

  const gPull = dampedClimbG(0, 0.1, v, 1.0);
  assert.ok(gPull > 1.0);
});


test('given the bank: 60° is 2 G, and radius and rate agree with the G-based functions', () => {
  near(gFromBankDeg(60), 2, 1e-12);
  near(gFromBankDeg(0), 1, 1e-12);
  const v = ktToFtps(140);
  for (const bank of [30, 45, 60]) {
    const g = gFromBankDeg(bank);
    near(turnRadiusFromBankFt(v, bank), turnRadiusFt(v, g), 1e-6);
    near(turnRateFromBankRadPerSec(v, bank), turnRateRadPerSec(v, g), 1e-12);
  }
});

test('a standard-rate turn: 3° per second at 120 KTAS takes about 18° of bank', () => {
  // Worked out: bank = tan⁻¹(3°/s × v ÷ g) = 18.24° (standard aerodynamics).
  near(radToDeg(turnRateFromBankRadPerSec(ktToFtps(120), 18.25)), 3, 0.02);
});

test('the bank a turn needs: the rate of a 60° turn at 220 kt gives 60° back, a left turn banks left', () => {
  const v = ktToFtps(220);
  const rate = turnRateFromBankRadPerSec(v, 60);
  near(bankDegFromTurnRate(v, rate), 60, 1e-9);
  near(bankDegFromTurnRate(v, -rate), -60, 1e-9);
  assert.equal(bankDegFromTurnRate(v, 0), 0);
});

test('easeRoll rolls from level to 60° smoothly and stops there without overshooting', () => {
  // Limits as the Traffic sim uses them (45°/s, 90°/s²; estimates). Generous limit: the roll is done within 4 s (about 2 s at 45°/s).
  const limits = { maxRateDps: 45, maxAccelDps2: 90 };
  const dt = 0.05;
  let s = { bankDeg: 0, rollRateDps: 0 };
  let maxBank = 0;
  for (let t = 0; t < 4; t += dt) {
    const next = easeRoll(s.bankDeg, s.rollRateDps, 60, dt, limits);
    assert.ok(Math.abs(next.rollRateDps) <= 45 + 1e-9, 'roll rate stays within its limit');
    assert.ok(Math.abs(next.rollRateDps - s.rollRateDps) <= 90 * dt + 1e-9, 'roll rate builds up, never steps');
    s = next;
    maxBank = Math.max(maxBank, s.bankDeg);
  }
  near(s.bankDeg, 60, 0.5);
  assert.ok(maxBank <= 60 + 0.5, `no overshoot past 60° (reached ${maxBank})`);
});
