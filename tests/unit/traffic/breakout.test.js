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

import {
  stepBreakout,
  BREAKOUT_PT,
  ENTRY_MID_PT,
  ENTRY_GATE_PT,
  REJOIN_INTERCEPT_PT,
  ENT1_TRACK_DEG,
  ENT1_ROUTE,
  calcAlongTrackENT1,
  calcCrossTrackENT1,
} from '../../../src/modules/traffic/breakout.js';
import { initAircraftState, stepAircraft } from '../../../src/modules/traffic/flight-engine.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const mooseJaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8')
);
const pat = mooseJaw.routes[0];
const ent1 = mooseJaw.routes.find((r) => r.id === 'ENT1') || ENT1_ROUTE;

test('Breakout Stage 1: initiates climb to 4,500 ft MSL, accelerates towards 220 KIAS, and vectors to breakout point', () => {
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: 0,
    y: -28181, // Downwind leg
    alt: 3500,
    headingDeg: 118,
    iasKt: 140,
    phase: 'breakout',
    command: 'breakout',
    mode: 'PHYSICS',
  });

  // Step 20 seconds into climb
  for (let t = 0; t < 20.0; t += 0.05) {
    stepBreakout(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
  }
  assert.ok(ac.alt > 3500, `Aircraft should climb past 3,500 ft, got ${ac.alt} ft`);
  assert.ok(ac.iasKt > 140, `Aircraft should accelerate past 140 kt, got ${ac.iasKt} kt`);

  // Step to level-off at 4,500 ft MSL (t = 45s)
  for (let t = 20.0; t < 45.0; t += 0.05) {
    stepBreakout(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
  }
  assert.ok(
    Math.abs(ac.alt - 4500) <= 100,
    `Aircraft should capture 4,500 ft MSL within ±100 ft tolerance, got ${ac.alt} ft`
  );
  assert.ok(
    Math.abs(ac.iasKt - 220) <= 15,
    `Aircraft should accelerate towards 220 KIAS, got ${ac.iasKt} kt`
  );
  assert.equal(ac.intent, 'overhead', 'Breakout maintains overhead intent');
});

test('Breakout Stage 1: smooth pitch decay over last 300 ft of climb (Pillar 8 climb arrest)', () => {
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -5000,
    y: -20000,
    alt: 4100,
    headingDeg: 270,
    iasKt: 200,
    phase: 'breakout',
    command: 'breakout',
    mode: 'PHYSICS',
  });

  // Step through 4,200 to 4,500 ft
  let altCaptured = false;
  for (let t = 0; t < 25.0; t += 0.05) {
    stepBreakout(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
    if ((ac.alt ?? 0) >= 4480) {
      altCaptured = true;
      break;
    }
  }

  assert.ok(altCaptured, `Aircraft should capture 4,500 ft, got ${ac.alt} ft`);
  // Over the final 300 ft, pitch should have decayed towards 0°
  assert.ok(ac.pitchDeg <= 2.0, `Pitch should smoothly decay to ~0° at 4,500 ft, got ${ac.pitchDeg}°`);
});

test('Breakout Stage 2: continuous descending rejoin arc from breakout point to 3,500 ft curving toward Entry 1', () => {
  // Position aircraft at the Breakout Point at 4,500 ft and 220 KIAS
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -10974,
    y: -24252,
    alt: 4500,
    headingDeg: 270,
    iasKt: 220,
    phase: 'breakout',
    command: 'breakout',
    mode: 'PHYSICS',
  });

  // Step 25 seconds into descending rejoin arc
  for (let t = 0; t < 25.0; t += 0.05) {
    stepBreakout(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
  }

  // Aircraft should descend towards 3,500 ft MSL
  assert.ok(ac.alt < 4500, `Aircraft should descend from 4,500 ft, got ${ac.alt} ft`);
  assert.ok(ac.alt >= 3400, `Aircraft should not undershoot 3,500 ft, got ${ac.alt} ft`);

  // Speed should maintain 220 KIAS (±10 kt)
  assert.ok(Math.abs(ac.iasKt - 220) <= 10, `Speed should maintain ~220 KIAS, got ${ac.iasKt} kt`);

  // Heading should curve towards Entry 1 track (~034°)
  const turnDeg = Math.abs(wrapDeg180(ac.headingDeg - 270));
  assert.ok(
    turnDeg > 20,
    `Heading should curve towards Entry 1, turned ${turnDeg.toFixed(1)}° from 270° (now ${ac.headingDeg.toFixed(1)}°)`
  );
});

