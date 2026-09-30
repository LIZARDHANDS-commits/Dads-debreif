// The Delayed 45's check turn and roll-in boxes do nothing when the check is not flown, and the screen says so (#223 re-check C2, C5).
// delayed45CheckReason must agree with the engine, so the boxes are never greyed when they would act, or live when they would not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, delayed45CheckReason } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const D45 = { ...DEFAULTS, maneuver: 'delayed45away', turnDeg: 45, startHeadingDeg: 0, durationSec: 5 };

test('agrees with the engine for every formation, style and timing: a reason exactly when the check is not flown', () => {
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox', 'twoShip']) {
    for (const delayed45Check of ['auto', 'none', 'check']) {
      for (const timing of ['time', 'clock', 'auto']) {
        const settings = { ...D45, formation, delayed45Check, timing };
        const flown = createRun(settings).state.delayed45CheckFlown;
        assert.equal(delayed45CheckReason(settings) === null, flown, `${formation} ${delayed45Check} ${timing}`);
      }
    }
  }
});

test('the reason is in words for the pilot, and says which setting stops the check', () => {
  assert.equal(delayed45CheckReason({ ...D45, timing: 'clock', delayed45Check: 'check' }), 'The clock cue flies the plain 45, so the check turn is not used.');
  assert.match(delayed45CheckReason({ ...D45, delayed45Check: 'none' }), /Plain/);
  assert.match(delayed45CheckReason({ ...D45, formation: 'twoShip', delayed45Check: 'auto' }), /two-ship/);
  assert.equal(delayed45CheckReason({ ...D45, formation: 'weighted' }), null);
});

test('a turn other than the Delayed 45 has no reason: its boxes are hidden, not greyed', () => {
  assert.equal(delayed45CheckReason({ ...D45, maneuver: 'delayed90away' }), null);
});
