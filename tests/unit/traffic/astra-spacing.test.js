// Checks: an Astra and a CT-156 land in turn with spacing. A CT-156 at Pattern 1's perch and a CT-102B Astra II on its
//   own downwind about abeam the departure end, in the default wind, with deconfliction on, both land on 29L, and when
//   the second crosses the threshold the first is at least 2,000 ft ahead of it or already climbing away (Traffic spec
//   4.19 item 6; plan Step 5c Phase 3; testing.md).
// Expected values: the runway is Patrick's measured 29L (src/airfields/cymj-runways.js: 150 ft wide, threshold to
//   departure end); 2,000 ft is the day minimum on final (TR-R18, the Flying Orders); the default wind is the setup's
//   (defaults.js, 269°T at 15 kt). "Landed" is the first moment it is down at the runway's height after flying; the
//   threshold crossing is the first step it passes the threshold line. Both are events, never a time. 10 minutes is a
//   safety stop only, about ten Astra laps (a lap is about 3¼ minutes in calm air, spec 4.19 item 3; the CT-156 lands
//   from its perch in about a minute), so only an aircraft that never lands reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { DEFAULTS } from '../../../src/modules/traffic/defaults.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_WIDTH_FT, THRESHOLD_DATA_ELEV_FT } from '../../../src/modules/traffic/airfield.js';
import { legOffsetsFt } from '../../../src/core/geo.js';

const mooseJaw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8'));
const RUNWAY_FT = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);
const SPACING_FT = 2000; // TR-R18, the Flying Orders' day minimum on final
const SAFETY_STOP_SEC = 10 * 60; // about ten Astra laps: a safety stop, not a time to meet
const AIRBORNE_FT = 100; // above the runway by this much counts as flying, so the touchdown that follows is a landing

/** Along 29L from the threshold, and off the centreline, feet. */
const frame = (p) => {
  const o = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, p);
  return { along: o.alongFt, off: Math.abs(o.crossFt) };
};

test('an Astra and a CT-156 land in turn with spacing', () => {
  const setup = {
    ...structuredClone(mooseJaw),
    routes: structuredClone([...mooseJaw.routes, ...mooseJaw.routesForOtherTypes]),
    aircraft: [
      { id: 'H1', type: 'CT-156', routeId: 'PAT1', startIndex: 11, startsAtSec: 0 }, // Pattern 1's Perch
      { id: 'X1', type: 'CT-102B', routeId: 'PAT_ASTRA', startIndex: 2, startsAtSec: 0 }, // the Astra's Downwind
    ],
    windFromDeg: DEFAULTS.windFromDeg,
    windKt: DEFAULTS.windKt,
    deconflict: true,
  };
  const sim = createSim(setup, { seed: 1 });
  const seen = new Map(['H1', 'X1'].map((id) => [id, { airborne: false, landed: null, crossed: false }]));
  const crossings = []; // in the order they cross the threshold: { id, gapFt, aheadClimbing }

  for (let k = 1; k * STEP_SEC <= SAFETY_STOP_SEC; k++) {
    const before = new Map(sim.state().aircraft.map((a) => [a.id, frame(a)]));
    sim.stepTo(k * STEP_SEC);
    const now = sim.state().aircraft;
    for (const a of now) {
      const s = seen.get(a.id);
      const f = frame(a);
      if (a.alt > THRESHOLD_DATA_ELEV_FT + AIRBORNE_FT) s.airborne = true;
      if (s.airborne && !s.landed && a.alt <= THRESHOLD_DATA_ELEV_FT + 1) s.landed = f;
      if (!s.crossed && s.airborne && before.get(a.id).along < 0 && f.along >= 0) {
        s.crossed = true;
        // The other one, at this moment: how far ahead along the runway, and whether it has landed and is climbing away.
        const other = now.find((b) => b.id !== a.id);
        const o = seen.get(other.id);
        crossings.push({ id: a.id, gapFt: frame(other).along - f.along, aheadClimbing: Boolean(o.landed) && other.climbFtps > 0 });
      }
    }
    if ([...seen.values()].every((s) => s.landed && s.crossed)) break;
  }

  for (const [id, s] of seen) {
    assert.ok(s.landed, `${id} lands within the ${SAFETY_STOP_SEC / 60} minute safety stop`);
    assert.ok(s.landed.along >= 0 && s.landed.along <= RUNWAY_FT, `${id} touches down ${s.landed.along.toFixed(0)} ft past the 29L threshold, on a ${RUNWAY_FT.toFixed(0)} ft runway`);
    assert.ok(s.landed.off <= RUNWAY_WIDTH_FT['29L'] / 2, `${id} touches down ${s.landed.off.toFixed(0)} ft off the centreline`);
  }
  assert.equal(crossings.length, 2, 'both cross the threshold');
  const second = crossings[1];
  assert.ok(second.gapFt >= SPACING_FT || second.aheadClimbing,
    `when ${second.id} crosses the threshold the other is ${second.gapFt.toFixed(0)} ft ahead and ${second.aheadClimbing ? '' : 'not '}climbing away (at least ${SPACING_FT} ft, or climbing away)`);
});
