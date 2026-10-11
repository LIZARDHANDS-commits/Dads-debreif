// Checks: shape checks on the built-in setup: no leg over 15 degrees, final turn loses height evenly,
//   straight-in about 240 ft up at 3/4 NM, break about 2,000 ft past the threshold, no join jumps, no corner
//   over available G, spacing on final.
// Serves: TR-R4, TR-R7, TR-R9, TR-R11, TR-R15, TR-R18, ALL-R20.
// Expected values: the window at 3/4 NM on a 3 degree path, worked out in the test (SMM 4.7 paras 10-12; about
//   240 ft up, EFIG p.397); 3,500 ft pattern height (TR-R4); the break about 2,000 ft past the threshold in a 10 kt
//   headwind and about 1,700 ft in calm air (SMM 4.17 para 39; Traffic spec item 12, Patrick 4 Oct 08:48Z); bank from
//   G in a level turn, acos(1/G), and the G the T-6A can pull, worked out (standard aerodynamics); 2,000 ft final
//   spacing (TR-R18, WFO day minimum). Margins from the shared table (docs/TESTING.md) unless the line says why; run
//   limits are safety stops with their reason beside them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routePath, positionAt, pointTurn } from '../../../src/modules/traffic/route.js';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { CATALOG } from '../../../src/airfields/catalog.js';
import { FT_PER_NM, ktToFtps } from '../../../src/core/units.js';
import { TOLERANCES } from '../../helpers/tolerances.js';
import { flownCorners } from '../../crosscheck/traffic-measure.js';

const SETUP = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const FIELD_FT = CATALOG.CYMJ.elevationFt;
const RUNWAY_FT = 1880; // the runway's height in the built-in setup (moose-jaw.json PAT1 point 1)
const PATTERN_FT = 3500; // TR-R4
/** Height above the runway at 3/4 NM on a 3° path (SMM 4.7 paras 10-12), worked out: about 239 ft. */
const WINDOW_ABOVE_FT = 0.75 * FT_PER_NM * Math.tan((3 * Math.PI) / 180);

// 15°: the limit set in task 15 (TR-02), an estimate with no manual page yet; 1e-4° only absorbs rounding.
test('no flown slope steeper than 15° on any built-in circuit route (TR-02, task 15)', () => {
  const circuitRoutes = SETUP.routes;
  for (const route of circuitRoutes) {
    const path = routePath(route, SETUP.routeOptions);
    for (const s of path.segs) {
      const dz = Math.abs((s.b.alt ?? 2500) - (s.a.alt ?? 2500));
      const slopeDeg = s.len > 0 ? (Math.atan(dz / s.len) * 180) / Math.PI : 0;
      assert.ok(slopeDeg <= 15.0 + 1e-4, `${route.id} leg ${s.i} slope is ${slopeDeg.toFixed(1)}° > 15°`);
    }
  }
});

test('final turn: height falls evenly from pattern height at the perch to the window, ±100 ft half way round (TR-02, task 15)', () => {
  const pat = SETUP.routes.find((r) => r.id === 'PAT1');
  const path = routePath(pat, SETUP.routeOptions);
  const firstIdx = path.points.findIndex((p) => p.src === 11);
  const lastIdx = path.points.findLastIndex((p) => p.src === 12);
  let dStart = 0;
  for (let i = 0; i < firstIdx; i++) dStart += path.segs[i].len;
  let dTurn = 0;
  for (let i = firstIdx; i < lastIdx; i++) dTurn += path.segs[i].len;
  const midPos = positionAt(pat, dStart + dTurn / 2, SETUP.routeOptions);
  const expectedMidAlt = (PATTERN_FT + RUNWAY_FT + WINDOW_ABOVE_FT) / 2; // about 2,810 ft
  // ±100 ft: the shared height margin.
  assert.ok(Math.abs(midPos.alt - expectedMidAlt) <= TOLERANCES.ALTITUDE_FT, `midAlt ${midPos.alt.toFixed(1)} vs expected ${expectedMidAlt.toFixed(1)}`);
});

// SMM 4.7 para 12 / EFIG p.397: about 240 ft above the field at the window (3/4 NM out on a 3° path).
for (const id of ['ENT2']) {
  test(`the ${id} straight-in is about 240 ft above the field at 0.75 NM, ±100 ft (TR-03)`, () => {
    const route = SETUP.routes.find((r) => r.id === id);
    const above = positionAt(route, routePath(route).lengthFt - 0.75 * FT_PER_NM).alt - FIELD_FT;
    // ±100 ft: the shared height margin.
    assert.ok(Math.abs(above - WINDOW_ABOVE_FT) <= TOLERANCES.ALTITUDE_FT, `${id} is ${above.toFixed(0)} ft above the field at 0.75 NM`);
  });
}

/** How far past the threshold, along the runway, the built-in break starts in the wind given. */
function breakPastThresholdFt(wind) {
  const pat = SETUP.routes.find((r) => r.id === 'PAT1');
  const path = routePath(pat, { ...SETUP.routeOptions, ...wind });
  const [t, d] = pat.points;
  const len = Math.hypot(d.x - t.x, d.y - t.y);
  const ux = (d.x - t.x) / len, uy = (d.y - t.y) / len;
  const breakStart = path.points.find((p) => p.src === 9);
  return (breakStart.x - t.x) * ux + (breakStart.y - t.y) * uy;
}

