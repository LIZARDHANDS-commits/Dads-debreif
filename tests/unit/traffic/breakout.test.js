// Checks: the flown breakout from downwind, calm and in 20 kt: it climbs to about 4,500 ft before it turns back,
//   keeps within the bank setting, and hands over on the ENT1 line at pattern height, lined up and wings level, at
//   least 1 NM before the merge, then carries on into the circuit.
// Serves: TR-R34, Traffic spec 1a items 15-18 and 22.
// Expected values: 4,500 ft and "at least 1 NM out" are TR-R34 (Patrick, 4 Oct 01:24Z); 3,500 ft is pattern
//   height (TR-R4); margins from the shared table (docs/TESTING.md).
// The tests of the old live breakout controller (stepBreakout: its stages, pitch decay and arc) were retired with
//   it on Patrick's card "Rebuild, then delete" (4 Oct 17:53Z).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ENT1_TRACK_DEG, ENT1_ROUTE, calcCrossTrackENT1 } from '../../../src/modules/traffic/breakout.js';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { routeLengthFt, closestDistFt } from '../../../src/modules/traffic/route.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const mooseJaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8')
);
const ent1 = mooseJaw.routes.find((r) => r.id === 'ENT1') || ENT1_ROUTE;
const NM_FT = 6076;

// The flown breakout (Traffic spec 1a items 15-18 and 22, TR-R34; Patrick's card "Rebuild, then delete", 4 Oct
// 17:53Z), through the sim from downwind, calm and in 20 kt: it climbs to about 4,500 ft before it turns back,
// then hands over on the ENT1 line at pattern height, lined up and wings level, at least 1 NM before the merge,
// and carries on into the circuit. Margins from the shared table (±100 ft, ±5°); the bank setting (50°) is a
// maximum, checked once the roll from the circuit's own bank has had a few seconds.
test('Breakout flown from downwind: climbs to 4,500 ft, then rejoins on the ENT1 line at pattern height and carries on', () => {
  for (const wind of [{ windKt: 0, windFromDeg: 360 }, { windKt: 20, windFromDeg: 200 }]) {
    const label = `${wind.windKt} kt from ${wind.windFromDeg}`;
    const sim = createSim({ ...mooseJaw, aircraft: [], ...wind }, { seed: 42 });
    const id = sim.spawn({ routeId: 'PAT1', startPoint: 11 });
    sim.stepTo(5);
    assert.equal(sim.command(id, 'breakout'), true);
    const t0 = sim.t;
    let turnBack = null, handOver = null, maxBank = 0, intoCircuit = false;
    while (sim.t < 600 && !intoCircuit) {
      sim.stepTo(sim.t + 0.5);
      const a = sim.state().aircraft.find((x) => x.id === id);
      if (a.command === 'breakout' && sim.t > t0 + 3) maxBank = Math.max(maxBank, Math.abs(a.bankDeg));
      if (!turnBack && a.phase === 'rejoin') turnBack = a;
      if (!handOver && a.command === null) handOver = a;
      if (handOver && a.routeId === 'PAT1') intoCircuit = true;
    }
    assert.ok(turnBack && Math.abs(turnBack.alt - 4500) <= 100, `${label}: about 4,500 ft before it turns back, got ${turnBack?.alt.toFixed(0)}`);
    assert.ok(maxBank <= 50 + 5, `${label}: bank within the 50° setting, got ${maxBank.toFixed(1)}°`);
    assert.ok(handOver, `${label}: hands over to ENT1`);
    assert.equal(handOver.routeId, 'ENT1', `${label}: onto ENT1`);
    assert.ok(Math.abs(handOver.alt - 3500) <= 100, `${label}: at pattern height, got ${handOver.alt.toFixed(0)} ft`);
    assert.ok(Math.abs(calcCrossTrackENT1(handOver)) <= 100, `${label}: on the ENT1 line, ${calcCrossTrackENT1(handOver).toFixed(0)} ft off`);
    assert.ok(Math.abs(wrapDeg180(handOver.trackDeg - ENT1_TRACK_DEG)) <= 5, `${label}: lined up with ENT1`);
    assert.ok(Math.abs(handOver.bankDeg) <= 5, `${label}: wings level at the hand-over`);
    const toMergeFt = routeLengthFt(ent1) - closestDistFt(ent1, handOver);
    assert.ok(toMergeFt >= NM_FT, `${label}: at least 1 NM before the merge (TR-R34), got ${(toMergeFt / NM_FT).toFixed(2)} NM`);
    assert.ok(intoCircuit, `${label}: carries on into the circuit`);
  }
});
