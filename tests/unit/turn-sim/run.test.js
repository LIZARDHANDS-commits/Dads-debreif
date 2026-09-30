// The Turn Sim engine: what a run does, stated in plain facts. (The golden tests in
// tests/golden/turn-sim-run.test.js pin it to V6 number for number.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { V6_DEFAULTS, DEFAULTS, aircraftKey } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { planTurn, turningOrder } from '../../../src/modules/turn-sim/engine/plan.js';
import { limitG, bankDegFromG } from '../../../src/core/flight-math.js';

const V6 = V6_DEFAULTS;
const flyAll = (run) => { while (run.step()); };
const byId = (run, id) => run.state.aircraft.find((a) => a.id === id);

test('a run starts at t = 0 with the aircraft at their slots, straight and level, and nothing planned yet', () => {
  const run = createRun(V6);
  assert.equal(run.state.tSec, 0);
  assert.equal(run.state.finished, false);
  assert.equal(run.state.canStartLeg, false);
  assert.deepEqual(run.state.aircraft.map((a) => a.id), [1, 2, 3, 4]);
  // 4312 with V6's math heading 0 (east): #2 6,000 ft on one side of Lead, #3 6,000 the other, #4 12,000.
  assert.deepEqual(run.state.aircraft.map((a) => [a.xFt, a.yFt]), [[0, 0], [6000 * Math.cos(Math.PI / 2), 6000], [-6000 * Math.cos(Math.PI / 2), -6000], [-12000 * Math.cos(Math.PI / 2), -12000]]);
  for (const a of run.state.aircraft) assert.deepEqual([a.headingRad, a.turning, a.bankDeg, a.done], [0, false, 0, false]);
  assert.deepEqual(run.history(), []);
});

test('state is one live object: the same one after reset, step and a new leg', () => {
  const run = createRun(V6);
  const { state } = run;
  const list = state.aircraft;
  run.step();
  run.reset({ ...V6, formation: 'twoShip' });
  assert.equal(run.state, state);
  assert.equal(state.aircraft, list);
  assert.equal(state.aircraft.length, 2);
});

test('missing settings take their defaults', () => {
  const a = createRun({});
  const b = createRun(DEFAULTS);
  for (let i = 0; i < 50; i++) { a.step(); b.step(); }
  assert.deepEqual(a.state, b.state);
});

test('a run at the rebuild\'s defaults flies 3 G (D113) where V6\'s defaults fly 2 G', () => {
  assert.equal(createRun(DEFAULTS).state.aircraft[0].g, 3);
  assert.equal(createRun({}).state.aircraft[0].g, 3);
  assert.equal(createRun(V6).state.aircraft[0].g, 2);
  const box = (settings) => createRun({ ...settings, formation: 'offsetBox' }).state.aircraft.find((a) => a.id === 3);
  // #3 sits the box aft distance behind Lead: 8,000 ft in V6, 7,000 ft by default (D114). Heading 0 is east, so aft is -x.
  assert.equal(Math.round(box(V6).xFt), -8000);
  assert.equal(Math.round(box(DEFAULTS).xFt), -7000);
});

test('every step is 0.05 s: 20 steps are a second, whatever calls step() and however fast', () => {
  const run = createRun(V6);
  for (let i = 0; i < 20; i++) run.step();
  assert.ok(Math.abs(run.state.tSec - 1) < 1e-9);
  assert.equal(run.history().length, 21); // t = 0 and one row per step
  assert.equal(run.history()[0].tSec, 0);
  // The same run stepped in bursts is the same run.
  const other = createRun(V6);
  for (let burst = 0; burst < 4; burst++) for (let i = 0; i < 5; i++) other.step();
  assert.deepEqual(other.state, run.state);
});

test('delayed 90 at V6\'s defaults: the outside aircraft turns first, then one every 16 s', () => {
  const run = createRun(V6);
  const first = {};
  while (run.step()) {
    for (const a of run.state.aircraft) if (a.turning && first[a.id] === undefined) first[a.id] = run.state.tSec;
  }
  // A right turn starts the aircraft on the left of the line first (V6 puts #2 there in 4312), then Lead, #3, #4.
  const order = Object.entries(first).sort((x, y) => x[1] - y[1]).map(([id]) => +id);
  assert.deepEqual(order, [2, 1, 3, 4]);
  assert.ok(first[2] < 0.1);
  assert.ok(Math.abs(first[1] - 16) < 0.1 && Math.abs(first[3] - 32) < 0.1 && Math.abs(first[4] - 48) < 0.1, JSON.stringify(first));
});

