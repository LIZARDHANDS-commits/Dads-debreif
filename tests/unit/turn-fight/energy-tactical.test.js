// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tacticalAimCalculation,
  aimPoint,
  createEnergyFight,
  stepEnergyFight,
  ENERGY_DEFAULT_SETUP,
} from '../../../src/modules/turn-fight/energy-sim.js';

test('tacticalAimCalculation maintains convex combination wLag + wLead + wPure = 1.0 across flight envelopes', () => {
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'tactical' };

  const target = {
    pm: { x: 5000, y: 5000, z: -10000, vx: 200, vy: 0, vz: 0 },
    turnDir: 1,
    rollRad: 0.5,
  };

  const testCases = [
    { range: 5000, closureKt: 80 },
    { range: 3500, closureKt: 50 },
    { range: 2000, closureKt: 20 },
    { range: 1200, closureKt: 0 },
    { range: 800, closureKt: -10 },
  ];

  for (const { range, closureKt } of testCases) {
    const ac = {
      pm: {
        x: target.pm.x - range,
        y: target.pm.y,
        z: target.pm.z,
        vx: target.pm.vx + closureKt * 1.68781,
        vy: 0,
        vz: 0,
      },
    };

    const res = tacticalAimCalculation(setup, target, ac);
    const sum = res.wLag + res.wLead + res.wPure;
    assert.ok(Math.abs(sum - 1.0) < 1e-6, `Weights sum to 1.0 (got ${sum}) for range ${range}`);
    assert.ok(res.wLag >= 0 && res.wLag <= 1, 'wLag bounded in [0, 1]');
    assert.ok(res.wLead >= 0 && res.wLead <= 1, 'wLead bounded in [0, 1]');
    assert.ok(res.wPure >= 0 && res.wPure <= 1, 'wPure bounded in [0, 1]');
  }
});

test('tacticalAimCalculation: wLag dominates at long range or high closure (Control Zone Entry)', () => {
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'tactical' };
  const target = {
    pm: { x: 10000, y: 10000, z: -10000, vx: 250, vy: 0, vz: 0 },
    turnDir: 1,
    rollRad: 0.5,
  };

  // Long range (4,500 ft): Lag dominates
  const acLongRange = {
    pm: { x: 10000 - 4500, y: 10000, z: -10000, vx: 250, vy: 0, vz: 0 },
  };
  const resLong = tacticalAimCalculation(setup, target, acLongRange);
  assert.equal(resLong.wLag, 1.0);
  assert.equal(resLong.label, 'Pursuit: Lag (Control Zone Entry)');

  // High closure (110 kt): Lag dominates even inside 2,500 ft to avoid overshooting turn circle
  const acHighClosure = {
    pm: { x: 10000 - 2200, y: 10000, z: -10000, vx: 250 + 110 * 1.68781, vy: 0, vz: 0 },
  };
  const resClosure = tacticalAimCalculation(setup, target, acHighClosure);
  assert.ok(resClosure.wLag > 0.5);
  assert.equal(resClosure.label, 'Pursuit: Lag (Control Zone Entry)');
});

test('tacticalAimCalculation: wLead dominates inside gun envelope with controlled closure (Snapshot)', () => {
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'tactical' };
  const target = {
    pm: { x: 10000, y: 10000, z: -10000, vx: 200, vy: 0, vz: 0 },
    turnDir: 1,
    rollRad: 0.5,
  };

  // Close range (1,000 ft) with zero closure
  const acSnapshot = {
    pm: { x: 10000 - 1000, y: 10000, z: -10000, vx: 200, vy: 0, vz: 0 },
  };
  const resSnapshot = tacticalAimCalculation(setup, target, acSnapshot);
  assert.equal(resSnapshot.wLead, 1.0);
  assert.equal(resSnapshot.label, 'Pursuit: Lead (Snapshot)');
});

test('tacticalAimCalculation: wPure dominates in tracking phase at medium range with low closure', () => {
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'tactical' };
  const target = {
    pm: { x: 10000, y: 10000, z: -10000, vx: 200, vy: 0, vz: 0 },
    turnDir: 1,
    rollRad: 0.5,
  };

  // Medium range (2,000 ft) with closure matching target
  const acTracking = {
    pm: { x: 10000 - 2000, y: 10000, z: -10000, vx: 200, vy: 0, vz: 0 },
  };
  const resTracking = tacticalAimCalculation(setup, target, acTracking);
  assert.ok(resTracking.wPure > resTracking.wLag && resTracking.wPure > resTracking.wLead);
  assert.equal(resTracking.label, 'Pursuit: Pure (Tracking)');
});

test('aimPoint delegates to tacticalAimCalculation when pursuit is tactical', () => {
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'tactical' };
  const target = {
    pm: { x: 1000, y: 2000, z: -10000, vx: 150, vy: 0, vz: 0 },
    turnDir: 1,
    rollRad: 0.5,
  };
  const ac = {
    pm: { x: 500, y: 2000, z: -10000, vx: 150, vy: 0, vz: 0 },
  };

  const expectedAim = tacticalAimCalculation(setup, target, ac).aim;
  const actualAim = aimPoint(setup, target, ac);
  assert.deepEqual(actualAim, expectedAim);
});

test('full fight with pursuit tactical assigns human telemetry labels during pursuit', () => {
  // Set up an unequal fight where Blue quickly gets on Red's tail
  const state = createEnergyFight({
    ...ENERGY_DEFAULT_SETUP,
    blueKias: 280,
    redKias: 180,
    blueMove: 'mpt',
    redMove: 'mpt',
    pursuit: 'tactical',
  });

  // Step simulation until pursuit starts
  let pursued = false;
  for (let t = 0; t < 1200; t++) {
    stepEnergyFight(state, 0.05);
    if (state.blue.ctl.mode === 'pursuit' || state.red.ctl.mode === 'pursuit') {
      pursued = true;
      const chaser = state.blue.ctl.mode === 'pursuit' ? state.blue : state.red;
      assert.match(chaser.why, /^Pursuit: (Lag \(Control Zone Entry\)|Pure \(Tracking\)|Lead \(Snapshot\)) after first nose-on/);
      break;
    }
  }
  assert.ok(pursued, 'At least one aircraft entered pursuit');
});
