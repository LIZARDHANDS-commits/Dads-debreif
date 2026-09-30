// The offset box's rear element check: config, status and what it does to #3 and #4.
// V6 itself is compared step by step in tests/golden/turn-sim-run.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { rearCheckConfig } from '../../../src/modules/turn-sim/engine/rear-check.js';

// V6's start (at the set time, whatever #3 and #4 are doing): rearCheckAfterTurns off.
const box = { ...V6_DEFAULTS, rearCheckAfterTurns: false, formation: 'offsetBox', maneuver: 'inplace90', rearCheckOn: true, rearCheckStartSec: 10, rearCheckHoldSec: 2, durationSec: 60 };

test('the check is on only in the offset box, and its numbers are limited as V6 limits them', () => {
  assert.equal(rearCheckConfig({ ...box, formation: 'weighted' }).enabled, false);
  assert.equal(rearCheckConfig({ ...box, rearCheckOn: false }).enabled, false);
  const cfg = rearCheckConfig({ ...box, rearCheckAngleDeg: 500, rearCheckStartSec: -3, rearCheckHoldSec: -1, rearCheckDir: 'right' });
  assert.deepEqual([cfg.enabled, cfg.dir, cfg.angleRad, cfg.startSec, cfg.holdSec], [true, -1, Math.PI / 2, 0, 0]);
  assert.equal(rearCheckConfig({ ...box, rearCheckAngleDeg: 0 }).angleRad, Math.PI / 180);
});

test('the status walks waiting, out, holding, back, complete; #1 and #2 never take part', () => {
  const run = createRun(box);
  assert.equal(run.state.rearCheck.phase, 'waiting');
  const seen = [];
  while (run.step()) {
    const phase = run.state.rearCheck.phase;
    if (seen[seen.length - 1] !== phase) seen.push(phase);
  }
  assert.deepEqual(seen, ['waiting', 'turningOut', 'holding', 'turningBack', 'complete']);
  assert.equal(createRun({ ...box, rearCheckOn: false }).state.rearCheck.phase, 'off');
});

test('from 0 s the check comes first: #3 and #4 swing 20 degrees left and back, then make the planned turn; #1 and #2 turn at once', () => {
  const run = createRun({ ...box, rearCheckStartSec: 0, rearCheckHoldSec: 1, durationSec: 40 });
  run.step();
  const start = run.state.aircraft.map((a) => a.headingRad);
  let peak = 0;
  while (run.step() && run.state.rearCheck.phase !== 'complete') {
    for (const i of [2, 3]) peak = Math.max(peak, Math.abs(run.state.aircraft[i].headingRad - start[i]));
    assert.ok(run.state.aircraft[0].turning || run.state.aircraft[0].done, '#1 turns at once');
  }
  assert.ok(Math.abs(peak - (20 * Math.PI) / 180) < 0.02, `peak ${peak}`);
  assert.equal(run.state.aircraft[2].turning, false);
});

test('Q47: the check starts at its set time or once #3 and #4 have finished turning, whichever is later', () => {
  // A delayed 90 in the offset box: #3 turns from 30 s to 40 s and #4 from 46 s to 56 s, and the check is set for 35 s.
  const base = { ...V6_DEFAULTS, formation: 'offsetBox', maneuver: 'delayed90away', direction: 'right', rearCheckOn: true, rearCheckStartSec: 35, rearCheckHoldSec: 2, durationSec: 120, offsetBox4Timing: 'late' };
  const doneAt = (settings) => {
    const run = createRun(settings);
    const at = {};
    let firstCheckSec = null;
    while (run.step()) {
      for (const a of run.state.aircraft) if (a.done && at[a.id] === undefined) at[a.id] = run.state.tSec;
      if (firstCheckSec === null && ['turningOut', 'holding', 'turningBack', 'complete'].includes(run.state.rearCheck.phase)) firstCheckSec = run.state.tSec;
    }
    return { at, firstCheckSec, run };
  };
  const v6 = doneAt({ ...base, rearCheckAfterTurns: false });
  const q47 = doneAt({ ...base, rearCheckAfterTurns: true });
  const off = doneAt({ ...base, rearCheckOn: false });
  assert.ok(v6.firstCheckSec <= 35.1, 'V6: the check starts at 35 s, in the middle of the turn of #3');
  assert.ok(v6.at[3] > off.at[3] + 1, 'V6: the check postponed the planned turn');
  const both = Math.max(off.at[3], off.at[4]);
  assert.ok(q47.firstCheckSec >= both && q47.firstCheckSec <= both + 0.2, `starts once both are done: ${q47.firstCheckSec} vs ${both}`);
  assert.deepEqual(q47.at, off.at, 'the planned turns finish exactly when they do without the check');
  assert.equal(q47.run.state.rearCheck.phase, 'complete');
  // Set later than both turns: the set time wins.
  const late = doneAt({ ...base, rearCheckStartSec: 90, rearCheckAfterTurns: true });
  assert.ok(late.firstCheckSec >= 90 && late.firstCheckSec <= 90.1, `${late.firstCheckSec}`);
});

test('Q47 is the default; V6 starts the check at its set time', () => {
  assert.equal(rearCheckConfig({ ...box, rearCheckAfterTurns: undefined }).afterTurns, false);
  assert.equal(createRun({ formation: 'offsetBox', rearCheckOn: true }).state.rearCheck.enabled, true);
  assert.equal(rearCheckConfig({ ...box, ...{ rearCheckAfterTurns: true } }).afterTurns, true);
});

test('a new leg clears the check: it runs again in leg 2 (V6 cleared it only on Reset, so leg 2 had none)', () => {
  const run = createRun({ ...box, rearCheckAfterTurns: true, rearCheckStartSec: 20, durationSec: 60 });
  const phasesOfLeg = () => {
    const seen = [];
    while (run.step()) if (seen[seen.length - 1] !== run.state.rearCheck.phase) seen.push(run.state.rearCheck.phase);
    return seen;
  };
  const full = ['waiting', 'turningOut', 'holding', 'turningBack', 'complete'];
  assert.deepEqual(phasesOfLeg(), full);
  run.startLeg();
  assert.equal(run.state.rearCheck.phase, 'waiting', 'cleared at the new leg');
  assert.deepEqual(phasesOfLeg(), full);
});
