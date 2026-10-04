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

import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBadge } from '../../../src/shell/home.js';

const built = () => {};

test('a module that is not built yet is marked Coming soon, prototype or not', () => {
  assert.equal(cardBadge({ load: null }), 'Coming soon');
  assert.equal(cardBadge({ load: null, prototype: true }), 'Coming soon');
});

test('a built module carries PROTOTYPE until the combined sign-off (D135)', () => {
  assert.equal(cardBadge({ load: built, prototype: true }), 'PROTOTYPE');
});

test('a built module without the prototype flag has no badge', () => {
  assert.equal(cardBadge({ load: built }), null);
  assert.equal(cardBadge({ load: built, prototype: false }), null);
});
