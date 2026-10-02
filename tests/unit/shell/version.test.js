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
import { updatedLabel } from '../../../src/shell/version.js';

test('the footer says when this copy was published, in Zulu', () => {
  assert.equal(updatedLabel('2026-09-30T02:01:13Z'), 'Updated 30 Sep 2026, 02:01Z');
  assert.equal(updatedLabel('2026-01-05T23:59:59.999Z'), 'Updated 5 Jan 2026, 23:59Z');
});

test('a copy without a build time says it is a development copy', () => {
  assert.equal(updatedLabel(undefined), 'Development copy');
  assert.equal(updatedLabel('not a time'), 'Development copy');
});
