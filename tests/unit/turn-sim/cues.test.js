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

test('cue status: who each aircraft waits on and for which clock position, known before Play and live while it flies', () => {
  const run = createRun({ ...V6_DEFAULTS, timing: 'clock', direction: 'right', clockCuePos: 7, durationSec: 60 });
  const cue = (id) => run.state.aircraft.find((a) => a.id === id).cue;
  // 4312 turning right starts #2 (outside), then #1, #3, #4, each watching the one before.
  assert.deepEqual([2, 1, 3, 4].map((id) => cue(id).mode), ['start', 'waiting', 'waiting', 'waiting']);
  assert.deepEqual([1, 3, 4].map((id) => cue(id).targetId), [2, 1, 3]);
  assert.equal(cue(2).targetId, null);
  assert.deepEqual([1, 2, 3, 4].map((id) => cue(id).clockPos), [7, 7, 7, 7]);
  run.step();
  assert.equal(run.state.aircraft.find((a) => a.id === 2).turning, true); // #2 has nothing to watch
  assert.equal(cue(2).mode, 'start');
  assert.equal(cue(1).mode, 'waiting');
  while (run.step());
  assert.deepEqual([1, 2, 3, 4].map((id) => cue(id).mode), ['triggered', 'start', 'triggered', 'triggered']);
});

test('cue status: an aircraft with its own clock position shows it, and other timings say off', () => {
  const run = createRun({ ...V6_DEFAULTS, timing: 'clock', [aircraftKey(3, 'clockPos')]: '4.5' });
  assert.equal(run.state.aircraft.find((a) => a.id === 3).cue.clockPos, 4.5);
  assert.equal(run.state.aircraft.find((a) => a.id === 1).cue.clockPos, 5.5);
  const time = createRun(V6_DEFAULTS);
  for (const a of time.state.aircraft) assert.equal(a.cue.mode, 'off');
});

test('cue status: #3 and #4 in the offset box at 5:30 are flagged, because V6 never turns them (issue #16, Q44c)', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...V6_DEFAULTS, formation: 'offsetBox', timing: 'clock', direction, durationSec: 200 });
    const flags = () => run.state.aircraft.map((a) => a.cue.cantSee);
    assert.deepEqual(flags(), [false, false, true, true]);
    while (run.step());
    // The engine agrees: only the front element ever turned.
    assert.deepEqual(run.state.aircraft.map((a) => a.done), [true, true, false, false], direction);
  }
  const seven = createRun({ ...V6_DEFAULTS, formation: 'offsetBox', timing: 'clock', clockCuePos: 7 });
  assert.deepEqual(seven.state.aircraft.map((a) => a.cue.cantSee), [false, false, false, false]);
});

test('SMM item 2, Auto: a right turn cues at 7 o\'clock and a left turn at 5 o\'clock, the side the outside wingman comes back on', () => {
  // The engine's own run shows which side: in a right turn the outside aircraft (#2, on Lead's left) turns first and
  // drops back along Lead's LEFT side, so Lead sees it at 7 o'clock (+150° from the nose). In a left turn it is the
  // right side, 5 o'clock (-150°). Positive bearings are to the left.
  const right = startsWithBearings({ ...V6_DEFAULTS, timing: 'clock', clockCuePos: 'auto', direction: 'right', durationSec: 100 });
  assert.ok(Math.abs(right[1].bearing(2) - 150) < 6, `Lead starts when #2 is at ${right[1].bearing(2)}°`);
  const left = startsWithBearings({ ...V6_DEFAULTS, timing: 'clock', clockCuePos: 'auto', direction: 'left', durationSec: 100 });
  assert.ok(Math.abs(left[3].bearing(4) + 150) < 6, `#3 starts when #4 is at ${left[3].bearing(4)}°`);
  // Auto is 7 and 5, and the status lines say so.
  const status = (direction, clockCuePos = 'auto') => createRun({ ...V6_DEFAULTS, timing: 'clock', clockCuePos, direction }).state.aircraft[0].cue.clockPos;
  assert.equal(status('right'), 7);
  assert.equal(status('left'), 5);
  assert.equal(status('right', '5.5'), 5.5); // a fixed position stays pickable, V6's 5:30 included
  // The step between aircraft is the same 14.7 s either way: about the 15 s of the SMM's line abreast turn.
  const step = (direction) => { const t = startTimes({ ...V6_DEFAULTS, timing: 'clock', clockCuePos: 'auto', direction, durationSec: 100 }); return direction === 'right' ? t[1] : t[3]; };
  assert.ok(step('right') > 14 && step('right') < 15.5, `${step('right')}`);
  assert.ok(step('left') > 14 && step('left') < 15.5, `${step('left')}`);
});

test('SMM item 2, Auto: an aircraft can pick Auto for itself while the rest use a fixed position', () => {
  const run = createRun({ ...V6_DEFAULTS, timing: 'clock', clockCuePos: '5.5', direction: 'left', [aircraftKey(2, 'clockPos')]: 'auto' });
  assert.equal(run.state.aircraft.find((a) => a.id === 2).cue.clockPos, 5);
  assert.equal(run.state.aircraft.find((a) => a.id === 1).cue.clockPos, 5.5);
});
