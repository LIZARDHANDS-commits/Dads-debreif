// Checks: the tennis ball on simple flights: level and straight intercepts, nose-up tilt, climbing and turning targets, cone width of 3 degrees either side for 6.
// Serves: DB-R19.
// Expected values: Patrick's rulings Q33 to Q37 (30 Sep 2026) and straight-line geometry; the printed "INTERCEPT 105 ft" style strings are the code's own rounded output (register, T3).

// The tennis ball on simple flights: what Patrick decided on 2026-09-30
// (Q33 to Q37, tasks/flight-math/tennis-ball.md), against known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps, G_FTPS2 } from '../../../src/core/units.js';
import { turnRateRadPerSec } from '../../../src/core/flight-math.js';
import { tennisBall } from '../../../src/core/tennis.js';

// The settings the debrief opens with, fed in as inputs: ball 350 kt, cone 6 degrees wide (+/-3, Patrick's Q35),
// 3 s of flight, 250 ft hit radius, gravity on. They are test inputs, not expected answers.
const DEFAULT_SETTINGS = { ballKt: 350, coneDeg: 6, tofSec: 3, gravity: true, hitRadiusFt: 250 };
const v = ktToFtps(200);
const BALL_FPS = ktToFtps(350);
const STEP_SEC = 0.15; // the solver checks the path every 0.15 s or so (documented in tennis.js)

/**
 * Shooter at 200 kt heading east at 5,000 ft; target `ahead` feet in front and
 * `above` feet higher, flying `targetAt` (default: straight on at 200 kt).
 * Returns the solver's answer.
 */
function shot({ ahead = 1500, above = 0, pitchDeg = 0, climbFps = 0, targetAt, ...settings } = {}) {
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 200 };
  const target = { x: ahead, y: 0, altFt: 5000 + above };
  targetAt ??= t => ({ x: ahead + v * t, y: 0, altFt: 5000 + above });
  return tennisBall({ ...DEFAULT_SETTINGS, ...settings, shooter, target, targetAt, shooterHdg: 0, shooterClimbFps: climbFps, pitchDeg });
}

/**
 * The closest the ball comes to the target, worked out here from the rules alone (no code under test):
 * the ball carries the shooter's whole velocity, climb included, and pitch tilts only its own speed (Patrick, Q33);
 * gravity drops it by g t^2 / 2. A fine 1 ms search gives the true closest approach and the fastest the two
 * close on each other.
 */
function closestApproach({ targetAt, pitchDeg = 0, climbFps = 0, durationSec = 3 }) {
  const p = pitchDeg * Math.PI / 180;
  const ballAt = t => ({ x: (v + BALL_FPS * Math.cos(p)) * t, y: 0, altFt: 5000 + (climbFps + BALL_FPS * Math.sin(p)) * t - 0.5 * G_FTPS2 * t * t });
  const dist = t => { const b = ballAt(t), g = targetAt(t); return Math.hypot(b.x - g.x, b.y - g.y, b.altFt - g.altFt); };
  let min = Infinity, maxClosing = 0;
  for (let t = 0; t <= durationSec; t += 0.001) {
    min = Math.min(min, dist(t));
    maxClosing = Math.max(maxClosing, Math.abs(dist(t + 0.001) - dist(t)) / 0.001);
  }
  return { min, maxClosing };
}

/**
 * The solver samples the path every 0.15 s, so its miss distance is never below the true closest approach and
 * never more than half a step (0.075 s) at the fastest closing speed above it.
 */
function assertMissMatchesGeometry(result, geometry) {
  const slack = geometry.maxClosing * STEP_SEC / 2;
  assert.ok(result.best.dist >= geometry.min - 0.5, `miss ${result.best.dist.toFixed(0)} ft is closer than the geometry allows (${geometry.min.toFixed(0)} ft)`);
  assert.ok(result.best.dist <= geometry.min + slack, `miss ${result.best.dist.toFixed(0)} ft is further than the geometry allows (${geometry.min.toFixed(0)} ft + ${slack.toFixed(0)} ft)`);
}

const straight = (ahead, above = 0) => t => ({ x: ahead + v * t, y: 0, altFt: 5000 + above });

test('level and straight, 1,500 ft ahead: INTERCEPT, and the miss is the ball\'s drop where the two meet', () => {
  const r = shot();
  assert.equal(r.status, 'INTERCEPT');
  assertMissMatchesGeometry(r, closestApproach({ targetAt: straight(1500) }));
  // By hand: the ball closes at 350 kt over the target's own speed (550 - 200 kt), so they meet after 1,500 / closing
  // seconds, and the ball has dropped g t^2 / 2 by then. That is the miss, to within the 0.15 s sampling.
  const closingFps = BALL_FPS;
  const t = 1500 / closingFps;
  const drop = 0.5 * G_FTPS2 * t * t;
  assert.ok(Math.abs(r.best.dist - drop) <= closingFps * STEP_SEC / 2, `${r.best.dist.toFixed(0)} ft against a drop of ${drop.toFixed(0)} ft`);
});

