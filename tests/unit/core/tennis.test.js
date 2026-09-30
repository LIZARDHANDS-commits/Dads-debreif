// The tennis ball on simple flights: what Patrick decided on 2026-09-30
// (Q33 to Q37, tasks/flight-math/tennis-ball.md), against known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../../src/core/units.js';
import { turnRateRadPerSec } from '../../../src/core/flight-math.js';
import { tennisBall } from '../../../src/core/tennis.js';

const V6_DEFAULTS = { ballKt: 350, coneDeg: 6, tofSec: 3, gravity: true, hitRadiusFt: 250 };
const v = ktToFtps(200);

/**
 * Shooter at 200 kt heading east at 5,000 ft; target `ahead` feet in front and
 * `above` feet higher, flying `targetAt` (default: straight on at 200 kt).
 */
function shot({ ahead = 1500, above = 0, pitchDeg = 0, climbFps = 0, targetAt, ...settings } = {}) {
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 200 };
  const target = { x: ahead, y: 0, altFt: 5000 + above };
  targetAt ??= t => ({ x: ahead + v * t, y: 0, altFt: 5000 + above });
  const r = tennisBall({ ...V6_DEFAULTS, ...settings, shooter, target, targetAt, shooterHdg: 0, shooterClimbFps: climbFps, pitchDeg });
  return `${r.status} ${Math.round(r.best.dist)} ft`;
}

test('level and straight, 1,500 ft behind: INTERCEPT', () => {
  assert.equal(shot(), 'INTERCEPT 105 ft');
});

test('nose up tilts the ball\'s own speed', () => {
  assert.equal(shot({ pitchDeg: 10 }), 'INTERCEPT 158 ft');
  assert.equal(shot({ pitchDeg: 20 }), 'IN CONE 419 ft');
});

test('the target flies its recorded path, climb included (Q34, Q37)', () => {
  // A 4 G left turn: V6 flew the target straight on and said INTERCEPT at 105 ft.
  const w = turnRateRadPerSec(v, 4), R = v / w;
  assert.equal(shot({ targetAt: t => ({ x: 1500 + R * Math.sin(w * t), y: R - R * Math.cos(w * t), altFt: 5000 }) }), 'IN CONE 321 ft');
  // Climbing at 6,000 ft/min: V6 held its altitude.
  assert.equal(shot({ targetAt: t => ({ x: 1500 + v * t, y: 0, altFt: 5000 + 100 * t }) }), 'IN CONE 343 ft');
});

test('the ball carries the shooter\'s climb (Q33)', () => {
  // Target 300 ft higher; the shooter climbing 4,000 ft/min.
  assert.equal(shot({ above: 300 }), 'IN CONE 401 ft');
  assert.equal(shot({ above: 300, climbFps: 4000 / 60 }), 'INTERCEPT 235 ft');
});

test('INTERCEPT needs the target in the cone, ±3° for a width of 6 (Q35, Q36)', () => {
  const still = { x: 1000, y: 150, altFt: 5000 }; // 8.5° off the nose
  const off = settings => tennisBall({ ...V6_DEFAULTS, gravity: false, ...settings, shooter: { x: 0, y: 0, altFt: 5000, spdKt: 200 }, target: still, targetAt: () => null, shooterHdg: 0, pitchDeg: 0 });
  assert.ok(off({}).best.dist <= 250, 'the ball passes within the hit radius');
  assert.equal(off({}).status, 'OUT OF CONE');
  assert.equal(off({ coneDeg: 17.2 }).status, 'INTERCEPT', 'inside ±8.6°');
  const edge = deg => tennisBall({ ...V6_DEFAULTS, shooter: { x: 0, y: 0, altFt: 5000, spdKt: 200 }, target: { x: 50000 * Math.cos(deg * Math.PI / 180), y: 50000 * Math.sin(deg * Math.PI / 180), altFt: 5000 }, targetAt: () => null, shooterHdg: 0, pitchDeg: 0 }).status;
  assert.equal(edge(2.9), 'IN CONE');
  assert.equal(edge(-2.9), 'IN CONE');
  assert.equal(edge(3.1), 'OUT OF CONE');
});

test('V6\'s floors stay: at least 0.25 s of flight and a 10 ft hit radius', () => {
  const r = tennisBall({ ...V6_DEFAULTS, tofSec: 0, hitRadiusFt: 0, shooter: { x: 0, y: 0 }, target: { x: 0, y: 0 }, targetAt: () => null, shooterHdg: 0, pitchDeg: 0 });
  assert.equal(r.tofSec, 0.25);
  assert.equal(r.hitRadiusFt, 10);
  assert.equal(r.points.length, 9, 'at least 8 steps');
});
