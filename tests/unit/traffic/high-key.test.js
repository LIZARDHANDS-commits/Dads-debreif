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
  stepHighKey,
} from '../../../src/modules/traffic/high-key.js';
import { initAircraftState, stepAircraft } from '../../../src/modules/traffic/flight-engine.js';
import { getNavPlan } from '../../../src/modules/traffic/nav-plans.js';
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
