// The wind triangle, against known answers (SPEC-traffic, "Wind and aircraft
// types"). V6 has no wind, so there is no golden test: with the wind calm it
// must give V6's numbers exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { windTriangle } from '../../../src/core/wind.js';

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} ± ${tol}`);

test('the spec\'s final: track 290°, 110 KTAS, wind 250° at 20 kt', () => {
  const w = windTriangle(290, 110, 250, 20);
  near(w.crosswindKt, -12.86, 0.01, 'crosswind (from the left)');
  near(w.headwindKt, 15.32, 0.01, 'headwind');
  near(w.crabDeg, -6.71, 0.01, 'crab (left)');
  near(w.headingDeg, 283.29, 0.01, 'heading');
  near(w.groundSpeedKt, 93.93, 0.01, 'ground speed');
  assert.equal(w.canHoldTrack, true);
});

test('calm: no crab, and the airspeed is the ground speed, exactly', () => {
  for (const track of [0, 45, 290, 359.5]) {
    for (const from of [0, 250]) {
      assert.deepEqual(windTriangle(track, 110, from, 0),
        { crabDeg: 0, headingDeg: track, groundSpeedKt: 110, headwindKt: 0, crosswindKt: 0, canHoldTrack: true });
    }
  }
});

test('a pure headwind and a pure tailwind change only the ground speed', () => {
  const head = windTriangle(90, 120, 90, 25);
  near(head.crabDeg, 0, 1e-12, 'crab');
  near(head.groundSpeedKt, 95, 1e-12, 'ground speed');
  near(head.headwindKt, 25, 1e-12, 'headwind');
  const tail = windTriangle(90, 120, 270, 25);
  near(tail.groundSpeedKt, 145, 1e-12, 'ground speed');
  near(tail.headwindKt, -25, 1e-12, 'a tailwind is a negative headwind');
});

test('a pure crosswind: crab into the wind, and the ground speed drops a little', () => {
  // Track north, wind from the east (the right) at 20 kt, 110 KTAS.
  const right = windTriangle(0, 110, 90, 20);
  near(right.crosswindKt, 20, 1e-12, 'crosswind from the right');
  near(right.crabDeg, 10.48, 0.01, 'crab right');
  near(right.headingDeg, 10.48, 0.01, 'heading');
  near(right.groundSpeedKt, Math.sqrt(110 ** 2 - 20 ** 2), 1e-9, 'ground speed');
  // Wind from the west: crab left, and the heading wraps below 000.
  const left = windTriangle(0, 110, 270, 20);
  near(left.crabDeg, -10.48, 0.01, 'crab left');
  near(left.headingDeg, 349.52, 0.01, 'heading wraps to 349.5');
});

test('a crosswind stronger than the airspeed, or a headwind that stops it, can\'t hold the track', () => {
  const cross = windTriangle(0, 40, 90, 50);
  assert.equal(cross.canHoldTrack, false);
  assert.equal(cross.crabDeg, 90, 'nose straight into the wind');
  assert.equal(cross.headingDeg, 90);
  assert.equal(cross.groundSpeedKt, 0);
  near(cross.crosswindKt, 50, 1e-12, 'the components are still given');
  const fromLeft = windTriangle(0, 40, 270, 50);
  assert.equal(fromLeft.crabDeg, -90, 'from the left, the nose points left');
  assert.equal(fromLeft.headingDeg, 270);
  const equal = windTriangle(0, 40, 90, 40);
  assert.equal(equal.canHoldTrack, false, 'a crosswind equal to the airspeed leaves nothing to move along the track');
  assert.equal(equal.groundSpeedKt, 0);
  const head = windTriangle(0, 40, 0, 50);
  assert.equal(head.canHoldTrack, false);
  assert.equal(head.groundSpeedKt, 0);
  assert.equal(windTriangle(0, 40, 0, 40).canHoldTrack, false, 'standing still over the ground');
  assert.deepEqual(windTriangle(0, 0, 0, 0),
    { crabDeg: 0, headingDeg: 0, groundSpeedKt: 0, headwindKt: 0, crosswindKt: 0, canHoldTrack: false }, 'no airspeed, and no NaN');
});
