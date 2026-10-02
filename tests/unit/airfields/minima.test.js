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

test("not set (D71 fallback): exactly V6's single 600-2, marked not checked", () => {
  const m = alternateMinima({ approach: 'not-set' });
  assert.deepEqual(m.options, [pair(600, 2)]);
  assert.equal(m.checked, false);
  assert.deepEqual(alternateMinima({}).options, [pair(600, 2)]);
  assert.deepEqual(alternateMinima({ approach: 'bogus' }).options, [pair(600, 2)]);
});

test('CAP GEN: two or more precision approaches to separate runways give 400-1', () => {
  const m = alternateMinima({ approach: 'two-precision' });
  assert.deepEqual(m.options, [pair(400, 1)]);
  assert.equal(m.checked, true);
});

test('CAP GEN: one precision approach gives 600-2, with the 700-1½ and 800-1 trade-offs', () => {
  assert.deepEqual(opts({ approach: 'one-precision' }), [pair(600, 2), pair(700, 1.5), pair(800, 1)]);
});

test('CAP GEN: non-precision only gives 800-2, with the 900-1½ and 1000-1 trade-offs', () => {
  assert.deepEqual(opts({ approach: 'non-precision' }), [pair(800, 2), pair(900, 1.5), pair(1000, 1)]);
});

test('CAP GEN / D73: GNSS only counts as non-precision (no LPV credit)', () => {
  assert.deepEqual(opts({ approach: 'gnss-only' }), opts({ approach: 'non-precision' }));
});

test('CAP GEN "whichever is greater", ceiling and visibility separately: one precision, HAT 350, ¾ SM gives 700-2 only', () => {
  assert.deepEqual(opts({ approach: 'one-precision', lowestHatFt: 350, lowestVisSm: 0.75 }), [pair(700, 2)]);
});

test('CAP GEN: when the standard values win, the trade-offs still apply', () => {
  assert.deepEqual(
    opts({ approach: 'one-precision', lowestHatFt: 200, lowestVisSm: 0.5 }),
    [pair(600, 2), pair(700, 1.5), pair(800, 1)],
  );
});

test('CAP GEN: 200-½ above the lowest HAT for two precision approaches', () => {
  assert.deepEqual(opts({ approach: 'two-precision', lowestHatFt: 250, lowestVisSm: 0.75 }), [pair(500, 1.25)]);
});

test('CAP GEN: 300-1 above the lowest HAA for non-precision', () => {
  assert.deepEqual(opts({ approach: 'non-precision', lowestHatFt: 580, lowestVisSm: 1.5 }), [pair(900, 2.5)]);
});

test('CAP GEN: a computed visibility is never more than 3 SM', () => {
  assert.deepEqual(opts({ approach: 'non-precision', lowestHatFt: 500, lowestVisSm: 2.5 }), [pair(800, 3)]);
});

test('CAP GEN: only the HAT entered raises only the ceiling; no numbers entered gives the standard values', () => {
  assert.deepEqual(opts({ approach: 'one-precision', lowestHatFt: 480 }), [pair(800, 2)]);
  assert.deepEqual(opts({ approach: 'one-precision', lowestVisSm: 1.5 }), [pair(600, 2.5)]);
});

test('CAP GEN rounding: up to 20 ft over a hundred rounds down, more rounds up', () => {
  assert.equal(roundCeilingFt(420), 400);
  assert.equal(roundCeilingFt(421), 500);
  assert.equal(roundCeilingFt(400), 400);
  assert.equal(roundCeilingFt(499), 500);
  // HAT 320 + 300 = 620, rounds to 600: the standard 600-2 wins, trade-offs apply.
  assert.deepEqual(opts({ approach: 'one-precision', lowestHatFt: 320 }), [pair(600, 2), pair(700, 1.5), pair(800, 1)]);
});

test('D72: landing minima for PROB groups are the lowest HAT and its visibility', () => {
  assert.deepEqual(landingMinima({ lowestHatFt: 250, lowestVisSm: 0.75 }), pair(250, 0.75));
});

test('D72: without both numbers there are no landing minima (wx then lists PROB as unchecked)', () => {
  assert.equal(landingMinima({}), null);
  assert.equal(landingMinima({ lowestHatFt: 250 }), null);
  assert.equal(landingMinima({ lowestVisSm: 0.75 }), null);
});

test('options returned are fresh copies, so a caller cannot change the table', () => {
  opts({ approach: 'one-precision' })[0].ceilingFt = 1;
  assert.deepEqual(opts({ approach: 'one-precision' })[0], pair(600, 2));
});

test('D80: no IFR approach gives no table minima; the visual descent from the MEA is the whole test', () => {
  assert.ok(APPROACH_TYPES.includes('no-ifr'));
  const m = alternateMinima({ approach: 'no-ifr', lowestHatFt: 300, lowestVisSm: 1 });
  assert.deepEqual([m.approach, m.checked, m.options], ['no-ifr', true, null]);
});

test('D80: visual descent from the MEA, default 3 SM; GNSS-only only once an MEA is entered, no-IFR always (so wx says incomplete, never 600-2)', () => {
  assert.deepEqual(visualDescent({ approach: 'gnss-only', meaFt: 4000, elevationFt: 1892 }), { meaFt: 4000, elevationFt: 1892, visSm: 3 });
  assert.deepEqual(visualDescent({ approach: 'no-ifr', meaFt: 4000, elevationFt: null, visualDescentVisSm: 5 }), { meaFt: 4000, elevationFt: null, visSm: 5 });
  assert.deepEqual(visualDescent({ approach: 'no-ifr' }), { meaFt: null, elevationFt: null, visSm: 3 });
  assert.equal(visualDescent({ approach: 'gnss-only', elevationFt: 1892 }), null);
  assert.equal(visualDescent({ approach: 'one-precision', meaFt: 4000, elevationFt: 1892 }), null);
});
