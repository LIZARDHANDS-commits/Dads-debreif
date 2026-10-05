// Checks: the warning beside a G box: none at a normal speed and G, one naming the speed and limit above the
//   T-6A's stall line, none exactly on it, and the 7 G cap.
// Serves: TF-R4.
// Expected values: stall line G = (speed / 86 kt)^2 and 7 G cap from the shared limit table (circular); 86 kt
//   is Patrick's ruling SH-25, 7 G is NFM p.5-9; the title's "V6's default" (4 G) is a label only, the default
//   is now 5 G.

// The T-6 limit warning beside a G box (SPEC-turn-fight, "T-6 limit warning").
import test from 'node:test';
import assert from 'node:assert/strict';
import { T6A_LIMITS, stallLimitG } from '../../../src/core/t6-performance.js';
import { limitWarning } from '../../../src/modules/turn-fight/t6-limit.js';

test('the limits are core\'s: the stall line is G = (speed / 86 kt) squared, capped at 7 G, reached at about 227.5 kt', () => {
  assert.equal(T6A_LIMITS.stallKias, 86);
  assert.equal(T6A_LIMITS.maxG, 7);
  assert.equal(stallLimitG(86), 1);
  assert.equal(stallLimitG(172), 4);
  assert.ok(Math.abs(stallLimitG(227.5) - 7) < 0.02);
});

test('a G above the stall line names the speed and the limit, rounded down so it never overstates it', () => {
  assert.equal(limitWarning(120, 4), "4.0 G is above the T-6's stall limit at 120 kt (1.9 G)");
  assert.equal(limitWarning(172, 4.5), "4.5 G is above the T-6's stall limit at 172 kt (4.0 G)");
  assert.equal(limitWarning(120, 1.95), "1.95 G is above the T-6's stall limit at 120 kt (1.9 G)");
});

test('exactly on the limit is not above it', () => {
  assert.equal(limitWarning(172, 4), null);
  assert.equal(limitWarning(400, 7), null);
});

test('above the 7 G cap, at a speed where the wing could pull more', () => {
  assert.equal(limitWarning(300, 8), "Above the T-6's 7 G limit");
  assert.equal(limitWarning(400, 9), "Above the T-6's 7 G limit");
  assert.equal(limitWarning(228, 7.5), "Above the T-6's 7 G limit");
});

test('below the stall speed where both apply, the stall line is the one that bites', () => {
  assert.match(limitWarning(120, 8), /stall limit at 120 kt/);
});

test('a bad number gives no warning (the box refuses it)', () => {
  assert.equal(limitWarning(Number.NaN, 4), null);
  assert.equal(limitWarning(220, Number.NaN), null);
  assert.equal(limitWarning(0, 4), null);
});
