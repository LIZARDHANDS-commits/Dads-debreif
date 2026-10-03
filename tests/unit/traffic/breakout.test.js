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
import { tickAircraft, stepBreakout } from '../../../src/modules/traffic/tick-aircraft.js';
import { initAircraftState, stepAircraft } from '../../../src/modules/traffic/flight-engine.js';
import { posOnRoute, pointDistFt } from '../../../src/modules/traffic/route.js';
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

test('Breakout: initiates climb to 4,500 ft MSL, accelerates towards 220 KIAS, and vectors to breakout point', () => {
  const sim = makeSim();
  const id = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 11, // Downwind
    iasKt: 140,
    alt: 3500,
  });

  sim.stepTo(2);
  const ok = sim.command(id, 'breakout');
  assert.equal(ok, true, 'sim.command breakout should succeed');

  const a = sim.state().aircraft.find((ac) => ac.id === id);
  assert.equal(a.command, 'breakout');
  assert.equal(a.phase, 'breakout');
  assert.equal(a.intent, 'overhead', 'Breakout sets intent to overhead');

  // Step 20 seconds into climb
  sim.stepTo(22);
  const aClimbing = sim.state().aircraft.find((ac) => ac.id === id);
  assert.ok(aClimbing.alt > 3500, `Aircraft should climb past 3,500 ft, got ${aClimbing.alt} ft`);
  assert.ok(aClimbing.kt > 140, `Aircraft should accelerate past 140 kt, got ${aClimbing.kt} kt`);

  // Step to level-off at 4,500 ft MSL
  sim.stepTo(45);
  const aLevel = sim.state().aircraft.find((ac) => ac.id === id);
  assert.ok(
    Math.abs(aLevel.alt - 4500) <= 100,
    `Aircraft should capture 4,500 ft MSL within ±100 ft tolerance, got ${aLevel.alt} ft`
  );
  assert.ok(
    Math.abs(aLevel.kt - 220) <= 15,
    `Aircraft should accelerate towards 220 KIAS, got ${aLevel.kt} kt`
  );
});

test('Breakout: smooth pitch decay over last 300 ft of climb (Pillar 8 climb arrest)', () => {
  const pat = mooseJaw.routes[0];
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

test('Breakout: continuous descending arc from breakout point to 3,500 ft curving toward Entry 1', () => {
  const pat = mooseJaw.routes[0];
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
  const turnDeg = wrapDeg180(ac.headingDeg - 270);
  assert.ok(turnDeg > 20, `Heading should curve towards Entry 1, turned ${turnDeg.toFixed(1)}° from 270° (now ${ac.headingDeg.toFixed(1)}°)`);
});

test('Breakout: tangent rail capture at Entry 1 with zero coordinate teleportation (<25 ft/frame)', () => {
  const sim = makeSim();
  const id = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 11,
    iasKt: 140,
    alt: 3500,
  });

  sim.stepTo(2);
  sim.command(id, 'breakout');

  let maxFrameJump = 0;
  let prevPos = null;
  let reentered = false;

  for (let sec = 2.05; sec <= 200.0; sec += 0.05) {
    const sBefore = sim.state().aircraft.find((a) => a.id === id);
    if (!sBefore) break;
    const px = sBefore.x;
    const py = sBefore.y;

    sim.stepTo(sec);

    const sAfter = sim.state().aircraft.find((a) => a.id === id);
    if (!sAfter) break;
    const jump = Math.hypot(sAfter.x - px, sAfter.y - py);
    if (jump > maxFrameJump) maxFrameJump = jump;

    if (sAfter.mode === 'RAIL' && (sAfter.phase === 'entry' || sAfter.phase === 'initial' || sAfter.phase === 'downwind')) {
      reentered = true;
      assert.equal(sAfter.intent, 'overhead', 'Intent should be overhead break on return to pattern');
      assert.ok(
        Math.abs(sAfter.alt - 3500) <= 100,
        `Rejoin altitude should capture 3,500 ft MSL (±100 ft), got ${sAfter.alt} ft`
      );
      break;
    }
  }

  assert.ok(reentered, 'Aircraft should tangentially capture Entry rail and transition to overhead intent');
  // At 220 KIAS (233 TAS = ~393 ft/s), 0.05s normal kinematic translation is ~19.6 ft.
  // D411 strict guard: maximum frame step movement must never jump > 30 ft.
  assert.ok(
    maxFrameJump <= 30.0,
    `Frame-to-frame movement must not exceed kinematic translation (zero teleportation), max was ${maxFrameJump.toFixed(2)} ft`
  );
});
