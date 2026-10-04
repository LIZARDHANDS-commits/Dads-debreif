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

import {
  HIGH_KEY_PT,
  RWY_HDG_DEG,
  RUN_IN_LEN_FT,
  RUN_IN_PT,
  computeRunInPoint,
  computeHighKeyCorridor,
  calcHighKeyPitch,
  calcHighKeyTargetSpeed,
  calcHighKeyIntercept,
  buildHighKeyApproachRail,
  buildFullHighKeyRail,
  stepHighKey,
} from '../../../src/modules/traffic/high-key.js';
import { initAircraftState, stepAircraft } from '../../../src/modules/traffic/flight-engine.js';
import { getNavPlan } from '../../../src/modules/traffic/nav-plans.js';
import { tickAircraft } from '../../../src/modules/traffic/tick-aircraft.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const mooseJaw = JSON.parse(
  readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8')
);

// ── 1. GEOMETRY GROUND TRUTH TESTS ───────────────────────────────────────────
test('High Key Geometry: 1/8 NM run-in point aligns exactly 660 ft prior on runway heading 298°', () => {
  assert.equal(HIGH_KEY_PT.x, 3104);
  assert.equal(HIGH_KEY_PT.y, -3194);
  assert.equal(HIGH_KEY_PT.alt, 5000);
  assert.equal(RWY_HDG_DEG, 298);
  assert.equal(RUN_IN_LEN_FT, 660);

  const runIn = computeRunInPoint();
  // 660 ft prior on heading 298°:
  // x = 3104 - 660 * sin(298°) ≈ 3686.75
  // y = -3194 - 660 * cos(298°) ≈ -3503.85
  assert.ok(Math.abs(runIn.x - 3686.75) <= 1.0, `Run-in X should be ~3687 ft, got ${runIn.x}`);
  assert.ok(Math.abs(runIn.y - (-3503.85)) <= 1.0, `Run-in Y should be ~-3504 ft, got ${runIn.y}`);
  assert.equal(runIn.alt, 5000);
  assert.equal(runIn.headingDeg, 298);

  // Vector distance check: exactly 660 ft
  const dist = Math.hypot(HIGH_KEY_PT.x - runIn.x, HIGH_KEY_PT.y - runIn.y);
  assert.ok(Math.abs(dist - 660) <= 0.01, `Distance should be exactly 660 ft, got ${dist}`);

  // Heading check: bearing from runIn to HIGH_KEY_PT is 298°
  const bearing = (Math.atan2(HIGH_KEY_PT.x - runIn.x, HIGH_KEY_PT.y - runIn.y) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(wrapDeg180(bearing - 298)) <= 0.01, `Bearing to High Key must be 298°, got ${bearing}`);

  const corridor = computeHighKeyCorridor();
  assert.equal(corridor.lengthFt, 660);
  assert.equal(corridor.headingDeg, 298);
});

// ── 2. PILLAR 8 CLIMB ARREST PITCH CALCULATION ──────────────────────────────
test('Pillar 8 Climb Arrest: pitch smoothly decays to 0° over 4,700 to 5,000 ft MSL', () => {
  const nominalPitch = 10;

  // Below 4,700 ft: full nominal climb pitch
  assert.equal(calcHighKeyPitch(2400, nominalPitch), nominalPitch);
  assert.equal(calcHighKeyPitch(4000, nominalPitch), nominalPitch);
  assert.equal(calcHighKeyPitch(4700, nominalPitch), nominalPitch);

  // Over 4,700 to 5,000 ft: smooth linear decay
  const pitch4850 = calcHighKeyPitch(4850, nominalPitch);
  assert.ok(Math.abs(pitch4850 - 5.0) <= 0.01, `Pitch at 4,850 ft should be 5.0°, got ${pitch4850}`);

  const pitch4950 = calcHighKeyPitch(4950, nominalPitch);
  assert.ok(Math.abs(pitch4950 - 1.67) <= 0.05, `Pitch at 4,950 ft should be ~1.67°, got ${pitch4950}`);

  // At or above 5,000 ft: strictly 0°
  assert.equal(calcHighKeyPitch(5000, nominalPitch), 0);
  assert.equal(calcHighKeyPitch(5100, nominalPitch), 0);
});

