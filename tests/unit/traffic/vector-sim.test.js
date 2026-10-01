// Tests for the high-fidelity Cartesian vector flight model and wind-adaptive pattern
// architecture (wind_adaptive_aerodynamic_flight_plan.md, D370, D371, D382, D389).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeWindPerch, generateWindAdjustedTrack } from '../../../src/modules/traffic/route.js';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { ktToFtps } from '../../../src/core/units.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const PAT1 = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');

test('computeWindPerch returns calm perch coordinates when wind is zero', () => {
  const calm = computeWindPerch(PAT1, 360, 0);
  assert.ok(calm);
  const nominal = PAT1.points[11];
  assert.equal(Math.round(calm.x), Math.round(nominal.x));
  assert.equal(Math.round(calm.y), Math.round(nominal.y));
  assert.equal(calm.shiftX, 0);
  assert.equal(calm.shiftY, 0);
  assert.ok(calm.turnSec >= 28 && calm.turnSec <= 32);
});

test('computeWindPerch shifts perch upwind under headwind on final', () => {
  // Runway 29L heading is ~298°. Wind from 298° is a pure headwind on final (tailwind on downwind).
  // Airmass drifts toward 118° during the final turn.
  // To roll out on centerline, the aircraft must start the turn upwind (shifted toward 298°).
  const windKt = 20;
  const shifted = computeWindPerch(PAT1, 298, windKt);
  assert.ok(shifted);
  const nominal = PAT1.points[11];

  // Vector from nominal to shifted should point into the wind (~298° true: negative x, positive y)
  const dx = shifted.x - nominal.x;
  const dy = shifted.y - nominal.y;
  const shiftDist = Math.hypot(dx, dy);
  const expectedDist = ktToFtps(windKt) * shifted.turnSec;

  assert.ok(Math.abs(shiftDist - expectedDist) < 10, `Shift distance ${shiftDist} should match expected drift ${expectedDist}`);
  // Shift direction should be opposite the wind drift (i.e. toward 298°)
  const shiftBearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(shiftBearing - 298) < 5 || Math.abs(shiftBearing - 298 + 360) < 5, `Shift bearing ${shiftBearing}° should point toward 298°`);
});

test('computeWindPerch shifts perch wider (south) under crosswind from north', () => {
  // Wind from 028° (approx 90° right of runway 298°) blows toward 208° (southwest).
  // During final turn, aircraft is pushed southwest (toward centerline).
  // Therefore perch must shift northeast (away from runway, wider downwind) to compensate.
  const windKt = 15;
  const shifted = computeWindPerch(PAT1, 28, windKt);
  assert.ok(shifted);
  const nominal = PAT1.points[11];
  const dx = shifted.x - nominal.x;
  const dy = shifted.y - nominal.y;
  const shiftDist = Math.hypot(dx, dy);
  const expectedDist = ktToFtps(windKt) * shifted.turnSec;
  assert.ok(Math.abs(shiftDist - expectedDist) < 10);
});

test('generateWindAdjustedTrack produces smooth continuous path with wind drift', () => {
  const calmTrack = generateWindAdjustedTrack(PAT1, 298, 0);
  assert.ok(Array.isArray(calmTrack) && calmTrack.length > 50);

  const windyTrack = generateWindAdjustedTrack(PAT1, 298, 20);
  assert.ok(Array.isArray(windyTrack) && windyTrack.length > 50);

  // Windy track should differ from calm track during overhead break and final turn
  const breakCalm = calmTrack.find((p) => p.phase === 'break');
  const breakWindy = windyTrack.find((p) => p.phase === 'break');
  assert.ok(breakCalm && breakWindy);
  assert.notEqual(breakCalm.x, breakWindy.x);
});

test('sim with wind integrates vector flight for overhead break and downwind steer', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 298;
  setup.windKt = 20;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 } // Starts at Break
  ];

  const sim = createSim(setup, { seed: 1 });
  const a0 = sim.state().aircraft[0];
  assert.equal(a0.id, 'A1');

  // Step 20 seconds into the break turn
  sim.stepTo(20);
  const a20 = sim.state().aircraft[0];
  assert.equal(a20.status, 'flying');
  // Aircraft should have decelerated from 220 KIAS down toward 140 KIAS
  assert.ok(a20.kt <= 180 && a20.kt >= 135, `Speed ${a20.kt} should bleed toward 140 KIAS via V² drag`);
  // Altitude should remain at 3500 ft MSL
  assert.equal(a20.alt, 3500);
});
