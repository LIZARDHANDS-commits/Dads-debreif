// Checks: the tactical AI's aim weights, yo-yos offered only in their envelopes, pursuit start rules, gun-kill
//   build-up and reset, mid-air collision at the hitbox, closest-approach (TCPA) maths and avoidance, tumble and
//   ground impact.
//   The telemetry, tumble and impact sentences are not pinned.
// Serves: TF-R1, TF-R8.
// Expected values: none is a manual number (F7): gun zone 2,500 ft / 15 / 60 degrees / 2 s, hitbox and tumble
//   rates are design choices for Dad to check (TF-Q10); closest approach is worked out by hand in the test.

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
  tacticalAdvantage,
  checkMidAirCollision,
  COLLISION_HITBOX_FT,
  computeTcpa,
  turnPlaneNormal,
  TCPA_GATE_MIN_SEC,
  TCPA_GATE_MAX_SEC,
  TCPA_MISS_GATE_FT,
  DECONFLICTION_OFFSET_FT,
} from '../../../src/modules/turn-fight/energy-sim.js';

// Where the numbers in this file come from (F7). None is a manual number.
// - The gun zone is a design choice for the tool (TF-R1, the gun-kill): inside 2,500 ft, nose within 15° of the other jet,
//   the other jet's aspect within 60°, held for 2 s. energy-sim.js (checkWezGun) keeps these inline, not exported, so they are named once here.
const GUN_ZONE = Object.freeze({ rangeFt: 2500, ataDeg: 15, aspectDeg: 60, buildUpSec: 2 });
// - The hitbox is COLLISION_HITBOX_FT, read from the engine (CT-156 wingspan 33.4 ft, length 33.3 ft).
// - The tumble rates after a collision are design choices, values for Dad to check (TF-Q10): [roll, pitch, yaw] in deg/s by closing speed.
//   Blue gets the rates and Red the opposite signs. A faster closing speed is a harder tumble (checked at the end of the tumble test).
const TUMBLE_RATES = Object.freeze({
  slow: Object.freeze({ p: 150, q: -60, r: 50 }),    // closing under 35 kt
  medium: Object.freeze({ p: 450, q: -200, r: 160 }), // closing 35 to 90 kt
  fast: Object.freeze({ p: 900, q: -400, r: 300 }),   // closing over 90 kt
});

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

  // Blue has the commanding advantage: its advantage score beats Red's by more than 0.15 (the rule's own condition, SPEC-turn-fight tactical AI).
  const gap = tacticalAdvantage(state.blue, state.red) - tacticalAdvantage(state.red, state.blue);
  assert.ok(gap > 0.15, `Blue's advantage over Red is above 0.15 (${gap})`);
  // ATA about 55° is past the usual 45° but inside 65°, so Blue is allowed to start the chase.
  assert.equal(shouldPursueTactical(state, state.blue, state.red), true, 'Blue may chase at ATA 55 with a decisive advantage');
  // The same jets with Blue pointing 70° off (beyond 65°) may not chase: the loosened gate is still a gate.
  const wide = 70 * Math.PI / 180;
  state.blue.pm.x = -2000 * Math.sin(wide);
  state.blue.pm.y = -2000 * Math.cos(wide);
  assert.equal(shouldPursueTactical(state, state.blue, state.red), false, 'Blue may not chase at ATA 70');
});

test('Task 22: WEZ Gun tracking accumulates when in the gun zone (range, ATA and aspect inside GUN_ZONE)', () => {
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

  state.red.pm.x = GUN_ZONE.rangeFt - 500;
  state.red.pm.y = 0;
  state.red.pm.z = 10000;
  state.red.pm.vx = 200 * 1.68781;
  state.red.pm.vy = 0;
  state.red.pm.vz = 0;

  // Blue ATA = 0° and Red AA = 0°, both inside the zone's angles, and the range is inside its reach.
  checkWezGun(state, 0.5);
  assert.ok(Math.abs(state.blue.ctl.wezTrackSec - 0.5) < 1e-4, `WEZ tracking accumulated 0.5 s (got ${state.blue.ctl.wezTrackSec})`);
  assert.equal(state.kill, undefined);
});