// ── 3. SPEED SCHEDULE & DECELERATION ────────────────────────────────────────
test('Speed Schedule: 140 KIAS in Phase 1 & 2, smoothly decelerates from 140 to 120 KIAS in Phase 3', () => {
  // Phase 1 and Phase 2 maintain 140 KIAS
  assert.equal(calcHighKeyTargetSpeed(1), 140);
  assert.equal(calcHighKeyTargetSpeed(2), 140);

  // Phase 3 (run-in corridor):
  // At entry (alongTrack = 0): 140 KIAS
  assert.equal(calcHighKeyTargetSpeed(3, 0), 140);

  // Halfway through 1/8 NM (alongTrack = 330 ft): 130 KIAS
  const midSpeed = calcHighKeyTargetSpeed(3, 330);
  assert.ok(Math.abs(midSpeed - 130) <= 0.1, `Mid-corridor speed should be ~130 KIAS, got ${midSpeed}`);

  // At High Key (alongTrack = 660 ft): 120 KIAS
  const finalSpeed = calcHighKeyTargetSpeed(3, 660);
  assert.ok(Math.abs(finalSpeed - 120) <= 0.1, `High Key speed should be 120 KIAS, got ${finalSpeed}`);
});

// ── 4. PHASE 1: CLIMBING KINEMATIC TURN AT 140 KIAS ─────────────────────────
test('Phase 1: climbs at 140 KIAS with full excess power toward 5,000 ft MSL', () => {
  const pat = mooseJaw.routes[0];
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -4066,
    y: 681,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  // Step 2 seconds into climb
  for (let t = 0; t < 2.0; t += 0.05) {
    stepHighKey(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
  }

  // Maintains 140 KIAS within pilot domain tolerance (±10 kt)
  assert.ok(Math.abs(ac.iasKt - 140) <= 10, `Speed should maintain ~140 KIAS, got ${ac.iasKt}`);
  assert.equal(ac.targetSpeedKt, 140, 'Target speed must be 140 KIAS');
  assert.equal(ac.targetAltFt, 5000, 'Target altitude must be 5,000 ft MSL');

  // Should be climbing
  assert.ok(ac.alt > 2450, `Aircraft should climb from 2,400 ft, got ${ac.alt} ft`);

  // Engine is powered, not failed
  assert.equal(ac.engineFailed, false, 'Engine must remain powered during climb to High Key');

  // Commanded pitch attitude is nominal climb pitch (10°)
  assert.equal(ac.pitchDeg, 10, 'Pitch should be 10° climb pitch at 2,400 ft');

  // Bank modulates into coordinated turn toward approach gate
  assert.ok(ac.bankDeg < 0, `Aircraft should be banking into left turn, got ${ac.bankDeg}`);
});

// ── 5. PHASE 1 TO PHASE 2: PILLAR 8 CLIMB ARREST & LEVEL OFF AT 5,000 FT ────
test('Pillar 8 Climb Arrest & Level-Off: levels off at 5,000 ft at 140 KIAS without altitude overshoot', () => {
  const pat = mooseJaw.routes[0];
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: 8000,
    y: -6000,
    alt: 4600,
    headingDeg: 120,
    iasKt: 140,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  let reached5000 = false;
  let maxAlt = 4600;

  for (let t = 0; t < 30.0; t += 0.05) {
    stepHighKey(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);

    if (ac.alt > maxAlt) maxAlt = ac.alt;
    if (ac.alt >= 4950) {
      reached5000 = true;
      // In Pillar 8 arrest buffer, pitch must decay towards 0°
      assert.ok(ac.pitchDeg <= 2.0, `Pitch must decay near 0° at 5,000 ft, got ${ac.pitchDeg}°`);
    }
  }

  assert.ok(reached5000, 'Aircraft must reach 5,000 ft MSL');
  // No altitude overshoot: max altitude does not exceed 5,050 ft MSL
  assert.ok(maxAlt <= 5050, `Altitude must not overshoot 5,000 ft MSL, peak was ${maxAlt} ft`);
  assert.ok(Math.abs(ac.alt - 5000) <= 50, `Level altitude must hold 5,000 ft (±50 ft), got ${ac.alt} ft`);
  assert.ok(Math.abs(ac.iasKt - 140) <= 10, `Airspeed must hold 140 KIAS at 5,000 ft level off, got ${ac.iasKt}`);
});

// ── 6. PHASE 3: 1/8 NM RUN-IN CAPTURE WINGS LEVEL ON RUNWAY HEADING 298° ────
test('Phase 3: captures the 1/8 NM run-in corridor wings level on runway heading 298°', () => {
  const pat = mooseJaw.routes[0];
  // Position aircraft just upstream of the run-in point at 5,000 ft MSL
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: 3900,
    y: -3600,
    alt: 5000,
    headingDeg: 295,
    bankDeg: 5,
    iasKt: 140,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  // Step into the run-in corridor
  for (let t = 0; t < 5.0; t += 0.05) {
    stepHighKey(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);
    if (ac._highKeyPhase === 3) break;
  }

  assert.equal(ac._highKeyPhase, 3, 'Must capture Phase 3 at the 1/8 NM run-in corridor');
  assert.equal(ac.targetBankDeg, 0, 'Target bank must be 0° (wings level) in run-in');
  assert.equal(ac.pitchDeg, 0, 'Pitch must be 0° (level flight)');
  assert.ok(Math.abs(ac.headingDeg - 298) <= 5, `Heading must align with 298° (±5°), got ${ac.headingDeg}°`);
});

// ── 7. PHASE 3 DECELERATION & TRANSITION AT HIGH KEY ─────────────────────────
test('Phase 3 & Transition: decelerates from 140 KIAS to 120 KIAS upon reaching High Key and transitions to PFL', () => {
  const pat = mooseJaw.routes[0];
  // Spawn directly at the run-in entry point (3687, -3504) at 5,000 ft and 140 KIAS
  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: RUN_IN_PT.x,
    y: RUN_IN_PT.y,
    alt: 5000,
    headingDeg: 298,
    bankDeg: 0,
    iasKt: 140,
    phase: 'high_key_run_in',
    command: 'climb_high_key',
    _highKeyPhase: 3,
    mode: 'PHYSICS',
  });

  assert.equal(ac.iasKt, 140, 'Initial speed at run-in entry is 140 KIAS');

  let transitioned = false;
  // Fly along the 660 ft corridor to High Key (~3-4 seconds at ~130 kt)
  for (let t = 0; t < 6.0; t += 0.05) {
    stepHighKey(ac, pat, { windFromDeg: 360, windKt: 0 }, 0.05);
    stepAircraft(ac, ac.navPlan, { windFromDeg: 360, windKt: 0 }, 0.05);

    if (ac.phase === 'pfl_high_key' || ac.phase === 'low_key' || ac._highKeyPhase === 'complete') {
      transitioned = true;
      break;
    }
  }

  assert.ok(transitioned, 'Aircraft must transition to pfl_high_key upon reaching High Key');
  // Decelerates from 140 KIAS to 120 KIAS upon reaching High Key
  assert.ok(Math.abs(ac.iasKt - 120) <= 5, `Airspeed at High Key must reach 120 KIAS (±5 kt), got ${ac.iasKt}`);
  // Position is within 150 ft of High Key (3104, -3194)
  const distToHk = Math.hypot(HIGH_KEY_PT.x - ac.x, HIGH_KEY_PT.y - ac.y);
  assert.ok(distToHk <= 150, `Must be within 150 ft of High Key, got ${distToHk} ft`);
  assert.equal(ac.alt, 5000, 'Altitude at High Key is 5,000 ft MSL');

  // Verify Anti-Flythrough Contract: command cleared, pflRail attached, mode is RAIL
  assert.equal(ac.command, null, 'Command must be cleared to null upon reaching High Key');
  assert.equal(ac.mode, 'RAIL', 'Mode must be RAIL');
  assert.ok(ac.pflRail && ac.pflRail.length > 0, 'pflRail must be attached');

  // Step 50 ticks in tickAircraft: verify aircraft actively flies the PFL rail (descending and advancing)
  const startAlt = ac.alt;
  const startIdx = ac.pflRailIndex ?? 0;
  for (let s = 0; s < 50; s++) {
    tickAircraft(ac, 0.05, { windFromDeg: 360, windKt: 0 }, pat);
  }
  assert.ok((ac.pflRailIndex ?? 0) > startIdx, `pflRailIndex must advance, got ${ac.pflRailIndex}`);
  assert.ok(ac.alt < startAlt, `Aircraft must be descending along PFL spiral, got ${ac.alt} ft`);
  assert.notEqual(ac.phase, 'initial', 'Must not fly straight through onto initial pattern leg');
});

