// Golden test (R9, D10): src/modules/traffic/sim.js against V6's own Traffic page,
// step by step, for an hour of sim time. V6's `step` (with its `checkDecisions`,
// `handleRouteEnd` and `conflicts`) runs in Node (tests/golden/traffic-v6.js) at 1x and
// 20 frames a second, which is 0.05 s of sim time a frame, next to sim.js taking its
// fixed 0.05 s steps. Both are given the same routes and aircraft and the same seeded
// dice, and after every step every aircraft's route, distance along it, position,
// height, speed, leg and status, every conflict and caution, and the dice themselves
// must agree within 1e-9 ft (tests/golden/traffic-pair.js does the comparing).
//
// The rules' corners (odds of 0 and 1, routes that go nowhere, other options and limits,
// Reset) are in traffic-sim-rules.test.js, which runs alongside this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPattern, newEntry, newSplit, ROUTE_COLORS } from '../../src/modules/traffic/route.js';
import { v6DefaultProfile } from './traffic-v6.js';
import { builtIn, startPair, flyBoth, gridEvents, spawnBoth, HOUR_STEPS, STEPS_PER_SEC } from './traffic-pair.js';

test('the built-in Moose Jaw setup flies an hour the way V6 does, with the same dice', () => {
  const pair = startPair(builtIn(), { seed: 1 });
  const seen = flyBoth(pair, HOUR_STEPS);
  assert.equal(pair.mine.t, pair.v6.state.t);
  assert.ok(pair.mine.t > 3599.99 && pair.mine.t < 3600.01, `${pair.mine.t} s`);
  assert.ok(seen.routes.size >= 4, `the aircraft used ${[...seen.routes]}`);
  assert.ok(seen.landed + seen.done >= 1, 'someone finished');
});

test('the built-in setup with two other seeds, twenty minutes each, so other choices are made', () => {
  for (const seed of [2024, 0xbeef]) {
    const pair = startPair(builtIn(), { seed });
    const seen = flyBoth(pair, 20 * 60 * STEPS_PER_SEC);
    assert.ok(seen.routes.size >= 2, `seed ${seed}: the aircraft used ${[...seen.routes]}`);
  }
});

test('a spawned-traffic grid on the built-in routes, landing as V6 lands, flies an hour the way V6 does', () => {
  const setup = builtIn();
  const pair = startPair(setup, { seed: 7 });
  const seen = flyBoth(pair, HOUR_STEPS, gridEvents(setup));
  assert.equal(pair.mine.state().aircraft.length, 34, 'the seven and a grid of 27');
  assert.ok(seen.maxFlying >= 25, `${seen.maxFlying} aircraft flying at once`);
  assert.ok(seen.conflict > 0 && seen.caution > 0, 'the grid produced conflicts and cautions to compare');
  assert.ok(seen.landed + seen.done >= 5);
});

test('traffic spawned while it runs, each with a delay from that moment, is flown the same', () => {
  const setup = builtIn();
  const pair = startPair(setup, { seed: 5 });
  const types = ['CT-157', 'CT-156', 'CT-102', 'CT-114'];
  const events = {};
  setup.routes.forEach((route, i) => {
    for (const [j, at] of [3000, 12000, 30000].entries()) {
      events[at + i] = (p) => spawnBoth(p, { type: types[(i + j) % 4], routeId: route.id, start: (i + j) % route.points.length, delay: [0, 15, 47.3][j] });
    }
  });
  flyBoth(pair, 30 * 60 * STEPS_PER_SEC, events);
  assert.equal(pair.mine.state().aircraft.length, 7 + 27);
});

test('the patterns, entries and splits the builders make (V6\'s own starting setup) fly an hour the way V6 does', () => {
  const routes = [newPattern('PAT1', 'Pattern 1', { color: ROUTE_COLORS[0] }), newPattern('PAT2', 'Pattern 2', { offsetEastFt: 14000, color: ROUTE_COLORS[1] })];
  routes.push(newEntry('ENT1', 'Entry 1', 'PAT1', routes, { color: ROUTE_COLORS[3] }));
  routes.push(newEntry('ENT2', 'Entry 2', 'PAT1', routes, { color: ROUTE_COLORS[4] }));
  routes.push(newSplit('SPL1', 'Split 1', 'PAT1', routes, { color: ROUTE_COLORS[5] }));
  routes.push(newSplit('SPL2', 'Split 2', 'PAT2', routes, { color: ROUTE_COLORS[6] }));
  const setup = {
    ...builtIn(), routes,
    aircraft: [
      { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 0, startsAtSec: 0 },
      { id: 'A2', type: 'CT-114', routeId: 'ENT1', startIndex: 0, startsAtSec: 15 },
      { id: 'A3', type: 'CT-157', routeId: 'PAT2', startIndex: 0, startsAtSec: 30 },
      { id: 'A4', type: 'CT-102', routeId: 'ENT2', startIndex: 0, startsAtSec: 45 },
    ],
  };
  const pair = startPair(setup, { seed: 314 });
  const seen = flyBoth(pair, HOUR_STEPS, gridEvents(setup, { firstStep: 400 }));
  assert.ok(seen.routes.has('SPL1') || seen.routes.has('SPL2'), 'someone took a split');
});

test('V6\'s own raw start times (136.6792 s for A2, not the 137 the setup file keeps) fly the same as V6 on both sides', () => {
  const setup = builtIn();
  const raw = v6DefaultProfile().aircraft;
  setup.aircraft.forEach((a, i) => { a.startsAtSec = raw[i].delay; });
  assert.notEqual(setup.aircraft[1].startsAtSec, 137);
  const pair = startPair(setup, { seed: 1 });
  const seen = flyBoth(pair, 12 * 60 * STEPS_PER_SEC);
  assert.ok(seen.routes.size >= 2);
  assert.ok(Math.abs(builtIn().aircraft[1].startsAtSec - setup.aircraft[1].startsAtSec - 0.3208) < 1e-3, 'the setup file starts A2 0.32 s later than V6 does');
});
