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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPROACH_TYPES, alternateMinima, landingMinima, roundCeilingFt, visualDescent } from '../../../src/airfields/minima.js';

const pair = (ceilingFt, visSm) => ({ ceilingFt, visSm });
const opts = (field) => alternateMinima(field).options;

test('approach types offered: not set, two precision, one precision, non-precision, GNSS only, no IFR approach', () => {
  assert.deepEqual(APPROACH_TYPES, ['not-set', 'two-precision', 'one-precision', 'non-precision', 'gnss-only', 'no-ifr']);
});

// SOF-R12: an airfield with no approach set is not judged by a quiet 600-2; the fallback is marked not checked,
// and the SOF turns that into amber "Incomplete". The 600-2 here is only a placeholder carried with the unchecked flag.
test('not set: the placeholder 600-2 is marked not checked (SOF-R12 reads this as Incomplete)', () => {
  const m = alternateMinima({ approach: 'not-set' });
  assert.deepEqual(m.options, [pair(600, 2)]);
  assert.equal(m.checked, false);
  assert.deepEqual(alternateMinima({}).options, [pair(600, 2)]);
  assert.deepEqual(alternateMinima({ approach: 'bogus' }).options, [pair(600, 2)]);
});

test('two or more precision approaches to separate runways give 400-1 (Gen Book p. 7)', () => {
  const m = alternateMinima({ approach: 'two-precision' });
  assert.deepEqual(m.options, [pair(400, 1)]);
  assert.equal(m.checked, true);
});

// 600-2: Gen Book p. 7. The 700-1½ and 800-1 trade-offs are from CAP GEN "Operating Minima - Alternate" (page not recorded).
test('one precision approach gives 600-2, with the 700-1½ and 800-1 trade-offs (Gen Book p. 7; CAP GEN)', () => {
  assert.deepEqual(opts({ approach: 'one-precision' }), [pair(600, 2), pair(700, 1.5), pair(800, 1)]);
});

// 800-2: Gen Book p. 7. The 900-1½ and 1000-1 trade-offs are from CAP GEN (page not recorded).
test('non-precision only gives 800-2, with the 900-1½ and 1000-1 trade-offs (Gen Book p. 7; CAP GEN)', () => {
  assert.deepEqual(opts({ approach: 'non-precision' }), [pair(800, 2), pair(900, 1.5), pair(1000, 1)]);
});

test('GNSS only counts as non-precision, no LPV credit (Gen Book p. 7 note; D73)', () => {
  assert.deepEqual(opts({ approach: 'gnss-only' }), opts({ approach: 'non-precision' }));
});

// By hand, Gen Book p. 7: ceiling is the higher of 600 and HAT + 300 = 650, so 700 after rounding; visibility the higher of 2 and 0.75 + 1 = 1.75, so 2.
test('"whichever is higher", ceiling and visibility separately: one precision, HAT 350, ¾ SM gives 700-2 only (Gen Book p. 7)', () => {
  assert.deepEqual(opts({ approach: 'one-precision', lowestHatFt: 350, lowestVisSm: 0.75 }), [pair(700, 2)]);
});

test('when the standard values win, the trade-offs still apply (Gen Book p. 7; CAP GEN)', () => {
  assert.deepEqual(
    opts({ approach: 'one-precision', lowestHatFt: 200, lowestVisSm: 0.5 }),
    [pair(600, 2), pair(700, 1.5), pair(800, 1)],
  );
});

// By hand, Gen Book p. 7: ceiling the higher of 400 and HAT + 200 = 450, rounded up to 500; visibility the higher of 1 and 0.75 + 0.5 = 1.25.
test('two precision approaches: 200-½ above the lowest HAT (Gen Book p. 7)', () => {
  assert.deepEqual(opts({ approach: 'two-precision', lowestHatFt: 250, lowestVisSm: 0.75 }), [pair(500, 1.25)]);
});