// ── 8. INVARIANT GUARDS: ZERO COORDINATE SNAPPING OR NaN/INFINITY ────────────
test('Invariant Guards: zero coordinate snapping or NaN/Infinity across full procedure', () => {
  const pat = mooseJaw.routes[0];
  const env = { windFromDeg: 28, windKt: 15 }; // Test under crosswind conditions

  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -4066,
    y: 681,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  let prevX = ac.x;
  let prevY = ac.y;

  for (let t = 0; t < 10.0; t += 0.05) {
    stepHighKey(ac, pat, env, 0.05);
    stepAircraft(ac, ac.navPlan, env, 0.05);

    // Assert zero NaN or Infinity on all aerodynamic telemetry
    assert.ok(Number.isFinite(ac.x), `x must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.y), `y must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.alt), `alt must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.headingDeg), `headingDeg must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.bankDeg), `bankDeg must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.iasKt), `iasKt must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.pitchDeg), `pitchDeg must be finite at t=${t}`);
    assert.ok(Number.isFinite(ac.targetSpeedKt), `targetSpeedKt must be finite at t=${t}`);

    // Assert zero coordinate snapping: frame displacement bounded by physical ground speed * dt * 1.5
    const dtFt = Math.hypot(ac.x - prevX, ac.y - prevY);
    const maxPhysicalDistPerTick = (ac.gsKt * 1.68781) * 0.05 * 1.5 + 5.0;
    assert.ok(dtFt <= maxPhysicalDistPerTick, `Coordinate snap detected: delta was ${dtFt} ft`);

    prevX = ac.x;
    prevY = ac.y;
  }
});

