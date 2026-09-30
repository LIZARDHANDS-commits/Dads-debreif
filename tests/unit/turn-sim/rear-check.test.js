// The offset box's rear element check: config, status and what it does to #3 and #4.
// V6 itself is compared step by step in tests/golden/turn-sim-run.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { rearCheckConfig } from '../../../src/modules/turn-sim/engine/rear-check.js';

const box = { ...V6_DEFAULTS, formation: 'offsetBox', maneuver: 'inplace90', rearCheckOn: true, rearCheckStartSec: 10, rearCheckHoldSec: 2, durationSec: 60 };

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