// By hand, Gen Book p. 7: ceiling the higher of 800 and 580 + 300 = 880, rounded up to 900; visibility the higher of 2 and 1.5 + 1 = 2.5.
test('non-precision: 300-1 above the lowest HAA (Gen Book p. 7)', () => {
  assert.deepEqual(opts({ approach: 'non-precision', lowestHatFt: 580, lowestVisSm: 1.5 }), [pair(900, 2.5)]);
});

test('a computed visibility is never more than 3 SM (CAP GEN, page not recorded)', () => {
  assert.deepEqual(opts({ approach: 'non-precision', lowestHatFt: 500, lowestVisSm: 2.5 }), [pair(800, 3)]);
});

test('only the HAT entered raises only the ceiling; no numbers entered gives the standard values (Gen Book p. 7)', () => {
  assert.deepEqual(opts({ approach: 'one-precision', lowestHatFt: 480 }), [pair(800, 2)]);
  assert.deepEqual(opts({ approach: 'one-precision', lowestVisSm: 1.5 }), [pair(600, 2.5)]);
});

test('rounding: up to 20 ft over a hundred rounds down, more rounds up (CAP GEN, page not recorded)', () => {
  assert.equal(roundCeilingFt(420), 400);
  assert.equal(roundCeilingFt(421), 500);
  assert.equal(roundCeilingFt(400), 400);
  assert.equal(roundCeilingFt(499), 500);
  // HAT 320 + 300 = 620, rounds to 600: the standard 600-2 wins, trade-offs apply.
  assert.deepEqual(opts({ approach: 'one-precision', lowestHatFt: 320 }), [pair(600, 2), pair(700, 1.5), pair(800, 1)]);
});

test('landing minima for PROB groups are the lowest HAT and its visibility (Gen Book p. 7; D72)', () => {
  assert.deepEqual(landingMinima({ lowestHatFt: 250, lowestVisSm: 0.75 }), pair(250, 0.75));
});

test('without both numbers there are no landing minima (D72; SOF-R12 has the SOF read that as Incomplete)', () => {
  assert.equal(landingMinima({}), null);
  assert.equal(landingMinima({ lowestHatFt: 250 }), null);
  assert.equal(landingMinima({ lowestVisSm: 0.75 }), null);
});

test('options returned are fresh copies, so a caller cannot change the table', () => {
  opts({ approach: 'one-precision' })[0].ceilingFt = 1;
  assert.deepEqual(opts({ approach: 'one-precision' })[0], pair(600, 2));
});

test('no IFR approach gives no table minima; the visual descent from the MEA is the whole test (Gen Book p. 7; D80)', () => {
  assert.ok(APPROACH_TYPES.includes('no-ifr'));
  const m = alternateMinima({ approach: 'no-ifr', lowestHatFt: 300, lowestVisSm: 1 });
  assert.deepEqual([m.approach, m.checked, m.options], ['no-ifr', true, null]);
});

test('visual descent from the MEA (Gen Book p. 7; D80, Patrick\'s ruling), default 3 SM; GNSS-only only once an MEA is entered, no-IFR always (so wx says incomplete, never 600-2)', () => {
  assert.deepEqual(visualDescent({ approach: 'gnss-only', meaFt: 4000, elevationFt: 1892 }), { meaFt: 4000, elevationFt: 1892, visSm: 3 });
  assert.deepEqual(visualDescent({ approach: 'no-ifr', meaFt: 4000, elevationFt: null, visualDescentVisSm: 5 }), { meaFt: 4000, elevationFt: null, visSm: 5 });
  assert.deepEqual(visualDescent({ approach: 'no-ifr' }), { meaFt: null, elevationFt: null, visSm: 3 });
  assert.equal(visualDescent({ approach: 'gnss-only', elevationFt: 1892 }), null);
  assert.equal(visualDescent({ approach: 'one-precision', meaFt: 4000, elevationFt: 1892 }), null);
});