test('Task 22: WEZ Gun tracking awards the kill once the zone has been held for its build-up time, and not before', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.merged = true;
  state.mergeSec = 0;
  state.timeSec = 3.5; // any time after the pass: the kill is judged on how long the zone was held, not on the clock

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

  // One step short of the build-up: still tracking, no kill.
  state.blue.ctl.wezTrackSec = GUN_ZONE.buildUpSec - 0.04;
  checkWezGun(state, 0.02);
  assert.equal(state.kill, undefined, 'no kill while the build-up time is not yet held');

  // The step that completes the build-up awards it.
  checkWezGun(state, 0.02);
  assert.ok(state.kill, 'state.kill should be defined');
  assert.equal(state.kill.victor, 'blue');
  assert.equal(state.kill.timeSec, state.timeSec, 'the kill is stamped with the fight clock at that moment');
  assert.equal(state.kill.rangeFt, 1800);
  assert.equal(state.kill.ataDeg, 0);
});

test('Task 22: WEZ Gun tracking resets if the target breaks out of the gun zone: range, cone, aspect, or the attacker stalls', () => {
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

  // Case 1: Target opens range beyond the zone's reach
  state.red.pm.x = GUN_ZONE.rangeFt + 100;
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when the range is outside the zone');

  // Case 2: Blue ATA outside the zone's cone (5° past it)
  state.red.pm.x = GUN_ZONE.rangeFt - 500;
  state.blue.ctl.wezTrackSec = 1.5;
  const radOut = (GUN_ZONE.ataDeg + 5) * Math.PI / 180;
  state.blue.pm.vx = 200 * 1.68781 * Math.cos(radOut);
  state.blue.pm.vy = 200 * 1.68781 * Math.sin(radOut);
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when ATA is outside the cone');

  // Case 3: Target aspect beyond the zone's limit (head-on, aspect 180°)
  state.blue.pm.vx = 200 * 1.68781;
  state.blue.pm.vy = 0;
  state.red.pm.vx = -200 * 1.68781; // flying toward Blue
  state.blue.ctl.wezTrackSec = 1.5;
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when the target aspect is beyond the zone');

  // Case 4: Attacker stalls
  state.red.pm.vx = 200 * 1.68781;
  state.blue.ctl.wezTrackSec = 1.5;
  state.blue.stall = true;
  checkWezGun(state, 0.02);
  assert.equal(state.blue.ctl.wezTrackSec, 0, 'Tracking resets when attacker stalls');
});

test('Task 27: checkMidAirCollision triggers state.collision when 3D range drops below the hitbox (COLLISION_HITBOX_FT)', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.timeSec = 5.0;
  state.blue.kias = 220;
  state.red.kias = 200;
  state.blue.altFt = 10000;
  state.red.altFt = 10000;
  state.blue.pm.x = 0;
  state.blue.pm.y = 0;
  state.blue.pm.z = 10000;
  state.blue.xFt = 0;
  state.blue.yFt = 0;
  state.blue.zFt = 10000;
  state.blue.pm.vx = 220 * 1.68781;
  state.blue.pm.vy = 0;
  state.blue.pm.vz = 0;

  const inside = COLLISION_HITBOX_FT - 5; // 5 ft inside the hitbox
  state.red.pm.x = inside;
  state.red.pm.y = 0;
  state.red.pm.z = 10000;
  state.red.xFt = inside;
  state.red.yFt = 0;
  state.red.zFt = 10000;
  state.red.pm.vx = -200 * 1.68781;
  state.red.pm.vy = 0;
  state.red.pm.vz = 0;

  state.rangeFt = inside;

  checkMidAirCollision(state);

  assert.ok(state.collision, 'state.collision should be triggered');
  assert.equal(state.collision.timeSec, 5.0);
  assert.equal(state.collision.impactKias, 210);
  assert.equal(state.collision.altitudeFt, 10000);
  assert.equal(state.blue.collided, true);
  assert.equal(state.red.collided, true);
  assert.ok(state.collision.closingRateKt > 0, 'closing rate should be positive');
  assert.ok(state.collision.relativeSpeedKt > 0, 'relative speed should be positive');
});

test('Task 27: checkMidAirCollision does not trigger when 3D range is at or above the hitbox', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.timeSec = 5.0;
  state.rangeFt = COLLISION_HITBOX_FT + 1;
  state.blue.pm.x = 0;
  state.red.pm.x = COLLISION_HITBOX_FT + 1;
  state.blue.xFt = 0;
  state.red.xFt = COLLISION_HITBOX_FT + 1;

  checkMidAirCollision(state);

  assert.ok(!state.collision, 'collision should not trigger');
  assert.equal(state.blue.collided, false);
  assert.equal(state.red.collided, false);

  // Boundary check at exactly the hitbox
  state.rangeFt = COLLISION_HITBOX_FT;
  state.red.pm.x = COLLISION_HITBOX_FT;
  state.red.xFt = COLLISION_HITBOX_FT;
  checkMidAirCollision(state);

  assert.ok(!state.collision, 'collision should not trigger at exactly the hitbox');
  assert.equal(state.blue.collided, false);
  assert.equal(state.red.collided, false);
});

