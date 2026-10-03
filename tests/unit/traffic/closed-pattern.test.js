// ╔══════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR WARNING — READ BEFORE DEBUGGING TEST FAILURES            ║
// ║                                                                    ║
// ║  These tests use PILOT-DOMAIN TOLERANCES (±10 kt, ±100 ft, ±5°).  ║
// ║  If a test fails repeatedly, DO NOT tweak the physics engine to    ║
// ║  make it pass. Instead:                                            ║
// ║    1. Ask the operator what to do.                                 ║
// ║    2. The test tolerance may need widening, OR                     ║
// ║    3. There may be a genuine flight behavior bug.                  ║
// ║  Never force physics to match a test value.                        ║
// ╚══════════════════════════════════════════════════════════════════════╝
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createSim } from '../../../src/modules/traffic/sim.js';
import { tickAircraft, stepClosedPattern } from '../../../src/modules/traffic/tick-aircraft.js';
import { initAircraftState, stepAircraft } from '../../../src/modules/traffic/flight-engine.js';
import { computeWindPerch, posOnRoute, pointDistFt, navSegs } from '../../../src/modules/traffic/route.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const mooseJaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8')
);

function makeSim(options = {}) {
  return createSim(mooseJaw, {
    seed: 42,
    windFromDeg: 360,
    windKt: 0,
    ...options,
  });
}

test('Closed Pattern Phase 1: climbing turn kinematics at 140 KIAS and selected 50° bank', () => {
  const pat = mooseJaw.routes[0];
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -4066,
    y: 681,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    phase: 'closed_pattern',
    command: 'closed_pattern',
    closedPatternBankDeg: 50,
    closedPatternPitchDeg: 10,
  });

  assert.equal(ac.phase, 'closed_pattern');
  assert.equal(ac.closedPatternBankDeg, 50);

  // Step 2 seconds into Phase 1
  for (let t = 0; t < 2.0; t += 0.05) {
    stepClosedPattern(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
  }

  // Bank should smoothly roll towards -50° left bank (≤ 45°/s roll rate limit)
  assert.ok(ac.bankDeg < -40, `Bank should reach left turn bank, got ${ac.bankDeg}`);
  assert.ok(ac.bankDeg >= -50.1, `Bank should not exceed 50° limit, got ${ac.bankDeg}`);

  // Speed should maintain 140 KIAS within pilot domain tolerance (±10 kt)
  assert.ok(Math.abs(ac.iasKt - 140) <= 10, `Speed should hold ~140 KIAS, got ${ac.iasKt}`);

  // Altitude should climb from 2,400 ft
  assert.ok(ac.alt > 2450, `Aircraft should climb, got ${ac.alt} ft`);

  // Heading should turn left (decreasing from 298°)
  assert.ok(ac.headingDeg < 298, `Aircraft should turn left, got ${ac.headingDeg}°`);
});

test('Closed Pattern: custom bank angles (45° and 60°) via sim.command', () => {
  const sim = makeSim();
  const pat = mooseJaw.routes[0];

  // Spawn aircraft at Departure End
  const id1 = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });

  // Command 45° bank
  sim.command(id1, 'closed_pattern', { bankDeg: 45, pitchDeg: 10 });
  const a1 = sim.state().aircraft.find((a) => a.id === id1);
  assert.equal(a1.closedPatternBankDeg, 45);

  for (let t = 0.05; t <= 2.0; t += 0.05) {
    sim.stepTo(t);
  }
  const a1After = sim.state().aircraft.find((a) => a.id === id1);
  assert.ok(a1After.bankDeg <= -40 && a1After.bankDeg >= -45.1, `45° bank should be held, got ${a1After.bankDeg}`);

  // Reset and test 60° bank
  const sim2 = makeSim();
  const id2 = sim2.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });
  sim2.command(id2, 'closed_pattern', { bankDeg: 60, pitchDeg: 12 });
  const a2 = sim2.state().aircraft.find((a) => a.id === id2);
  assert.equal(a2.closedPatternBankDeg, 60);
  assert.equal(a2.closedPatternPitchDeg, 12);

  for (let t = 0.05; t <= 2.0; t += 0.05) {
    sim2.stepTo(t);
  }
  const a2After = sim2.state().aircraft.find((a) => a.id === id2);
  assert.ok(a2After.bankDeg <= -50 && a2After.bankDeg >= -60.1, `60° bank should be rolled toward, got ${a2After.bankDeg}`);
});

test('Closed Pattern: smooth transition from climbing turn to level flight at 3,500 ft MSL', () => {
  const pat = mooseJaw.routes[0];
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -4066,
    y: 681,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    phase: 'closed_pattern',
    command: 'closed_pattern',
    closedPatternBankDeg: 50,
    closedPatternPitchDeg: 10,
    mode: 'PHYSICS',
  });

  // Step through maneuver until 3,500 ft MSL is captured
  let capturedAlt = false;
  for (let t = 0; t < 40.0; t += 0.05) {
    stepClosedPattern(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
    if ((ac.alt ?? 0) >= 3450) {
      capturedAlt = true;
      break;
    }
  }

  assert.ok(capturedAlt, 'Aircraft should climb to 3,500 ft MSL');
  // Pitch should have smoothly decayed towards 0° in the last 300 ft
  assert.ok(ac.pitchDeg <= 2.0, `Pitch should decay to ~0° at 3,500 ft, got ${ac.pitchDeg}°`);

  // Step further until wings roll level as track aligns towards downwind/perch
  let wingsLevel = false;
  for (let t = 0; t < 20.0; t += 0.05) {
    stepClosedPattern(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
    if (Math.abs(ac.bankDeg) <= 3.0 && (ac.headingDeg >= 110 && ac.headingDeg <= 140)) {
      wingsLevel = true;
      break;
    }
  }

  assert.ok(wingsLevel, `Wings should roll level as aircraft aligns with downwind/perch track, bank was ${ac.bankDeg}°`);
  assert.ok(Math.abs(ac.alt - 3500) <= 100, `Altitude should hold 3,500 ft MSL (±100 ft), got ${ac.alt} ft`);
});

