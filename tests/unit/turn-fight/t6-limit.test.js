// The T-6 limit warning beside a G box (SPEC-turn-fight, "T-6 limit warning").
import test from 'node:test';
import assert from 'node:assert/strict';
import { T6_STALL_SPEED_KT, T6_MAX_G, stallLimitG, limitWarning } from '../../../src/modules/turn-fight/t6-limit.js';

test('the stall line is G = (speed / 86 kt) squared, and reaches 7 G at about 227.5 kt', () => {
  assert.equal(T6_STALL_SPEED_KT, 86);
  assert.equal(stallLimitG(86), 1);
  assert.equal(stallLimitG(172), 4);
  assert.ok(Math.abs(stallLimitG(227.5) - 7) < 0.02);
  assert.equal(T6_MAX_G, 7);
});

test('V6\'s default, 220 KTAS at 4 G, is inside the limit (6.5 G), so there is no warning', () => {
  assert.equal(stallLimitG(220).toFixed(1), '6.5');
  assert.equal(limitWarning(220, 4), null);
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
