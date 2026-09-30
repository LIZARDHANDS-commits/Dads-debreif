// The debrief's tennis-ball glue (SPEC-debrief: Tennis ball): it reads the
// tracks at the moment and hands core's one solver the ships, their path
// ahead and V6's settings. The solver itself is pinned in core's tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlight, sampleAt } from '../../../src/flight-data/flight.js';
import { LAYOUT_DEFAULTS } from '../../../src/modules/debrief/state.js';
import { tennisAt, tennisTone } from '../../../src/modules/debrief/tennis.js';
import { tennisLines } from '../../../src/modules/debrief/tennis-panel.js';

const M_PER_DEG = 111_320;
const cos50 = Math.cos((50 * Math.PI) / 180);
// A ship flying due north at 200 kt from `northM` metres north and `eastM` east.
function north({ northM = 0, eastM = 0, still = false } = {}) {
  const fixes = [];
  for (let t = 0; t <= 60; t++) {
    const n = northM + (still ? 0 : 102.9 * t); // 200 kt ≈ 102.9 m/s
    fixes.push({ t, lat: 50 + n / M_PER_DEG, lon: -105 + eastM / (M_PER_DEG * cos50), altM: 2500 });
  }
  return fixes;
}
const settings = { ...LAYOUT_DEFAULTS };

test('#2 right behind Lead, pointing at it: INTERCEPT, with the numbers behind it', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: north({ northM: 300 }) }, 2: { name: 'two', fixes: north() } });
  const sol = tennisAt(flight, 20, settings);
  assert.equal(sol.status, 'INTERCEPT');
  assert.equal(sol.shooterId, 2);
  assert.equal(sol.targetId, 1);
  assert.ok(Math.abs(sol.rangeNow - 984) < 5, String(sol.rangeNow)); // 300 m
  assert.ok(sol.losAngle < 0.5);
  assert.equal(tennisTone(sol.status), 'good');
  const { status, lines } = tennisLines(sol);
  assert.equal(status, 'INTERCEPT');
  assert.match(lines[0], /^#2 at #1, range 98\d ft$/);
  assert.match(lines[1], /cone ±3\.0°$/);
});

test('the target flies its recorded path over the time of flight (Q34)', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: north({ northM: 300 }) }, 2: { name: 'two', fixes: north() } });
  const sol = tennisAt(flight, 20, settings);
  const last = sol.targetPoints.at(-1);
  const want = sampleAt(flight.tracks[1], 20 + sol.tofSec);
  assert.ok(Math.abs(last.x - want.xFt) < 1e-6 && Math.abs(last.y - want.yFt) < 1e-6);
});

test('a target well off the nose is OUT OF CONE; a narrower cone changes IN CONE to OUT (D77)', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: north({ northM: 300, eastM: 300 }) }, 2: { name: 'two', fixes: north() } });
  assert.equal(tennisAt(flight, 20, settings).status, 'OUT OF CONE');
  const near = buildFlight({ 1: { name: 'lead', fixes: north({ northM: 3000, eastM: 60 }) }, 2: { name: 'two', fixes: north() } });
  assert.equal(tennisAt(near, 20, { ...settings, tennisRadiusFt: 10 }).status, 'IN CONE'); // 1.1° off, too far to hit
  assert.equal(tennisAt(near, 20, { ...settings, tennisRadiusFt: 10, tennisConeDeg: 2 }).status, 'OUT OF CONE');
});

test('nothing to solve: a missing ship, the same ship twice, a shooter not moving', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: north({ northM: 300 }) }, 2: { name: 'two', fixes: north({ still: true }) } });
  assert.deepEqual(tennisAt(flight, 20, { ...settings, tennisShooter: 3 }), { status: 'LOAD DATA', message: 'Load #3 and #1 tracks.' });
  assert.equal(tennisAt(flight, 20, { ...settings, tennisTarget: 2 }).status, 'PICK TWO');
  assert.equal(tennisAt(flight, 20, settings).status, 'NOT MOVING');
  assert.deepEqual(tennisLines({ status: 'PICK TWO', message: 'Choose two different aircraft.' }), { status: 'PICK TWO', lines: ['Choose two different aircraft.'] });
});
