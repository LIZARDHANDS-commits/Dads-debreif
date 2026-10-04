// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Turn logic and the turning order, in plain facts (the golden test pins V6 itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const flyAll = (run) => { while (run.step()); };
const byId = (run, id) => run.state.aircraft.find((a) => a.id === id);

test('D41: "toward cue aircraft" turns #3 toward Lead, and "away" turns it away (V6 had them swapped)', () => {
  for (const [logic, sign] of [['toward', 1], ['away', -1]]) {
    // Heading east: Lead is on #3's left (north of it), so toward is a left turn, +heading.
    const run = createRun({ ...V6_DEFAULTS, maneuver: 'inplace90', formation: 'weighted', [aircraftKey(3, 'turnLogic')]: logic });
    flyAll(run);
    assert.ok(Math.abs(byId(run, 3).headingRad - sign * Math.PI / 2) < 2e-4, `${logic} #3 ${byId(run, 3).headingRad}`);
    assert.ok(byId(run, 1).headingRad < 0, 'Lead still turns the selected direction (right)');
  }
});

test('a cue aircraft other than Lead: toward #2 from #3 is toward where #2 is', () => {
  const run = createRun({ ...V6_DEFAULTS, maneuver: 'inplace90', [aircraftKey(3, 'turnLogic')]: 'toward', [aircraftKey(3, 'clockTarget')]: '2' });
  flyAll(run);
  // #2 is farther to #3's left than Lead, so toward is still a left turn.
  assert.ok(byId(run, 3).headingRad > 0);
});
