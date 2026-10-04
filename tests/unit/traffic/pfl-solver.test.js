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

import {
  PFL_AIRFIELD,
  calcCleanGlideArrival,
  calcZoomApex,
  solvePflTangent,
  computeDragSchedule,
  findContinuousArcTangent,
  simulateTurnRollout,
} from '../../../src/modules/traffic/pfl-solver.js';
import { generatePflTrack } from '../../../src/modules/traffic/route.js';
import { FT_PER_NM } from '../../../src/core/units.js';

// ── 1. ZOOM APEX PERFORMANCE TESTS ──────────────────────────────────────────
test('PFL Zoom Apex: high speed (>150 KIAS) executes simultaneous zoom & turn with +700 to +1,000 ft gain', () => {
  const aircraft = {
    x: 10000,
    y: -10000,
    alt: 3500,
    kias: 220,
    headingDeg: 120,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const apex = calcZoomApex(aircraft, env);

  // Invariant 1: Airspeed decelerates cleanly to 120 KIAS
  assert.equal(apex.kias, 120, 'Apex airspeed must be 120 KIAS');

  // Invariant 2: Zoom altitude gain between +700 and +1,000 ft (T-6A performance chart)
  assert.ok(apex.gainFt >= 700 && apex.gainFt <= 1000, `Zoom gain must be between 700 and 1000 ft, got ${apex.gainFt}`);
  assert.equal(apex.alt, 3500 + apex.gainFt, 'Apex altitude must equal initial alt + gainFt');
  assert.equal(apex.zoomed, true, 'zoomed flag must be true');

  // Invariant 3: Heading turns toward High Key / recovery track (airfield is at x=3104, y=-3194)
  // Airfield bearing from (10000, -10000) is northwest (~315°)
  assert.notEqual(apex.headingDeg, aircraft.headingDeg, 'Heading must turn toward recovery track');
  assert.ok(apex.timeSec > 5 && apex.timeSec < 25, `Zoom duration must be physically reasonable, got ${apex.timeSec}`);
  assert.ok(apex.distanceFt > 2000 && apex.distanceFt < 6000, `Zoom advance distance must be physically reasonable, got ${apex.distanceFt}`);

  // Invariant 4: Coordinates advance with authentic wind drift
  assert.ok(Number.isFinite(apex.x) && Number.isFinite(apex.y), 'Apex coordinates must be finite');
});

test('PFL Zoom Apex: sub-150 KIAS aircraft yields zero zoom gain and level decel to 120 KIAS', () => {
  const aircraft = {
    x: 7145,
    y: -8000,
    alt: 3500,
    kias: 140,
    headingDeg: 118,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const apex = calcZoomApex(aircraft, env);

  // Invariant 1: Zero zoom altitude gain (level deceleration per SMM / NFM p.3-9)
  assert.equal(apex.gainFt, 0, 'Sub-150 KIAS aircraft must yield 0 zoom gain');
  assert.equal(apex.alt, 3500, 'Altitude must remain level at 3,500 ft');
  assert.equal(apex.zoomed, false, 'zoomed flag must be false');

  // Invariant 2: Decelerates to 120 KIAS
  assert.equal(apex.kias, 120, 'Must decelerate to 120 KIAS');
  assert.ok(apex.timeSec > 5 && apex.timeSec < 15, `Decel time must be physically realistic, got ${apex.timeSec}`);
  assert.ok(apex.distanceFt > 1000 && apex.distanceFt < 3500, `Decel distance must be realistic, got ${apex.distanceFt}`);
  assert.equal(apex.headingDeg, 118, 'Level decel maintains wings-level track heading');
});

test('PFL Zoom Apex: aircraft already at or below 120 KIAS requires zero zoom or decel time', () => {
  const aircraft = {
    x: 5000,
    y: -5000,
    alt: 3000,
    kias: 115,
    headingDeg: 298,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const apex = calcZoomApex(aircraft, env);
  assert.equal(apex.gainFt, 0);
  assert.equal(apex.timeSec, 0);
  assert.equal(apex.distanceFt, 0);
  assert.equal(apex.alt, 3000);
  assert.equal(apex.x, 5000);
  assert.equal(apex.y, -5000);
});

// ── 2. CLEAN GLIDE PERFORMANCE TESTS ─────────────────────────────────────────
test('Clean Glide Arrival: 12.15:1 still-air glide ratio matches 2.0 NM per 1,000 ft', () => {
  const fromPt = { x: 0, y: 0, alt: 5000 };
  const toPt = { x: 2 * FT_PER_NM, y: 0, alt: 4000 }; // Exactly 2.0 NM away
  const env = { windFromDeg: 360, windKt: 0 };

  const arrAlt = calcCleanGlideArrival(fromPt, toPt, env);
  // In still air, 2.0 NM must consume exactly 1,000 ft (pilot tolerance ±10 ft)
  assert.ok(Math.abs(arrAlt - 4000) <= 10, `Arrival altitude after 2.0 NM must be ~4,000 ft, got ${arrAlt}`);
});

test('Clean Glide Arrival: wind drift expands range downwind and contracts range upwind', () => {
  const fromPt = { x: 0, y: 0, alt: 5000 };
  // Gliding East (track 090°):
  const toPtEast = { x: 2 * FT_PER_NM, y: 0, alt: 4000 };

  // Case 1: 20 kt tailwind (wind from 270°)
  const tailwindEnv = { windFromDeg: 270, windKt: 20 };
  const arrTailwind = calcCleanGlideArrival(fromPt, toPtEast, tailwindEnv);

  // Case 2: 20 kt headwind (wind from 090°)
  const headwindEnv = { windFromDeg: 90, windKt: 20 };
  const arrHeadwind = calcCleanGlideArrival(fromPt, toPtEast, headwindEnv);

  // Tailwind preserves more altitude than headwind
  assert.ok(arrTailwind > 4000, `Tailwind must preserve altitude > 4,000 ft, got ${arrTailwind}`);
  assert.ok(arrHeadwind < 4000, `Headwind must lose more altitude < 4,000 ft, got ${arrHeadwind}`);
  assert.ok(arrTailwind - arrHeadwind > 200, `Tailwind vs headwind delta should exceed 200 ft, got ${arrTailwind - arrHeadwind}`);
});

// ── 3. PFL TANGENT SOLVER CLASSIFICATION TESTS ───────────────────────────────
test('PFL Tangent Solver: surplus energy (>5,300 ft MSL at High Key) classifies as high_key with surplusOrbit', () => {
  // Aircraft near High Key at 6,000 ft MSL
  const apex = {
    x: 4500,
    y: -4500,
    alt: 6000,
    headingDeg: 298,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const result = solvePflTangent(apex, env);

  assert.equal(result.classification, 'high_key');
  assert.equal(result.bankDeg, 35);
  assert.equal(result.surplusOrbit, true, 'Surplus energy must flag surplusOrbit');
  assert.ok(result.energyMargin > 300, `Surplus energy margin should be > 300 ft, got ${result.energyMargin}`);
  assert.equal(result.joinIndex, 0, 'High Key join index must be 0');
  assert.equal(result.joinPoint.tag, 'high_key');
});

test('PFL Tangent Solver: downwind / Low Key energy classifies as low_key', () => {
  // Aircraft downwind at 4,000 ft MSL approaching Low Key (cannot reach High Key at 5,000 ft)
  const apex = {
    x: 532,
    y: -6000,
    alt: 4000,
    headingDeg: 118,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const result = solvePflTangent(apex, env);

  assert.equal(result.classification, 'low_key');
  assert.equal(result.bankDeg, 35);
  assert.equal(result.surplusOrbit, false);
  assert.ok(result.energyMargin >= -50, `Energy margin at Low Key must be acceptable, got ${result.energyMargin}`);
  assert.equal(result.joinPoint.tag, 'low_key');
});

test('PFL Tangent Solver: SMM Ch 13 doctrine selects tight bank (45°) when marginal energy cuts corner to save aircraft', () => {
  // Aircraft at Low Key area at 3,200 ft MSL (500 ft below nominal 3,700 ft MSL)
  const apex = {
    x: 532,
    y: -8031,
    alt: 3200,
    headingDeg: 118,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const result = solvePflTangent(apex, env);

  // Invariant: Must select base_key recovery with tight 45° bank (cutting corner)
  assert.equal(result.classification, 'base_key');
  assert.equal(result.bankDeg, 45, 'Must select 45° bank to cut the corner');
  assert.ok(result.energyMargin >= -50, `Tight bank must restore viable energy margin, got ${result.energyMargin}`);
  assert.ok(result.joinIndex > 0, 'Must intercept along spiral');
});

test('PFL Tangent Solver: direct threshold classified when too low for any key point but can make straight-in glide', () => {
  // Aircraft on extended final (heading 298°), 2 NM from threshold at 2,300 ft MSL
  // (Threshold is 1,892 ft MSL, delta = 408 ft. 2 NM in still air requires 1,000 ft,
  // so at 1 NM away (6,000 ft), 408 ft delta is plenty: 6000 / 12.15 ≈ 493 ft)
  // Position 4,000 ft southeast of threshold:
  const apex = {
    x: 3104 - 4000 * Math.sin(298 * Math.PI / 180),
    y: -3194 - 4000 * Math.cos(298 * Math.PI / 180),
    alt: 2350,
    headingDeg: 298,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const result = solvePflTangent(apex, env);

  assert.equal(result.classification, 'direct_threshold');
  assert.equal(result.joinPoint.tag, 'threshold');
  assert.ok(result.energyMargin >= 0, `Direct threshold glide must have positive arrival margin, got ${result.energyMargin}`);
  assert.equal(result.crashPoint, null);
});

test('PFL Tangent Solver: aircraft near the perch facing runway with Base Key behind selects direct threshold, never turns backwards', () => {
  // Aircraft at normal circuit downwind near the perch (x=7146, y=-10275), having turned towards threshold (heading ~320°)
  // Base Key is behind it (at x=8793, y=-9538 or to the southeast). Altitude is 2,800 ft MSL.
  // Glide distance to threshold (~3104, -3194) is ~8,100 ft (1.33 NM).
  // Height above ground is 2,800 - 1,892 = 908 ft.
  // At 2 NM / 1,000 ft, 908 ft yields 1.81 NM range. 1.81 > 1.33 NM => POSITIVE MARGIN!
  const apex = {
    x: 7146,
    y: -10275,
    alt: 2800,
    headingDeg: 320,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const result = solvePflTangent(apex, env);

  // Invariant: Must NOT classify as base_key pointing behind the aircraft; must glide direct to threshold
  assert.equal(result.classification, 'direct_threshold');
  assert.equal(result.joinPoint.tag, 'threshold');
  assert.ok(result.energyMargin >= 0, `Must have positive arrival margin, got ${result.energyMargin}`);
  assert.equal(result.crashPoint, null);
});

test('PFL Tangent Solver: unrecoverable deficit energy classifies as crash_short with terrain impact point', () => {
  // Aircraft 12 NM away from Moose Jaw at only 2,100 ft MSL (terrain elevation 1,892 ft MSL)
  const apex = {
    x: 80000,
    y: -3194,
    alt: 2100,
    headingDeg: 298,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const result = solvePflTangent(apex, env);

  assert.equal(result.classification, 'crash_short');
  assert.equal(result.bankDeg, 0);
  assert.equal(result.joinPoint, null);
  assert.equal(result.joinIndex, -1);
  assert.ok(result.energyMargin < -500, `Crash short must report negative energy margin, got ${result.energyMargin}`);

  // Crash point must contact terrain at 1,892 ft MSL short of threshold
  assert.ok(result.crashPoint !== null, 'Must calculate crashPoint');
  assert.equal(result.crashPoint.alt, 1892, 'Terrain impact must occur at field elevation 1,892 ft MSL');
  assert.ok(Number.isFinite(result.crashPoint.x) && Number.isFinite(result.crashPoint.y));

  // Crash point must sit between apex and threshold
  const distApexToCrash = Math.hypot(result.crashPoint.x - apex.x, result.crashPoint.y - apex.y);
  const distApexToTh = Math.hypot(PFL_AIRFIELD.thresholdX - apex.x, PFL_AIRFIELD.thresholdY - apex.y);
  assert.ok(distApexToCrash < distApexToTh, 'Crash point must be short of threshold');
});

// ── 4. TASK 1: CONTINUOUS ARC TANGENT & PROXIMITY TESTS ──────────────────────
test('PFL Tangent Solver: continuous arc tangent search finds tangent touchpoint with error <= 5 deg and deltaZ >= -100 ft', () => {
  // Aircraft at an arbitrary off-track point in Moose Jaw training area
  const aircraft = {
    x: 9000,
    y: -6000,
    alt: 4200,
    headingDeg: 270,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 10 };
  const track = generatePflTrack(null, env.windFromDeg, env.windKt, { bankDeg: 35 });

  const result = findContinuousArcTangent(aircraft, track, env, 35);

  assert.ok(result !== null, 'Must find a valid join point along spiral');
  assert.ok(result.joinIndex >= 0, 'joinIndex must be non-negative');
  assert.ok(result.tangentErrorDeg <= 5.0, `Tangent error must be <= 5 deg (Pilot Domain Tolerance D371), got ${result.tangentErrorDeg}`);
  assert.ok(result.energyMargin >= -100, `Energy margin must satisfy deltaZ >= -100 ft, got ${result.energyMargin}`);
  assert.ok(Number.isFinite(result.interceptDistanceFt), 'Intercept distance must be finite');
});

test('PFL Tangent Solver: solvePflTangent returns continuous arc tangent for off-track aircraft without key snapping', () => {
  const aircraft = {
    x: 9000,
    y: -6000,
    alt: 4200,
    headingDeg: 270,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const result = solvePflTangent(aircraft, env);

  assert.ok(result.joinIndex >= 0, 'Must find valid continuous arc joinIndex');
  assert.ok(result.tangentErrorDeg <= 5.0, `solvePflTangent must achieve tangent error <= 5 deg, got ${result.tangentErrorDeg}`);
  assert.ok(result.energyMargin >= -100, `Energy margin must satisfy deltaZ >= -100 ft, got ${result.energyMargin}`);
  assert.equal(result.directLatch, false);
});

test('PFL Tangent Solver: multi-variable drag schedule table matches SMM Ch 13 absorption gates', () => {
  // 1. Severe surplus (> +400 ft)
  const schedHigh = computeDragSchedule(450);
  assert.equal(schedHigh.profile, 'high_energy');
  assert.equal(schedHigh.earlyGear, true);
  assert.equal(schedHigh.earlyFlapsTo, true);
  assert.equal(schedHigh.earlyFlapsLdg, true);

  // 2. Moderate surplus (+150 to +400 ft)
  const schedMod = computeDragSchedule(250);
  assert.equal(schedMod.profile, 'moderate_energy');
  assert.equal(schedMod.earlyGear, false);
  assert.equal(schedMod.earlyFlapsTo, true);
  assert.equal(schedMod.earlyFlapsLdg, false);

  // 3. Nominal (-100 to +150 ft)
  const schedNom = computeDragSchedule(50);
  assert.equal(schedNom.profile, 'nominal');
  assert.equal(schedNom.earlyGear, false);
  assert.equal(schedNom.earlyFlapsTo, false);
  assert.equal(schedNom.delayFlaps, false);

  // 4. Deficit (< -100 ft)
  const schedLow = computeDragSchedule(-120);
  assert.equal(schedLow.profile, 'low_energy');
  assert.equal(schedLow.delayFlaps, true);
  assert.equal(schedLow.delayGear, true);
});

test('PFL Tangent Solver: aircraft within 500 ft of arc triggers directLatch with 0 ft intercept distance', () => {
  // High Key coordinates at 5,000 ft
  const hkAircraft = {
    x: PFL_AIRFIELD.thresholdX + 150,
    y: PFL_AIRFIELD.thresholdY + 150,
    alt: 5000,
    headingDeg: 298,
    kias: 120,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const result = solvePflTangent(hkAircraft, env);

  assert.equal(result.directLatch, true, 'Aircraft within 500 ft must set directLatch = true');
  assert.equal(result.interceptDistanceFt, 0, 'directLatch must have 0 ft intercept distance');
  assert.equal(result.joinIndex, 0);
});

