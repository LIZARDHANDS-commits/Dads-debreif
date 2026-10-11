// Checks: in a crosswind the aircraft lands with the wing-down method, not crabbed: just before touchdown the nose is
//   along the runway and the upwind wing is down (SMM 4.12 paras 26 and 28b; Patrick, 11 Oct 09:03Z).
// Expected values: the SMM's rule (never land crabbing, upwind wing down); the nose within the shared ±5° margin
//   (docs/TESTING.md); 1° is only "the wing is visibly down", not how much bank it needs. 120 s is a safety stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const mooseJaw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8'));
const RUNWAY_FT = 1880;

test('Crosswind final: lands wing-down, nose along the runway and the upwind wing down (SMM 4.12 paras 26, 28b)', () => {
  for (const windFromDeg of [208, 28]) {
    const sim = createSim({ ...mooseJaw, aircraft: [], windKt: 20, windFromDeg }, { seed: 42 });
    const id = sim.spawn({ routeId: 'PAT1', startPoint: 12 });
    let lastAirborne = null;
    while (sim.t < 120) {
      sim.stepTo(sim.t + 0.25);
      const a = sim.state().aircraft.find((x) => x.id === id);
      if (a.alt <= RUNWAY_FT + 1) break;
      if (a.alt < RUNWAY_FT + 30) lastAirborne = a;
    }
    assert.ok(lastAirborne, `wind from ${windFromDeg}: came down to the runway`);
    const yaw = wrapDeg180(lastAirborne.headingDeg - lastAirborne.trackDeg);
    assert.ok(Math.abs(yaw) <= 5, `wind from ${windFromDeg}: nose ${yaw.toFixed(1)}° off the track just before touchdown`);
    const fromRight = wrapDeg180(windFromDeg - lastAirborne.trackDeg) > 0;
    const intoWind = fromRight ? lastAirborne.bankDeg : -lastAirborne.bankDeg;
    assert.ok(intoWind >= 1, `wind from ${windFromDeg}: bank ${lastAirborne.bankDeg.toFixed(1)}° should be into the wind`);
  }
});
