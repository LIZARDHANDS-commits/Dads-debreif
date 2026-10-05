// Checks: an aircraft started a whole number of miles back on the OHB Rejoin starts on the line at that distance from
// the Merge, at the line's height and speed, and then joins the overhead break as one from the Entry Start does.
// Serves: Patrick, 4 Oct (the OHB Rejoin's "how many miles back on the rejoin line", whole miles, approved as a
// flying change: sim.spawn backFt).
// Expected values: the route file's Merge point and its 3,500 ft, 220 kt legs; margins from the shared table
// (±100 ft, ±10 kt) and 0.1 NM along the line (the line bends by 5°, so straight-line distance is near enough).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const NM = 6076.12;
const merge = MOOSE_JAW.routes.find((r) => r.id === 'ENT1').points.at(-1);

test('miles back on the OHB Rejoin: it starts on the line that far from the Merge, at 3,500 ft and 220 kt', () => {
  const sim = createSim({ ...structuredClone(MOOSE_JAW), aircraft: [], windFromDeg: 269, windKt: 15 });
  for (const miles of [1, 5, 9]) {
    const id = sim.spawn({ routeId: 'ENT1', backFt: miles * NM, id: `B${miles}` });
    const a = sim.state().aircraft.find((x) => x.id === id);
    const nm = Math.hypot(a.x - merge.x, a.y - merge.y) / NM;
    assert.ok(Math.abs(nm - miles) <= 0.1, `${miles} NM asked, ${nm.toFixed(2)} NM from the Merge`);
    assert.ok(Math.abs(a.alt - 3500) <= 100, `${a.alt} ft`);
    assert.ok(Math.abs((a.kt ?? a.iasKt) - 220) <= 10, `${a.kt} kt`);
  }
});

test('miles back on the OHB Rejoin: it joins the overhead break, as one from the Entry Start does', () => {
  const sim = createSim({ ...structuredClone(MOOSE_JAW), aircraft: [], windFromDeg: 269, windKt: 15 });
  sim.spawn({ routeId: 'ENT1', backFt: 5 * NM, id: 'B5' });
  sim.spawn({ routeId: 'ENT1', startPoint: 1, id: 'ES' });
  sim.stepTo(300); // 5 minutes: both have flown the 9.2 NM line at 220 kt
  const on = (id) => sim.state().aircraft.find((x) => x.id === id).routeId;
  assert.equal(on('B5'), 'PAT1');
  assert.equal(on('ES'), 'PAT1');
});

test('a distance back that is not a number of feet from 0 is refused in words', () => {
  const sim = createSim({ ...structuredClone(MOOSE_JAW), aircraft: [] });
  assert.throws(() => sim.spawn({ routeId: 'ENT1', backFt: -1 }), /distance back/);
  assert.throws(() => sim.spawn({ routeId: 'ENT1', backFt: NaN }), /distance back/);
});
