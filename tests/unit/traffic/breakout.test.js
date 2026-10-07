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

import { ENT1_TRACK_DEG, ENT1_ROUTE, REJOIN_INTERCEPT_PT, calcCrossTrackENT1 } from '../../../src/modules/traffic/breakout.js';
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

// Patrick, 5 Oct 00:08Z and 00:13Z: off the rejoin line a breakout turns away from the pattern (here to the right),
// and one needed so as not to collide may bank up to 80°, never past the stall line (standard aerodynamics: the
// G a wing can make at that speed).
test('a breakout off the rejoin line turns away from the pattern, and an 80° one stays inside the stall line and bleeds speed', async () => {
  const { buildBreakout, gateLegOf, BREAKOUT_TRAFFIC_BANK_DEG } = await import('../../../src/modules/traffic/breakout.js');
  const { stallLimitG } = await import('../../../src/core/t6-performance.js');
  const sim = createSim({ ...mooseJaw, windKt: 15, windFromDeg: 260, aircraft: [{ id: 'A1', type: 'CT-156', routeId: 'ENT1', startIndex: 1, startsAtSec: 0 }] }, { seed: 1 });
  sim.stepTo(20);
  const h0 = sim.state().aircraft[0].headingDeg;
  sim.command('A1', 'breakout');
  sim.stepTo(26);
  assert.ok(wrapDeg180(sim.state().aircraft[0].headingDeg - h0) > 5, 'it turns right, away from the pattern');

  const path = buildBreakout({ ...REJOIN_INTERCEPT_PT, alt: 3500, kias: 220, headingDeg: ENT1_TRACK_DEG, bankDeg: 0 }, { windFromDeg: 260, windKt: 15 }, ent1, gateLegOf(ent1), BREAKOUT_TRAFFIC_BANK_DEG, 'right');
  assert.ok(path.every((p) => p.g <= stallLimitG(p.kt) + 0.1), 'never past the stall line');
  assert.ok(Math.max(...path.map((p) => p.g)) > 3, 'it pulls hard when it can');
  assert.ok(Math.min(...path.map((p) => p.kt)) < 220 - 10, 'the hard turn costs speed');
});

test('near-runway avoidance breakout climbs straight ahead to 2,500 ft past departure end at 140 KIAS, then turns', async () => {
  const { buildBreakout, gateLegOf, AVOID_CLIMB_KIAS, BREAKOUT_RUNWAY_SAFE_ALT_FT } = await import('../../../src/modules/traffic/breakout.js');
  const { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_29L_HDG_DEG } = await import('../../../src/modules/traffic/airfield.js');
  const { legOffsetsFt } = await import('../../../src/core/geo.js');

  const start = { x: THRESHOLD_29L.x, y: THRESHOLD_29L.y, alt: 1900, kias: 110, headingDeg: RUNWAY_29L_HDG_DEG, bankDeg: 0 };
  const path = buildBreakout(start, { windFromDeg: 260, windKt: 15 }, ent1, gateLegOf(ent1), 50);

  const rwyLen = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);

  // While below 2,500 ft or before departure end, holds runway track with wings level
  const lowPoints = path.filter((p) => p.alt < BREAKOUT_RUNWAY_SAFE_ALT_FT || legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, p).alongFt < rwyLen);
  assert.ok(lowPoints.length > 0, 'has low-level climb points');
  for (const p of lowPoints) {
    const offHdg = Math.abs(wrapDeg180(p.headingDeg - RUNWAY_29L_HDG_DEG));
    assert.ok(offHdg <= 10, `stays on runway heading while low, off by ${offHdg}° at ${p.alt} ft`);
  }

  // Holds 140 KIAS sporty climb
  const midClimbPoints = path.filter((p) => p.alt >= 2600 && p.alt <= 4000);
  assert.ok(midClimbPoints.length > 0, 'has mid-climb points');
  for (const p of midClimbPoints) {
    assert.ok(Math.abs(p.kt - AVOID_CLIMB_KIAS) <= 15, `holds 140 KIAS sporty climb, got ${p.kt} at ${p.alt} ft`);
  }

  // Once past 2,500 ft and departure end, turns toward BREAKOUT_PT (south)
  assert.ok(path.some((p) => wrapDeg180(p.headingDeg - RUNWAY_29L_HDG_DEG) < -20), 'turns towards BREAKOUT_PT');
});
