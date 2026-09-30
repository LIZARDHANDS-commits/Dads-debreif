// The Delayed 45 as the SMM flies it (16.19 paras 55 to 57, Figures 16.16 and 16.17): the aircraft that turns first turns 45
// degrees and flies on; the other flies straight until the first has gone through its tail, then turns 45 degrees too, and
// they roll out in LAB on the new heading with the sides swapped. V6 used the 90's delay (16 s) for the 45, so the second
// aircraft turned too early and ended in trail, 2,500 ft ahead, nowhere near LAB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, MANEUVER_TURN_DEG } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, delayed45Check: 'none', maneuver: 'delayed45away', turnDeg: MANEUVER_TURN_DEG.delayed45away, startHeadingDeg: 0, durationSec: 200 };
/** The base delay is a 90's, 16 s; a 45 waits 16 x cot 22.5 = 38.6 s where LAB needs 39.05 s: the end is within about 200 ft. */
const TOLERANCE_FT = 250;

const fromLead = (list, id) => {
  const lead = list.find((a) => a.id === 1);
  const b = list.find((a) => a.id === id);
  const h = lead.headingRad;
  const dx = b.xFt - lead.xFt;
  const dy = b.yFt - lead.yFt;
  return { right: dx * Math.sin(h) - dy * Math.cos(h), ahead: dx * Math.cos(h) + dy * Math.sin(h) };
};

function fly(settings) {
  const run = createRun(settings);
  const start = run.state.aircraft.map((a) => ({ ...a }));
  const startedAt = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && startedAt[a.id] === undefined) startedAt[a.id] = run.state.tSec;
  return { run, start, startedAt };
}

test('two-ship, right and left: the outside aircraft goes first, the other about 39 s later, and they end in LAB on the new heading with the sides swapped', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, startedAt } = fly({ ...BASE, formation: 'twoShip', direction });
    const label = direction;
    const startHeading = start[0].headingRad;
    const turn = direction === 'right' ? -1 : 1;
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (startHeading + turn * Math.PI / 4)) < 2e-4, `${label} #${a.id}: on the new heading, 45 degrees round`);
    const [first, second] = startedAt[1] < startedAt[2] ? [1, 2] : [2, 1];
    assert.ok(startedAt[first] < 0.1, `${label}: the first goes at once`);
    assert.ok(Math.abs(startedAt[second] - 38.6) < 0.2, `${label}: the second waits 38.6 s, ${startedAt[second]}`);
    const end = fromLead(run.state.aircraft, 2);
    assert.ok(Math.abs(Math.abs(end.right) - 6000) < TOLERANCE_FT, `${label}: 6,000 ft abeam, ${end.right.toFixed(0)}`);
    assert.ok(Math.abs(end.ahead) < TOLERANCE_FT, `${label}: in LAB, ${end.ahead.toFixed(0)} ft ahead`);
    assert.ok(Math.sign(fromLead(start, 2).right) === -Math.sign(end.right), `${label}: the sides swapped`);
  }
});

test('4312: the four go one after another, 38.6 s apart, and end in LAB on the new heading with the order reversed', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, startedAt } = fly({ ...BASE, formation: 'weighted', direction });
    const order = Object.entries(startedAt).sort((a, b) => a[1] - b[1]);
    order.forEach(([, at], i) => assert.ok(Math.abs(at - i * 38.6) < 0.3, `${direction}: start ${i} at ${at}`));
    assert.equal(run.state.turnComplete, true, `${direction}: all four have finished their turns`);
    for (const id of [2, 3, 4]) {
      const was = fromLead(start, id);
      const now = fromLead(run.state.aircraft, id);
      assert.ok(Math.abs(now.right + was.right) < 2 * TOLERANCE_FT && Math.abs(now.ahead) < 2 * TOLERANCE_FT, `${direction} #${id}: ${was.right.toFixed(0)} became ${now.right.toFixed(0)}, ${now.ahead.toFixed(0)} ahead`);
    }
  }
});

test('the Base delay is still a 90\'s: the Delayed 90 is untouched, the 45 waits cot(22.5) = 2.41 times as long', () => {
  const start = (maneuver, turnDeg) => {
    const { startedAt } = fly({ ...BASE, maneuver, turnDeg, formation: 'twoShip', direction: 'right', durationSec: 90 });
    return Math.max(...Object.values(startedAt));
  };
  assert.ok(Math.abs(start('delayed90away', 90) - 16) < 0.1);
  assert.ok(Math.abs(start('delayed45away', 45) - 16 * 2.41421356) < 0.1);
});

test('no aircraft turns further than the 45 (the 90 the wingman starts for is never completed), to within the roll-in step', () => {
  for (const formation of ['twoShip', 'weighted']) {
    for (const direction of ['right', 'left']) {
      const run = createRun({ ...BASE, formation, direction });
      const start = run.state.aircraft.map((a) => a.headingRad);
      let most = 0;
      while (run.step()) run.state.aircraft.forEach((a, i) => { most = Math.max(most, Math.abs(a.headingRad - start[i])); });
      assert.ok(most < Math.PI / 4 + 2e-4 && most > Math.PI / 4 - 2e-4, `${formation} ${direction}: the most any aircraft turned was ${(most * 180 / Math.PI).toFixed(3)} degrees`);
    }
  }
});

