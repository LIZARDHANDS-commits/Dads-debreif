// Checks: a flat practice-bomb pass from the default start, in still air over flat ground, flown by the Run-in Simulator's
//   pilot and released at the computed air release point, puts the bomb on the aim point, and the aircraft stays above the
//   ground the whole way through the escape (what a pilot would recognise: it hit, and it got away).
// Serves: RS-R4, RS-R6 and RS-R9 (docs/modules/run-in-sim/testing.md, the one light test; plan Step 5).
// Expected values: the aim point the test sets (the origin) and the ground the test lays (flat, 1,800 ft); nothing from
//   the code's own output or V6. The miss margin is the shared table's ±100 ft (tests/helpers/tolerances.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { flyPass } from '../../../src/modules/run-in-sim/pass.js';
import { DEFAULTS, runPatch, setupFrom } from '../../../src/modules/run-in-sim/defaults.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

test('a flat practice-bomb pass released at the CARP hits the aim point, and the escape stays above the ground', () => {
  const groundFt = 1800; // flat ground, about Moose Jaw's height
  const world = { groundAt: () => groundFt, known: () => true };
  const settings = { ...DEFAULTS, ...runPatch('bombFlat'), releaseMode: 'carp', windTopKt: 0, windGroundKt: 0 };
  const { flight, fall } = flyPass(setupFrom(settings), world);

  assert.ok(flight.release, 'the bomb is released');
  assert.ok(fall?.landed, 'the bomb lands');
  const missFt = Math.hypot(fall.impact.x - 0, fall.impact.y - 0); // the aim point is the origin
  assert.ok(missFt <= TOLERANCES.DISTANCE_FT, `the bomb lands ${missFt.toFixed(0)} ft from the aim point`);

  assert.ok(flight.events.safe !== undefined, 'the escape settles at its height');
  const tl = flight.timeline;
  for (let i = 0; i < tl.t.length; i++) {
    assert.ok(tl.z[i] > groundFt, `above the ground at ${tl.t[i].toFixed(1)} s (${(tl.z[i] - groundFt).toFixed(0)} ft)`);
  }
});
