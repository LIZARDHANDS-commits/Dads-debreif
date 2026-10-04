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
import { tickAircraft } from '../../../src/modules/traffic/tick-aircraft.js';
import { routeLengthFt, closestDistFt } from '../../../src/modules/traffic/route.js';
import { ktToFtps } from '../../../src/core/units.js';
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

// Rewritten with Patrick's yes (card, 4 Oct 09:47Z): the rejoin rolls out on the ENT1 line and hands straight
// over (no 1 s blend), at least 1 NM before the merge (TR-R34). Patrick, 09:21Z: at the hand-over the aircraft's
// vector is in line with the track, so nothing snaps.
// Margins: ±100 ft and ±5° from the shared table (docs/TESTING.md). "No jump" is checked frame to frame: the
// place moves by its ground speed within 5 ft, the heading by under 2° and the bank by under 5° in a 0.05 s step
// (a snap shows as tens of feet or degrees in one step; a 90°/s roll is 4.5° a step).
const NM_FT = 6076;

/** Flies the breakout from the breakout point, calm, until it hands over to ENT1 or `limitSec` runs out. */
function flyToHandOver(limitSec = 200) {
  const ac = initAircraftState({
    id: 'A1', type: 'CT-156', x: -10974, y: -24252, alt: 4500, headingDeg: 270, iasKt: 220,
    phase: 'breakout', command: 'breakout', mode: 'PHYSICS',
  });
  const env = { windFromDeg: 360, windKt: 0 };
  let prev = null, worst = { jumpFt: 0, hdgDeg: 0, bankDeg: 0 };
  const note = (a) => {
    if (prev) {
      const moved = Math.hypot(a.x - prev.x, a.y - prev.y);
      const expected = ktToFtps(prev.groundSpeedKt ?? prev.gsKt ?? 220) * 0.05;
      worst.jumpFt = Math.max(worst.jumpFt, Math.abs(moved - expected));
      worst.hdgDeg = Math.max(worst.hdgDeg, Math.abs(wrapDeg180(a.headingDeg - prev.headingDeg)));
      worst.bankDeg = Math.max(worst.bankDeg, Math.abs((a.bankDeg ?? 0) - (prev.bankDeg ?? 0)));
    }
    prev = { x: a.x, y: a.y, headingDeg: a.headingDeg, bankDeg: a.bankDeg, groundSpeedKt: a.groundSpeedKt, gsKt: a.gsKt };
  };
  for (let t = 0; t < limitSec; t += 0.05) {
    stepBreakout(ac, ent1, env, 0.05);
    if (ac.mode === 'RAIL') return { ac, handOver: { ...ac }, worst, env };
    stepAircraft(ac, ac.navPlan, env, 0.05);
    note(ac);
  }
  return { ac, handOver: null, worst, env };
}

test('Breakout rejoin: hands over on the ENT1 line at pattern height, track along it, wings level, at least 1 NM before the merge, with no jump', () => {
  const { handOver, worst } = flyToHandOver();
  assert.ok(handOver, 'the breakout should hand over to ENT1');
  assert.equal(handOver.phase, 'entry');
  assert.equal(handOver.routeId, 'ENT1');
  assert.equal(handOver.intent, 'overhead');
  assert.ok(Math.abs(handOver.alt - 3500) <= 100, `at pattern height (3,500 ±100 ft), got ${handOver.alt.toFixed(0)} ft`);
  assert.ok(Math.abs(calcCrossTrackENT1(handOver)) <= 100, `on the ENT1 line (±100 ft), got ${calcCrossTrackENT1(handOver).toFixed(0)} ft off`);
  const trackDeg = handOver.trackDeg ?? handOver.headingDeg;
  assert.ok(Math.abs(wrapDeg180(trackDeg - ENT1_TRACK_DEG)) <= 5, `track along the line (±5°), got ${trackDeg.toFixed(1)}°`);
  assert.ok(Math.abs(handOver.bankDeg ?? 0) <= 5, `wings level (±5°), got ${(handOver.bankDeg ?? 0).toFixed(1)}°`);
  const toMergeFt = routeLengthFt(ent1) - closestDistFt(ent1, handOver);
  assert.ok(toMergeFt >= NM_FT, `at least 1 NM before the merge (TR-R34), got ${(toMergeFt / NM_FT).toFixed(2)} NM`);
  assert.ok(worst.jumpFt <= 5, `no jump in place, worst ${worst.jumpFt.toFixed(1)} ft in a step`);
  assert.ok(worst.hdgDeg <= 2, `no snap in heading, worst ${worst.hdgDeg.toFixed(2)}° in a step`);
  assert.ok(worst.bankDeg <= 5, `no snap in bank, worst ${worst.bankDeg.toFixed(2)}° in a step`);
});

test('Breakout rejoin: after the hand-over it carries on up ENT1 wings level at 3,500 ft and 220 KIAS, with no jump', () => {
  const { ac, handOver, env } = flyToHandOver();
  assert.ok(handOver, 'the breakout should hand over to ENT1');
  let prev = { x: ac.x, y: ac.y, headingDeg: ac.headingDeg, bankDeg: ac.bankDeg };
  let worstJumpFt = 0, worstHdgDeg = 0, worstBankDeg = 0;
  for (let t = 0; t < 10; t += 0.05) {
    tickAircraft(ac, 0.05, env, ent1);
    const moved = Math.hypot(ac.x - prev.x, ac.y - prev.y);
    worstJumpFt = Math.max(worstJumpFt, Math.abs(moved - ktToFtps(ac.groundSpeedKt ?? ac.gsKt ?? 220) * 0.05));
    worstHdgDeg = Math.max(worstHdgDeg, Math.abs(wrapDeg180(ac.headingDeg - prev.headingDeg)));
    worstBankDeg = Math.max(worstBankDeg, Math.abs((ac.bankDeg ?? 0) - (prev.bankDeg ?? 0)));
    prev = { x: ac.x, y: ac.y, headingDeg: ac.headingDeg, bankDeg: ac.bankDeg };
  }
  assert.equal(ac.mode, 'RAIL');
  assert.equal(ac.phase, 'entry');
  assert.ok(Math.abs(wrapDeg180(ac.headingDeg - ENT1_TRACK_DEG)) <= 5, `heading along ENT1 (±5°, calm), got ${ac.headingDeg.toFixed(1)}°`);
  assert.ok(Math.abs(ac.bankDeg ?? 0) <= 5, `wings level (±5°), got ${(ac.bankDeg ?? 0).toFixed(1)}°`);
  assert.ok(Math.abs(ac.alt - 3500) <= 100, `3,500 ft (±100), got ${ac.alt.toFixed(0)} ft`);
  assert.ok(Math.abs(ac.iasKt - 220) <= 10, `220 KIAS (±10), got ${ac.iasKt.toFixed(0)} kt`);
  assert.ok(worstJumpFt <= 5, `no jump in place, worst ${worstJumpFt.toFixed(1)} ft in a step`);
  assert.ok(worstHdgDeg <= 2, `no snap in heading, worst ${worstHdgDeg.toFixed(2)}° in a step`);
  assert.ok(worstBankDeg <= 5, `no snap in bank, worst ${worstBankDeg.toFixed(2)}° in a step`);
});