test('Breakout Stage 2 to tangent capture: intercept occurs 2 NM prior to circuit entry along ENT1 path with zero coordinate jumping (<25 ft/frame)', () => {
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -10974,
    y: -24252,
    alt: 4500,
    headingDeg: 270,
    iasKt: 220,
    phase: 'breakout',
    command: 'breakout',
    mode: 'PHYSICS',
  });

  let maxFrameJump = 0;
  let prevX = ac.x;
  let prevY = ac.y;
  let captured = false;
  let captureState = null;

  for (let t = 0; t < 150.0; t += 0.05) {
    if (ac.mode === 'BLENDING') {
      captured = true;
      captureState = { ...ac };
      break;
    }

    stepBreakout(ac, ent1, { windFromDeg: 360, windKt: 0 }, 0.05);

    if (ac.mode === 'BLENDING') {
      captured = true;
      captureState = { ...ac };
      break;
    }

    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);

    const jump = Math.hypot(ac.x - prevX, ac.y - prevY);
    if (jump > maxFrameJump) maxFrameJump = jump;
    prevX = ac.x;
    prevY = ac.y;
  }

  assert.ok(captured, 'Aircraft should tangentially capture ENT1 and enter BLENDING mode');
  assert.equal(captureState.phase, 'entry', 'Phase must be entry on capture');
  assert.equal(captureState.routeId, 'ENT1', 'Route must be ENT1 on capture');
  assert.equal(captureState.intent, 'overhead', 'Intent must be overhead break');

  // Verify altitude and speed at intercept
  assert.ok(
    Math.abs(captureState.alt - 3500) <= 100,
    `Intercept altitude must be 3,500 ft MSL (±100 ft), got ${captureState.alt} ft`
  );
  assert.ok(
    Math.abs(captureState.iasKt - 220) <= 10,
    `Intercept airspeed must be 220 KIAS (±10 kt), got ${captureState.iasKt} kt`
  );

  // Verify intercept location: occurs along ENT1 path, near or prior to 2 NM point (10256, -38141)
  const alongTrack = calcAlongTrackENT1(captureState);
  const crossTrack = calcCrossTrackENT1(captureState);
  assert.ok(
    Math.abs(crossTrack) <= 250,
    `Lateral cross-track error must be <= 250 ft, got ${crossTrack.toFixed(1)} ft`
  );
  // 2 NM point is along ≈ 9815 ft; intercept must occur prior to or near 2 NM point
  assert.ok(
    alongTrack <= 9815 + 500 && alongTrack >= 0,
    `Intercept must occur along ENT1 path near or prior to 2 NM point (along <= 10315 ft), got ${alongTrack.toFixed(1)} ft`
  );
  const distTo2NM = Math.hypot(captureState.x - REJOIN_INTERCEPT_PT.x, captureState.y - REJOIN_INTERCEPT_PT.y);
  assert.ok(
    distTo2NM <= 3650, // within 0.6 NM of target 2 NM intercept point
    `Intercept must be near 2 NM target point (within 3650 ft), got ${distTo2NM.toFixed(1)} ft`
  );

  // Frame jump tolerance: strictly < 25 ft/frame (zero coordinate teleportation)
  assert.ok(
    maxFrameJump <= 25.0,
    `Maximum frame-to-frame jump must be < 25 ft (zero coordinate teleportation), got ${maxFrameJump.toFixed(2)} ft`
  );
});

test('Breakout Rollout: settles to ENT1 track (~034°), wings level (bank = 0°), 220 KIAS, 3,500 ft', () => {
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -10974,
    y: -24252,
    alt: 4500,
    headingDeg: 270,
    iasKt: 220,
    phase: 'breakout',
    command: 'breakout',
    mode: 'PHYSICS',
  });

  let maxFrameJump = 0;
  let prevX = ac.x;
  let prevY = ac.y;

  for (let t = 0; t < 150.0; t += 0.05) {
    if (ac.mode === 'BLENDING') {
      // Step through 1.0s cubic smoothstep blend
      ac._blendTimer = (ac._blendTimer || 0) + 0.05;
      const u = Math.min(1, ac._blendTimer / 1.0);
      const s = 3 * u * u - 2 * u * u * u;
      const start = ac._blendStart;
      const target = ac._blendTarget;
      ac.x = start.x + (target.x - start.x) * s;
      ac.y = start.y + (target.y - start.y) * s;
      ac.alt = start.alt + (target.alt - start.alt) * s;
      ac.headingDeg = start.headingDeg + wrapDeg180(target.headingDeg - start.headingDeg) * s;
      ac.bankDeg = (start.bankDeg || 0) * (1 - s);
      if (u >= 1.0) {
        ac.mode = 'RAIL';
        ac.distFt = target.distFt;
        break;
      }
    } else {
      stepBreakout(ac, ent1, { windFromDeg: 360, windKt: 0 }, 0.05);
      if (ac.mode !== 'BLENDING') {
        stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
      }
    }

    const jump = Math.hypot(ac.x - prevX, ac.y - prevY);
    if (jump > maxFrameJump) maxFrameJump = jump;
    prevX = ac.x;
    prevY = ac.y;
  }

  assert.equal(ac.mode, 'RAIL', 'Mode must settle to RAIL on ENT1');
  assert.equal(ac.phase, 'entry', 'Phase must be entry');
  assert.ok(
    Math.abs(ac.headingDeg - ENT1_TRACK_DEG) <= 5.0,
    `Heading must settle to ENT1 track (${ENT1_TRACK_DEG.toFixed(1)}° ±5°), got ${ac.headingDeg.toFixed(1)}°`
  );
  assert.ok(
    Math.abs(ac.bankDeg) <= 1.0,
    `Wings must be level (bank = 0° ±1°), got ${ac.bankDeg.toFixed(1)}°`
  );
  assert.ok(
    Math.abs(ac.alt - 3500) <= 50,
    `Altitude must be 3,500 ft MSL (±50 ft), got ${ac.alt} ft`
  );
  assert.ok(
    Math.abs(ac.iasKt - 220) <= 5,
    `Speed must be 220 KIAS (±5 kt), got ${ac.iasKt} kt`
  );
  assert.ok(
    maxFrameJump <= 25.0,
    `Frame-to-frame movement must not exceed 25 ft throughout rollout, max was ${maxFrameJump.toFixed(2)} ft`
  );
});
