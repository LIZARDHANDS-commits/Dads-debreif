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

// The Correction model, in plain facts (the golden run test pins the G fix path to V6; core pins turnSimG).
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, DEFAULTS, aircraftKey } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const byId = (run, id) => run.state.aircraft.find((a) => a.id === id);

test('the Correction model is off by default (Q41)', () => {
  assert.equal(DEFAULTS.correction, 'none');
  assert.equal(V6_DEFAULTS.correction, 'none');
});

test('with no correction the G is the G setting plus the aircraft\'s own error, for every aircraft, all run long', () => {
  const run = createRun({ ...V6_DEFAULTS, baseG: 3, [aircraftKey(3, 'gError')]: 0.5 });
  while (run.step()) assert.deepEqual(run.state.aircraft.map((a) => a.g), [3, 3, 3.5, 3]);
});

test('D74: G fix at base G 1.2 with a large error gives no NaN, and the wingman flies at the 1.01 floor', () => {
  // #2 starts 3,000 ft too close (tight). G fix wants to ease its G by the full 0.8: 1.2 - 0.8 = 0.4 G, which V6 turned into NaN.
  const run = createRun({
    ...V6_DEFAULTS, correction: 'gfix', correctionStrength: 2, baseG: 1.2, maneuver: 'inplace90', durationSec: 60,
    [aircraftKey(2, 'positionErrorOn')]: true, [aircraftKey(2, 'lateralDir')]: 'tight', [aircraftKey(2, 'lateralFt')]: 3000,
  });
  let floor = false;
  while (run.step()) {
    for (const a of run.state.aircraft) {
      for (const v of [a.xFt, a.yFt, a.headingRad, a.g, a.bankDeg]) assert.ok(Number.isFinite(v), `#${a.id} t=${run.state.tSec}`);
      assert.ok(a.g >= 1.01, `#${a.id} g=${a.g}`);
    }
    if (byId(run, 2).g === 1.01) floor = true;
  }
  assert.ok(floor, '#2 reached the floor');
  for (const row of run.history()) assert.ok(Number.isFinite(row.minSepFt));
});

test('G fix never corrects Lead, and pulls a wingman that is too far back harder and one that is too close less', () => {
  const g2 = (lateralDir) => {
    const run = createRun({
      ...V6_DEFAULTS, correction: 'gfix', correctionStrength: 1, baseG: 3, maneuver: 'inplace90',
      [aircraftKey(2, 'positionErrorOn')]: true, [aircraftKey(2, 'lateralDir')]: lateralDir, [aircraftKey(2, 'lateralFt')]: 1500,
    });
    run.step();
    return [byId(run, 1).g, byId(run, 2).g];
  };
  const [leadWide, wide] = g2('wide');
  const [leadTight, tight] = g2('tight');
  assert.equal(leadWide, 3);
  assert.equal(leadTight, 3);
  assert.ok(wide > 3 && tight < 3, `${wide} ${tight}`);
  assert.ok(Math.abs(wide - 3.25) < 0.01 && Math.abs(tight - 2.75) < 0.01, 'a 1,500 ft error is 0.25 G at strength 1 (1,500 / 6,000)');
});