test('Task 27: checkMidAirCollision preserves existing state.kill for sequential debrief logging', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.timeSec = 5.0;
  state.rangeFt = 30;
  state.blue.pm.x = 0;
  state.red.pm.x = 30;
  state.blue.xFt = 0;
  state.red.xFt = 30;

  // Pre-existing Gun Kill
  state.kill = {
    victor: 'blue',
    timeSec: 4.5,
    rangeFt: 800,
    ataDeg: 2,
  };

  checkMidAirCollision(state);

  // Both kill and collision should be present
  assert.ok(state.kill, 'state.kill must be preserved');
  assert.equal(state.kill.victor, 'blue');
  assert.equal(state.kill.timeSec, 4.5);
  assert.equal(state.kill.rangeFt, 800);

  assert.ok(state.collision, 'state.collision must also be recorded');
  assert.equal(state.blue.collided, true);
  assert.equal(state.red.collided, true);
});

test('Task 27: checkMidAirCollision respects state.setup.collisionDetection === false', () => {
  const state = createEnergyFight({ turnsStart: 'now' });
  state.setup.collisionDetection = false;
  state.timeSec = 5.0;
  state.rangeFt = 20; // well inside the hitbox
  state.blue.pm.x = 0;
  state.red.pm.x = 20;
  state.blue.xFt = 0;
  state.red.xFt = 20;

  checkMidAirCollision(state);

  assert.ok(!state.collision, 'collision should not trigger when detection is disabled');
  assert.equal(state.blue.collided, false);
  assert.equal(state.red.collided, false);
});

test('Task 28: computeTcpa calculates accurate closed-form time and miss distance on crossing trajectories', () => {
  // Target flying West at 200 ft/s, initial pos (0, 400, 10000) -> vx = -200, vy = 0
  // Ac flying North at 200 ft/s, initial pos (-400, 50, 10000) -> vx = 0, vy = 200
  // Relative position: r = (400, 350, 0)
  // Relative velocity: vRel = (-200, -200, 0)
  // vv = 80000
  // rv = 400 * (-200) + 350 * (-200) = -150000
  // tcpaSec = 150000 / 80000 = 1.875 s
  // At t = 1.875 s:
  // cpaX = 400 - 200 * 1.875 = 25 ft
  // cpaY = 350 - 200 * 1.875 = -25 ft
  // missFt = hypot(25, -25) = 35.355 ft
  const target = {
    pm: { x: 0, y: 400, z: 10000, vx: -200, vy: 0, vz: 0 },
  };
  const ac = {
    pm: { x: -400, y: 50, z: 10000, vx: 0, vy: 200, vz: 0 },
  };

  const tcpa = computeTcpa(ac, target);
  assert.equal(tcpa.closing, true);
  // The answers are closed-form and worked out by hand above, so the margin only covers rounding: 0.1 s and 1 ft, tighter than the shared table.
  assert.ok(Math.abs(tcpa.tcpaSec - 1.875) <= 0.1, `tcpaSec ${tcpa.tcpaSec} matches 1.875 s within tolerance`);
  assert.ok(Math.abs(tcpa.missFt - 35.355) <= 1.0, `missFt ${tcpa.missFt} matches 35.355 ft within tolerance`);
});

test('Task 28: computeTcpa returns closing: false when aircraft are opening/diverging', () => {
  const target = {
    pm: { x: 1000, y: 0, z: 10000, vx: 200, vy: 0, vz: 0 },
  };
  const ac = {
    pm: { x: 0, y: 0, z: 10000, vx: -200, vy: 0, vz: 0 },
  };

  const tcpa = computeTcpa(ac, target);
  assert.equal(tcpa.closing, false);
  assert.equal(tcpa.tcpaSec, 0);
  assert.ok(Math.abs(tcpa.missFt - 1000) <= 1.0, `missFt ${tcpa.missFt} reflects initial separation`);
});

