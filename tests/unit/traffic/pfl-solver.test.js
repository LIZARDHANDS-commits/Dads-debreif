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
} from '../../../src/modules/traffic/pfl-solver.js';
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
  // Aircraft downwind at 4,000 ft MSL (cannot reach High Key at 5,000 ft)
  const apex = {
    x: 7145,
    y: -8000,
    alt: 4000,
    headingDeg: 120,
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
  // With 35° bank, the 15,305 ft spiral requires ~1,800 ft of altitude, causing it to fall short.
  // With 45° bank, the spiral is shortened by 1,869 ft, preserving ~150 ft of altitude to make the runway!
  const apex = {
    x: 7145,
    y: -10275,
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
