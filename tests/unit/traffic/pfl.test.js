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

// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { tickAircraft } from '../../../src/modules/traffic/tick-aircraft.js';
import { buildPflRail } from '../../../src/modules/traffic/pfl-rail.js';
import { PFL_AIRFIELD } from '../../../src/modules/traffic/pfl-solver.js';

const MOOSE_JAW = JSON.parse(
  readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8')
);

function createTestSim(customSettings = {}) {
  const setup = JSON.parse(JSON.stringify(MOOSE_JAW));
  if (customSettings.windFromDeg !== undefined) setup.windFromDeg = customSettings.windFromDeg;
  if (customSettings.windKt !== undefined) setup.windKt = customSettings.windKt;
  return createSim(setup);
}

// ── TEST 1: PFL INITIALIZATION & RAIL ATTACHMENT ──────────────────────────────
test('Test 1: Spawning aircraft and issuing sim.command(id, "pfl_current") sets mode = "RAIL", attaches pflRail, and starts in zoom/glide phase', () => {
  const sim = createTestSim();
  const id = sim.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 9, delaySec: 0 });

  // Step 0.1s so aircraft is active and flying along initial leg
  sim.stepTo(0.1);

  const beforeState = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(beforeState.status, 'flying');

  // Command PFL at current position
  const ok = sim.command(id, 'pfl_current');
  assert.equal(ok, true);

  const afterState = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(afterState.mode, 'RAIL', 'Mode must be set to RAIL');
  assert.equal(afterState.engineFailed, true, 'Engine failure flag must be set');
  assert.equal(afterState.command, 'pfl_current');
  assert.ok(
    afterState.phase === 'pfl_zoom' || afterState.phase === 'pfl_glide' || afterState.phase === 'pfl_tangent',
    `Initial PFL phase should be zoom or glide, got "${afterState.phase}"`
  );
  assert.ok(
    afterState.config?.toLowerCase() === 'clean',
    `Initial configuration must be clean, got "${afterState.config}"`
  );
});

// ── TEST 2: RECOVERABLE PFL GLIDE & SAFE TOUCHDOWN ────────────────────────────
test('Test 2: Stepping simulation with surplus/nominal energy aircraft follows PFL rail through High Key -> Low Key -> Base Key -> Final and safely lands (a.status === "landed")', () => {
  const sim = createTestSim({ windFromDeg: 360, windKt: 5 });

  // Spawn in the training area with surplus energy to reach High Key
  // Radial 180 (south), 3 NM, 6,200 ft MSL
  const id = sim.spawnPflFromArea({ radialDeg: 180, distNm: 3, altFt: 6200 });

  const startState = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(startState.mode, 'RAIL');
  assert.equal(startState.engineFailed, true);

  const observedPhases = new Set();
  let landedState = null;

  // Step simulation until aircraft touches down or maximum 10 minutes (6,000 steps)
  for (let s = 0; s < 6000; s++) {
    sim.stepTo(sim.t + STEP_SEC);
    const ac = sim.state().aircraft.find((a) => a.id === id);
    if (!ac) break;
    observedPhases.add(ac.phase);
    if (!ac.active) {
      landedState = ac;
      break;
    }
  }

  assert.ok(landedState !== null, 'Aircraft must finish glide and reach terminal state within 10 minutes');
  assert.equal(landedState.status, 'landed', `Aircraft status must be "landed", got "${landedState.status}"`);
  assert.equal(landedState.landed, true);
  assert.equal(landedState.active, false);
  assert.equal(landedState.alt, 1892, 'Terminal altitude must be runway elevation 1,892 ft MSL');

  // Verify proximity to runway threshold (3104, -3194)
  const distToThresh = Math.hypot(landedState.x - PFL_AIRFIELD.thresholdX, landedState.y - PFL_AIRFIELD.thresholdY);
  assert.ok(distToThresh <= 3000, `Landed position must be within 3,000 ft of threshold, got ${distToThresh.toFixed(1)} ft`);

  // Verify recovery phases were observed
  const hasKeyPhase =
    observedPhases.has('pfl_high_key') ||
    observedPhases.has('pfl_low_key') ||
    observedPhases.has('pfl_base_key') ||
    observedPhases.has('pfl_final') ||
    observedPhases.has('pfl_tangent');
  assert.ok(hasKeyPhase, `Recovery must progress through PFL key phases. Observed: ${[...observedPhases].join(', ')}`);
});

// ── TEST 3: UNRECOVERABLE DEFICIT ENERGY CRASH SHORT ─────────────────────────
test('Test 3: Stepping simulation with unrecoverable / low-energy aircraft follows straight clean glide to terrain contact at 1,892 ft MSL and terminates with a.status === "crashed"', () => {
  const sim = createTestSim({ windFromDeg: 360, windKt: 10 });

  // Spawn in the training area 30 NM away at only 3,000 ft MSL (1,108 ft AGL)
  // At 12:1 glide ratio, maximum clean glide distance is ~2.2 NM << 30 NM.
  const id = sim.spawnPflFromArea({ radialDeg: 90, distNm: 30, altFt: 3000 });

  const startState = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(startState.mode, 'RAIL');
  assert.equal(startState.engineFailed, true);

  let crashedState = null;

  // Step simulation until aircraft terminates
  for (let s = 0; s < 3000; s++) {
    sim.stepTo(sim.t + STEP_SEC);
    const ac = sim.state().aircraft.find((a) => a.id === id);
    if (!ac) break;
    if (!ac.active) {
      crashedState = ac;
      break;
    }
  }

  assert.ok(crashedState !== null, 'Aircraft must reach terrain contact within simulation run');
  assert.equal(crashedState.status, 'crashed', `Aircraft status must be "crashed", got "${crashedState.status}"`);
  assert.equal(crashedState.landed, true);
  assert.equal(crashedState.active, false);
  assert.equal(crashedState.alt, 1892, 'Terrain impact must occur at field elevation 1,892 ft MSL');

  // Verify crash location is well short of the runway threshold
  const distToThresh = Math.hypot(crashedState.x - PFL_AIRFIELD.thresholdX, crashedState.y - PFL_AIRFIELD.thresholdY);
  assert.ok(distToThresh > 3000, `Crash location must be short of runway threshold (>3,000 ft), got ${distToThresh.toFixed(1)} ft`);
});
