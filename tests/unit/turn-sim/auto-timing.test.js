// Auto timing, stated in plain facts (the golden run test pins the flying to V6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const V6 = { ...V6_DEFAULTS, timing: 'auto' };

/** The time each aircraft first turns, by id. */
function startTimes(settings) {
  const run = createRun(settings);
  const first = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && first[a.id] === undefined) first[a.id] = run.state.tSec;
  return { first, run };
}

test('D43: with auto timing the outside aircraft turns first and each follows at its own time, without waiting for Lead', () => {
  const { first, run } = startTimes({ ...V6, durationSec: 200 });
  const step = run.state.autoStepSec;
  // 4312 turning right: #2 is outside, then Lead, #3, #4, one step apart.
  assert.ok(first[2] < 0.1, `#2 starts at once, not when Lead starts: ${first[2]}`);
  for (const [id, n] of [[1, 1], [3, 2], [4, 3]]) assert.ok(Math.abs(first[id] - n * step) < 0.1, `#${id} ${first[id]} vs ${n * step}`);
});

test('the auto step is shown in state and never written into Base delay', () => {
  const settings = { ...V6, baseDelaySec: 7 };
  const run = createRun(settings);
  assert.equal(run.state.autoStepSec, null); // nothing planned yet
  run.step();
  assert.ok(run.state.autoStepSec > 0);
  assert.equal(settings.baseDelaySec, 7);
  // Base delay itself has no effect on auto timing.
  const other = createRun({ ...settings, baseDelaySec: 30 });
  other.step();
  assert.equal(other.state.autoStepSec, run.state.autoStepSec);
});

test('the step is only there for a delayed turn with Timing = auto', () => {
  for (const [timing, maneuver] of [['time', 'delayed90away'], ['auto', 'hook90'], ['auto', 'inplace90']]) {
    const run = createRun({ ...V6, timing, maneuver });
    run.step();
    assert.equal(run.state.autoStepSec, null, `${timing} ${maneuver}`);
  }
  assert.ok(DEFAULTS.timing === 'time');
});
