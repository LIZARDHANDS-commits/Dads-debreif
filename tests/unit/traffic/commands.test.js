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

// Engine failure (Traffic spec 4.5 item 5): above 150 KIAS the aircraft zooms first
// (SMM 13.17 para 34; NFM Fig 3-4 p.3-12); at or below 150 it holds height and slows
// to 125 KIAS. Both then glide down.
test('sim.command engine_fail above 150 KIAS climbs first (zoom), then glides down', () => {
  const sim = createSim(SETUP, { seed: 1 });
  sim.stepTo(60);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acBefore.status, 'flying');
  assert.equal(acBefore.engineFailed, false);
  assert.ok(acBefore.kt > 150, `starts above 150 KIAS (${acBefore.kt})`);

  assert.equal(sim.command('A1', 'engine_fail'), true);

  sim.stepTo(70);
  const acZoom = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acZoom.engineFailed, true);
  assert.ok(acZoom.alt > acBefore.alt, `the zoom climbs: ${acZoom.alt} ft after ${acBefore.alt} ft`);
  assert.ok(acZoom.kt < acBefore.kt, 'the zoom trades speed for the height');

  sim.stepTo(90);
  const acGlide = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(acGlide.status === 'ejected' || acGlide.alt < acZoom.alt, `then it glides down (${acGlide.alt} ft)`);
});

test('sim.command engine_fail at or below 150 KIAS holds height while it slows, then glides down', () => {
  const sim = createSim(SETUP, { seed: 1 });
  const id = sim.spawn({ id: 'A_EF', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(2);
  const acBefore = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acBefore.kt <= 150, `starts at or below 150 KIAS (${acBefore.kt})`);

  assert.equal(sim.command(id, 'engine_fail'), true);

  sim.stepTo(5);
  const acSlow = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(acSlow.engineFailed, true);
  // ±100 ft: the shared height margin (docs/TESTING.md).
  assert.ok(Math.abs(acSlow.alt - acBefore.alt) <= 100, `holds height while slowing (${acBefore.alt} → ${acSlow.alt})`);
  assert.ok(acSlow.kt <= acBefore.kt, 'slows');

  sim.stepTo(30);
  const acGlide = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acGlide.alt < acBefore.alt - 100, `then glides down (${acGlide.alt} ft)`);
});

test('sim.command breakout turns away from circuit, climbs to 4,500 ft, and accelerates towards 220 kt', () => {
  const sim = createSim(SETUP, { seed: 1 });
  sim.stepTo(20);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');

  const ok = sim.command('A1', 'breakout');
  assert.equal(ok, true);

  sim.stepTo(35);
  const acAfter = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acAfter.command, 'breakout');
  assert.ok(acAfter.kt >= 140 && acAfter.kt <= 220, `speed accelerating towards 220 kt, got ${acAfter.kt}`);
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

  // Followed by shape, not at a fixed second (Patrick's card, 10:15Z): on the way to the crosswind turn it
  // climbs past 2,500 ft (levelling there until past the upwind end, 09:14Z) and accelerates under full power.
  let highest = 0, fastest = 0, turnedCrosswind = false;
  while (sim.t < 300 && !turnedCrosswind) {
    sim.stepTo(sim.t + 0.5);
    const acClimb = sim.state().aircraft.find((a) => a.id === 'A1');
    highest = Math.max(highest, acClimb.alt);
    fastest = Math.max(fastest, acClimb.kt);
    turnedCrosswind = acClimb.phase === 'crosswind';
  }
  assert.ok(turnedCrosswind, 'turns crosswind');
  assert.ok(highest > 2500, 'climbs past 2500 ft');
  assert.ok(fastest >= 135, 'accelerates under full power');
});