test('nose up tilts the ball\'s own speed: 10 degrees still intercepts, 20 degrees sends it over the target', () => {
  const ten = shot({ pitchDeg: 10 }), twenty = shot({ pitchDeg: 20 });
  assert.equal(ten.status, 'INTERCEPT');
  assert.equal(twenty.status, 'IN CONE');
  assertMissMatchesGeometry(ten, closestApproach({ targetAt: straight(1500), pitchDeg: 10 }));
  assertMissMatchesGeometry(twenty, closestApproach({ targetAt: straight(1500), pitchDeg: 20 }));
  assert.ok(twenty.best.ball.altFt > twenty.best.target.altFt, 'the ball passes above a level target');
  assert.ok(twenty.best.dist > ten.best.dist, 'more nose up, a bigger miss against a level target');
});

test('the target flies its recorded path, climb included (Patrick, Q34 and Q37)', () => {
  // A 4 G left turn away: flown straight on the target would be an intercept; turning, it is not.
  const w = turnRateRadPerSec(v, 4), R = v / w;
  const turning = t => ({ x: 1500 + R * Math.sin(w * t), y: R - R * Math.cos(w * t), altFt: 5000 });
  const turn = shot({ targetAt: turning });
  assert.equal(turn.status, 'IN CONE');
  assertMissMatchesGeometry(turn, closestApproach({ targetAt: turning }));
  // Climbing at 6,000 ft/min (100 ft/s): the target leaves the level ball's path.
  const climbing = t => ({ x: 1500 + v * t, y: 0, altFt: 5000 + 100 * t });
  const climb = shot({ targetAt: climbing });
  assert.equal(climb.status, 'IN CONE');
  assertMissMatchesGeometry(climb, closestApproach({ targetAt: climbing }));
  assert.ok(climb.best.dist > shot().best.dist, 'a climbing target is missed by more than a level one');
});

test('the ball carries the shooter\'s climb (Patrick, Q33)', () => {
  // Target 300 ft higher; the shooter climbing 4,000 ft/min (66.7 ft/s) takes the ball up with it.
  const level = shot({ above: 300 });
  const climbingFps = 4000 / 60;
  const climbing = shot({ above: 300, climbFps: climbingFps });
  assert.equal(level.status, 'IN CONE');
  assert.equal(climbing.status, 'INTERCEPT');
  assertMissMatchesGeometry(level, closestApproach({ targetAt: straight(1500, 300) }));
  assertMissMatchesGeometry(climbing, closestApproach({ targetAt: straight(1500, 300), climbFps: climbingFps }));
});

test('INTERCEPT needs the target in the cone, ±3° for a width of 6 (Q35, Q36)', () => {
  const still = { x: 1000, y: 150, altFt: 5000 }; // 8.5° off the nose
  const off = settings => tennisBall({ ...DEFAULT_SETTINGS, gravity: false, ...settings, shooter: { x: 0, y: 0, altFt: 5000, spdKt: 200 }, target: still, targetAt: () => null, shooterHdg: 0, pitchDeg: 0 });
  assert.ok(off({}).best.dist <= 250, 'the ball passes within the hit radius');
  assert.equal(off({}).status, 'OUT OF CONE');
  assert.equal(off({ coneDeg: 17.2 }).status, 'INTERCEPT', 'inside ±8.6°');
  const edge = deg => tennisBall({ ...DEFAULT_SETTINGS, shooter: { x: 0, y: 0, altFt: 5000, spdKt: 200 }, target: { x: 50000 * Math.cos(deg * Math.PI / 180), y: 50000 * Math.sin(deg * Math.PI / 180), altFt: 5000 }, targetAt: () => null, shooterHdg: 0, pitchDeg: 0 }).status;
  assert.equal(edge(2.9), 'IN CONE');
  assert.equal(edge(-2.9), 'IN CONE');
  assert.equal(edge(3.1), 'OUT OF CONE');
});

// No manual page or ruling from Patrick sets these two floors: they are guards so a zero setting still gives a usable
// path (an estimate, kept from the original tool; Patrick's Q33 to Q37 rulings do not cover them).
test('floors guard the settings: at least 0.25 s of flight and a 10 ft hit radius', () => {
  const r = tennisBall({ ...DEFAULT_SETTINGS, tofSec: 0, hitRadiusFt: 0, shooter: { x: 0, y: 0 }, target: { x: 0, y: 0 }, targetAt: () => null, shooterHdg: 0, pitchDeg: 0 });
  assert.equal(r.tofSec, 0.25);
  assert.equal(r.hitRadiusFt, 10);
  assert.equal(r.points.length, 9, 'at least 8 steps');
});
