// Checks: a landing for the stop on 29L (Traffic spec 4.17, TR-115): it slows to about 20 kt by the runway's end,
//   turns off, crosses 29R, stops in front of the Bandit hangar and is then removed; a touch-and-go behind it flies a
//   low approach while it is on the runway.
// Serves: TR-115.
// Expected values: 20 kt taxi speed (Patrick, 10 Oct 20:38Z) with the shared ±10 kt margin; the hangar is Hangar 2
//   (scenery3d.js, which carries the Bandit badge), its centre measured on Esri's photo, and "in front" means on its
//   ramp side within 300 ft (its door is about 100 ft south of its centre); the 10 minute stop is generous (the
//   circuit, rollout and taxi take about 6).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSim } from '../../../src/modules/traffic/sim.js';
import { CYMJ_BUILDING_COORDS } from '../../../src/modules/traffic/scenery3d.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, THRESHOLD_29R, DEPARTURE_END_29R } from '../../../src/modules/traffic/airfield.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));

/** Feet to the left of a runway's centreline, looking along it from its threshold (negative: right of it). */
const leftOf = (th, end, p) => ((end.x - th.x) * (p.y - th.y) - (end.y - th.y) * (p.x - th.x)) / Math.hypot(end.x - th.x, end.y - th.y);
/** Feet along a runway from its threshold. */
const alongOf = (th, end, p) => ((end.x - th.x) * (p.x - th.x) + (end.y - th.y) * (p.y - th.y)) / Math.hypot(end.x - th.x, end.y - th.y);

test('a full stop on 29L rolls out to 20 kt, taxis across 29R to the Bandit hangar, and a touch-and-go behind it goes low approach', () => {
  const setup = structuredClone(MOOSE_JAW);
  Object.assign(setup, { windFromDeg: 269, windKt: 15 });
  setup.aircraft = [
    { id: 'STOP', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0, intent: 'full_stop' },
    { id: 'TG', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 30, intent: 'touch_and_go' },
  ];
  const sim = createSim(setup, { seed: 1 });
  const hangar = CYMJ_BUILDING_COORDS.hangars.find((h) => h.id === 'hangar-2');
  const rwyLen = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);
  let ktAtEnd = null, crossed29R = false, lowApproach = false, stoppedAt = null, last = null;
  for (let t = 1; t <= 600; t++) {
    sim.stepTo(t);
    const stop = sim.state().aircraft.find((a) => a.id === 'STOP');
    const tg = sim.state().aircraft.find((a) => a.id === 'TG');
    if (stop.status === 'flying' && stop.onGround) {
      // Within 500 ft of 29L's end, still on it: about taxi speed.
      if (ktAtEnd === null && alongOf(THRESHOLD_29L, DEPARTURE_END_29L, stop) > rwyLen - 500) ktAtEnd = stop.kt;
      if (leftOf(THRESHOLD_29R, DEPARTURE_END_29R, stop) < 0) crossed29R = true; // north of 29R, as the hangars are
      if (stop.phase === 'rollout' && tg.phase === 'go_around') lowApproach = true;
      last = stop;
    }
    if (stop.status === 'landed') { stoppedAt = last; break; }
  }
  assert.ok(ktAtEnd !== null && Math.abs(ktAtEnd - 20) <= 10, `at the end of 29L it should be at about 20 kt: ${ktAtEnd}`);
  assert.ok(crossed29R, 'it should cross 29R to the ramp');
  assert.ok(lowApproach, 'the touch-and-go behind should fly a low approach while the full stop rolls out');
  assert.ok(stoppedAt, 'it should stop and be removed within 10 minutes');
  const toHangar = Math.hypot(stoppedAt.x - hangar.x, stoppedAt.y - hangar.y);
  assert.ok(toHangar <= 300 && stoppedAt.y < hangar.y, `it should stop on the ramp in front of the Bandit hangar: ${Math.round(toHangar)} ft from its centre`);
});
