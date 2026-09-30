// The Delayed 45 with the check turn (verification N3; SMM 16.19 Figures 16.17, 16.34 and 16.31; decision D148). The figures are described
// here in my own words, with no text copied from the manual.
//
// Reading of Figure 16.17 (two aircraft), both panels: the aircraft that turns first flies its standard 45 (70/3) toward the other.
// The other flies a check turn of 10 to 15 degrees toward the first once the first has established its 45, then turns the rest of its 45
// (45 plus the check) when the first has gone through its tail and reaches about 7 or 5 o'clock (5 in a right turn, 7 in a left). Both roll
// out on the 45 heading. The figure marks two positions for the wingman at the end and notes that the geometry needs extra speed to hold the
// sweep, and that spacing and sweep errors are fixed on the roll-out. So the end state is abreast but tight, not the plain turn's 6,000 ft,
// and the turn takes less time.
// Figure 16.34 (spread 4, right) and Figure 16.31 (box) are in the tests for the four-ship formations and the box below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkSettings } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, maneuver: 'delayed45away', turnDeg: 45, startHeadingDeg: 0, durationSec: 20, timing: 'time', formation: 'twoShip' };

function fly(settings) {
  const run = createRun(settings);
  const start = run.state.aircraft.map((a) => ({ ...a }));
  const startedAt = {};
  const swing = {}; // the most each aircraft turned toward the first turner's side, in degrees, signed by the final turn's way
  let minSepFt = Infinity;
  while (run.step()) {
    const list = run.state.aircraft;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.turning && startedAt[a.id] === undefined) startedAt[a.id] = run.state.tSec;
      const d = (a.headingRad - start[i].headingRad) * 180 / Math.PI;
      swing[a.id] = swing[a.id] || { min: 0, max: 0 };
      swing[a.id].min = Math.min(swing[a.id].min, d);
      swing[a.id].max = Math.max(swing[a.id].max, d);
      for (let j = i + 1; j < list.length; j++) minSepFt = Math.min(minSepFt, Math.hypot(a.xFt - list[j].xFt, a.yFt - list[j].yFt));
    }
  }
  return { run, start, startedAt, swing, minSepFt };
}

const fromLead = (list, id) => {
  const lead = list.find((a) => a.id === 1);
  const b = list.find((a) => a.id === id);
  const h = lead.headingRad;
  const dx = b.xFt - lead.xFt;
  const dy = b.yFt - lead.yFt;
  return { right: dx * Math.sin(h) - dy * Math.cos(h), ahead: dx * Math.cos(h) + dy * Math.sin(h) };
};

test('the setting: delayed45Check is auto by default and the check is 12.5 degrees; auto keeps the two-ship plain', () => {
  assert.equal(DEFAULTS.delayed45Check, 'auto');
  assert.equal(DEFAULTS.checkTurnDeg, 12.5);
  assert.equal(checkSettings({ delayed45Check: 'check' }).delayed45Check, 'check');
  assert.equal(checkSettings({ delayed45Check: 'sideways' }).delayed45Check, 'auto');
  const { startedAt } = fly({ ...BASE, direction: 'right' });
  const second = Math.max(startedAt[1], startedAt[2]);
  assert.ok(Math.abs(second - 38.6) < 0.2, `the plain two-ship Delayed 45 is unchanged: the second turns at ${second}`);
});

