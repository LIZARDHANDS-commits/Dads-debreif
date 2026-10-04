// Checks: the Setup column's scenarios put aircraft where a pilot expects, Random spreads five apart, and the
// wind dial reads a bearing and the runway's head and cross wind the way a pilot works them out.
// Serves: Patrick, 4 Oct 11:05Z (Setup menu, scenario buttons including Random with five aircraft, wind as a
// dial for direction and a bar for strength); TR-R5 (wind set at any time).
// Expected values: compass bearings and the wind triangle (standard aerodynamics: head = W cos, cross = W sin of
// the angle off the runway); the built-in setup's own aircraft; 1 NM spacing is the panel's own estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENARIOS, RANDOM_COUNT, RANDOM_SPACING_FT, randomStarts, scenarioAircraft, dialBearing, runwayWindText } from '../../../src/modules/traffic/setup-panel.js';
import { createSim } from '../../../src/modules/traffic/sim.js';

const mooseJaw = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const routes = mooseJaw.routes;
const pointOf = (a) => routes.find((r) => r.id === a.routeId).points[a.startIndex];

test('Setup: five scenario buttons, Random among them', () => {
  assert.equal(SCENARIOS.length, 5);
  assert.ok(SCENARIOS.some((s) => s.id === 'random'));
});

test('Setup: Random puts five aircraft on route points, at least 1 NM apart, and the same dice give the same picture', () => {
  for (const seed of [1, 7, 42, 2026]) {
    const list = scenarioAircraft('random', { routes, seed });
    assert.equal(list.length, RANDOM_COUNT);
    assert.deepEqual(list.map((a) => a.id), ['A1', 'A2', 'A3', 'A4', 'A5']);
    for (const [i, a] of list.entries()) {
      for (const b of list.slice(i + 1)) {
        const [p, q] = [pointOf(a), pointOf(b)];
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= RANDOM_SPACING_FT, `${a.id} and ${b.id} start at least 1 NM apart (seed ${seed})`);
      }
    }
    assert.deepEqual(randomStarts(routes, seed), randomStarts(routes, seed));
  }
  assert.notDeepEqual(randomStarts(routes, 1), randomStarts(routes, 2), 'new dice, a new picture');
});

test('Setup: "Moose Jaw day" is the built-in setup\'s own aircraft, and every scenario flies in the sim', () => {
  assert.deepEqual(scenarioAircraft('moose-jaw', { routes, builtIn: mooseJaw.aircraft }), mooseJaw.aircraft);
  for (const s of SCENARIOS) {
    const aircraft = scenarioAircraft(s.id, { routes, builtIn: mooseJaw.aircraft, seed: 3 });
    assert.ok(aircraft.length >= 1, s.label);
    const sim = createSim({ ...mooseJaw, aircraft }, { seed: 1 });
    sim.stepTo(120);
    const flying = sim.state().aircraft.filter((a) => a.status === 'flying' || a.status === 'waiting');
    assert.ok(flying.length >= 1, `${s.label}: aircraft are up after two minutes`);
  }
});

test('Setup: the dial reads compass bearings (north up, east right), 360 for north', () => {
  assert.equal(dialBearing(0, -50), 360);
  assert.equal(dialBearing(50, 0), 90);
  assert.equal(dialBearing(0, 50), 180);
  assert.equal(dialBearing(-50, 0), 270);
  assert.equal(dialBearing(Math.sin((203 * Math.PI) / 180) * 50, -Math.cos((203 * Math.PI) / 180) * 50), 200, 'drag steps of 10°');
});

test('Setup: the runway wind line gives head and cross wind as a pilot works them out for 29L (298°T)', () => {
  assert.equal(runwayWindText(298, 20), '29L: 20 kt head, no cross');
  assert.equal(runwayWindText(118, 15), '29L: 15 kt tail, no cross');
  assert.equal(runwayWindText(208, 10), '29L: no head or tail, 10 kt cross from the left');
  assert.equal(runwayWindText(28, 10), '29L: no head or tail, 10 kt cross from the right');
  assert.equal(runwayWindText(200, 0), '29L: calm');
});
