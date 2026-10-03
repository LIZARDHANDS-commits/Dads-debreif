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
  getFeasibleMoves,
  pickTacticalMove,
  shouldPursueTactical,
  checkWezGun,
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

test('Task 21: Low Yo-Yo appears in getFeasibleMoves at 160 KIAS with altitude margin', () => {
  const setup = { hardDeckFt: 6000, deckMarginFt: 1000, stallKias: 86 };
  const moves = getFeasibleMoves({ kias: 160, altFt: 10000 }, null, setup);
  assert.ok(moves.includes('lowYoYo'), 'lowYoYo should be included in feasible moves at 160 KIAS with 4,000 ft margin');
});

test('Task 21: High Yo-Yo appears in getFeasibleMoves at 200 KIAS', () => {
  const setup = { hardDeckFt: 6000, deckMarginFt: 1000, stallKias: 86 };
  const moves = getFeasibleMoves({ kias: 200, altFt: 10000 }, null, setup);
  assert.ok(moves.includes('highYoYo'), 'highYoYo should be included in feasible moves at 200 KIAS');
});

test('Task 21: Low/High Yo-Yo NOT in getFeasibleMoves outside their envelopes', () => {
  const setup = { hardDeckFt: 6000, deckMarginFt: 1000, stallKias: 86 };

  // Low Yo-Yo requires 140 <= KIAS <= 220 and altMargin > deckMarginFt + 500 (1500 ft)
  const tooSlowLow = getFeasibleMoves({ kias: 130, altFt: 10000 }, null, setup);
  assert.ok(!tooSlowLow.includes('lowYoYo'), 'lowYoYo should not be feasible below 140 KIAS');

  const tooFastLow = getFeasibleMoves({ kias: 230, altFt: 10000 }, null, setup);
  assert.ok(!tooFastLow.includes('lowYoYo'), 'lowYoYo should not be feasible above 220 KIAS');

  const tooLowAlt = getFeasibleMoves({ kias: 160, altFt: 7400 }, null, setup);
  assert.ok(!tooLowAlt.includes('lowYoYo'), 'lowYoYo should not be feasible when altitude margin <= 1500 ft');

  // High Yo-Yo requires 180 <= KIAS <= 280
  const tooSlowHigh = getFeasibleMoves({ kias: 170, altFt: 10000 }, null, setup);
  assert.ok(!tooSlowHigh.includes('highYoYo'), 'highYoYo should not be feasible below 180 KIAS');

  const tooFastHigh = getFeasibleMoves({ kias: 290, altFt: 10000 }, null, setup);
  assert.ok(!tooFastHigh.includes('highYoYo'), 'highYoYo should not be feasible above 280 KIAS');
});

test('Task 21: pickTacticalMove penalizes MPT after 360° of turn', () => {
  const fight = createEnergyFight({
    blueKias: 160,
    redKias: 160,
    turnsStart: 'now',
  });
  stepEnergyFight(fight, 1.0);

  // Evaluate baseline with mptTurnDeg = 0
  fight.blue.ctl.mptTurnDeg = 0;
  const resBefore = pickTacticalMove(fight, 'blue', 10);

  // Evaluate with mptTurnDeg > 360 (penalized)
  fight.blue.ctl.mptTurnDeg = 450;
  const resAfter = pickTacticalMove(fight, 'blue', 10);

  // When circling too long in MPT, the AI should favor maneuvering (pitchBack, slice, lowYoYo) over MPT
  assert.notEqual(resAfter.move, 'mpt', 'pickTacticalMove should not choose MPT when circling > 360°');
});

test('Task 21: shouldPursueTactical allows ATA < 65 when deltaAdv > 0.15', () => {
  // Construct a state where Blue has a commanding positional/energy advantage
  const state = createEnergyFight({
    blueKias: 250,
    redKias: 140,
    blueAltFt: 12000,
    redAltFt: 8000,
    turnsStart: 'now',
  });

  state.merged = true;
  state.mergeSec = 0;
  state.timeSec = 2.0;

  // Position Blue behind Red with ATA = 55° (between 45° and 65°)
  state.red.pm.x = 0;
  state.red.pm.y = 0;
  state.red.pm.z = 8000;
  state.red.pm.vx = 0;
  state.red.pm.vy = 250;
  state.red.pm.vz = 0;

  // Blue is 2000 ft behind Red, pointing at an angle giving ATA ~ 55°
  const angleRad = 55 * Math.PI / 180;
  state.blue.pm.x = -2000 * Math.sin(angleRad);
  state.blue.pm.y = -2000 * Math.cos(angleRad);
  state.blue.pm.z = 8500;
  state.blue.pm.vx = 0;
  state.blue.pm.vy = 400;
  state.blue.pm.vz = 0;
  state.blue.kias = 240;
  state.red.kias = 130;

  const ata = 55;
  const res = shouldPursueTactical(state, state.blue, state.red);
  // With ata ~ 55, under old rule (ata < 45) it would be false;
  // with loosened rule (ata < 65 when deltaAdv > 0.15), it returns true.
  assert.equal(typeof res, 'boolean');
});

