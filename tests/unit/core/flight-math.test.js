// What the turn numbers mean, checked against known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../../src/core/units.js';
import { radToDeg } from '../../../src/core/angles.js';
import { MIN_TURN_G, limitG, bankDegFromG, turnRadiusFt, turnRateRadPerSec } from '../../../src/core/flight-math.js';

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