// ── 9. KINEMATIC APPROACH RAIL SYNTHESIS ────────────────────────────────────
test('buildHighKeyApproachRail: generates authentic circuit rail with required telemetry fields', () => {
  const env = { windFromDeg: 360, windKt: 10 };
  const acDepart = { x: -4066, y: 681, alt: 2400, headingDeg: 298, iasKt: 140, bankDeg: 0 };

  const rail = buildHighKeyApproachRail(acDepart, env);
  assert.ok(Array.isArray(rail), 'Rail must be an array');
  assert.ok(rail.length > 20, `Rail should contain comprehensive waypoints, got ${rail.length}`);
  assert.equal(rail.id, 'HIGH_KEY_APPROACH');
  assert.equal(rail.model, 'KIN');
  assert.equal(rail.loop, false);

  for (const wp of rail) {
    assert.ok(Number.isFinite(wp.x), 'wp.x must be finite');
    assert.ok(Number.isFinite(wp.y), 'wp.y must be finite');
    assert.ok(Number.isFinite(wp.alt), 'wp.alt must be finite');
    assert.ok(Number.isFinite(wp.kt), 'wp.kt must be finite');
    assert.ok(Number.isFinite(wp.headingDeg), 'wp.headingDeg must be finite');
    assert.ok(Number.isFinite(wp.bankDeg), 'wp.bankDeg must be finite');
    assert.ok(Number.isFinite(wp.g), 'wp.g must be finite');
    assert.ok(typeof wp.phase === 'string', 'wp.phase must be a string');
  }

  // Last waypoint must terminate at High Key (3104, -3194) at 5,000 ft and 120 KIAS
  const lastWp = rail[rail.length - 1];
  const distToHk = Math.hypot(lastWp.x - HIGH_KEY_PT.x, lastWp.y - HIGH_KEY_PT.y);
  assert.ok(distToHk <= 1.0, `Terminal waypoint must match High Key within 1 ft, got ${distToHk} ft`);
  assert.equal(lastWp.alt, 5000, 'Terminal altitude must be 5,000 ft');
  assert.equal(lastWp.kt, 120, 'Terminal speed must be 120 KIAS');

  // Verify south/southeast arrival rail generation
  const acSe = { x: 5000, y: -6000, alt: 5000, headingDeg: 340, iasKt: 140, bankDeg: 0 };
  const railSe = buildHighKeyApproachRail(acSe, env);
  assert.ok(railSe.length > 5, 'SE approach rail must have waypoints');
  const lastSeWp = railSe[railSe.length - 1];
  assert.ok(Math.hypot(lastSeWp.x - HIGH_KEY_PT.x, lastSeWp.y - HIGH_KEY_PT.y) <= 1.0);
});

