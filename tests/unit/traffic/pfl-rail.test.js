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
  buildPflRail,
  densifyRail,
  getPflConfig,
} from '../../../src/modules/traffic/pfl-rail.js';
import { PFL_AIRFIELD } from '../../../src/modules/traffic/pfl-solver.js';

// ── 1. CONFIGURATION SCHEDULE TESTS ──────────────────────────────────────────
test('PFL Configuration Schedule: enforces Clean -> Gear Down -> Flaps TO -> Flaps LDG by altitude', () => {
  assert.equal(getPflConfig(4500, 'pfl_high_key'), 'Clean');
  assert.equal(getPflConfig(3701, 'pfl_high_key'), 'Clean');
  assert.equal(getPflConfig(3700, 'pfl_low_key'), 'Gear Down');
  assert.equal(getPflConfig(3200, 'pfl_low_key'), 'Gear Down');
  assert.equal(getPflConfig(2900, 'pfl_base_key'), 'Flaps TO');
  assert.equal(getPflConfig(2500, 'pfl_base_key'), 'Flaps TO');
  assert.equal(getPflConfig(2120, 'pfl_final'), 'Flaps LDG');
  assert.equal(getPflConfig(1892, 'pfl_final'), 'Flaps LDG');
});

// ── 2. ZERO COORDINATE SNAPPING TESTS (<25 FT/FRAME) ─────────────────────────
test('PFL Rail Invariant: zero coordinate snapping (<25 ft/frame) across entire High Key rail', () => {
  const aircraft = {
    x: 4500,
    y: -4500,
    alt: 5500,
    kias: 200,
    headingDeg: 298,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const rail = buildPflRail(aircraft, env);

  assert.ok(rail.length > 50, `Rail should contain waypoints, got ${rail.length}`);
  assert.equal(rail.id, 'PFL_RAIL');
  assert.equal(rail.model, 'KIN');
  assert.equal(rail.loop, false);
  assert.equal(rail.classification, 'high_key');

  // Verify zero coordinate snapping between EVERY adjacent pair of waypoints
  let maxStep = 0;
  for (let i = 1; i < rail.length; i++) {
    const d = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
    if (d > maxStep) maxStep = d;
    assert.ok(
      d < 25,
      `Coordinate snap detected at index ${i}: distance was ${d.toFixed(1)} ft (must be < 25 ft/frame)`
    );
  }

  assert.ok(maxStep <= 20, `Max step should be <= 20 ft, got ${maxStep}`);
});

test('PFL Rail Invariant: zero coordinate snapping (<25 ft/frame) across Low Key rail', () => {
  const aircraft = {
    x: 7145,
    y: -8000,
    alt: 4000,
    kias: 140,
    headingDeg: 120,
  };
  const env = { windFromDeg: 360, windKt: 15 };

  const rail = buildPflRail(aircraft, env);

  assert.equal(rail.classification, 'low_key');
  let maxStep = 0;
  for (let i = 1; i < rail.length; i++) {
    const d = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
    if (d > maxStep) maxStep = d;
    assert.ok(
      d < 25,
      `Low Key rail coordinate snap at index ${i}: ${d.toFixed(1)} ft`
    );
  }
  assert.ok(maxStep <= 20);
});

test('PFL Rail Invariant: zero coordinate snapping (<25 ft/frame) across Base Key (Corner Cut) rail', () => {
  const aircraft = {
    x: 7145,
    y: -10275,
    alt: 3200,
    kias: 120,
    headingDeg: 118,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const rail = buildPflRail(aircraft, env);

  assert.equal(rail.classification, 'base_key');
  assert.equal(rail.bankDeg, 45, 'Must cut the corner with 45° bank');

  for (let i = 1; i < rail.length; i++) {
    const d = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
    assert.ok(d < 25, `Base Key rail snap at index ${i}: ${d.toFixed(1)} ft`);
  }
});

test('PFL Rail Invariant: zero coordinate snapping (<25 ft/frame) across Direct Threshold rail', () => {
  const aircraft = {
    x: 3104 - 4000 * Math.sin(298 * Math.PI / 180),
    y: -3194 - 4000 * Math.cos(298 * Math.PI / 180),
    alt: 2350,
    kias: 120,
    headingDeg: 298,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const rail = buildPflRail(aircraft, env);

  assert.equal(rail.classification, 'direct_threshold');

  for (let i = 1; i < rail.length; i++) {
    const d = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
    assert.ok(d < 25, `Direct threshold rail snap at index ${i}: ${d.toFixed(1)} ft`);
  }
});

// ── 3. FINITE NUMBERS & TELEMETRY EMBEDDING TESTS ─────────────────────────────
test('PFL Rail Telemetry: every waypoint embeds strictly finite numbers and rich aerodynamic state', () => {
  const aircraft = {
    x: 10000,
    y: -10000,
    alt: 3800,
    kias: 220,
    headingDeg: 120,
  };
  const env = { windFromDeg: 310, windKt: 12 };

  const rail = buildPflRail(aircraft, env);

  for (let i = 0; i < rail.length; i++) {
    const wp = rail[i];

    // Coordinates and altitude
    assert.ok(Number.isFinite(wp.x), `wp[${i}].x must be finite`);
    assert.ok(Number.isFinite(wp.y), `wp[${i}].y must be finite`);
    assert.ok(Number.isFinite(wp.alt), `wp[${i}].alt must be finite`);
    assert.ok(wp.alt >= 1890, `wp[${i}].alt must not dip below field elevation`);

    // Speed
    assert.ok(Number.isFinite(wp.kt), `wp[${i}].kt must be finite`);
    assert.ok(wp.kt >= 90 && wp.kt <= 250, `wp[${i}].kt within flight envelope, got ${wp.kt}`);

    // Attitude and G
    assert.ok(Number.isFinite(wp.headingDeg), `wp[${i}].headingDeg must be finite`);
    assert.ok(wp.headingDeg >= 0 && wp.headingDeg < 360, `wp[${i}].headingDeg in [0, 360)`);
    assert.ok(Number.isFinite(wp.bankDeg), `wp[${i}].bankDeg must be finite`);
    assert.ok(Number.isFinite(wp.g), `wp[${i}].g must be finite`);
    assert.ok(wp.g >= 0.2 && wp.g <= 3.0, `wp[${i}].g within limits, got ${wp.g}`);

    // Telemetry strings
    assert.ok(typeof wp.phase === 'string' && wp.phase.length > 0, `wp[${i}].phase must be string`);
    assert.ok(typeof wp.config === 'string' && wp.config.length > 0, `wp[${i}].config must be string`);
  }
});

// ── 4. COMPLETE CONFIGURATION SEQUENCE TESTS ─────────────────────────────────
test('PFL Rail Configuration Schedule: High Key rail contains full Clean -> Gear Down -> Flaps TO -> Flaps LDG sequence', () => {
  const aircraft = {
    x: 4500,
    y: -4500,
    alt: 5500,
    kias: 200,
    headingDeg: 298,
  };
  const env = { windFromDeg: 360, windKt: 0 };

  const rail = buildPflRail(aircraft, env);

  // Extract ordered list of distinct configuration states
  const configSequence = [];
  for (const wp of rail) {
    if (configSequence.length === 0 || configSequence[configSequence.length - 1] !== wp.config) {
      configSequence.push(wp.config);
    }
  }

  // Must transition through Clean -> Gear Down -> Flaps TO -> Flaps LDG in exact sequence
  assert.deepEqual(configSequence, ['Clean', 'Gear Down', 'Flaps TO', 'Flaps LDG']);

  // First waypoint must be Clean
  assert.equal(rail[0].config, 'Clean');

  // Last waypoint must be Flaps LDG at threshold
  const last = rail[rail.length - 1];
  assert.equal(last.config, 'Flaps LDG');
  assert.ok(Math.abs(last.alt - 1892) <= 10, `Touchdown at field elevation 1,892 ft, got ${last.alt}`);
  assert.ok(Math.abs(last.kt - 100) <= 10, `Touchdown at ~100 KIAS, got ${last.kt}`);
});

// ── 5. UNRECOVERABLE / CRASH SHORT RAIL TESTS ─────────────────────────────────
test('PFL Rail Crash Short: unrecoverable state synthesizes straight clean glide terminating at 1,892 ft MSL', () => {
  const aircraft = {
    x: 80000,
    y: -3194,
    alt: 2100,
    kias: 120,
    headingDeg: 298,
  };
  const env = { windFromDeg: 360, windKt: 10 };

  const rail = buildPflRail(aircraft, env);

  assert.equal(rail.classification, 'crash_short');
  assert.ok(rail.length > 20);

  // Zero coordinate snapping on crash rail
  for (let i = 1; i < rail.length; i++) {
    const d = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
    assert.ok(d < 25, `Crash rail snap at index ${i}: ${d.toFixed(1)} ft`);
  }

  // Terminates at terrain elevation 1,892 ft MSL
  const last = rail[rail.length - 1];
  assert.equal(last.alt, 1892, 'Terminates at terrain elevation 1,892 ft MSL');
  assert.equal(last.phase, 'crash_short');
  assert.equal(last.tag, 'crash_short');
  assert.equal(last.config, 'Clean', 'Stays clean during emergency glide to preserve distance');
});