test('the run lasts until the last aircraft has turned and 10 s more, so a four-ship Delayed 45 with Auto timing is not cut off at 75 s', () => {
  const run = createRun({ ...DEFAULTS, delayed45Check: 'none', maneuver: 'delayed45away', turnDeg: 45, timing: 'auto', formation: 'weighted', direction: 'right', durationSec: 75 });
  while (run.step());
  assert.equal(run.state.turnComplete, true, 'all four turned');
  // The last start is 3 x 39.05 = 117.2 s, its turn takes 3.2 s, and then 10 s.
  assert.ok(run.state.durationSec > 130 && run.state.durationSec < 132, `${run.state.durationSec}`);
  assert.ok(Math.abs(run.state.tSec - run.state.durationSec) < 0.06);
  // V6's stop at the Duration is one setting away, and leaves two aircraft that never turned.
  const v6 = createRun({ ...DEFAULTS, delayed45Check: 'none', maneuver: 'delayed45away', turnDeg: 45, timing: 'auto', formation: 'weighted', direction: 'right', durationSec: 75, durationCoversTurn: false });
  while (v6.step());
  assert.equal(v6.state.durationSec, 75);
  assert.equal(v6.state.aircraft.filter((a) => !a.done).length, 2);
});

test('a Duration longer than the plan needs is kept', () => {
  const run = createRun({ ...DEFAULTS, maneuver: 'inplace90', durationSec: 200 });
  assert.equal(run.state.durationSec, 200);
});

// Audit R2. The Auto clock position is the Delayed 90 cue (7 o'clock in a right turn: the second aircraft turns BEFORE the first passes
// the tail, Fig 16.15). In the Delayed 45 (Fig 16.16) it turns AFTER the first has gone through the tail: 5 o'clock in a right turn, 7 in a
// left. With the 90's cue the second aircraft turned early and ended near trail.
test('the clock cue with Auto: the Delayed 45 waits for 4:30 in a right turn and 7:30 in a left (the figure\'s 5 and 7, nearest the 38.6 s that rolls out LAB), and ends in LAB on the 45 heading in every formation', () => {
  const LAB_TOLERANCE_FT = 1000; // the cue tolerance is 4 degrees of bearing, about 400 ft of timing either way at 6,000 ft, plus the roll-in step
  for (const formation of ['twoShip', 'weighted', 'weightedReverse', 'offsetBox']) {
    for (const direction of ['right', 'left']) {
      const label = `${formation} ${direction}`;
      const { run, start } = fly({ ...BASE, timing: 'clock', clockCuePos: 'auto', formation, direction });
      assert.equal(run.state.turnComplete, true, `${label}: all turned`);
      const turn = direction === 'right' ? -1 : 1;
      for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad + turn * Math.PI / 4)) < 2e-4, `${label} #${a.id}: on the 45 heading`);
      const ids = formation === 'twoShip' ? [2] : formation === 'offsetBox' ? [2] : [2, 3, 4];
      for (const id of ids) {
        const was = fromLead(start, id);
        const now = fromLead(run.state.aircraft, id);
        assert.ok(Math.abs(now.ahead) < LAB_TOLERANCE_FT, `${label} #${id}: ${now.ahead.toFixed(0)} ft ahead, want abreast`);
        assert.ok(Math.sign(now.right) === -Math.sign(was.right), `${label} #${id}: sides swapped`);
      }
      const cue = run.state.aircraft[1].cue;
      assert.equal(cue.clockPos, direction === 'right' ? 4.5 : 7.5, `${label}: the cue is ${cue.clockPos} o'clock`);
    }
  }
});

test('the clock cue with Auto for the Delayed 90 is unchanged: 7 o\'clock in a right turn, 5 in a left', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...BASE, maneuver: 'delayed90away', turnDeg: 90, timing: 'clock', clockCuePos: 'auto', formation: 'twoShip', direction });
    assert.equal(run.state.aircraft[1].cue.clockPos, direction === 'right' ? 7 : 5);
  }
});

test('the clock cue: the run waits for every aircraft to turn, however short the Duration, up to a hard cap of 300 s (audit yellow)', () => {
  for (const formation of ['twoShip', 'weighted']) {
    const run = createRun({ ...BASE, formation, timing: 'clock', clockCuePos: 'auto', direction: 'right', durationSec: 20 });
    while (run.step());
    assert.equal(run.state.turnComplete, true, `${formation}: all turned though the Duration is 20 s`);
  }
  // A cue that never comes (a cue position the other aircraft never reaches) stops at the cap instead of running for ever.
  const stuck = createRun({ ...BASE, formation: 'twoShip', timing: 'clock', clockCuePos: '1', direction: 'right', durationSec: 20 });
  while (stuck.step());
  assert.equal(stuck.state.turnComplete, false);
  assert.ok(stuck.state.tSec >= 299 && stuck.state.tSec < 301, `stopped at ${stuck.state.tSec}`);
});

test('on the clock cue the run lasts until the last aircraft has turned, and 10 s more', () => {
  const run = createRun({ ...BASE, formation: 'twoShip', timing: 'clock', clockCuePos: 'auto', direction: 'right', durationSec: 20 });
  let doneAt = null;
  while (run.step()) if (doneAt === null && run.state.turnComplete) doneAt = run.state.tSec;
  assert.ok(doneAt !== null && doneAt > 30, `all turned at ${doneAt}`);
  assert.ok(Math.abs(run.state.durationSec - (doneAt + 10)) < 0.11, `duration ${run.state.durationSec} vs ${doneAt} + 10`);
  assert.ok(Math.abs(run.state.tSec - run.state.durationSec) < 0.06);
});
