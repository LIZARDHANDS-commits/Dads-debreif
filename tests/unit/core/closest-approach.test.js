// Checks: closest approach on simple tracks (head-on, crossing miss, opening), the danger test holding until the range opens, the dodge side.
// Serves: ALL-27.
// Expected values: straight-line geometry worked out in the test; the 1e-9 closeness is arithmetic, not a flying margin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closestApproach, dangerGate, clearanceSide } from '../../../src/core/closest-approach.js';

test('two jets head-on 3,000 ft apart closing at 600 ft/s meet in 5 s with no miss; flying apart they are not closing', () => {
  const a = { x: 0, y: 0, z: 0, vx: 300, vy: 0, vz: 0 };
  const b = { x: 3000, y: 0, z: 0, vx: -300, vy: 0, vz: 0 };
  const c = closestApproach(a, b);
  assert.equal(c.closing, true);
  assert.ok(Math.abs(c.tcpaSec - 5) < 1e-9 && c.missFt < 1e-9 && Math.abs(c.rangeFt - 3000) < 1e-9);
  const apart = closestApproach(a, { ...b, vx: 400 });
  assert.equal(apart.closing, false);
  assert.ok(Math.abs(apart.missFt - 3000) < 1e-9, 'not closing: the miss is the range now');
});

test('a track offset 200 ft above passes 200 ft clear', () => {
  const c = closestApproach({ x: 0, y: 0, z: 0, vx: 300, vy: 0, vz: 0 }, { x: 3000, y: 0, z: 200, vx: -300, vy: 0, vz: 0 });
  assert.ok(Math.abs(c.missFt - 200) < 1e-9);
});

test('the danger test comes on for a close miss soon, and once on it holds until the range opens past the release range', () => {
  const limits = { soonSec: 3.5, missFt: 120, nearFt: 600, releaseFt: 800 };
  assert.equal(dangerGate(false, { closing: true, tcpaSec: 2, missFt: 50, rangeFt: 1200 }, limits), true);
  assert.equal(dangerGate(false, { closing: true, tcpaSec: 2, missFt: 500, rangeFt: 1200 }, limits), false, 'a wide miss is no danger');
  assert.equal(dangerGate(true, { closing: false, tcpaSec: 0, missFt: 700, rangeFt: 700 }, limits), true, 'held while still inside the release range');
  assert.equal(dangerGate(true, { closing: false, tcpaSec: 0, missFt: 900, rangeFt: 900 }, limits), false, 'released once the range opens');
});

test('the dodge goes to the side the jet is already on, and the tie-break decides when level', () => {
  assert.equal(clearanceSide(50, -1), 1);
  assert.equal(clearanceSide(-50, 1), -1);
  assert.equal(clearanceSide(0, -1), -1);
  assert.equal(clearanceSide(0.5, 1), 1);
});
