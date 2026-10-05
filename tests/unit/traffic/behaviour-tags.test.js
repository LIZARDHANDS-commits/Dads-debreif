// Checks: the tag round the lap names only the pattern, [OHB] or [SI], and past the window it is the landing behaviour
// (T+GO, STOP, GO AROUND); a route's own line thickness and opacity are read safely.
// Serves: Patrick, 4 Oct ("just say [OHB] or [SI], not what they are doing next"; "once they pass the window aircraft
// display their landing behaviour"; the Display box's thickness and opacity per route).
import test from 'node:test';
import assert from 'node:assert/strict';
import { behaviourOf, behaviourLabel } from '../../../src/modules/traffic/behaviour.js';
import { lineScale, lineOpacity } from '../../../src/modules/traffic/map2d.js';

const pattern = { kind: 'pattern', id: 'PAT1' };
const label = (a, ctx) => behaviourLabel(behaviourOf({ active: true, ...a }, { route: pattern, fieldElevFt: 1892, ...ctx }));

test('round the lap the tag is only [OHB] or [SI]', () => {
  for (const phase of ['climb', 'crosswind', 'outer_downwind', 'initial', 'break', 'downwind', 'final_turn']) {
    assert.equal(label({ phase, kt: 130 }), '[OHB]', phase);
  }
  assert.equal(label({ phase: 'outer_downwind', siPattern: true, kt: 220 }), '[SI]');
  assert.equal(label({ phase: 'downwind', kt: 120 }), '[OHB]', 'no configuration either');
});

test('past the window on final the tag is the landing behaviour', () => {
  const past = { onFinal: true, toThresholdFt: 3000, windowFt: 4557 };
  assert.equal(label({ phase: 'final', intent: 'touch_and_go' }, past), '[T+GO]');
  assert.equal(label({ phase: 'final', intent: 'full_stop' }, past), '[STOP]');
  assert.equal(label({ phase: 'final', intent: 'go_around' }, past), '[GO AROUND]');
  assert.equal(label({ phase: 'final', intent: 'touch_and_go', rndLowApproach: true }, past), '[GO AROUND]', 'a low approach goes around');
  assert.equal(label({ phase: 'final', intent: 'full_stop' }, { ...past, toThresholdFt: 6000 }), '[OHB]', 'not yet past the window');
});

test('a route line\'s thickness and opacity fall back to its usual look', () => {
  assert.equal(lineScale({}), 1);
  assert.equal(lineScale({ lineScale: 2.5 }), 2.5);
  assert.equal(lineScale({ lineScale: -1 }), 1);
  assert.equal(lineOpacity({}), 1);
  assert.equal(lineOpacity({ lineOpacity: 0.4 }), 0.4);
  assert.equal(lineOpacity({ lineOpacity: 3 }), 1);
});
