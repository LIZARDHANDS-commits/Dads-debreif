// The shackle as the SMM flies it (16.19 paras 61 and 62; a two-ship turn): both aircraft turn about 45 degrees INTO each other at once,
// cross, and reverse back to the original heading, timed to arrive in LAB on swapped sides. V6 turned every wingman away
// (its "right" vector is the map's left), so nobody crossed; the V6 flight is in git history (commit 63fffa8 and before).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkSettings, turnProblem } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { shackleHoldSec } from '../../../src/modules/turn-sim/engine/plan.js';

const BASE = { ...DEFAULTS, maneuver: 'shackle45', turnDeg: 45, startHeadingDeg: 0, durationSec: 90 };
/** Tolerance on the end state, in feet: the sim steps 0.05 s (about 19 ft of flying) and turns on the step's end heading. */
const TOLERANCE_FT = 150;

/** Where `b` is from `a` in a's frame at the start: feet to a's left ("across") and feet ahead. Start heading is north. */
const rel = (list, id, fromId) => {
  const a = list.find((x) => x.id === fromId);
  const b = list.find((x) => x.id === id);
  return { across: -(b.xFt - a.xFt), ahead: b.yFt - a.yFt };
};

function fly(settings) {
  const run = createRun(settings);
  const start = run.state.aircraft.map((a) => ({ ...a }));
  const crossed = new Set();
  const turning = { 1: [], 2: [], 3: [], 4: [] };
  let closest = Infinity;
  const sideAt = (from, to) => Math.sign(rel(run.state.aircraft, to, from).across);
  const initial = { '1-2': sideAt(1, 2) };
  if (run.state.aircraft.length === 4) initial['3-4'] = sideAt(3, 4);
  while (run.step()) {
    for (const [pair, side] of Object.entries(initial)) {
      const [x, y] = pair.split('-').map(Number);
      if (sideAt(x, y) === -side) crossed.add(pair);
      closest = Math.min(closest, Math.hypot(...Object.values(rel(run.state.aircraft, y, x))));
    }
    for (const a of run.state.aircraft) turning[a.id].push(a.turning);
  }
  return { run, start, crossed, turning, initial, closest };
}

test('two-ship, right and left: they turn into each other, cross, and end on the start heading with the sides swapped', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, crossed, initial } = fly({ ...BASE, formation: 'twoShip', direction });
    const end = run.state.aircraft;
    assert.ok(crossed.has('1-2'), `${direction}: the tracks cross`);
    for (const a of end) assert.equal(a.headingRad, start.find((s) => s.id === a.id).headingRad, `${direction} #${a.id}: rolls out on the start heading`);
    const gap = rel(end, 2, 1);
    assert.equal(Math.sign(gap.across), -initial['1-2'], `${direction}: #2 is now on the other side`);
    assert.ok(Math.abs(Math.abs(gap.across) - 6000) < TOLERANCE_FT, `${direction}: back to 6,000 ft abeam, got ${gap.across.toFixed(0)}`);
    assert.ok(Math.abs(gap.ahead) < TOLERANCE_FT, `${direction}: in LAB, ${gap.ahead.toFixed(0)} ft ahead`);
  }
});

test('the first leg turns each toward the other, whichever way the Direction box points, both at once', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...BASE, formation: 'twoShip', direction });
    const gap = () => Math.abs(rel(run.state.aircraft, 2, 1).across);
    const before = gap();
    run.step();
    assert.ok(run.state.aircraft.every((a) => a.turning), `${direction}: both turn at once`);
    for (let i = 0; i < 60; i++) run.step(); // 3 s: the first leg (3.2 s) is nearly done
    assert.ok(gap() < before - 400, `${direction}: the gap closes, ${before} to ${gap().toFixed(0)}`);
    const [one, two] = run.state.aircraft.map((a) => a.headingRad - Math.PI / 2);
    assert.ok(one * two < 0 && Math.abs(Math.abs(one) - Math.PI / 4) < 0.2 && Math.abs(Math.abs(two) - Math.PI / 4) < 0.2, `${direction}: opposite ways, about 45 degrees`);
  }
});

test('the hold between the legs is the SMM\'s timing: 19.5 s at 220 KTAS, 3 G and 6,000 ft', () => {
  const v = 220 * 1.68781;
  const radius = (v * v) / (32.174 * Math.sqrt(8));
  const hold = shackleHoldSec(6000, Math.PI / 4, v, radius);
  assert.ok(Math.abs(hold - 19.45) < 0.1, `${hold}`);
  assert.equal(shackleHoldSec(500, Math.PI / 4, v, radius), 0, 'a gap the two turns already close needs no hold');
  const { turning } = fly({ ...BASE, formation: 'twoShip', direction: 'right' });
  // Turning, straight (the hold), turning: count the seconds of the straight stretch between the two legs.
  const t = turning[1];
  const first = t.indexOf(true);
  const legOneEnd = t.indexOf(false, first);
  const legTwoStart = t.indexOf(true, legOneEnd);
  assert.ok(Math.abs((legTwoStart - legOneEnd) * 0.05 - 19.45) < 0.3, `${(legTwoStart - legOneEnd) * 0.05} s`);
  assert.equal(new Set(turning[2].map(String)).size, 2);
});

test('Patrick 09:28Z: the shackle is a two-ship turn; a four-ship formation does not fly it', () => {
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox']) {
    assert.match(turnProblem(formation, 'shackle45'), /two-ship/);
    assert.equal(checkSettings({ ...BASE, formation }).maneuver, DEFAULTS.maneuver, `${formation}: settings fall back to the default turn`);
    const run = createRun({ ...BASE, formation });
    assert.match(run.state.maneuverFallback, /two-ship/);
    run.step();
    assert.equal(run.state.aircraft.filter((a) => a.turning).length, 1, `${formation}: flies the default delayed turn, not a shackle`);
  }
  assert.equal(turnProblem('twoShip', 'shackle45'), null);
  assert.equal(checkSettings({ ...BASE, formation: 'twoShip' }).maneuver, 'shackle45');
  assert.equal(createRun({ ...BASE, formation: 'twoShip' }).state.maneuverFallback, null);
});

test('a short Duration does not cut the shackle off: the run lasts through the hold and the reversal (audit yellow)', () => {
  for (const durationSec of [5, 20, 30]) {
    const run = createRun({ ...BASE, formation: 'twoShip', durationSec });
    while (run.step());
    assert.equal(run.state.turnComplete, true, `Duration ${durationSec}: both aircraft finished`);
    assert.ok(run.state.durationSec > 30, `Duration ${durationSec}: the run is ${run.state.durationSec.toFixed(1)} s, past the hold`);
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - Math.PI / 2) < 2e-4, `Duration ${durationSec} #${a.id}: rolled out on the start heading`);
  }
});
