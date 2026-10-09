// Checks: from the front seat's eye, head straight ahead in level flight, the horizon shows through the windscreen:
// the forward canopy bow's crest is above the eye's level line and the glareshield's top is below it.
// Serves: the Formation Sim's CT-156 cockpit interior (docs/modules/turn-sim/plan.md; TS-154).
// Expected values: what a pilot recognises from the front seat of a CT-156: the horizon sits over the glareshield and
// under the windscreen's bow. The bands (0° to 25° up, 0° to 25° down) are deliberately wide, not the shared ±5°:
// the eye point and the panel are estimates until Patrick rules, and the check is only which side of the level line
// each one falls. Pure geometry, no WebGL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { panelAnglesFrom, EYE_FT } from '../../../src/ui-kit/ct156-cockpit.js';

test('the horizon shows between the glareshield and the forward canopy bow from the front seat', () => {
  const { bowCrestDeg, glareshieldDeg } = panelAnglesFrom(EYE_FT);
  assert.ok(bowCrestDeg > 0 && bowCrestDeg < 25, `the forward bow's crest is ${bowCrestDeg.toFixed(1)}° from the eye line, wanted above it (0° to 25°)`);
  assert.ok(glareshieldDeg < 0 && glareshieldDeg > -25, `the glareshield's top is ${glareshieldDeg.toFixed(1)}° from the eye line, wanted below it (-25° to 0°)`);
});