test('the built-in break starts about 2,000 ft past the threshold in a 10 kt headwind and about 1,700 ft in calm air, ±100 ft (TR-06, task 15)', () => {
  // SMM 4.17 para 39: 2,000 ft in a 10 kt headwind. Calm air: earlier by 10 kt × the break's time, so it rolls out
  // at the same spot, about 1,700 ft (Traffic spec item 12; Patrick, 4 Oct 08:48Z). ±100 ft: the shared distance margin.
  const headwind = breakPastThresholdFt({ windFromDeg: 298, windKt: 10 });
  assert.ok(Math.abs(headwind - 2000) <= TOLERANCES.DISTANCE_FT, `10 kt headwind: the break starts ${headwind.toFixed(0)} ft past the threshold`);
  const calm = breakPastThresholdFt({});
  assert.ok(Math.abs(calm - 1700) <= TOLERANCES.DISTANCE_FT, `calm air: the break starts ${calm.toFixed(0)} ft past the threshold`);
});

// The limit is twice what the aircraft flies in one step, plus 5 ft: a join may change its line by up to a step's
// travel, but a jump to somewhere else on the route fails. 5,000 steps (250 s) is the run length, not a time to meet.
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

// TR-20: the G the T-6A can pull at its speed (the stall line) is a physical limit, so it holds with no margin. G rule
// for all tests (Patrick, 11 Oct 19:37Z): above 7 G fails; above 5 G is a caution, logged and shown, never a fail.
test('every corner of every built-in route is flown within the G the T-6A can pull at its speed, and never above 7 G (TR-20, task 12)', (t) => {
  const corners = flownCorners(SETUP);
  const where = (c) => `${c.routeId} point ${c.point}: ${c.flownG.toFixed(2)} G flown at ${c.kt} kt, can pull ${c.canPullG.toFixed(2)} G`;
  for (const c of corners.filter((x) => x.flownG > 5 && x.flownG <= 7)) t.diagnostic(`caution, above 5 G: ${where(c)}`);
  assert.deepEqual(corners.filter((c) => c.margin > 0).map(where), [], 'past the stall line');
  assert.deepEqual(corners.filter((c) => c.flownG > 7).map(where), [], 'above 7 G');
});

test('the bank each turn point asks for is the level-turn bank for its G, acos(1/G), ±5° (TR-07, task 12)', () => {
  // Standard aerodynamics: in a level turn the load factor is 1 / cos(bank). ±5°: the shared angle margin.
  for (const r of SETUP.routes) {
    r.points.forEach((p, i) => {
      const turn = pointTurn(r, i, SETUP.routeOptions);
      if (!turn) return;
      const g = Math.min(Math.max(+p.g || 2, 1.01), 9); // a blank G is read as 2, and 1.01 to 9 G is what a turn can ask (route.js)
      const expectedDeg = (Math.acos(1 / g) * 180) / Math.PI;
      assert.ok(Math.abs(turn.bankDeg - expectedDeg) <= TOLERANCES.ANGLE_DEG, `${r.id} point ${i + 1}: ${turn.bankDeg.toFixed(1)}° for ${g} G, level turn ${expectedDeg.toFixed(1)}°`);
    });
  }
});

test('a straight-in joining a pattern that always lands, from its first point, lands (TR-08, task 12)', () => {
  const setupAlwaysLand = {
    ...SETUP,
    routes: SETUP.routes.map((r) => r.id === 'PAT1' ? { ...r, landOdds: 1.0 } : r),
    aircraft: [{ id: 'SI1', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 0 }],
  };
  const sim = createSim(setupAlwaysLand, { seed: 1 });
  // Safety stop: 1,000 s (20,000 steps), about three times the straight-in's length, so only an aircraft that never lands reaches it.
  for (let s = 1; s <= 20000; s++) {
    sim.stepTo(s * STEP_SEC);
    if (sim.state().aircraft[0]?.status === 'landed') break;
  }
  assert.equal(sim.state().aircraft[0]?.status, 'landed', 'SI1 never landed');
});

test('two straight-ins started 20 s apart never close inside the 2,000 ft final spacing (TR-R18, TR-04, task 18)', () => {
  // TR-R18: aircraft aim for 2,000 ft on final, the Flying Orders' day minimum (Patrick, 4 Oct 01:25Z).
  const SPACING_FT = 2000;
  const testSetup = {
    ...SETUP,
    aircraft: [
      { id: 'Lead', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 0 },
      { id: 'Wing', type: 'CT-156', routeId: 'ENT2', startIndex: 0, startsAtSec: 20 },
    ],
  };
  const sim = createSim(testSetup, { seed: 1 });
  let minSpacing = Infinity, wingDone = false;
  // Followed until the Wing has touched down and joined the circuit; safety stop 1,000 s, about three times the
  // straight-in, so only a pair that never gets down reaches it.
  for (let step = 1; step <= 20000 && !wingDone; step++) {
    sim.stepTo(step * STEP_SEC);
    const state = sim.state();
    const lead = state.aircraft.find((a) => a.id === 'Lead');
    const wing = state.aircraft.find((a) => a.id === 'Wing');
    if (lead && wing && lead.status === 'flying' && wing.status === 'flying') {
      const d = Math.hypot(lead.x - wing.x, lead.y - wing.y);
      if (d < minSpacing) minSpacing = d;
    }
    wingDone = wing.status !== 'flying' || wing.routeId !== 'ENT2';
  }
  assert.ok(wingDone, 'the Wing never got to the runway');
  assert.ok(minSpacing >= SPACING_FT, `closest the pair came was ${minSpacing.toFixed(0)} ft, inside ${SPACING_FT} ft`);
});