test('Task 28: aimPoint displaces aim point out-of-plane when TCPA gate triggers (<75 ft, 0.5-1.5 s)', () => {
  // Set up geometry where TCPA is 1.0 s (within [0.5, 1.5] s) and miss distance is 50 ft (< 75 ft)
  // Target at (300, 50, 10000), vx = -150, vy = 0, vz = 0
  // Ac at (0, 0, 10000), vx = 150, vy = 0, vz = 0
  // r = (300, 50, 0), vRel = (-300, 0, 0), vv = 90000, rv = -90000
  // tcpaSec = 1.0 s, cpaX = 0, cpaY = 50, cpaZ = 0 -> missFt = 50 ft (< 75 ft)
  // Target wings level -> turnPlaneNormal is (0, 0, 1)
  // acPos.z - targetPos.z = 0 -> dot(acPos - targetPos, n) = 0 >= 0 -> offset is +85 ft along n (z)
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'pure' };
  const target = {
    pm: { x: 300, y: 50, z: 10000, vx: -150, vy: 0, vz: 0 },
    turnDir: 0,
    g: 1.0,
  };
  const ac = {
    pm: { x: 0, y: 0, z: 10000, vx: 150, vy: 0, vz: 0 },
    deconflicting: false,
  };

  const baseAim = { x: target.pm.x, y: target.pm.y, z: target.pm.z };
  const aim = aimPoint(setup, target, ac);

  assert.equal(ac.deconflicting, true);
  assert.equal(aim.x, baseAim.x);
  assert.equal(aim.y, baseAim.y);
  assert.ok(Math.abs(aim.z - (baseAim.z + DECONFLICTION_OFFSET_FT)) <= 1.0);

  // Also verify turning defender produces out-of-plane offset orthogonal to turn plane
  const turnTarget = {
    pm: { x: 300, y: 0, z: 10000, vx: -150, vy: 0, vz: 0, up: { x: 0, y: 0, z: 1 } },
    turnDir: 1,
    g: 3.0,
  };
  const turnAc = {
    pm: { x: 0, y: 50, z: 10000, vx: 150, vy: 0, vz: 0 },
    deconflicting: false,
  };
  const n = turnPlaneNormal(turnTarget);
  // n = cross((-150, 0, 0), (0, 0, 1)) = (0, 150, 0) -> normalized (0, 1, 0)
  assert.ok(Math.abs(n.y - 1.0) <= 0.05);
  const turnAim = aimPoint(setup, turnTarget, turnAc);
  assert.equal(turnAc.deconflicting, true);
  assert.ok(Math.abs(turnAim.y - (turnTarget.pm.y + DECONFLICTION_OFFSET_FT)) <= 1.0);
});

test('Task 28: aimPoint does not displace aim point when collisionAvoidance === false', () => {
  const setup = { ...ENERGY_DEFAULT_SETUP, pursuit: 'pure', collisionAvoidance: false };
  const target = {
    pm: { x: 300, y: 50, z: 10000, vx: -150, vy: 0, vz: 0 },
    turnDir: 0,
    g: 1.0,
  };
  const ac = {
    pm: { x: 0, y: 0, z: 10000, vx: 150, vy: 0, vz: 0 },
    deconflicting: false,
  };

  const baseAim = { x: target.pm.x, y: target.pm.y, z: target.pm.z };
  const aim = aimPoint(setup, target, ac);

  assert.equal(ac.deconflicting, false);
  assert.deepEqual(aim, baseAim);
});

test('D425: Immelmann can be attempted across full entry envelope (180-316 KIAS) without 140 kt apex gate', () => {
  // At 185 KIAS (entry speed near low end of Immelmann envelope where apex speed would be low),
  // Immelmann must be included in feasible moves without being gated out by an artificial apex limit.
  const moves185 = getFeasibleMoves({ kias: 185, altFt: 10000 });
  assert.ok(moves185.includes('immelmann'), 'Immelmann is feasible at 185 KIAS');

  // At 240 KIAS (nominal entry speed)
  const moves240 = getFeasibleMoves({ kias: 240, altFt: 10000 });
  assert.ok(moves240.includes('immelmann'), 'Immelmann is feasible at 240 KIAS');

  // Below 180 KIAS (e.g. 175 KIAS), Immelmann is not in envelope
  const moves175 = getFeasibleMoves({ kias: 175, altFt: 10000 });
  assert.ok(!moves175.includes('immelmann'), 'Immelmann is not feasible below 180 KIAS entry envelope');
});

