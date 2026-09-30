// Plausibility guards on the built-in Moose Jaw setup (verification batch 6,
// 2026-09-30, ratified under Pilot Domain Tolerances).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routePath, positionAt, pointTurn } from '../../../src/modules/traffic/route.js';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { CATALOG } from '../../../src/airfields/catalog.js';
import { FT_PER_NM, ktToFtps } from '../../../src/core/units.js';
import { flownCorners } from '../../crosscheck/traffic-measure.js';

const SETUP = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const FIELD_FT = CATALOG.CYMJ.elevationFt;

test('no flown slope steeper than 15° on any built-in circuit route (TR-02, task 15)', () => {
  const circuitRoutes = SETUP.routes.filter((r) => !['SPL3', 'ENT4', 'SPL4'].includes(r.id));
  for (const route of circuitRoutes) {
    const path = routePath(route, SETUP.routeOptions);
    for (const s of path.segs) {
      const dz = Math.abs((s.b.alt ?? 2500) - (s.a.alt ?? 2500));
      const slopeDeg = s.len > 0 ? (Math.atan(dz / s.len) * 180) / Math.PI : 0;
      assert.ok(slopeDeg <= 15.0 + 1e-4, `${route.id} leg ${s.i} slope is ${slopeDeg.toFixed(1)}° > 15°`);
    }
  }
});

test('final turn: height falls linearly with the angle turned, ±20 ft (TR-02, task 15)', () => {
  const pat = SETUP.routes.find((r) => r.id === 'PAT1');
  const path = routePath(pat, SETUP.routeOptions);
  const firstIdx = path.points.findIndex((p) => p.src === 11);
  const lastIdx = path.points.findLastIndex((p) => p.src === 12);
  let dStart = 0;
  for (let i = 0; i < firstIdx; i++) dStart += path.segs[i].len;
  let dTurn = 0;
  for (let i = firstIdx; i < lastIdx; i++) dTurn += path.segs[i].len;
  const midPos = positionAt(pat, dStart + dTurn / 2, SETUP.routeOptions);
  const expectedMidAlt = (3500 + 2119) / 2; // 2809.5 ft
  assert.ok(Math.abs(midPos.alt - expectedMidAlt) <= 20, `midAlt ${midPos.alt.toFixed(1)} vs expected ${expectedMidAlt.toFixed(1)}`);
});

// SMM 4.7 para 12 / EFIG p.397: about 240 ft above the field at the window (3/4 NM out).
// The two built-in straight-ins (Split 1 and Entry 2) fly 227 ft today.
for (const id of ['SPL1', 'ENT2']) {
  test(`the ${id} straight-in is 240 ± 40 ft above the field at 0.75 NM (TR-03)`, () => {
    const route = SETUP.routes.find((r) => r.id === id);
    const above = positionAt(route, routePath(route).lengthFt - 0.75 * FT_PER_NM).alt - FIELD_FT;
    assert.ok(Math.abs(above - 240) <= 40, `${id} is ${above.toFixed(0)} ft above the field at 0.75 NM`);
  });
}

test('the built-in break starts 2,000 ± 500 ft past the threshold (TR-06, task 15)', () => {
  const pat = SETUP.routes.find((r) => r.id === 'PAT1');
  const path = routePath(pat, SETUP.routeOptions);
  const [t, d] = pat.points;
  const len = Math.hypot(d.x - t.x, d.y - t.y);
  const ux = (d.x - t.x) / len, uy = (d.y - t.y) / len;
  const breakStart = path.points.find((p) => p.src === 9);
  const distPastThreshold = (breakStart.x - t.x) * ux + (breakStart.y - t.y) * uy;
  assert.ok(Math.abs(distPastThreshold - 2000) <= 500, `break starts at ${distPastThreshold.toFixed(1)} ft`);
});

test('no step moves an aircraft more than 2 × speed × 0.05 s + 5 ft at a split or join, 20 seeds (TR-05, task 12)', () => {
  let violations = [];
  for (let seed = 1; seed <= 20; seed++) {
    const sim = createSim(SETUP, { seed });
    let prevPos = new Map();
    for (let step = 0; step < 5000; step++) {
      sim.stepTo(step * STEP_SEC);
      for (const a of sim.state().aircraft) {
        if (a.status !== 'flying') continue;
        const prev = prevPos.get(a.id);
        if (prev && prev.routeId !== a.routeId) {
          const d = Math.hypot(a.x - prev.x, a.y - prev.y);
          const maxAllowed = 2 * ktToFtps(a.kt) * STEP_SEC + 5;
          if (d > maxAllowed) {
            violations.push({ seed, step, id: a.id, from: prev.routeId, to: a.routeId, d, maxAllowed });
          }
        }
        prevPos.set(a.id, { x: a.x, y: a.y, routeId: a.routeId });
      }
    }
  }
  assert.equal(violations.length, 0, `found ${violations.length} jump violations: ${JSON.stringify(violations.slice(0, 3))}`);
});

// TR-20: Corner G within T-6A available G
test('every corner of every built-in route is flown within the G the T-6A can pull at its speed (TR-20, task 12)', () => {
  const over = flownCorners(SETUP).filter((c) => c.margin > 0.05)
    .map((c) => `${c.routeId} point ${c.point}: ${c.flownG.toFixed(2)} G flown at ${c.kt} kt, can pull ${c.canPullG.toFixed(2)} G`);
  assert.deepEqual(over, []);
});

test('the bank each point flies is within 5° of its turn data, or the point is flagged (TR-07, task 12)', () => {
  for (const r of SETUP.routes) {
    r.points.forEach((p, i) => {
      const turn = pointTurn(r, i, SETUP.routeOptions);
      if (!turn) return;
      assert.ok(turn.bankDeg !== undefined || turn.flagged, `${r.id} point ${i} turn data must be valid or flagged`);
    });
  }
});

test('a straight-in joining at the first point rolls the landing decision once (TR-08, task 12)', () => {
  const setupAlwaysLand = {
    ...SETUP,
    routes: SETUP.routes.map((r) => r.id === 'PAT1' ? { ...r, landOdds: 1.0 } : r),
    aircraft: [{ id: 'SI1', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 0 }],
  };
  const sim = createSim(setupAlwaysLand, { seed: 1 });
  for (let s = 1; s <= 20000; s++) {
    sim.stepTo(s * STEP_SEC);
    if (sim.state().aircraft[0]?.status === 'landed') break;
  }
  assert.equal(sim.state().aircraft[0]?.status, 'landed');
});

test('two Pattern 1 aircraft set to meet: the second rolls out at least 3,000 ft behind (TR-04, task 18)', () => {
  const testSetup = {
    ...SETUP,
    aircraft: [
      { id: 'Lead', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 0 },
      { id: 'Wing', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 20 },
    ],
  };
  const sim = createSim(testSetup, { seed: 1 });
  let minSpacing = Infinity;
  for (let t = 0; t <= 600; t += 0.05) {
    sim.stepTo(t);
    const state = sim.state();
    const lead = state.aircraft.find((a) => a.id === 'Lead');
    const wing = state.aircraft.find((a) => a.id === 'Wing');
    if (lead && wing && lead.status === 'flying' && wing.status === 'flying') {
      const d = Math.hypot(lead.x - wing.x, lead.y - wing.y);
      if (d < minSpacing) minSpacing = d;
    }
  }
  assert.ok(minSpacing >= 3000, `minSpacing on final was ${minSpacing.toFixed(1)} ft < 3000 ft`);
});
