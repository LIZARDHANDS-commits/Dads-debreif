// Checks: one aircraft through a few ticks on the path follower: it moves along its route, crosswind gives crab,
//   no wind gives ground speed equal to true airspeed, landed aircraft do not move, the route's tags carry over,
//   and no shadow position is kept.
// Serves: TR-R30, TR-R6, TR-R15.
// Expected values: the wind triangle worked out in the test; positions and the 1,892 ft threshold are typed in
//   from V6 data, no source.
// The tests of the old rail and physics machine (initMode, shouldEnterPhysics, the physics step, the hand-back to
// the rail, the waypoint triggers) were retired with that machine on Patrick's card "Rebuild, then delete"
// (4 Oct 17:53Z).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tickAircraft } from '../../../src/modules/traffic/tick-aircraft.js';
import { posOnRoute, pointDistFt } from '../../../src/modules/traffic/route.js';
import { iasToTasKt } from '../../../src/core/t6-performance.js';

const MOOSE_JAW = JSON.parse(
  readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8')
);
const pat1 = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');

function near(actual, expected, tol, msg) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg || ''}: expected ${actual} to be within ${tol} of ${expected} (diff: ${Math.abs(actual - expected)})`
  );
}

test('3.1 RAIL mode advances distFt and derives coordinates from route', () => {
  const startDist = 5000;
  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: startDist,
    iasKt: 140,
    active: true,
  };
  const dt = 1.0;
  tickAircraft(a, dt, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.ok(a.distFt > startDist, 'distFt must advance');
  const expectedP = posOnRoute(pat1, a.distFt);
  near(a.x, expectedP.x, 0.1, 'a.x matches route position');
  near(a.y, expectedP.y, 0.1, 'a.y matches route position');
  near(a.alt, expectedP.alt, 0.1, 'a.alt matches route altitude');
});

test('3.2 RAIL mode calculates wind triangle and crab angle under crosswind', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: pointDistFt(pat1, 8) + 1000, // On straight initial leg (heading 298°)
    iasKt: 220,
    active: true,
  };
  const wind = { windFromDeg: 208, windKt: 20 }; // Direct crosswind (90° from 298°)
  tickAircraft(a, 0.1, wind, pat1);

  assert.ok(Math.abs(a.crabDeg) > 4, 'Crosswind should produce non-zero crab angle');
  assert.ok(a.gsKt > 0, 'Ground speed should remain positive');
  assert.equal(a.mode, 'RAIL');
});

test('6.2 Invariant 2: ZERO shadow variables exist on aircraft state', () => {
  const a = { id: 'A1', distFt: 10000, iasKt: 220, active: true };
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  // Check forbidden shadow variable names
  assert.equal(a.customX, undefined, 'customX is strictly banned');
  assert.equal(a.customY, undefined, 'customY is strictly banned');
  assert.equal(a.customAlt, undefined, 'customAlt is strictly banned');
  assert.equal(a.customHeading, undefined, 'customHeading is strictly banned');
  assert.equal(a.customKt, undefined, 'customKt is strictly banned');
  assert.equal(a.blendFrom, undefined, 'blendFrom is strictly banned');
  assert.equal(a.blendTo, undefined, 'blendTo is strictly banned');
});

test('6.3 Invariant: Landed or inactive aircraft do not tick', () => {
  const aLanded = { id: 'A1', mode: 'RAIL', distFt: 1000, x: 100, y: 100, landed: true, active: false };
  tickAircraft(aLanded, 1.0, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(aLanded.distFt, 1000, 'Landed aircraft must not advance distance');

  const aInactive = { id: 'A2', mode: 'RAIL', distFt: 1000, x: 100, y: 100, active: false };
  tickAircraft(aInactive, 1.0, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(aInactive.distFt, 1000, 'Inactive aircraft must not advance distance');
});

test('7.4 Zero wind executes identically without branching errors', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: 10000,
    iasKt: 140,
    active: true,
  };
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.crabDeg, 0, 'Zero wind produces 0 crab');
  near(a.gsKt, iasToTasKt(a.iasKt, a.alt), 0.01, 'Zero wind ground speed equals true airspeed (Traffic spec item 8)');
  assert.equal(a.mode, 'RAIL');
});

test('8.3 tickAircraft preserves waypoint tag in RAIL mode', () => {
  const taggedRoute = {
    id: 'TAGGED',
    name: 'Tagged',
    kind: 'pattern',
    points: [
      { x: 0, y: 0, alt: 2500, kt: 120, g: 1.0, tag: 'threshold', label: 'Threshold' },
      { x: 10000, y: 0, alt: 2500, kt: 120, g: 1.0, tag: 'downwind', label: 'Downwind' },
    ],
  };

  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: 0,
    iasKt: 120,
    active: true,
  };

  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, taggedRoute);
  assert.equal(a.mode, 'RAIL');
  assert.equal(a.tag, 'threshold');
});