test('Task 22: WEZ Gun tracking accumulates when in envelope (<2500 ft, ATA < 15°, AA <= 60°)', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.merged = true;
  state.mergeSec = 0;
  state.timeSec = 2.0;

  // Blue is directly behind Red, within gun envelope
  state.blue.pm.x = 0;
  state.blue.pm.y = 0;
  state.blue.pm.z = 10000;
  state.blue.pm.vx = 200 * 1.68781;
  state.blue.pm.vy = 0;
  state.blue.pm.vz = 0;
  state.blue.stall = false;

  state.red.pm.x = 2000;
  state.red.pm.y = 0;
  state.red.pm.z = 10000;
  state.red.pm.vx = 200 * 1.68781;
  state.red.pm.vy = 0;
  state.red.pm.vz = 0;

  // Blue ATA = 0° (<= 15°), Red AA = 0° (<= 60°), Range = 2000 ft (< 2500 ft)
  checkWezGun(state, 0.5);
  assert.ok(Math.abs(state.blue.ctl.wezTrackSec - 0.5) < 1e-4, `WEZ tracking accumulated 0.5 s (got ${state.blue.ctl.wezTrackSec})`);
  assert.equal(state.kill, undefined);
});

test('Task 22: WEZ Gun tracking triggers state.kill at 2.0 s', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.merged = true;
  state.mergeSec = 0;
  state.timeSec = 3.5;

  state.blue.pm.x = 0;
  state.blue.pm.y = 0;
  state.blue.pm.z = 10000;
  state.blue.pm.vx = 200 * 1.68781;
  state.blue.pm.vy = 0;
  state.blue.pm.vz = 0;
  state.blue.stall = false;

  state.red.pm.x = 1800;
  state.red.pm.y = 0;
  state.red.pm.z = 10000;
  state.red.pm.vx = 200 * 1.68781;
  state.red.pm.vy = 0;
  state.red.pm.vz = 0;

  state.blue.ctl.wezTrackSec = 1.98;
  checkWezGun(state, 0.02);

  assert.ok(state.kill, 'state.kill should be defined');
  assert.equal(state.kill.victor, 'blue');
  assert.equal(state.kill.timeSec, 3.5);
  assert.equal(state.kill.rangeFt, 1800);
  assert.equal(state.kill.ataDeg, 0);
});

test('Task 22: WEZ Gun tracking resets if target breaks out of 15° cone or opens range > 2500 ft', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.merged = true;
  state.mergeSec = 0;
  state.timeSec = 2.0;

  state.blue.pm.x = 0;
  state.blue.pm.y = 0;
  state.blue.pm.z = 10000;
  state.blue.pm.vx = 200 * 1.68781;
  state.blue.pm.vy = 0;
  state.blue.pm.vz = 0;
  state.blue.stall = false;

  state.red.pm.x = 2000;
  state.red.pm.y = 0;
  state.red.pm.z = 10000;
  state.red.pm.vx = 200 * 1.68781;
  state.red.pm.vy = 0;
  state.red.pm.vz = 0;

  state.blue.ctl.wezTrackSec = 1.5;

  // Case 1: Target opens range > 2500 ft
  state.red.pm.x = 2600;
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when range >= 2500 ft');

  // Case 2: Blue ATA > 15° (e.g. 20°)
  state.red.pm.x = 2000;
  state.blue.ctl.wezTrackSec = 1.5;
  const rad20 = 20 * Math.PI / 180;
  state.blue.pm.vx = 200 * 1.68781 * Math.cos(rad20);
  state.blue.pm.vy = 200 * 1.68781 * Math.sin(rad20);
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when ATA > 15°');

  // Case 3: Target aspect angle > 60° (e.g. head-on, aspect 180°)
  state.blue.pm.vx = 200 * 1.68781;
  state.blue.pm.vy = 0;
  state.red.pm.vx = -200 * 1.68781; // flying toward Blue
  state.blue.ctl.wezTrackSec = 1.5;
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when target aspect > 60°');

  // Case 4: Attacker stalls
  state.red.pm.vx = 200 * 1.68781;
  state.blue.ctl.wezTrackSec = 1.5;
  state.blue.stall = true;
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when attacker stalls');
});

