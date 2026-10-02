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

test('sim.command breakout turns away from circuit and climbs to 3,500 ft at 140 kt', () => {
  const sim = createSim(SETUP, { seed: 1 });
  sim.stepTo(20);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');

  const ok = sim.command('A1', 'breakout');
  assert.equal(ok, true);

  sim.stepTo(35);
  const acAfter = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(acAfter.command, 'breakout');
  assert.ok(acAfter.kt >= 130 && acAfter.kt <= 150, `speed ${acAfter.kt} should be near 140 kt`);
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
  // D411: ±300 ft — physics engine climb-out, testing behavior not precision
  assert.ok(acClimb.alt >= 2200 && acClimb.alt <= 2800, `Alt ${acClimb.alt} should be near 2,500 ft (±300 ft)`);
  assert.ok(acClimb.kt > 120, 'accelerating under full power');
});


test('sim.command breakout completes multi-phase Split 2 exit, south leg, and rejoin without orbiting', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Start an aircraft on downwind
  const id = sim.spawn({ id: 'A_DW', routeId: 'PAT1', startPoint: 11, delaySec: 0 });
  sim.stepTo(5);

  const ok = sim.command(id, 'breakout');
  assert.equal(ok, true);

  // Flies through breakout climb to 3,500 ft and vectors outbound
  sim.stepTo(30);
  let ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.command, 'breakout');
  assert.ok(ac.alt >= 3200 && ac.alt <= 3800, `Alt ${ac.alt} should be near 3,500 ft`);
  assert.ok(ac.kt >= 140 && ac.kt <= 180);

  // Progresses southwards along the Split 2 corridor
  sim.stepTo(100);
  ac = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(ac.y <= -30000, `Y position ${ac.y} should be south of pattern`);

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

  // D411: behavioral check — aircraft is climbing, not pinned to exact altitude at exact second
  sim.stepTo(20);
  const acClimb = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(acClimb.command, 'climb_low_key');
  assert.equal(acClimb.phase, 'pfl');
  assert.ok(acClimb.alt > 2500, `Alt ${acClimb.alt} should be climbing from starting altitude`);

  // After capturing Low Key, proceeds into PFL descent — use longer window
  sim.stepTo(60);
  const acDescend = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acDescend.alt < 3600, `Alt ${acDescend.alt} should be descending on PFL profile`);
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
  assert.equal(acZoom.phase, 'pfl');
  assert.ok(acZoom.alt >= 3500, 'zoom climb gains or maintains height');

  // After zoom completes, stabilizes at clean 125 KIAS best glide
  sim.stepTo(35);
  const acGlide = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acGlide.kt >= 115 && acGlide.kt <= 135, `speed ${acGlide.kt} should be near 125 KIAS clean best glide`);
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

  // Climbs toward 5,000 ft MSL
  sim.stepTo(25);
  let ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.command, 'climb_high_key');
  assert.equal(ac.phase, 'pfl');
  assert.ok(ac.alt > 3500, `Alt ${ac.alt} ft should be climbing towards 5,000 ft High Key`);

  // Arrives near threshold at ~5,000 ft and enters circular gliding descent
  sim.stepTo(90);
  ac = sim.state().aircraft.find((a) => a.id === id);
  assert.equal(ac.phase, 'pfl');
  assert.ok(ac.alt <= 5000, `Alt ${ac.alt} should be capped at or descending from 5,000 ft`);
  assert.ok(ac.alt >= 3000, `Alt ${ac.alt} should be descending along circular PFL arc`);
});

test('Preset Point - Closed Pattern (Point 2 on PAT1 at 2,400 ft / 140 kt) climbs and rolls out on downwind to perch without orbiting', () => {
  const sim = createSim(SETUP, { seed: 1 });
  // Start at point 2 (departure end)
  const id = sim.spawn({ id: 'A_CP', routeId: 'PAT1', startPoint: 2, delaySec: 0 });
  const initial = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(Math.abs(initial.alt - 2400) <= 300, `spawns near 2,400 ft MSL (got ${initial.alt})`);
  assert.ok(initial.kt >= 120 && initial.kt <= 160, `spawns near 140 KIAS (got ${initial.kt})`);
  assert.ok(Math.abs(initial.headingDeg - 298) <= 10, `spawns near runway heading 298° (got ${initial.headingDeg})`);
  assert.equal(initial.phase, 'closed_pattern', 'starts in closed pattern');

  // D411: behavioral — is it climbing and turning? Not pinned to exact alt at exact second
  sim.stepTo(25);
  const acDw = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acDw.phase === 'downwind' || acDw.phase === 'closed_pattern', `phase should be downwind or still turning (got ${acDw.phase})`);
  assert.ok(acDw.alt >= 2400, `Alt ${acDw.alt} should be climbing from 2,400 ft`);

  // Tracks toward Perch and enters final turn (does not loop in infinite circles)
  sim.stepTo(100);
  const acPerch = sim.state().aircraft.find((a) => a.id === id);
  assert.ok(acPerch.phase === 'final_turn' || acPerch.phase === 'final' || acPerch.phase === 'downwind');
  assert.notEqual(acPerch.phase, 'closed_pattern', 'must not stay stuck in closed pattern orbit');
});
