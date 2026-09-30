// The clock cue, in plain facts (the golden run test pins the flying to V6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../../src/modules/turn-sim/settings.js';
import { relativeBearingDeg } from '../../../src/core/angles.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const V6 = { ...V6_DEFAULTS, timing: 'clock', direction: 'left', durationSec: 120 };

/** The time each aircraft first turns, by id. */
function startTimes(settings) {
  const run = createRun(settings);
  const first = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && first[a.id] === undefined) first[a.id] = run.state.tSec;
  return first;
}

test('the Clock tolerance setting is used: a wider tolerance starts each turn earlier, and 4° is the default', () => {
  const four = startTimes(V6);
  const explicit = startTimes({ ...V6, clockCueTolDeg: 4 });
  assert.deepEqual(four, explicit);
  const wide = startTimes({ ...V6, clockCueTolDeg: 20 });
  const narrow = startTimes({ ...V6, clockCueTolDeg: 1 });
  assert.ok(wide[3] < four[3] && four[3] <= narrow[3], `${wide[3]} ${four[3]} ${narrow[3]}`);
  // A cue that has not come yet does not start the aircraft: #3 waits for #4 and starts after it.
  assert.ok(four[3] > four[4]);
});

/** Runs and records, for each aircraft, when it first turns and the bearing (degrees from its nose) of every other aircraft just before. */
function startsWithBearings(settings) {
  const run = createRun(settings);
  const out = {};
  const bearing = (st, i, j) => {
    const a = st.aircraft.find((x) => x.id === i);
    const b = st.aircraft.find((x) => x.id === j);
    return relativeBearingDeg({ x: a.xFt, y: a.yFt, hdg: a.headingRad }, { x: b.xFt, y: b.yFt });
  };
  for (;;) {
    const before = JSON.parse(JSON.stringify(run.state));
    if (!run.step()) break;
    for (const a of run.state.aircraft) {
      if (a.turning && out[a.id] === undefined) out[a.id] = { tSec: run.state.tSec, bearing: (j) => bearing(before, a.id, j) };
    }
  }
  return out;
}

const MANUAL = { ...V6_DEFAULTS, timing: 'clock', clockCueSequence: 'manual', direction: 'right', durationSec: 100, clockCuePos: 7.5 };

test('Q45, Manual targets: each aircraft turns when the aircraft it was told to watch reaches its clock position', () => {
  // Right turn, 4312: #2 (on Lead\'s left) is the outside aircraft. #4 watches #2, not the aircraft next to it.
  const watch = (target) => startsWithBearings({
    ...MANUAL,
    [aircraftKey(2, 'clockTarget')]: '2',
    [aircraftKey(1, 'clockTarget')]: '2',
    [aircraftKey(3, 'clockTarget')]: '1',
    [aircraftKey(4, 'clockTarget')]: target,
  });
  const behind3 = watch('3');
  const behind2 = watch('2');
  assert.ok(behind3[2].tSec < 0.1, '#2 watches itself: it starts at once');
  for (const [starts, id, target] of [[behind3, 1, 2], [behind3, 3, 1], [behind3, 4, 3], [behind2, 4, 2]]) {
    // 7:30 is 135° to the left of the nose. The bearing just before the start is within the 4° tolerance (plus the step).
    assert.ok(Math.abs(starts[id].bearing(target) - 135) < 6, `#${id} watching #${target}: ${starts[id].bearing(target)}`);
  }
  // #4 watching #2 starts sooner than #4 watching #3, because #2 turned first.
  assert.ok(behind2[4].tSec < behind3[4].tSec, `${behind2[4].tSec} vs ${behind3[4].tSec}`);
});

test('Q45, Manual targets: an aircraft with no target of its own watches the Clock cue aircraft, and turns by its own turn logic', () => {
  const s = { ...MANUAL, clockCueAircraft: 1, [aircraftKey(3, 'turnLogic')]: 'left' };
  const run = createRun(s);
  while (run.step());
  const byId = (id) => run.state.aircraft.find((a) => a.id === id);
  // Lead watches itself and turns right at once; #3 waits for Lead to reach its 7:30, and turns LEFT as its logic says.
  assert.ok(byId(1).headingRad < -1.5 && byId(1).headingRad > -1.6);
  assert.ok(byId(3).headingRad > 1.5 && byId(3).headingRad < 1.6);
  const starts = startsWithBearings(s);
  assert.ok(starts[1].tSec < 0.1 && starts[3].tSec > 1);
});

test('Outside-in is untouched by the target boxes: with Outside-in a per-aircraft Clock target changes nothing (V6\'s cascade)', () => {
  const base = { ...V6_DEFAULTS, timing: 'clock', direction: 'left', durationSec: 90 };
  const a = startWithoutBearings(base);
  const b = startWithoutBearings({ ...base, [aircraftKey(2, 'clockTarget')]: '4', [aircraftKey(3, 'clockTarget')]: '2' });
  assert.deepEqual(a, b);
});

function startWithoutBearings(settings) {
  const s = startsWithBearings(settings);
  return Object.fromEntries(Object.entries(s).map(([id, v]) => [id, v.tSec]));
}