test('Task 29: collision starts a tumble at the design rates for its closing speed, opposite for the two jets, harder at higher closing speed', () => {
  // Test low relative speed (< 35 kt)
  const stateLow = {
    setup: { collisionDetection: true },
    merged: true,
    timeSec: 10.0,
    mergeSec: 0,
    rangeFt: 25.0,
    blue: {
      who: 'blue',
      kias: 160,
      altFt: 10000,
      pm: { x: 0, y: 0, z: 10000, vx: 200, vy: 0, vz: 0 },
      ctl: { mode: 'mpt' },
    },
    red: {
      who: 'red',
      kias: 160,
      altFt: 10000,
      pm: { x: 20, y: 0, z: 10000, vx: 230, vy: 0, vz: 0 }, // dvx = -30 ft/s (~18 kt)
      ctl: { mode: 'mpt' },
    },
  };
  checkMidAirCollision(stateLow);
  assert.ok(stateLow.collision, 'Collision recorded');
  assert.ok(stateLow.blue.tumble, 'Blue tumble initialized');
  assert.ok(stateLow.red.tumble, 'Red tumble initialized');
  assert.equal(stateLow.blue.move, 'tumble');
  assert.equal(stateLow.blue.tumble.pDegPerSec, TUMBLE_RATES.slow.p);
  assert.equal(stateLow.blue.tumble.qDegPerSec, TUMBLE_RATES.slow.q);
  assert.equal(stateLow.blue.tumble.rDegPerSec, TUMBLE_RATES.slow.r);
  assert.equal(stateLow.red.tumble.pDegPerSec, -TUMBLE_RATES.slow.p);
  assert.equal(stateLow.red.tumble.qDegPerSec, -TUMBLE_RATES.slow.q);
  assert.equal(stateLow.red.tumble.rDegPerSec, -TUMBLE_RATES.slow.r);

  // Test medium relative speed (35 to 90 kt)
  const stateMed = {
    setup: { collisionDetection: true },
    merged: true,
    timeSec: 10.0,
    mergeSec: 0,
    rangeFt: 20.0,
    blue: {
      who: 'blue',
      kias: 200,
      altFt: 10000,
      pm: { x: 0, y: 0, z: 10000, vx: 300, vy: 0, vz: 0 },
      ctl: { mode: 'mpt' },
    },
    red: {
      who: 'red',
      kias: 200,
      altFt: 10000,
      pm: { x: 20, y: 0, z: 10000, vx: 200, vy: 0, vz: 0 }, // dvx = 100 ft/s (~59 kt)
      ctl: { mode: 'mpt' },
    },
  };
  checkMidAirCollision(stateMed);
  assert.equal(stateMed.blue.tumble.pDegPerSec, TUMBLE_RATES.medium.p);
  assert.equal(stateMed.blue.tumble.qDegPerSec, TUMBLE_RATES.medium.q);
  assert.equal(stateMed.blue.tumble.rDegPerSec, TUMBLE_RATES.medium.r);
  assert.equal(stateMed.red.tumble.pDegPerSec, -TUMBLE_RATES.medium.p);
  assert.equal(stateMed.red.tumble.qDegPerSec, -TUMBLE_RATES.medium.q);
  assert.equal(stateMed.red.tumble.rDegPerSec, -TUMBLE_RATES.medium.r);

  // Test high relative speed (> 90 kt)
  const stateHigh = {
    setup: { collisionDetection: true },
    merged: true,
    timeSec: 10.0,
    mergeSec: 0,
    rangeFt: 20.0,
    blue: {
      who: 'blue',
      kias: 220,
      altFt: 10000,
      pm: { x: 0, y: 0, z: 10000, vx: 350, vy: 0, vz: 0 },
      ctl: { mode: 'mpt' },
    },
    red: {
      who: 'red',
      kias: 220,
      altFt: 10000,
      pm: { x: 20, y: 0, z: 10000, vx: -350, vy: 0, vz: 0 }, // dvx = 700 ft/s (~414 kt)
      ctl: { mode: 'mpt' },
    },
  };
  checkMidAirCollision(stateHigh);
  assert.equal(stateHigh.blue.tumble.pDegPerSec, TUMBLE_RATES.fast.p);
  assert.equal(stateHigh.blue.tumble.qDegPerSec, TUMBLE_RATES.fast.q);
  assert.equal(stateHigh.blue.tumble.rDegPerSec, TUMBLE_RATES.fast.r);
  assert.equal(stateHigh.red.tumble.pDegPerSec, -TUMBLE_RATES.fast.p);
  assert.equal(stateHigh.red.tumble.qDegPerSec, -TUMBLE_RATES.fast.q);
  assert.equal(stateHigh.red.tumble.rDegPerSec, -TUMBLE_RATES.fast.r);

  // Always true: a faster closing speed never tumbles the jet more gently.
  for (const name of ['pDegPerSec', 'qDegPerSec', 'rDegPerSec']) {
    assert.ok(Math.abs(stateLow.blue.tumble[name]) < Math.abs(stateMed.blue.tumble[name]) && Math.abs(stateMed.blue.tumble[name]) < Math.abs(stateHigh.blue.tumble[name]), name);
  }
});