test('Closed Pattern: vector-intercept turn points velocity vector at wind-adjusted perch', () => {
  const pat = mooseJaw.routes[0];
  const envCalm = { windFromDeg: 360, windKt: 0 };
  const envWind = { windFromDeg: 28, windKt: 15 };

  const perchCalm = computeWindPerch(pat, envCalm.windFromDeg, envCalm.windKt);
  const perchWind = computeWindPerch(pat, envWind.windFromDeg, envWind.windKt);

  assert.ok(perchCalm, 'Calm perch should exist');
  assert.ok(perchWind, 'Wind perch should exist');
  assert.notEqual(perchCalm.x, perchWind.x, 'Wind should shift perch point');

  // Verify calm wind tracking
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -5500,
    y: -2000,
    alt: 3500,
    headingDeg: 140,
    bankDeg: 0,
    iasKt: 140,
    phase: 'closed_pattern',
    command: 'closed_pattern',
  });

  stepClosedPattern(ac, pat, envCalm, 0.05);
  assert.ok(ac.desiredHeadingDeg !== undefined, 'desiredHeadingDeg should be set towards perch');

  const dx = perchCalm.x - ac.x;
  const dy = perchCalm.y - ac.y;
  const expectedBearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  assert.ok(
    Math.abs(wrapDeg180(ac.desiredHeadingDeg - expectedBearing)) <= 1.0,
    `Desired heading should point directly at calm perch (${expectedBearing.toFixed(1)}°), got ${ac.desiredHeadingDeg.toFixed(1)}°`
  );

  // Verify crosswind tracking
  const acWind = initAircraftState({
    id: 'A2',
    type: 'CT-156',
    x: -5500,
    y: -2000,
    alt: 3500,
    headingDeg: 140,
    bankDeg: 0,
    iasKt: 140,
    phase: 'closed_pattern',
    command: 'closed_pattern',
  });

  stepClosedPattern(acWind, pat, envWind, 0.05);
  assert.ok(acWind.desiredHeadingDeg !== undefined, 'desiredHeadingDeg should be set with wind');
  // Wind triangle should calculate a crab angle into the wind
  assert.notEqual(acWind.desiredHeadingDeg, ac.desiredHeadingDeg, 'Crosswind should modify desired heading');
});

test('Closed Pattern: tangent downwind rail capture with zero coordinate jump', () => {
  const sim = makeSim();
  const id = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });

  let captured = false;
  let maxFrameJump = 0;
  let prevPos = null;

  for (let sec = 0.05; sec <= 90.0; sec += 0.05) {
    const sBefore = sim.state().aircraft.find((a) => a.id === id);
    if (!sBefore) break;
    const px = sBefore.x;
    const py = sBefore.y;

    sim.stepTo(sec);

    const sAfter = sim.state().aircraft.find((a) => a.id === id);
    if (!sAfter) break;
    const jump = Math.hypot(sAfter.x - px, sAfter.y - py);
    if (jump > maxFrameJump) maxFrameJump = jump;

    if (sAfter.mode === 'RAIL' && sAfter.phase === 'downwind') {
      captured = true;
      break;
    }
  }

  assert.ok(captured, 'Closed pattern should capture onto downwind rail');
  // At 140 KIAS (148 TAS = ~250 ft/s), 0.05s normal kinematic translation is 12.5 ft.
  // D411 strict guard: maximum frame step movement must never jump > 25 ft.
  assert.ok(
    maxFrameJump <= 25.0,
    `Frame-to-frame movement must not exceed kinematic translation (zero teleportation), max was ${maxFrameJump.toFixed(2)} ft`
  );
});

test('Closed Pattern Preset Point 2 on PAT1 initializes and executes full 4-phase sequence into downwind', () => {
  const sim = makeSim();
  const id = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });

  const a = sim.state().aircraft.find((ac) => ac.id === id);
  assert.ok(a, 'Aircraft should spawn');
  assert.equal(a.command, 'closed_pattern', 'Should initialize with closed_pattern command');
  assert.equal(a.closedPatternBankDeg, 50, 'Default closed pattern bank should be 50°');
  assert.equal(a.closedPatternPitchDeg, 10, 'Default closed pattern pitch should be 10°');

  let enteredDownwind = false;
  for (let sec = 1; sec <= 90; sec++) {
    sim.stepTo(sec);
    const curr = sim.state().aircraft.find((ac) => ac.id === id);
    if (curr.mode === 'RAIL' && (curr.phase === 'downwind' || curr.phase === 'final_turn')) {
      enteredDownwind = true;
      assert.ok(Math.abs(curr.alt - 3500) <= 100, `Downwind altitude should be 3,500 ft MSL (±100 ft), got ${curr.alt}`);
      assert.equal(curr.command, null, 'Command should be cleared');
      break;
    }
  }

  assert.ok(enteredDownwind, 'Preset closed pattern should complete and capture downwind rail');
});
