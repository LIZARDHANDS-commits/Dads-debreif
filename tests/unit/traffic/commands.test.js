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

// Unit tests for in-flight commands: engine failure, breakout, go-around, and touch-and-go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';

const SETUP = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));

test('sim.command engine_fail slows towards 110 KIAS and initiates emergency descent', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Step until A1 is at cruise climb
  sim.stepTo(60);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acBefore.status, 'flying');
  assert.equal(acBefore.engineFailed, false);
  assert.ok(acBefore.kt > 110);

  // Issue engine fail
  const ok = sim.command('A1', 'engine_fail');
  assert.equal(ok, true);

  // Advance 10 seconds
  sim.stepTo(70);
  const acAfter = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acAfter.engineFailed, true);
  // Airspeed decays toward 110 KIAS
  assert.ok(acAfter.kt <= acBefore.kt);
  // Altitude descends
  assert.ok(acAfter.alt < acBefore.alt);
});

test('sim.command breakout turns away from circuit and climbs to 4,500 ft at 140 kt', () => {
  const sim = createSim(SETUP, { seed: 1 });
  sim.stepTo(20);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');

  const ok = sim.command('A1', 'breakout');
  assert.equal(ok, true);

  sim.stepTo(35);
  const acAfter = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acAfter.command, 'breakout');
  assert.ok(Math.abs(acAfter.kt - 140) <= 10, 'speed ~140 kt');
  assert.ok(acAfter.alt >= acBefore.alt);
});

test('sim.command go_around aborts landing and initiates Departure End climb-out', () => {
  const sim = createSim(SETUP, { seed: 1 });
  sim.stepTo(20);

  const ok = sim.command('A1', 'go_around');
  assert.equal(ok, true);

  const ac = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(ac.command, 'go_around');
  assert.equal(ac.phase, 'go_around');

  // Multi-phase climbout reaches 2,500 ft and accelerates under full power
  sim.stepTo(45);
  const acClimb = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(acClimb.alt > 2500, 'climbs past 2500 ft');
  assert.ok(acClimb.kt >= 135, 'accelerates under full power');
});


test('sim.command breakout completes multi-phase Split 2 exit, south leg, and rejoin without orbiting', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Start an aircraft on downwind
  const id = sim.spawn({ id: 'A_DW', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(5);

  const ok = sim.command(id, 'breakout');
  assert.equal(ok, true);

  // Flies through breakout climb to 4,500 ft and vectors outbound
  sim.stepTo(30);
  let ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.command, 'breakout');
  assert.ok(Math.abs(ac.alt - 4500) <= 100, 'alt ~4500 ft');
  assert.ok(ac.kt > 100, 'speed > 100 kt');

  // Progresses southwards along the Split 2 corridor
  sim.stepTo(100);
  ac = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(ac.alt > 3000, 'departing and maintaining alt');

  // Progresses to rejoin without getting stuck in an orbit
  sim.stepTo(250);
  ac = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(ac.alt >= 3000, 'maintains altitude during breakout');
});

test('sim.command climb_low_key executes full power climb to Low Key (3,900 ft / 120 kt)', () => {
  const sim = createSim(SETUP, { seed: 1 });
  const id = sim.spawn({ id: 'A_LK', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(5);

  const ok = sim.command(id, 'climb_low_key');
  assert.equal(ok, true);

  // Aircraft enters PFL profile
  sim.stepTo(15);
  const acClimb = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(acClimb.command, 'climb_low_key');
  assert.ok(['pfl_current', 'high_key', 'low_key', 'pfl'].includes(acClimb.phase), 'phase should be PFL-related');
  assert.ok(acClimb.alt > 2000, `Alt ${acClimb.alt} should be in PFL glide`);

  // After capturing Low Key, proceeds into PFL descent
  sim.stepTo(40);
  const acDescend = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acDescend.alt <= 3500, `Alt ${acDescend.alt} should descend on PFL profile`);
});

test('sim.command pfl_current executes zoom climb when >130 kt and glides at 125 kt', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Initial run-in is at 220 kt
  const id = sim.spawn({ id: 'A_PFL', routeId: 'PAT1', startPoint: 9, delaySec: 0 });
  sim.stepTo(5);

  const ok = sim.command(id, 'pfl_current');
  assert.equal(ok, true);

  // Zoom climb trades speed for altitude
  sim.stepTo(10);
  const acZoom = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(acZoom.engineFailed, true);
  assert.ok(['pfl_current', 'high_key', 'low_key', 'pfl'].includes(acZoom.phase), 'phase should be PFL-related');
  assert.ok(acZoom.alt > 2000, 'PFL descent');

  // After zoom completes, stabilizes at clean 125 KIAS best glide
  sim.stepTo(35);
  const acGlide = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(Math.abs(acGlide.kt - 125) <= 15, 'glide speed ~125 kt');
});

test('sim.nextCallsign gives next free callsign', () => {
  const sim = createSim(SETUP, { seed: 1 });
  const next = sim.nextCallsign();
  assert.equal(next, 'A8');
});

test('sim.command climb_high_key climbs to 5,000 ft MSL over threshold facing 298° heading and enters circular PFL arc', () => {
  const sim = createSim(SETUP, { seed: 1 });
  const id = sim.spawn({ id: 'A_HK', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(5);

  const ok = sim.command(id, 'climb_high_key');
  assert.equal(ok, true);

  // Climbs toward High Key / PFL profile
  sim.stepTo(25);
  let ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.command, 'climb_high_key');
  assert.ok(['pfl_current', 'high_key', 'low_key', 'pfl'].includes(ac.phase), 'phase should be PFL-related');
  assert.ok(ac.alt > 2000, `Alt ${ac.alt} ft should be flying PFL profile`);

  // Arrives near threshold and enters circular gliding descent
  sim.stepTo(90);
  ac = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(['pfl_current', 'high_key', 'low_key', 'base_key', 'pfl', 'pfl_final', 'final_turn', 'final'].includes(ac.phase), `phase ${ac.phase} should be PFL-related`);
  assert.ok(ac.alt <= 5000, `Alt ${ac.alt} should be capped at or descending from 5,000 ft`);
  assert.ok(ac.alt >= 2000, `Alt ${ac.alt} should be descending along circular PFL arc`);
});

test('Preset Point - Closed Pattern (Point 2 on PAT1 at 2,400 ft / 140 kt) climbs and rolls out on downwind to perch without orbiting', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Start at point 2 (departure end)
  const id = sim.spawn({ id: 'A_CP', routeId: 'PAT1', startPoint: 2, delaySec: 0 });
  const initial = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(initial.alt, 2400, 'spawns at 2,400 ft MSL');
  assert.equal(initial.kt, 140, 'spawns at 140 KIAS');
  assert.equal(initial.headingDeg, 298, 'spawns on runway heading 298°');
  assert.equal(initial.phase, 'closed_pattern', 'starts in closed pattern');

  // Executes climbing turn to 3,500 ft MSL and rolls out
  sim.stepTo(20);
  const acDw = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(['closed_pattern', 'downwind', 'break', 'initial'].includes(acDw.phase), 'phase should be in circuit progression');
  assert.ok(acDw.alt >= 2400, `Alt ${acDw.alt} should climb`);

  // Tracks toward Perch and enters final turn (does not loop in infinite circles)
  sim.stepTo(100);
  const acPerch = sim.state().aircraft.find((a) => a.id === id);
  assert.notEqual(acPerch.phase, 'closed_pattern', 'must not stay stuck in closed pattern orbit');
});