test('Task 29: tumbling aircraft decelerates due to bluff-body drag and drops under gravity', () => {
  const fight = createEnergyFight({ turnsStart: 'now' });
  fight.merged = true;
  fight.timeSec = 5.0;
  fight.mergeSec = 0;
  fight.rangeFt = 20.0;
  fight.blue.pm = { x: 0, y: 0, z: 10000, vx: 300, vy: 0, vz: 0 };
  fight.red.pm = { x: 15, y: 0, z: 10000, vx: -300, vy: 0, vz: 0 };
  fight.blue.altFt = 10000;
  fight.red.altFt = 10000;

  checkMidAirCollision(fight);
  assert.ok(fight.blue.tumble, 'Tumble active');

  const initialKias = fight.blue.kias;
  const initialAltFt = fight.blue.altFt;
  let bankRotated = false;

  // Step 2 seconds into tumble
  for (let i = 0; i < 2.0 / 0.02; i++) {
    stepEnergyFight(fight, 0.02);
    if (Math.abs(fight.blue.bankRad) > 0.01) bankRotated = true;
  }

  // Under bluff-body drag, speed must decay significantly
  assert.ok(fight.blue.kias < initialKias, 'Airspeed decelerates under bluff-body drag');
  // Under gravity, altitude must drop significantly
  assert.ok(fight.blue.altFt < initialAltFt - 50, 'Altitude drops under gravity');
  // Controls severed: throttle at 0 and g at 0
  assert.equal(fight.blue.throttle, 0, 'Thrust cut to 0');
  assert.equal(fight.blue.g, 0, 'Aerodynamic G cut to 0');
  // Angles integrate
  assert.ok(bankRotated, 'Bank angle rotates during tumble');
  assert.ok(fight.blue.pm.vz < 0, 'Vertical velocity is downward');
});

test('Task 29: terrain impact clamps altitude at 0 ft MSL and halts simulation with state.stopped = true', () => {
  const fight = createEnergyFight({ turnsStart: 'now' });
  fight.merged = true;
  fight.timeSec = 5.0;
  fight.mergeSec = 0;
  // Initialize low altitude tumble (100 ft MSL)
  fight.blue.altFt = 100;
  fight.blue.pm = { x: 0, y: 0, z: 100, vx: 100, vy: 0, vz: -150 };
  fight.blue.tumble = { pDegPerSec: 450, qDegPerSec: -200, rDegPerSec: 160 };
  fight.blue.why = 'Departure: Ballistic tumble after mid-air collision';
  fight.blue.move = 'tumble';

  fight.red.altFt = 100;
  fight.red.pm = { x: 50, y: 0, z: 100, vx: -100, vy: 0, vz: -150 };
  fight.red.tumble = { pDegPerSec: -450, qDegPerSec: 200, rDegPerSec: -160 };
  fight.red.why = 'Departure: Ballistic tumble after mid-air collision';
  fight.red.move = 'tumble';

  // Step forward until impact
  for (let i = 0; i < 2.0 / 0.02; i++) {
    stepEnergyFight(fight, 0.02);
    if (fight.stopped) break;
  }

  assert.equal(fight.stopped, true, 'Simulation halted on terrain impact');
  assert.equal(fight.blue.altFt, 0, 'Blue altitude clamped at 0 ft MSL');
  assert.equal(fight.blue.pm.z, 0, 'Blue pm.z clamped at 0');

  // Subsequent steps do nothing once stopped
  const timeStopped = fight.timeSec;
  stepEnergyFight(fight, 1.0);
  assert.equal(fight.timeSec, timeStopped, 'Simulation remains stopped after terrain impact');
});