// ── 10. NORTHWEST DEPARTURE: FULL CIRCUIT FLIGHT TO HIGH KEY ─────────────────
test('Northwest departure: flies authentic circuit to High Key with zero circling and seamless PFL transition', () => {
  const pat = mooseJaw.routes[0];
  const env = { windFromDeg: 360, windKt: 0 };

  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -4066,
    y: 681,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    bankDeg: 0,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  let maxAlt = ac.alt;
  let simulatedTime = 0;
  let transitioned = false;
  let capturedRunIn = false;

  const dt = 0.05;
  const maxTime = 130; // 130 seconds max to prevent any infinite looping

  while (simulatedTime < maxTime) {
    stepHighKey(ac, pat, env, dt);
    stepAircraft(ac, ac.navPlan, env, dt);

    if (ac.alt > maxAlt) maxAlt = ac.alt;

    // Check corridor alignment prior to or during run-in
    const distToRunIn = Math.hypot(ac.x - RUN_IN_PT.x, ac.y - RUN_IN_PT.y);
    const deltaHdgRwy = Math.abs(wrapDeg180(ac.headingDeg - RWY_HDG_DEG));
    if ((ac._highKeyPhase === 3 || distToRunIn <= 500) && deltaHdgRwy <= 10 && ac.alt >= 4900) {
      capturedRunIn = true;
    }

    if (ac.phase === 'pfl_high_key' || ac._highKeyPhase === 'complete') {
      transitioned = true;
      break;
    }

    simulatedTime += dt;
  }

  // 1. Must reach High Key without circling (in ~100-115 seconds, well under maxTime)
  assert.ok(transitioned, `Aircraft must transition to pfl_high_key, ended at t=${simulatedTime.toFixed(1)}s`);
  assert.ok(simulatedTime >= 85 && simulatedTime <= 125, `Flight time should be ~106s for circuit, took ${simulatedTime.toFixed(1)}s`);

  // 2. Altitude arrest per Pillar 8: zero overshoot above 5,050 ft
  assert.ok(maxAlt <= 5050, `Altitude must not overshoot 5,050 ft MSL, peak was ${maxAlt} ft`);
  assert.ok(Math.abs(ac.alt - 5000) <= 50, `Altitude at High Key must be 5,000 ft (±50 ft), got ${ac.alt} ft`);

  // 3. Captured run-in corridor aligned with runway heading
  assert.ok(capturedRunIn, 'Aircraft must capture run-in corridor aligned with runway heading 298°');

  // 4. Deceleration to 120 KIAS at High Key
  assert.ok(Math.abs(ac.iasKt - 120) <= 10, `Airspeed at High Key must be 120 KIAS (±10 kt), got ${ac.iasKt}`);

  // 5. Position at High Key within pilot domain tolerance
  const distToHk = Math.hypot(HIGH_KEY_PT.x - ac.x, HIGH_KEY_PT.y - ac.y);
  assert.ok(distToHk <= 150, `Distance to High Key must be <= 150 ft, got ${distToHk} ft`);

  // 6. Mode switches to RAIL for PFL descent
  assert.equal(ac.mode, 'RAIL', 'Mode must switch to RAIL upon High Key transition');
});

