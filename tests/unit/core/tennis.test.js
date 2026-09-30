// The two V6 tennis-ball solvers, side by side on simple flights, showing
// where they agree and where they don't (#19, tasks/flight-math/tennis-ball.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../../src/core/units.js';
import { turnRateRadPerSec } from '../../../src/core/flight-math.js';
import { tennisDebrief, tennis3D } from '../../../src/core/tennis.js';

const V6_DEFAULTS = { ballKt: 350, coneDeg: 6, tofSec: 3, gravity: true };
const v = ktToFtps(200);

/**
 * Shooter at 200 kt heading east at 5,000 ft; target 200 kt, `ahead` feet in
 * front and `above` feet higher, flying `targetAt`. Returns both verdicts.
 */
function bothSolvers({ ahead = 1500, above = 0, pitchDeg = 0, pitchDeg3D = pitchDeg, targetAt } = {}) {
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 200, hdg: 0 };
  const target = { x: ahead, y: 0, altFt: 5000 + above, spdKt: 200 };
  targetAt ??= t => ({ x: ahead + v * t, y: 0, altFt: 5000 + above });
  const flat = tennisDebrief({ ...V6_DEFAULTS, shooter, target, targetAt, shooterHdg: 0, pitchDeg, hitRadiusFt: 250 });
  const arc = tennis3D({ ...V6_DEFAULTS, shooter, target, targetAt, pitchDeg: pitchDeg3D, radiusFt: 250 });
  return { debrief: flat.status, debriefFt: Math.round(flat.best.dist), threeD: arc.hit ? 'INTERCEPT' : 'NO INTERCEPT', threeDFt: Math.round(arc.minDist) };
}

test('level, straight and 1,500 ft behind: both say INTERCEPT', () => {
  assert.deepEqual(bothSolvers(), { debrief: 'INTERCEPT', debriefFt: 105, threeD: 'INTERCEPT', threeDFt: 103 });
});

test('nose 10° up: the 3D arc also pitches the shooter\'s own speed, so the answers split', () => {
  assert.deepEqual(bothSolvers({ pitchDeg: 10 }), { debrief: 'INTERCEPT', debriefFt: 158, threeD: 'NO INTERCEPT', threeDFt: 308 });
});

test('nose 10° up, target 300 ft higher: in V6 the 3D arc never gets the shooter\'s pitch', () => {
  // The debrief uses the 10° estimate; the 3D view gets only the bias setting, 0.
  assert.deepEqual(bothSolvers({ above: 300, pitchDeg: 10, pitchDeg3D: 0 }), { debrief: 'INTERCEPT', debriefFt: 144, threeD: 'NO INTERCEPT', threeDFt: 400 });
});

test('target in a 4 G left turn: both follow its recorded path (Q34; V6\'s debrief flew it straight on and said INTERCEPT at 105 ft)', () => {
  const w = turnRateRadPerSec(v, 4), R = v / w;
  const targetAt = t => ({ x: 1500 + R * Math.sin(w * t), y: R - R * Math.cos(w * t), altFt: 5000 });
  assert.deepEqual(bothSolvers({ targetAt }), { debrief: 'IN CONE', debriefFt: 321, threeD: 'NO INTERCEPT', threeDFt: 320 });
});

test('the same "Cone width" setting draws the 3D cone twice as wide', () => {
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 200, hdg: 0 };
  // Debrief: IN CONE up to half the setting either side (±3° for 6°).
  const at = deg => tennisDebrief({ ...V6_DEFAULTS, shooter, target: { x: 50000 * Math.cos(deg * Math.PI / 180), y: 50000 * Math.sin(deg * Math.PI / 180), altFt: 5000, spdKt: 200 }, targetAt: () => null, shooterHdg: 0, pitchDeg: 0, hitRadiusFt: 250 }).status;
  assert.equal(at(2.9), 'IN CONE');
  assert.equal(at(3.1), 'OUT OF CONE');
  // 3D: the edges are drawn the whole setting either side (±6°).
  const [left, right] = tennis3D({ ...V6_DEFAULTS, shooter, target: { x: 50000, y: 0, altFt: 5000 }, pitchDeg: 0, radiusFt: 250 }).coneEdges;
  const edgeDeg = edge => Math.atan2(edge.at(-1).y, edge.at(-1).x) * 180 / Math.PI;
  assert.ok(Math.abs(edgeDeg(left) + 6) < 1e-9 && Math.abs(edgeDeg(right) - 6) < 1e-9);
});

test('INTERCEPT does not depend on the cone in either solver', () => {
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 200, hdg: 0 };
  const target = { x: 1000, y: 150, altFt: 5000, spdKt: 0 };
  const flat = tennisDebrief({ ...V6_DEFAULTS, gravity: false, coneDeg: 0.1, shooter, target, targetAt: () => null, shooterHdg: 0, pitchDeg: 0, hitRadiusFt: 250 });
  assert.equal(flat.status, 'INTERCEPT');
  assert.ok(flat.losAngle > 8, 'the target is well outside a ±0.05° cone');
  assert.ok(tennis3D({ ...V6_DEFAULTS, gravity: false, coneDeg: 0.1, shooter, target, pitchDeg: 0, radiusFt: 250 }).hit);
});

test('the settings floors differ: hit radius 10 ft vs 1 ft, and only the 3D cone has a floor', () => {
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 0, hdg: 0 };
  const target = { x: 0, y: 0, altFt: 5000, spdKt: 0 };
  assert.equal(tennisDebrief({ ...V6_DEFAULTS, shooter, target, targetAt: () => null, shooterHdg: 0, pitchDeg: 0, hitRadiusFt: 0 }).hitRadiusFt, 10);
  assert.equal(tennisDebrief({ ...V6_DEFAULTS, shooter, target, targetAt: () => null, shooterHdg: 0, pitchDeg: 0, hitRadiusFt: 0, tofSec: 0 }).tofSec, 0.25);
  const [left] = tennis3D({ ...V6_DEFAULTS, shooter: { ...shooter, spdKt: 200 }, target, pitchDeg: 0, radiusFt: 0, coneDeg: 0 }).coneEdges;
  assert.ok(Math.abs(Math.atan2(left.at(-1).y, left.at(-1).x) * 180 / Math.PI + 0.1) < 1e-9);
});

test('a climbing shooter\'s ball climbs with it (Q33)', () => {
  // Level nose, target 1,500 ft ahead and 300 ft higher, both 200 kt; the shooter climbing 4,000 ft/min.
  const shooter = { x: 0, y: 0, altFt: 5000, spdKt: 200, hdg: 0 };
  const target = { x: 1500, y: 0, altFt: 5300, spdKt: 200 };
  const targetAt = t => ({ x: 1500 + v * t, y: 0, altFt: 5300 });
  const shot = climb => tennisDebrief({ ...V6_DEFAULTS, shooter, target, targetAt, shooterHdg: 0, shooterClimbFps: climb, pitchDeg: 0, hitRadiusFt: 250 });
  assert.equal(shot(0).status, 'IN CONE', 'not climbing: the ball passes about 400 ft under');
  assert.equal(Math.round(shot(0).best.dist), 401);
  assert.equal(shot(4000 / 60).status, 'INTERCEPT');
  assert.equal(Math.round(shot(4000 / 60).best.dist), 235);
});
