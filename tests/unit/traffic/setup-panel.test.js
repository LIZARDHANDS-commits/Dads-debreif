// Checks: the Setup column's scenarios put aircraft where a pilot expects, Random spreads five apart, Busy circuit
//   puts up ten with a PFL and a straight-in that meets a final turn, and the
// wind dial reads a bearing and the runway's head and cross wind the way a pilot works them out.
// Serves: Patrick, 4 Oct 11:05Z (Setup menu, scenario buttons including Random with five aircraft, wind as a
// dial for direction and a bar for strength); TR-R5 (wind set at any time).
// Expected values: compass bearings and the wind triangle (standard aerodynamics: head = W cos, cross = W sin of
// the angle off the runway); the built-in setup's own aircraft; 1 NM spacing is the panel's own estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENARIOS, RANDOM_COUNT, RANDOM_SPACING_FT, BUSY_COUNT, randomStarts, scenarioAircraft, dialWindFrom, runwayWindText } from '../../../src/modules/traffic/setup-panel.js';
import { straightInDelaySec, conflictSpawnPlan } from '../../../src/modules/traffic/scenario-timing.js';
import { createSim } from '../../../src/modules/traffic/sim.js';

const mooseJaw = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const routes = mooseJaw.routes;
const pointOf = (a) => routes.find((r) => r.id === a.routeId).points[a.startIndex];

test('Setup: the scenario buttons, Busy circuit first and Random among them', () => {
  assert.equal(SCENARIOS[0].id, 'busy');
  assert.ok(SCENARIOS.some((s) => s.id === 'random'));
});

// Busy circuit (Patrick, 4 Oct 18:36Z): ten aircraft, a PFL from the area, a straight-in timed to meet a final turn.
test('Setup: Busy circuit puts up ten: one PFL in the area, one straight-in, the rest on Pattern 1 at least 1 NM apart', () => {
  for (const seed of [1, 7, 42]) {
    const list = scenarioAircraft('busy', { routes, seed });
    assert.equal(list.length, BUSY_COUNT);
    assert.equal(list.filter((a) => a.area).length, 1, 'one PFL from the area');
    assert.equal(list.filter((a) => a.routeId === 'ENT2').length, 1, 'one straight-in');
    const onPattern = list.filter((a) => !a.area && a.routeId === 'PAT1');
    for (const [i, a] of onPattern.entries()) {
      for (const b of onPattern.slice(i + 1)) {
        const [p, q] = [pointOf(a), pointOf(b)];
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= RANDOM_SPACING_FT, `${a.id} and ${b.id} start at least 1 NM apart (seed ${seed})`);
      }
    }
  }
});

// The caution distance (500 ft, TR-Q11) is the test of "meets": the timing helper finds a start that brings the
// straight-in inside it while the other aircraft is in its final turn, in the default wind and in calm air.
test('Setup: Busy circuit\'s straight-in can be timed to meet the overhead aircraft in its final turn', () => {
  const list = scenarioAircraft('busy', { routes, seed: 1 });
  const overhead = list.find((a) => a.routeId === 'PAT1' && a.startIndex === 8);
  const inbound = list.find((a) => a.routeId === 'ENT2');
  for (const wind of [{ windFromDeg: 260, windKt: 15 }, { windFromDeg: 360, windKt: 0 }]) {
    const { closestFt } = straightInDelaySec({ ...mooseJaw, ...wind }, overhead, inbound);
    assert.ok(closestFt < 500, `they meet within 500 ft in ${wind.windKt} kt from ${wind.windFromDeg}: ${Math.round(closestFt)} ft`);
  }
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

// The variation is 9° East (Patrick's ruling, TR-63): magnetic = true - 9.
test('Setup: the dial reads magnetic compass bearings in 5° steps (north up, east right in 2D) and gives the wind in true', () => {
  assert.equal(dialWindFrom(0, -50), 9, 'straight up is 360°M, 009°T');
  assert.equal(dialWindFrom(50, 0), 99, 'right is 090°M');
  assert.equal(dialWindFrom(0, 50), 189, 'down is 180°M');
  assert.equal(dialWindFrom(-50, 0), 279, 'left is 270°M');
  const at = (deg) => [Math.sin((deg * Math.PI) / 180) * 50, -Math.cos((deg * Math.PI) / 180) * 50];
  assert.equal(dialWindFrom(...at(203)), 204, '203° on the dial is 194°M, which lands on 195°M: 204°T');
});

test('Setup: a dial turned with the 3D view reads the bearing under the pointer as the turned dial shows it', () => {
  // Facing east (090°T up the screen), straight down: up the dial is 090°T, 081°M, which lands on 080°M.
  assert.equal(dialWindFrom(0, -50, 90), 89);
  // Facing west (270°T up the screen): a point to the right on the dial is north, 360°T, 351°M, which lands on 350°M: 359°T.
  assert.equal(dialWindFrom(50, 0, 270), 359);
});

test('Setup: the runway wind line gives head and cross wind as a pilot works them out for 29L (298°T)', () => {
  assert.equal(runwayWindText(298, 20), '29L: 20 kt head, no cross');
  assert.equal(runwayWindText(118, 15), '29L: 15 kt tail, no cross');
  assert.equal(runwayWindText(208, 10), '29L: no head or tail, 10 kt cross from the left');
  assert.equal(runwayWindText(28, 10), '29L: no head or tail, 10 kt cross from the right');
  assert.equal(runwayWindText(200, 0), '29L: calm');
});

test('Spawn a conflict finds a straight-in that meets an aircraft on initial, inside the caution distance, and leaves the run as it was (Patrick, 4 Oct 19:24Z)', () => {
  const setup = { ...mooseJaw, deconflict: true, windFromDeg: 260, windKt: 15, aircraft: scenarioAircraft('joining', { routes: mooseJaw.routes, seed: 3 }) };
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(15);
  const target = sim.state().aircraft.find((a) => a.status === 'flying' && a.phase === 'initial');
  assert.ok(target, 'an aircraft on initial to aim at');
  const before = JSON.stringify(sim.state());
  const plan = conflictSpawnPlan(sim, setup, target.id, 'ENT2');
  assert.equal(JSON.stringify(sim.state()), before, 'the run itself is not touched');
  assert.ok(plan, 'a straight-in can meet it');
  // Inside the caution distance (500 ft, TR-Q11), and far enough ahead to be seen coming.
  assert.ok(plan.closestFt < 500 && plan.inSec >= 20, JSON.stringify(plan));
  // Anywhere along the route, not only at its spots (Patrick, 4 Oct): spawned there and flown, the two really meet,
  // inside 500 ft and 500 ft, near when the plan said (within 30 s, a generous margin for the start's placement).
  assert.ok(Number.isFinite(plan.backFt) && plan.backFt >= 0, 'a distance back along the route');
  const id = sim.spawn({ routeId: 'ENT2', startPoint: 1, backFt: plan.backFt, delaySec: plan.delaySec, id: 'CX' });
  const t0 = sim.t;
  let met = null;
  for (let s = 0.5; s <= plan.inSec + 30 && !met; s += 0.5) {
    sim.stepTo(t0 + s);
    const now = sim.state().aircraft;
    const a = now.find((x) => x.id === id), b = now.find((x) => x.id === target.id);
    if (a?.status === 'flying' && b?.status === 'flying' && Math.abs(a.alt - b.alt) < 500 && Math.hypot(a.x - b.x, a.y - b.y) < 500) met = s;
  }
  assert.ok(met !== null, `flown, they meet inside 500 ft and 500 ft by ${plan.inSec + 30} s`);
});