test('each aircraft ends its delayed 90 turned 90° in the chosen direction, and the run stops at its duration', () => {
  for (const [direction, sign] of [['right', -1], ['left', 1]]) {
    const run = createRun({ ...V6, direction });
    flyAll(run);
    assert.equal(run.state.finished, true);
    assert.ok(Math.abs(run.state.tSec - 75) < 0.05 + 1e-9);
    for (const a of run.state.aircraft) {
      assert.ok(Math.abs(a.headingRad - sign * Math.PI / 2) < 2e-4, `#${a.id} ${direction} ${a.headingRad}`);
      assert.equal(a.done, true);
      assert.equal(a.turning, false);
    }
    assert.equal(run.state.turnComplete, true);
  }
});

test('hook and in-place 90 (V6\'s hook is the same turn) start all four aircraft at once', () => {
  for (const maneuver of ['hook90', 'inplace90']) {
    const run = createRun({ ...V6, maneuver });
    run.step();
    assert.deepEqual(run.state.aircraft.map((a) => a.turning), [true, true, true, true], maneuver);
  }
});

test('shackle: each aircraft turns 45° and then comes back to its start heading', () => {
  const run = createRun({ ...V6, maneuver: 'shackle45', formation: 'twoShip' });
  let peak = 0;
  while (run.step()) peak = Math.max(peak, ...run.state.aircraft.map((a) => Math.abs(a.headingRad)));
  assert.ok(Math.abs(peak - Math.PI / 4) < 2e-4, `peak ${peak}`);
  for (const a of run.state.aircraft) assert.equal(a.headingRad, 0);
});

test('G and bank: g is the G setting plus the aircraft\'s own error, limited to 1.01; bank shows only while turning', () => {
  const run = createRun({ ...V6, baseG: 3, [aircraftKey(2, 'gError')]: 1, [aircraftKey(3, 'gError')]: -4 });
  assert.equal(byId(run, 1).g, 3);
  assert.equal(byId(run, 2).g, 4);
  assert.equal(byId(run, 3).g, limitG(-1));
  assert.equal(byId(run, 3).g, 1.01);
  assert.equal(byId(run, 1).bankDeg, 0);
  run.step(); // #2 turns first in 4312 turning right
  assert.equal(byId(run, 2).turning, true);
  assert.equal(byId(run, 2).bankDeg, bankDegFromG(4));
  assert.equal(byId(run, 1).bankDeg, 0);
});

test('a delay error moves one aircraft\'s start time: + is late, - is early', () => {
  const start = (delayErrSec) => {
    const run = createRun({ ...V6, [aircraftKey(1, 'delayErrSec')]: delayErrSec });
    while (run.step()) if (byId(run, 1).turning) return run.state.tSec;
    return null;
  };
  assert.ok(Math.abs(start(0) - 16) < 0.1);
  assert.ok(Math.abs(start(3) - 19) < 0.1);
  assert.ok(Math.abs(start(-4) - 12) < 0.1);
});

test('history is kept by time, not by count: a 10-minute run keeps every row (V6 kept the last 2,000)', () => {
  const run = createRun({ ...V6, durationSec: 600 });
  flyAll(run);
  const rows = run.history();
  assert.ok(rows.length > 12000);
  assert.equal(rows[0].tSec, 0);
  assert.ok(Math.abs(rows[rows.length - 1].tSec - 600) < 0.06);
});

test('history rows hold the pairs that exist: six for four aircraft, one for a two-ship', () => {
  const four = createRun(V6);
  four.step();
  assert.deepEqual(Object.keys(four.history()[1].pairs), ['1-2', '1-3', '1-4', '3-4', '2-3', '2-4']);
  const two = createRun({ ...V6, formation: 'twoShip' });
  two.step();
  assert.deepEqual(Object.keys(two.history()[1].pairs), ['1-2']);
  assert.equal(two.history()[1].minSepFt, two.history()[1].pairs['1-2']);
  const row = four.history()[1];
  assert.equal(row.minSepFt, Math.min(...Object.values(row.pairs)));
});

