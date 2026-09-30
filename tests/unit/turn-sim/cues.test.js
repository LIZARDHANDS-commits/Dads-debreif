// The clock cue, in plain facts (the golden run test pins the flying to V6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
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