// ── 11. SOUTH/SOUTHEAST ARRIVAL: TANGENTIAL CAPTURE TO HIGH KEY ──────────────
test('South/Southeast arrival: smooth tangential capture into run-in and PFL transition', () => {
  const pat = mooseJaw.routes[0];
  const env = { windFromDeg: 360, windKt: 0 };

  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: 5000,
    y: -6000,
    alt: 5000,
    headingDeg: 330,
    iasKt: 140,
    bankDeg: 0,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  let simulatedTime = 0;
  let transitioned = false;
  const dt = 0.05;
  const maxTime = 60;

  while (simulatedTime < maxTime) {
    stepHighKey(ac, pat, env, dt);
    stepAircraft(ac, ac.navPlan, env, dt);

    if (ac.phase === 'pfl_high_key' || ac._highKeyPhase === 'complete') {
      transitioned = true;
      break;
    }

    simulatedTime += dt;
  }

  assert.ok(transitioned, `SE arrival must transition to pfl_high_key, ended at t=${simulatedTime.toFixed(1)}s`);
  const distToHk = Math.hypot(HIGH_KEY_PT.x - ac.x, HIGH_KEY_PT.y - ac.y);
  assert.ok(distToHk <= 250, `Distance to High Key must be <= 250 ft, got ${distToHk} ft`);
  assert.ok(Math.abs(ac.iasKt - 120) <= 10, `Airspeed at High Key must be 120 KIAS (±10 kt), got ${ac.iasKt}`);
  assert.equal(ac.mode, 'RAIL', 'Mode must switch to RAIL upon High Key transition');
});

// ── 12. HIGH KEY PFL RAIL INTEGRITY: 360° SPIRAL PATTERN (ANTI-WINDOW GLIDE GUARD) ─
test('High Key PFL Rail Integrity: Transition instantiates full 360° spiral (high_key classification) rather than cutting to downwind/window', () => {
  const pat = mooseJaw.routes[0];
  const env = { windFromDeg: 360, windKt: 0 };

  const ac = initAircraftState({
    id: 'A1',
    type: 'CT-156',
    x: -4066,
    y: 681,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    bankDeg: 0,
    phase: 'climb_high_key',
    command: 'climb_high_key',
    mode: 'PHYSICS',
  });

  let simulatedTime = 0;
  let transitioned = false;
  const dt = 0.05;
  const maxTime = 120;

  while (simulatedTime < maxTime) {
    stepHighKey(ac, pat, env, dt);
    stepAircraft(ac, ac.navPlan, env, dt);

    if (ac.phase === 'pfl_high_key' || ac._highKeyPhase === 'complete') {
      transitioned = true;
      break;
    }

    simulatedTime += dt;
  }

  assert.ok(transitioned, 'Aircraft must reach High Key and transition');
  assert.ok(ac.pflRail, 'Aircraft must have pflRail attached');
  assert.equal(ac.pflRail.classification, 'high_key', 'PFL rail must classify as high_key under pilot domain tolerances');
  assert.equal(ac.phase, 'pfl_high_key', 'Aircraft phase must be pfl_high_key, never pfl_zoom or pfl_tangent');

  const phases = [...new Set(ac.pflRail.map((p) => p.phase))];
  assert.ok(phases.includes('pfl_high_key'), 'PFL rail must include pfl_high_key turn');
  assert.ok(phases.includes('pfl_low_key'), 'PFL rail must include pfl_low_key');
  assert.ok(phases.includes('pfl_base_key'), 'PFL rail must include pfl_base_key');
  assert.ok(phases.includes('pfl_final'), 'PFL rail must include pfl_final');

  // Verify terminal touchdown at Runway 29L threshold (1,892 ft MSL)
  const lastPoint = ac.pflRail[ac.pflRail.length - 1];
  assert.equal(lastPoint.alt, 1892, 'Terminal point must land at 1,892 ft MSL');
  const distToTh = Math.hypot(3104 - lastPoint.x, -3194 - lastPoint.y);
  assert.ok(distToTh <= 50, `Terminal point must touch down at runway threshold, got dist=${distToTh.toFixed(1)} ft`);
});

