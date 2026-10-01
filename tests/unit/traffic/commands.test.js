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
  assert.equal(acAfter.kt, 140);
  assert.ok(acAfter.alt >= acBefore.alt);
});

test('sim.command go_around aborts landing and resets to Departure End climb-out', () => {
  const sim = createSim(SETUP, { seed: 1 });
  sim.stepTo(20);

  const ok = sim.command('A1', 'go_around');
  assert.equal(ok, true);

  const ac = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(ac.command, 'go_around');
  assert.equal(ac.alt, 2500);
  assert.equal(ac.kt, 140);
});

test('sim.nextCallsign gives next free callsign', () => {
  const sim = createSim(SETUP, { seed: 1 });
  const next = sim.nextCallsign();
  assert.equal(next, 'A8');
});
