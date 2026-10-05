// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// Slowing down in the Formation Sim (docs/modules/turn-sim/decisions.md TS-61, slow-down.js). Light checks of what a
// pilot would recognise: each stage slows harder than the one before it in Patrick's order of use (power, boards, idle,
// idle and boards); idle alone, level at 200 KIAS, is about the 5 kt/s Patrick confirmed (5 Oct 00:11Z); a planned
// slow-down never asks more than the stage it is flown with gives; and the core drag curve is not changed by any of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, slowKtps, slowRampKtps, speedSegFor } from '../../../src/modules/turn-sim/live/slow-down.js';
import { smoother, smootherSlope } from '../../../src/modules/turn-sim/live/flight.js';
import { dragPerWeight } from '../../../src/core/t6-performance.js';

test('each slowing stage slows harder than the one before it, at every rejoin speed (TS-61 order of use)', () => {
  for (const kias of [140, 170, 200, 230, 260]) {
    for (let i = 1; i < STAGES.length; i++) {
      assert.ok(slowKtps(STAGES[i], kias, 8000) > slowKtps(STAGES[i - 1], kias, 8000), `${STAGES[i]} slows harder than ${STAGES[i - 1]} at ${kias} KIAS`);
    }
    assert.ok(slowKtps('power', kias, 8000) > 0, 'even with power back the aircraft slows when level');
  }
});

test('idle alone, level at 200 KIAS, slows about 5 kt/s (Patrick, 5 Oct 00:11Z: "probably closer to 5")', () => {
  // Margin 1 kt/s: his number is a pilot's estimate ("probably closer to 5"), not a measured one.
  const idle = slowKtps('idle', 200, 3000);
  assert.ok(Math.abs(idle - 5) <= 1, `idle at 200 KIAS slows ${idle.toFixed(2)} kt/s`);
});

test('a planned slow-down never asks more than the stage it is flown with gives', () => {
  for (const stage of STAGES) {
    const from = 240;
    const to = 200;
    const seg = speedSegFor(from, to, 8000, stage);
    for (let i = 1; i < 50; i++) {
      const u = i / 50;
      const kias = from + (to - from) * smoother(u);
      const asked = seg.rateKtps * smootherSlope(u);
      assert.ok(asked <= slowKtps(stage, kias, 8000) * 1.001, `${stage}: asks ${asked.toFixed(2)} kt/s at ${kias.toFixed(0)} KIAS`);
    }
    assert.ok(slowRampKtps(from, to, 8000, stage) > 0);
  }
});

test('the core drag curve is the same: the idle prop and the boards are Formation-only terms', () => {
  // Read before and after using the helper; Fight Sim and Traffic fly the core curve.
  const before = dragPerWeight(200, 8000, 1);
  slowKtps('idleBoards', 200, 8000);
  assert.equal(dragPerWeight(200, 8000, 1), before);
});