test('sim.command breakout completes multi-phase Split 2 exit, south leg, and rejoin without orbiting', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Start an aircraft on downwind
  const id = sim.spawn({ id: 'A_DW', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(5);

  const ok = sim.command(id, 'breakout');
  assert.equal(ok, true);

  // Flies through the breakout climb to 4,500 ft and vectors outbound: checked where it turns back to rejoin, found
  // by its phase, not at a chosen second (the climb is flown from excess thrust now, Traffic spec 1a item 22).
  let ac = sim.state().aircraft.find((a) => a.id === id);
  while (sim.t < 200 && ac.phase === 'breakout') {
    sim.stepTo(sim.t + 0.5);
    ac = sim.state().aircraft.find((a) => a.id === id);
  }
  assert.equal(ac.command, 'breakout');
  assert.equal(ac.phase, 'rejoin', 'turns back to rejoin');
  assert.ok(Math.abs(ac.alt - 4500) <= 100, 'alt ~4500 ft');
  assert.ok(ac.kt > 100, 'speed > 100 kt');

  // Progresses southwards along the Split 2 corridor
  sim.stepTo(sim.t + 40);
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
  assert.ok(['pfl_current', 'high_key', 'low_key', 'pfl', 'climb_low_key', 'pfl_low_key', 'base_key', 'pfl_final'].includes(acClimb.phase), 'phase should be PFL-related');
  assert.ok(acClimb.alt > 2000, `Alt ${acClimb.alt} should be in PFL glide`);

  // After capturing Low Key, proceeds into PFL descent
  sim.stepTo(40);
  const acDescend = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acDescend.alt <= 3500, `Alt ${acDescend.alt} should descend on PFL profile`);
});

test('sim.command pfl_current executes zoom climb when above 150 KIAS and glides at 125 kt', () => {
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
  assert.ok(['pfl_current', 'pfl_zoom', 'pfl_glide', 'high_key', 'low_key', 'pfl'].includes(acZoom.phase), 'phase should be PFL-related');
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
  assert.ok(['climb_high_key', 'pfl_current', 'high_key', 'low_key', 'pfl'].includes(ac.phase), 'phase should be PFL-related');
  assert.ok(ac.alt > 2000, `Alt ${ac.alt} ft should be flying PFL profile`);

  // Arrives near threshold and enters circular gliding descent
  sim.stepTo(90);
  ac = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(['climb_high_key', 'high_key_run_in', 'pfl_high_key', 'pfl_current', 'high_key', 'low_key', 'base_key', 'pfl', 'pfl_final', 'final_turn', 'final'].includes(ac.phase), `phase ${ac.phase} should be PFL-related`);
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

test('sim.command climb_high_key maintains RAIL mode, approach power, cuts engine at High Key, lands and flies a touch-and-go', () => {
  const sim = createSim(SETUP, { seed: 1 });
  const id = sim.spawn({ id: 'A_HK_TEST', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(2);

  const ok = sim.command(id, 'climb_high_key');
  assert.equal(ok, true);

  let ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.mode, 'RAIL', 'Must be in RAIL mode, never PHYSICS mode');
  assert.ok(ac.highKeyFlight, 'Must be flying the planned climb to High Key');
  assert.equal(ac.engineFailed, false, 'Engine must remain powered during climb approach');

  // Step until crossing High Key
  let crossedHighKey = false;
  for (let t = 3; t <= 120; t += 5) {
    sim.stepTo(t);
    ac = sim.state().aircraft.find((a) => a.id === id);
    if (ac.engineFailed) {
      crossedHighKey = true;
      assert.equal(ac.tag, 'high_key');
      assert.equal(ac.mode, 'RAIL');
      break;
    }
  }
  assert.ok(crossedHighKey, 'Aircraft must cross High Key threshold and trigger engine failure');

  // A PFL that makes the runway flies a touch-and-go and carries on in the circuit (spec 4.5 item 13; Patrick 4 Oct 08:40Z).
  let lowest = Infinity;
  for (let t = 125; t <= 400 && ac.engineFailed; t += 1) {
    sim.stepTo(t);
    ac = sim.state().aircraft.find((a) => a.id === id);
    lowest = Math.min(lowest, ac.alt);
  }
  assert.equal(ac.status, 'flying', 'still flying after the touch-and-go');
  assert.equal(ac.engineFailed, false, 'power back on');
  assert.equal(ac.routeId, 'PAT1', 'back in the circuit');
  // ±100 ft: the shared height margin (docs/TESTING.md); the runway is at 1,880 ft.
  assert.ok(lowest <= 1980, `came down to the runway (lowest ${lowest} ft)`);
});