test('two-ship with the check, both directions: the first turns 45 at once, the other checks toward it as it establishes, and both roll out on the 45', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, startedAt, swing } = fly({ ...BASE, direction, delayed45Check: 'check' });
    const turn = direction === 'right' ? -1 : 1;
    const [first, second] = startedAt[1] < startedAt[2] ? [1, 2] : [2, 1];
    assert.ok(startedAt[first] < 0.1, `${direction}: #${first} turns at once`);
    assert.ok(startedAt[second] > 2.5 && startedAt[second] < 4, `${direction}: #${second} checks as #${first} establishes its 45, at ${startedAt[second]}`);
    // The check is toward the first: against the 45's way, 12.5 degrees. Nobody turns more than the 45.
    const against = turn === -1 ? swing[second].max : -swing[second].min;
    assert.ok(Math.abs(against - 12.5) < 0.6, `${direction}: the check is ${against.toFixed(1)} degrees toward the first`);
    for (const id of [1, 2]) {
      const most = Math.max(swing[id].max, -swing[id].min);
      assert.ok(most < 45.1, `${direction} #${id}: no more than 45 degrees, ${most.toFixed(2)}`);
    }
    assert.ok(Math.abs(Math.max(swing[first].max, -swing[first].min) - 45) < 0.1 && (turn === -1 ? swing[first].max < 0.1 : swing[first].min > -0.1), 'the first only turns its 45');
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad + turn * Math.PI / 4)) < 2e-4, `${direction} #${a.id}: on the 45 heading`);
  }
});

test('two-ship with the check: rolls out abreast (within 300 ft), sides swapped, and tight of 6,000 ft (the figure\'s sweep to fix), clear of each other', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, minSepFt } = fly({ ...BASE, direction, delayed45Check: 'check' });
    const end = fromLead(run.state.aircraft, 2);
    assert.ok(Math.abs(end.ahead) < 300, `${direction}: ${end.ahead.toFixed(0)} ft ahead, want abreast`);
    assert.ok(Math.sign(end.right) === -Math.sign(fromLead(start, 2).right), `${direction}: sides swapped`);
    // Measured 3,924 ft at 6,000: the check moves the wingman toward the track it then flies. The figure says to fix it on the roll-out.
    assert.ok(Math.abs(end.right) > 3000 && Math.abs(end.right) < 4500, `${direction}: ${Math.abs(end.right).toFixed(0)} ft apart`);
    assert.ok(minSepFt >= 1000, `${direction}: closest pass ${minSepFt.toFixed(0)} ft`);
    assert.deepEqual(run.state.crossings, [], 'no designed crossing');
  }
});

test('two-ship with the check is much shorter than the plain chain: about 40 s where the plain Delayed 45 takes 52', () => {
  const plain = createRun({ ...BASE, direction: 'right', delayed45Check: 'none' });
  while (plain.step());
  const check = createRun({ ...BASE, direction: 'right', delayed45Check: 'check' });
  while (check.step());
  assert.ok(check.state.durationSec < plain.state.durationSec - 8, `check ${check.state.durationSec.toFixed(1)} s, plain ${plain.state.durationSec.toFixed(1)} s`);
});

test('the check is a setting, 10 to 15 degrees: every value in the band flies the check and rolls out on the 45', () => {
  for (const checkTurnDeg of [10, 12.5, 15]) {
    const { run, start, swing } = fly({ ...BASE, direction: 'right', delayed45Check: 'check', checkTurnDeg });
    assert.ok(Math.abs(swing[2].max - checkTurnDeg) < 0.6 || Math.abs(swing[1].max - checkTurnDeg) < 0.6, `${checkTurnDeg}: swing ${JSON.stringify(swing)}`);
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad - Math.PI / 4)) < 2e-4);
  }
});

test('the clock cue flies the plain turn (its cue is the plan), whatever the check setting says', () => {
  const run = createRun({ ...BASE, direction: 'right', delayed45Check: 'check', timing: 'clock', clockCuePos: 'auto', durationSec: 100 });
  const swing = { min: 0, max: 0 };
  const h0 = run.state.aircraft[1].headingRad;
  while (run.step()) {
    const d = (run.state.aircraft[1].headingRad - h0) * 180 / Math.PI;
    swing.min = Math.min(swing.min, d);
    swing.max = Math.max(swing.max, d);
  }
  assert.ok(swing.max < 0.1, 'no check turn to the left');
});