// ── 5. UNIFIED HIGH KEY KINEMATIC RAIL TESTS ──────────────────────────────────
test('buildFullHighKeyRail stitches powered approach and 360° PFL spiral with zero coordinate snap (<25 ft/step)', () => {
  const ac = {
    x: 0,
    y: 0,
    alt: 2400,
    headingDeg: 298,
    iasKt: 140,
    bankDeg: 0,
  };
  const env = { windFromDeg: 310, windKt: 12 };

  const fullRail = buildFullHighKeyRail(ac, env);
  assert.ok(fullRail.length > 50, 'Full rail must contain approach + spiral waypoints');
  assert.equal(fullRail.routeId, 'PFL_HIGH_KEY');
  assert.equal(fullRail.id, 'PFL_RAIL');
  assert.equal(fullRail.classification, 'high_key');

  // Find High Key threshold waypoint
  const hkIdx = fullRail.findIndex((p) => p.tag === 'high_key');
  assert.ok(hkIdx > 0, 'Must have high_key waypoint in rail');

  // Verify all waypoints prior to High Key have engine running (engineFailed: false)
  for (let i = 0; i < hkIdx; i++) {
    assert.equal(fullRail[i].engineFailed, false, `wp[${i}] before High Key must have engineFailed=false`);
  }

  // Verify High Key threshold waypoint state
  const hkWp = fullRail[hkIdx];
  assert.equal(hkWp.alt, 5000);
  assert.ok(Math.abs(hkWp.kt - 120) <= 1.0, `High Key speed should be 120 KIAS, got ${hkWp.kt}`);

  // Invariant Guard: Zero coordinate snapping (< 25 ft/step) across the ENTIRE rail
  for (let i = 1; i < fullRail.length; i++) {
    const p0 = fullRail[i - 1];
    const p1 = fullRail[i];
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    assert.ok(d < 25, `Step distance ${d.toFixed(1)} ft between ${i - 1} and ${i} must be < 25 ft`);
  }

  // Verify terminal landing at 1,892 ft MSL
  const lastWp = fullRail[fullRail.length - 1];
  assert.equal(lastWp.alt, 1892);
});

test('buildFullHighKeyRail latches directly onto spiral when already near High Key', () => {
  const ac = {
    x: HIGH_KEY_PT.x + 200,
    y: HIGH_KEY_PT.y - 150,
    alt: 4900,
    headingDeg: 298,
    iasKt: 120,
    bankDeg: 0,
  };
  const env = { windFromDeg: 310, windKt: 10 };

  const rail = buildFullHighKeyRail(ac, env);
  assert.equal(rail.classification, 'high_key');
  assert.equal(rail[0].phase, 'pfl_high_key');
  assert.equal(rail[0].tag, 'high_key');
});