test('at the start the formation is on spacing: 4312 at 6,000 ft has Lead 6,000 ft from #2 and #3', () => {
  const run = createRun(V6);
  run.step();
  const row = run.history()[0];
  assert.ok(Math.abs(row.pairs['1-2'] - 6000) < 1e-6);
  assert.ok(Math.abs(row.pairs['1-3'] - 6000) < 1e-6);
  assert.ok(Math.abs(row.pairs['1-4'] - 12000) < 1e-6);
  assert.ok(Math.abs(row.minSepFt - 6000) < 1e-6);
});

test('reset goes back to t = 0 with the new settings and no history, and a run can be flown again', () => {
  const run = createRun(V6);
  for (let i = 0; i < 100; i++) run.step();
  run.reset({ ...V6, spacingFt: 4000, speedKt: 250 });
  assert.equal(run.state.tSec, 0);
  assert.deepEqual(run.history(), []);
  run.step();
  assert.ok(Math.abs(run.history()[0].pairs['1-2'] - 4000) < 1e-6);
  run.reset();
  assert.equal(run.state.tSec, 0);
  assert.equal(run.state.aircraft.length, 4);
  // reset() with no settings keeps the last ones.
  run.step();
  assert.ok(Math.abs(run.history()[0].pairs['1-2'] - 4000) < 1e-6);
});

test('a finished run does not step; startLeg begins a new leg from where the aircraft are, on Lead\'s heading', () => {
  const run = createRun({ ...V6, durationSec: 60 });
  run.startLeg(); // nothing to continue at t = 0
  assert.equal(run.state.tSec, 0);
  flyAll(run);
  assert.equal(run.step(), false);
  assert.equal(run.state.canStartLeg, true);
  const before = run.state.aircraft.map((a) => [a.xFt, a.yFt]);
  run.startLeg();
  assert.equal(run.state.tSec, 0);
  assert.equal(run.state.finished, false);
  assert.equal(run.state.canStartLeg, false);
  assert.deepEqual(run.state.aircraft.map((a) => [a.xFt, a.yFt]), before);
  assert.equal(run.history().length, 1); // a new leg's history starts again, as V6's does
  assert.equal(run.step(), true);
  // After a right turn, the formation flies south, and the second leg turns them right again to the west.
  flyAll(run);
  for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (-Math.PI)) < 4e-4, `${a.headingRad}`);
});

test('turnComplete goes true when every aircraft has finished its turn, before the run ends', () => {
  const run = createRun(V6);
  let at = null;
  while (run.step()) if (run.state.turnComplete && at === null) at = run.state.tSec;
  assert.ok(at > 48 && at < 75, `${at}`);
  assert.equal(run.state.canStartLeg, true);
});

test('planTurn sets each aircraft\'s start, direction and goal from the time delay', () => {
  const craft = [1, 2, 3, 4].map((id) => ({ id, xFt: 0, yFt: [0, 6000, -6000, -12000][id - 1], headingRad: 0, delayErrSec: 0, turnLogic: 'auto', clockTarget: 'global' }));
  const flight = { formation: 'weighted', maneuver: 'delayed90away', direction: 'right', turnDeg: 90, baseDelaySec: 10, startHeadingDeg: 0, clockCueAircraft: 1 };
  assert.deepEqual(turningOrder(craft, flight).map((a) => a.id), [2, 1, 3, 4]);
  planTurn(craft, flight);
  assert.deepEqual(craft.map((a) => [a.id, a.turnStartSec, a.turnDir, a.turnGoalRad]), [[1, 10, -1, Math.PI / 2], [2, 0, -1, Math.PI / 2], [3, 20, -1, Math.PI / 2], [4, 30, -1, Math.PI / 2]]);
  planTurn(craft, { ...flight, direction: 'left' });
  assert.deepEqual(turningOrder(craft, { ...flight, direction: 'left' }).map((a) => a.id), [4, 3, 1, 2]);
  assert.deepEqual(craft.map((a) => a.turnDir), [1, 1, 1, 1]);
});

test('the engine touches no page: no window, document, timers or animation frames in engine/ or settings.js', () => {
  const dir = fileURLToPath(new URL('../../../src/modules/turn-sim/engine/', import.meta.url));
  const files = [...readdirSync(dir).map((f) => dir + f), fileURLToPath(new URL('../../../src/modules/turn-sim/settings.js', import.meta.url))];
  for (const file of files) {
    const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /\b(window|document|localStorage|setTimeout|setInterval|requestAnimationFrame|performance\.now|Date\.now)\b/, file);
  }
});
